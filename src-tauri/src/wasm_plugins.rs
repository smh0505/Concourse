//! Host-side scaffolding for WASM `SourcePlugin`s: wires up the wasmtime Component Model
//! bindings generated from `wit/plugin.wit` and implements the `host` interface plugins import.

use crate::zip_install;
use std::path::{Path, PathBuf};
use wasmtime::component::bindgen;
use wasmtime_wasi::{ResourceTable, WasiCtx, WasiCtxBuilder, WasiView};

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
}

impl PluginHostState {
    pub fn new(plugin_id: String, plugin_dir: PathBuf, db_path: &Path) -> rusqlite::Result<Self> {
        let db = rusqlite::Connection::open(db_path)?;
        Ok(Self {
            plugin_id,
            plugin_dir,
            db,
            wasi_ctx: WasiCtxBuilder::new().build(),
            resource_table: ResourceTable::new(),
        })
    }

    /// Never lets a plugin's own key collide with another plugin's or a core app setting.
    fn namespaced_settings_key(&self, key: &str) -> String {
        format!("plugin:{}:{}", self.plugin_id, key)
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
    fn do_read_registry_string(&mut self, hive: String, path: String, value: String) -> Option<String> {
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
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
    }

    fn do_write_file(&mut self, path: String, contents: String) -> Result<(), String> {
        if let Some(parent) = Path::new(&path).parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
        }
        std::fs::write(&path, contents).map_err(|e| format!("Failed to write {}: {}", path, e))
    }

    fn do_remove_dir(&mut self, path: String) -> Result<(), String> {
        if !Path::new(&path).exists() {
            return Ok(());
        }
        std::fs::remove_dir_all(&path).map_err(|e| format!("Failed to remove {}: {}", path, e))
    }

    fn do_list_dir(&mut self, path: String) -> Result<Vec<String>, String> {
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
        std::path::Path::new(&path).exists()
    }

    /// Fire-and-forget, like launch() elsewhere in this app - playtime is covered separately by
    /// `launcher.rs::track_folder_playtime`.
    fn do_spawn_process(&mut self, path: String, args: Vec<String>) -> Result<(), String> {
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
    /// before continuing (mirrors the pre-migration wrapper_installer.rs's run_wrapper_installer).
    /// Deliberately ignores the exit code, only the spawn itself can fail - LR/LE's installer
    /// windows aren't real wizards with a meaningful success/failure exit status, they're just
    /// closed by the user whenever, so treating a nonzero exit as failure would reject a
    /// perfectly normal close (confirmed by a real test: force-closing the window here
    /// previously turned a fully successful install into a reported failure).
    fn do_run_and_wait(&mut self, path: String, args: Vec<String>, cwd: String) -> Result<(), String> {
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
        reqwest::blocking::Client::new()
            .get(&url)
            .header("User-Agent", "concourse")
            .send()
            .map_err(|e| e.to_string())?
            .text()
            .map_err(|e| e.to_string())
    }

    fn do_download_bytes(&mut self, url: String) -> Result<Vec<u8>, String> {
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
        zip_install::unwrap_single_subdir(Path::new(&dir))
            .map(|p| p.to_string_lossy().to_string())
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
    fn read_registry_string(&mut self, hive: String, path: String, value: String) -> Option<String> {
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

    fn spawn_process(&mut self, path: String, args: Vec<String>) -> Result<(), String> {
        self.do_spawn_process(path, args)
    }

    fn run_and_wait(&mut self, path: String, args: Vec<String>, cwd: String) -> Result<(), String> {
        self.do_run_and_wait(path, args, cwd)
    }

    fn http_get(&mut self, url: String) -> Result<String, String> {
        self.do_http_get(url)
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
    fn read_registry_string(&mut self, hive: String, path: String, value: String) -> Option<String> {
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

    fn spawn_process(&mut self, path: String, args: Vec<String>) -> Result<(), String> {
        self.do_spawn_process(path, args)
    }

    fn run_and_wait(&mut self, path: String, args: Vec<String>, cwd: String) -> Result<(), String> {
        self.do_run_and_wait(path, args, cwd)
    }

    fn http_get(&mut self, url: String) -> Result<String, String> {
        self.do_http_get(url)
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
