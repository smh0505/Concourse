//! Host-side scaffolding for WASM `SourcePlugin`s: wires up the wasmtime Component Model
//! bindings generated from `wit/plugin.wit` and implements the `host` interface plugins import.

use crate::zip_install;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use wasmtime::component::bindgen;
use wasmtime_wasi::{ResourceTable, WasiCtx, WasiCtxBuilder, WasiView};

/// Milestone 13 path allowlisting - a manifest-declared scope a plugin is allowed to read
/// beyond its own `plugin-dir()` (always implicitly allowed, see `is_within_plugin_dir`).
/// `Registry` covers a hive+key prefix (e.g. Steam's/GOG's own fixed vendor keys); `Path`
/// covers a literal filesystem path prefix (e.g. Epic's fixed manifests directory - genuinely
/// static, not runtime-discovered, so it doesn't need `request-read-scope`). Declared in
/// `plugin.json`'s `pathScopes` field, parsed once at `PluginHostState` construction.
#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum PathScope {
    Registry { hive: String, prefix: String },
    Path { prefix: String },
}

bindgen!({
    path: "wit/plugin.wit",
    world: "source-plugin-world",
});

/// Second, independent bindgen for the `wrapper-plugin-world` - `with`-sharing the `host`
/// module with `source-plugin-world` above turned out not to work here, since bindgen only
/// generates record types a world's exports actually reference, and `source-plugin-world`
/// never references `locale-profile`. Each world gets its own generated `host` module instead;
/// their `Host` traits end up structurally identical (none of the `host` interface's own
/// functions take `game-entry`/`locale-profile`), so `PluginHostState`'s two `impl Host`
/// blocks below both delegate to the same private methods rather than duplicating logic.
pub mod wrapper_world {
    use wasmtime::component::bindgen;

    bindgen!({
        path: "wit/plugin.wit",
        world: "wrapper-plugin-world",
    });
}

/// Third, independent bindgen for `metadata-plugin-world` - same reasoning as `wrapper_world`
/// above (bindgen only generates record types a world's exports reference, so
/// `metadata-result` needs its own `host` module here too).
pub mod metadata_world {
    use wasmtime::component::bindgen;

    bindgen!({
        path: "wit/plugin.wit",
        world: "metadata-plugin-world",
    });
}

/// Per-instantiation state passed to a plugin's `Store`. `plugin_id` namespaces
/// `settings`/`plugin_data` access so plugins can't read/write each other's data. Holds its own
/// `rusqlite` connection to `library.db` since `Host` trait methods run synchronously inside
/// wasmtime execution with no path back to the frontend's async connection (multiple SQLite
/// connections to one file is safe).
///
/// `wasi_ctx` is a bare, no-capability WASI context - `cargo component`-built components import
/// baseline `wasi:cli/*` even when they never touch real WASI filesystem/env access, so the
/// host still has to satisfy those imports at instantiation time.
pub struct PluginHostState {
    pub plugin_id: String,
    plugin_dir: PathBuf,
    db: rusqlite::Connection,
    wasi_ctx: WasiCtx,
    resource_table: ResourceTable,
    /// Manifest-declared registry/path scopes (Milestone 13) - static, known at plugin-author
    /// time (e.g. Steam's own vendor registry keys, Epic's fixed manifests directory).
    path_scopes: Vec<PathScope>,
    /// Dynamic scopes granted this instantiation via `request-read-scope` (Steam's runtime-
    /// discovered library folders - not knowable ahead of time, so can't live in `path_scopes`).
    /// In-memory only, not persisted - fine, since a fresh `PluginHostState` is created per
    /// Tauri command call anyway (see `wasm_plugin_runtime.rs`), and the plugin that needs this
    /// (Steam) does its discovery-then-read all within one call/instantiation.
    dynamic_read_scopes: Vec<PathBuf>,
    /// Manifest-declared allowed hostnames - unlike file paths, every plugin's real network
    /// usage is a small, fixed set of hostnames known at author time, so this needs no dynamic
    /// verified-scope mechanism the way Steam's filesystem access does. Declared in
    /// `plugin.json`'s `httpScopes` field.
    http_scopes: Vec<String>,
}

impl PluginHostState {
    pub fn new(
        plugin_id: String,
        plugin_dir: PathBuf,
        db_path: &Path,
        path_scopes: Vec<PathScope>,
        http_scopes: Vec<String>,
    ) -> rusqlite::Result<Self> {
        let db = rusqlite::Connection::open(db_path)?;
        Ok(Self {
            plugin_id,
            plugin_dir,
            db,
            wasi_ctx: WasiCtxBuilder::new().build(),
            resource_table: ResourceTable::new(),
            path_scopes,
            http_scopes,
            dynamic_read_scopes: Vec::new(),
        })
    }

    /// Never lets a plugin's own key collide with another plugin's or a core app setting.
    fn namespaced_settings_key(&self, key: &str) -> String {
        format!("plugin:{}:{}", self.plugin_id, key)
    }

    /// Backs the Milestone 13 capability-gating check for spawn-process/run-and-wait - queries
    /// `plugin_capability_grants` directly (not the `settings` table), since that's a table
    /// this plugin's own settings-get/settings-set host functions have no code path to at all.
    /// A grant only ever gets written by the frontend (install-confirmation checkbox, or a
    /// Settings-panel "Grant" button for an already-installed plugin) - never by the plugin
    /// itself.
    fn has_capability(&self, capability: &str) -> bool {
        self.db
            .query_row(
                "SELECT 1 FROM plugin_capability_grants WHERE plugin_id = ?1 AND capability = ?2",
                rusqlite::params![self.plugin_id, capability],
                |_| Ok(true),
            )
            .unwrap_or(false)
    }

    /// Lexically resolves `.`/`..` components without touching disk - unlike
    /// `std::fs::canonicalize`, this works for a path that doesn't exist yet (e.g. `write-file`'s
    /// target before it's created) and avoids Windows' `\\?\`-prefixed canonical form entirely.
    /// Case-insensitive comparison downstream, matching Windows path semantics.
    fn normalize_components(path: &str) -> Vec<String> {
        let mut parts: Vec<String> = Vec::new();
        for component in path.split(['/', '\\']) {
            match component {
                "" | "." => continue,
                ".." => {
                    parts.pop();
                }
                other => parts.push(other.to_string()),
            }
        }
        parts
    }

    /// True if `target`, once lexically normalized, starts with `prefix`'s own normalized
    /// components - the containment check every path-scope rule below is built on. Rejects
    /// traversal tricks like `<scoped-dir>\..\..\Users\x\.ssh\id_rsa`, whose normalized form no
    /// longer starts with the scoped prefix at all.
    fn path_has_prefix(target: &str, prefix: &str) -> bool {
        let target_parts = Self::normalize_components(target);
        let prefix_parts = Self::normalize_components(prefix);
        !prefix_parts.is_empty()
            && target_parts.len() >= prefix_parts.len()
            && target_parts[..prefix_parts.len()]
                .iter()
                .zip(prefix_parts.iter())
                .all(|(a, b)| a.eq_ignore_ascii_case(b))
    }

    /// Always allowed, for every file operation - a plugin can always read/write/delete inside
    /// its own directory.
    fn is_within_plugin_dir(&self, path: &str) -> bool {
        Self::path_has_prefix(path, &self.plugin_dir.to_string_lossy())
    }

    /// Read-only file access additionally allowed under: a manifest-declared static `Path`
    /// scope (Epic's fixed manifests dir), or a dynamic scope this instantiation was granted
    /// via `request-read-scope` (Steam's verified library folders). Never applies to
    /// write-file/remove-dir - those stay hard-confined to `plugin-dir()` with no escape hatch,
    /// see `is_within_plugin_dir`.
    fn is_allowed_read_path(&self, path: &str) -> bool {
        if self.is_within_plugin_dir(path) {
            return true;
        }
        let static_match = self.path_scopes.iter().any(|scope| match scope {
            PathScope::Path { prefix } => Self::path_has_prefix(path, prefix),
            PathScope::Registry { .. } => false,
        });
        if static_match {
            return true;
        }
        self.dynamic_read_scopes
            .iter()
            .any(|root| Self::path_has_prefix(path, &root.to_string_lossy()))
    }

    fn is_allowed_registry(&self, hive: &str, path: &str) -> bool {
        self.path_scopes.iter().any(|scope| match scope {
            PathScope::Registry {
                hive: scoped_hive,
                prefix,
            } => scoped_hive.eq_ignore_ascii_case(hive) && Self::path_has_prefix(path, prefix),
            PathScope::Path { .. } => false,
        })
    }

    /// Milestone 13's last item - checked before every outbound `http-get`/`http-request`/
    /// `download-bytes` call. Exact-hostname or subdomain-suffix match against
    /// `plugin.json`'s `httpScopes` (so declaring "steamgriddb.com" also covers
    /// "www.steamgriddb.com" without needing every subdomain spelled out). Only the plugin-
    /// supplied entry URL is checked - whatever redirect chain the HTTP client follows
    /// internally afterward is out of scope, same as how this kind of check normally works.
    fn is_allowed_host(&self, url: &str) -> bool {
        let Ok(parsed) = reqwest::Url::parse(url) else {
            return false;
        };
        let Some(host) = parsed.host_str() else {
            return false;
        };
        self.http_scopes.iter().any(|scope| {
            host.eq_ignore_ascii_case(scope)
                || host
                    .to_lowercase()
                    .ends_with(&format!(".{}", scope.to_lowercase()))
        })
    }

    /// Steam and Xbox are the plugins whose legitimate read scope genuinely can't be known
    /// ahead of time (Steam's install/library folders, Xbox's per-package `PackageRootFolder`,
    /// are wherever the user's own install/AppX repository put them) - this is the verified-
    /// elevation half of that: the host checks for a real structural signature before trusting
    /// a plugin-requested root at all (Steam: a `steamapps` subdirectory; Xbox: an
    /// `AppxManifest.xml` file, every AppX package's own real manifest). Any plugin id without
    /// a known validator is rejected outright rather than silently trusted or given a real
    /// user-facing approval prompt - there's no third-party plugin exercising that path yet,
    /// so a real prompt UI is deferred until one actually needs it (see milestones.md/devlog.md).
    fn do_request_read_scope(&mut self, path: String) -> Result<(), String> {
        let (recognized, expected_signature) = match self.plugin_id.as_str() {
            "steam-wasm" => (Path::new(&path).join("steamapps").is_dir(), "no steamapps subdirectory"),
            "xbox-wasm" => (Path::new(&path).join("AppxManifest.xml").is_file(), "no AppxManifest.xml"),
            _ => {
                return Err(format!(
                    "No path-scope validator is registered for plugin \"{}\" - request-read-scope isn't available to it yet.",
                    self.plugin_id
                ))
            }
        };
        if !recognized {
            return Err(format!(
                "\"{}\" doesn't look like a real install directory for this plugin ({}) - scope request denied.",
                path, expected_signature
            ));
        }
        self.dynamic_read_scopes.push(PathBuf::from(path));
        Ok(())
    }
}

impl WasiView for PluginHostState {
    fn ctx(&mut self) -> &mut WasiCtx {
        &mut self.wasi_ctx
    }

    fn table(&mut self) -> &mut ResourceTable {
        &mut self.resource_table
    }
}

/// Actual implementations behind both `Host` trait impls below (`gamelib::plugin::host::Host`
/// for `source-plugin-world`, `wrapper_world::gamelib::plugin::host::Host` for
/// `wrapper-plugin-world`) - kept as inherent methods so the two structurally-identical traits
/// (see `wrapper_world`'s doc comment) share one copy of the logic instead of two.
impl PluginHostState {
    fn do_read_registry_string(
        &mut self,
        hive: String,
        path: String,
        value: String,
    ) -> Option<String> {
        if !self.is_allowed_registry(&hive, &path) {
            return None;
        }
        #[cfg(target_os = "windows")]
        {
            use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
            use winreg::RegKey;

            let root = match hive.as_str() {
                "HKLM" => HKEY_LOCAL_MACHINE,
                "HKCU" => HKEY_CURRENT_USER,
                _ => return None,
            };
            RegKey::predef(root)
                .open_subkey(&path)
                .ok()?
                .get_value::<String, _>(&value)
                .ok()
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = (hive, path, value);
            None
        }
    }

    fn do_list_registry_keys(&mut self, hive: String, path: String) -> Result<Vec<String>, String> {
        if !self.is_allowed_registry(&hive, &path) {
            return Err(format!(
                "Registry access denied: \"{}\\{}\" is outside this plugin's declared pathScopes.",
                hive, path
            ));
        }
        #[cfg(target_os = "windows")]
        {
            use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
            use winreg::RegKey;

            let root = match hive.as_str() {
                "HKLM" => HKEY_LOCAL_MACHINE,
                "HKCU" => HKEY_CURRENT_USER,
                _ => return Err(format!("Unknown registry hive: {}", hive)),
            };
            let Ok(key) = RegKey::predef(root).open_subkey(&path) else {
                return Ok(Vec::new());
            };
            Ok(key.enum_keys().flatten().collect())
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = (hive, path);
            Ok(Vec::new())
        }
    }

    fn do_read_file(&mut self, path: String) -> Result<String, String> {
        if !self.is_allowed_read_path(&path) {
            return Err(format!(
                "Read access denied: \"{}\" is outside this plugin's directory and declared pathScopes.",
                path
            ));
        }
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
    }

    fn do_write_file(&mut self, path: String, contents: String) -> Result<(), String> {
        if !self.is_within_plugin_dir(&path) {
            return Err(format!(
                "Write access denied: \"{}\" is outside this plugin's own directory.",
                path
            ));
        }
        if let Some(parent) = Path::new(&path).parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
        }
        std::fs::write(&path, contents).map_err(|e| format!("Failed to write {}: {}", path, e))
    }

    fn do_remove_dir(&mut self, path: String) -> Result<(), String> {
        if !self.is_within_plugin_dir(&path) {
            return Err(format!(
                "Remove access denied: \"{}\" is outside this plugin's own directory.",
                path
            ));
        }
        if !Path::new(&path).exists() {
            return Ok(());
        }
        std::fs::remove_dir_all(&path).map_err(|e| format!("Failed to remove {}: {}", path, e))
    }

    fn do_list_dir(&mut self, path: String) -> Result<Vec<String>, String> {
        if !self.is_allowed_read_path(&path) {
            return Err(format!(
                "List access denied: \"{}\" is outside this plugin's directory and declared pathScopes.",
                path
            ));
        }
        let entries =
            std::fs::read_dir(&path).map_err(|e| format!("Failed to list {}: {}", path, e))?;
        entries
            .map(|entry| {
                entry
                    .map(|e| e.path().to_string_lossy().to_string())
                    .map_err(|e| e.to_string())
            })
            .collect()
    }

    fn do_path_exists(&mut self, path: String) -> bool {
        self.is_allowed_read_path(&path) && std::path::Path::new(&path).exists()
    }

    /// Fire-and-forget, like launch() elsewhere in this app - playtime is covered separately by
    /// `launcher.rs::track_folder_playtime`.
    fn do_spawn_process(&mut self, path: String, args: Vec<String>) -> Result<(), String> {
        if !self.has_capability("run-programs") {
            return Err(
                "This plugin has not been granted permission to run other programs. Grant it in Settings.".to_string(),
            );
        }
        std::process::Command::new(&path)
            .args(&args)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn {}: {}", path, e))?;
        Ok(())
    }

    /// Blocks until the child exits, unlike spawn_process - for a plugin's own managed-install
    /// flow, which needs to know when a visible third-party installer window has been closed
    /// before continuing. Deliberately ignores the exit code, only the spawn itself can fail -
    /// LR/LE's installer windows aren't real wizards with a meaningful success/failure exit
    /// status, they're just closed by the user whenever, so treating a nonzero exit as failure
    /// would reject a perfectly normal close.
    fn do_run_and_wait(
        &mut self,
        path: String,
        args: Vec<String>,
        cwd: String,
    ) -> Result<(), String> {
        if !self.has_capability("run-programs") {
            return Err(
                "This plugin has not been granted permission to run other programs. Grant it in Settings.".to_string(),
            );
        }
        std::process::Command::new(&path)
            .args(&args)
            .current_dir(&cwd)
            .status()
            .map_err(|e| format!("Failed to launch {}: {}", path, e))?;
        Ok(())
    }

    /// Uses reqwest's blocking client since wasmtime component calls are synchronous - must only
    /// be invoked from a blocking context (e.g. spawn_blocking), never on the async runtime
    /// thread. Sends a `User-Agent` - some APIs (e.g. GitHub's, used by the wrapper plugins'
    /// own managed-install flow to hit the releases API) reject requests without one.
    fn do_http_get(&mut self, url: String) -> Result<String, String> {
        if !self.is_allowed_host(&url) {
            return Err(format!(
                "Network access denied: \"{}\" is outside this plugin's declared httpScopes.",
                url
            ));
        }
        reqwest::blocking::Client::new()
            .get(&url)
            .header("User-Agent", "concourse")
            .send()
            .map_err(|e| e.to_string())?
            .text()
            .map_err(|e| e.to_string())
    }

    /// General-purpose version of `do_http_get` - custom headers and a non-GET method/body,
    /// for APIs `do_http_get` can't express (an auth header, or a POST-based query API like
    /// IGDB's). Still sends the same default `User-Agent` as a base, but a plugin-supplied
    /// header of the same name overrides it (`reqwest` uses the last `.header()` call for a
    /// given name), matching normal HTTP header-override expectations.
    fn do_http_request(
        &mut self,
        method: String,
        url: String,
        headers: Vec<(String, String)>,
        body: Option<String>,
    ) -> Result<String, String> {
        if !self.is_allowed_host(&url) {
            return Err(format!(
                "Network access denied: \"{}\" is outside this plugin's declared httpScopes.",
                url
            ));
        }
        let method = reqwest::Method::from_bytes(method.as_bytes())
            .map_err(|e| format!("Invalid HTTP method \"{}\": {}", method, e))?;

        let mut request = reqwest::blocking::Client::new()
            .request(method, &url)
            .header("User-Agent", "concourse");
        for (name, value) in headers {
            request = request.header(name, value);
        }
        if let Some(body) = body {
            request = request.body(body);
        }

        request
            .send()
            .map_err(|e| e.to_string())?
            .text()
            .map_err(|e| e.to_string())
    }

    fn do_download_bytes(&mut self, url: String) -> Result<Vec<u8>, String> {
        if !self.is_allowed_host(&url) {
            return Err(format!(
                "Network access denied: \"{}\" is outside this plugin's declared httpScopes.",
                url
            ));
        }
        reqwest::blocking::Client::new()
            .get(&url)
            .header("User-Agent", "concourse")
            .send()
            .map_err(|e| e.to_string())?
            .bytes()
            .map(|b| b.to_vec())
            .map_err(|e| e.to_string())
    }

    fn do_extract_zip(&mut self, bytes: Vec<u8>, dest_dir: String) -> Result<(), String> {
        zip_install::extract_zip(&bytes, Path::new(&dest_dir))
    }

    fn do_unwrap_single_subdir(&mut self, dir: String) -> Result<String, String> {
        zip_install::unwrap_single_subdir(Path::new(&dir)).map(|p| p.to_string_lossy().to_string())
    }

    fn do_replace_dir(&mut self, src: String, dest: String) -> Result<(), String> {
        zip_install::replace_dir(Path::new(&src), Path::new(&dest))
    }

    fn do_plugin_dir(&mut self) -> Result<String, String> {
        Ok(self.plugin_dir.to_string_lossy().to_string())
    }

    fn do_settings_get(&mut self, key: String) -> Option<String> {
        let namespaced = self.namespaced_settings_key(&key);
        self.db
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                [&namespaced],
                |row| row.get(0),
            )
            .ok()
    }

    fn do_settings_set(&mut self, key: String, value: String) {
        let namespaced = self.namespaced_settings_key(&key);
        let _ = self.db.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = ?2",
            rusqlite::params![namespaced, value],
        );
    }

    fn do_plugin_data_get(&mut self, game_id: i64, key: String) -> Option<String> {
        self.db
            .query_row(
                "SELECT value FROM plugin_data WHERE plugin_id = ?1 AND game_id = ?2 AND key = ?3",
                rusqlite::params![self.plugin_id, game_id, key],
                |row| row.get(0),
            )
            .ok()
    }

    fn do_plugin_data_set(&mut self, game_id: i64, key: String, value: String) {
        let _ = self.db.execute(
            "INSERT INTO plugin_data (plugin_id, game_id, key, value) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(plugin_id, game_id, key) DO UPDATE SET value = ?4",
            rusqlite::params![self.plugin_id, game_id, key, value],
        );
    }
}

impl gamelib::plugin::host::Host for PluginHostState {
    fn read_registry_string(
        &mut self,
        hive: String,
        path: String,
        value: String,
    ) -> Option<String> {
        self.do_read_registry_string(hive, path, value)
    }

    fn list_registry_keys(&mut self, hive: String, path: String) -> Result<Vec<String>, String> {
        self.do_list_registry_keys(hive, path)
    }

    fn read_file(&mut self, path: String) -> Result<String, String> {
        self.do_read_file(path)
    }

    fn write_file(&mut self, path: String, contents: String) -> Result<(), String> {
        self.do_write_file(path, contents)
    }

    fn list_dir(&mut self, path: String) -> Result<Vec<String>, String> {
        self.do_list_dir(path)
    }

    fn path_exists(&mut self, path: String) -> bool {
        self.do_path_exists(path)
    }

    fn remove_dir(&mut self, path: String) -> Result<(), String> {
        self.do_remove_dir(path)
    }

    fn request_read_scope(&mut self, path: String) -> Result<(), String> {
        self.do_request_read_scope(path)
    }

    fn spawn_process(&mut self, path: String, args: Vec<String>) -> Result<(), String> {
        self.do_spawn_process(path, args)
    }

    fn run_and_wait(&mut self, path: String, args: Vec<String>, cwd: String) -> Result<(), String> {
        self.do_run_and_wait(path, args, cwd)
    }

    fn http_get(&mut self, url: String) -> Result<String, String> {
        self.do_http_get(url)
    }

    fn http_request(
        &mut self,
        method: String,
        url: String,
        headers: Vec<(String, String)>,
        body: Option<String>,
    ) -> Result<String, String> {
        self.do_http_request(method, url, headers, body)
    }

    fn download_bytes(&mut self, url: String) -> Result<Vec<u8>, String> {
        self.do_download_bytes(url)
    }

    fn extract_zip(&mut self, bytes: Vec<u8>, dest_dir: String) -> Result<(), String> {
        self.do_extract_zip(bytes, dest_dir)
    }

    fn unwrap_single_subdir(&mut self, dir: String) -> Result<String, String> {
        self.do_unwrap_single_subdir(dir)
    }

    fn replace_dir(&mut self, src: String, dest: String) -> Result<(), String> {
        self.do_replace_dir(src, dest)
    }

    fn plugin_dir(&mut self) -> Result<String, String> {
        self.do_plugin_dir()
    }

    fn settings_get(&mut self, key: String) -> Option<String> {
        self.do_settings_get(key)
    }

    fn settings_set(&mut self, key: String, value: String) {
        self.do_settings_set(key, value)
    }

    fn plugin_data_get(&mut self, game_id: i64, key: String) -> Option<String> {
        self.do_plugin_data_get(game_id, key)
    }

    fn plugin_data_set(&mut self, game_id: i64, key: String, value: String) {
        self.do_plugin_data_set(game_id, key, value)
    }
}

impl wrapper_world::gamelib::plugin::host::Host for PluginHostState {
    fn read_registry_string(
        &mut self,
        hive: String,
        path: String,
        value: String,
    ) -> Option<String> {
        self.do_read_registry_string(hive, path, value)
    }

    fn list_registry_keys(&mut self, hive: String, path: String) -> Result<Vec<String>, String> {
        self.do_list_registry_keys(hive, path)
    }

    fn read_file(&mut self, path: String) -> Result<String, String> {
        self.do_read_file(path)
    }

    fn write_file(&mut self, path: String, contents: String) -> Result<(), String> {
        self.do_write_file(path, contents)
    }

    fn list_dir(&mut self, path: String) -> Result<Vec<String>, String> {
        self.do_list_dir(path)
    }

    fn path_exists(&mut self, path: String) -> bool {
        self.do_path_exists(path)
    }

    fn remove_dir(&mut self, path: String) -> Result<(), String> {
        self.do_remove_dir(path)
    }

    fn request_read_scope(&mut self, path: String) -> Result<(), String> {
        self.do_request_read_scope(path)
    }

    fn spawn_process(&mut self, path: String, args: Vec<String>) -> Result<(), String> {
        self.do_spawn_process(path, args)
    }

    fn run_and_wait(&mut self, path: String, args: Vec<String>, cwd: String) -> Result<(), String> {
        self.do_run_and_wait(path, args, cwd)
    }

    fn http_get(&mut self, url: String) -> Result<String, String> {
        self.do_http_get(url)
    }

    fn http_request(
        &mut self,
        method: String,
        url: String,
        headers: Vec<(String, String)>,
        body: Option<String>,
    ) -> Result<String, String> {
        self.do_http_request(method, url, headers, body)
    }

    fn download_bytes(&mut self, url: String) -> Result<Vec<u8>, String> {
        self.do_download_bytes(url)
    }

    fn extract_zip(&mut self, bytes: Vec<u8>, dest_dir: String) -> Result<(), String> {
        self.do_extract_zip(bytes, dest_dir)
    }

    fn unwrap_single_subdir(&mut self, dir: String) -> Result<String, String> {
        self.do_unwrap_single_subdir(dir)
    }

    fn replace_dir(&mut self, src: String, dest: String) -> Result<(), String> {
        self.do_replace_dir(src, dest)
    }

    fn plugin_dir(&mut self) -> Result<String, String> {
        self.do_plugin_dir()
    }

    fn settings_get(&mut self, key: String) -> Option<String> {
        self.do_settings_get(key)
    }

    fn settings_set(&mut self, key: String, value: String) {
        self.do_settings_set(key, value)
    }

    fn plugin_data_get(&mut self, game_id: i64, key: String) -> Option<String> {
        self.do_plugin_data_get(game_id, key)
    }

    fn plugin_data_set(&mut self, game_id: i64, key: String, value: String) {
        self.do_plugin_data_set(game_id, key, value)
    }
}

impl metadata_world::gamelib::plugin::host::Host for PluginHostState {
    fn read_registry_string(
        &mut self,
        hive: String,
        path: String,
        value: String,
    ) -> Option<String> {
        self.do_read_registry_string(hive, path, value)
    }

    fn list_registry_keys(&mut self, hive: String, path: String) -> Result<Vec<String>, String> {
        self.do_list_registry_keys(hive, path)
    }

    fn read_file(&mut self, path: String) -> Result<String, String> {
        self.do_read_file(path)
    }

    fn write_file(&mut self, path: String, contents: String) -> Result<(), String> {
        self.do_write_file(path, contents)
    }

    fn list_dir(&mut self, path: String) -> Result<Vec<String>, String> {
        self.do_list_dir(path)
    }

    fn path_exists(&mut self, path: String) -> bool {
        self.do_path_exists(path)
    }

    fn remove_dir(&mut self, path: String) -> Result<(), String> {
        self.do_remove_dir(path)
    }

    fn request_read_scope(&mut self, path: String) -> Result<(), String> {
        self.do_request_read_scope(path)
    }

    fn spawn_process(&mut self, path: String, args: Vec<String>) -> Result<(), String> {
        self.do_spawn_process(path, args)
    }

    fn run_and_wait(&mut self, path: String, args: Vec<String>, cwd: String) -> Result<(), String> {
        self.do_run_and_wait(path, args, cwd)
    }

    fn http_get(&mut self, url: String) -> Result<String, String> {
        self.do_http_get(url)
    }

    fn http_request(
        &mut self,
        method: String,
        url: String,
        headers: Vec<(String, String)>,
        body: Option<String>,
    ) -> Result<String, String> {
        self.do_http_request(method, url, headers, body)
    }

    fn download_bytes(&mut self, url: String) -> Result<Vec<u8>, String> {
        self.do_download_bytes(url)
    }

    fn extract_zip(&mut self, bytes: Vec<u8>, dest_dir: String) -> Result<(), String> {
        self.do_extract_zip(bytes, dest_dir)
    }

    fn unwrap_single_subdir(&mut self, dir: String) -> Result<String, String> {
        self.do_unwrap_single_subdir(dir)
    }

    fn replace_dir(&mut self, src: String, dest: String) -> Result<(), String> {
        self.do_replace_dir(src, dest)
    }

    fn plugin_dir(&mut self) -> Result<String, String> {
        self.do_plugin_dir()
    }

    fn settings_get(&mut self, key: String) -> Option<String> {
        self.do_settings_get(key)
    }

    fn settings_set(&mut self, key: String, value: String) {
        self.do_settings_set(key, value)
    }

    fn plugin_data_get(&mut self, game_id: i64, key: String) -> Option<String> {
        self.do_plugin_data_get(game_id, key)
    }

    fn plugin_data_set(&mut self, game_id: i64, key: String, value: String) {
        self.do_plugin_data_set(game_id, key, value)
    }
}
