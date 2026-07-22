//! Host-side scaffolding for WASM `SourcePlugin`s (Milestone 8). This wires up the
//! wasmtime Component Model bindings generated from `wit/plugin.wit` and implements the
//! `host` interface those plugins import - the actual load/instantiate/download pipeline
//! (checklist items after this one) isn't built yet, this only proves the bindings compile
//! and gives the rest of that work a concrete `Host` trait to implement against.

use std::path::Path;
use wasmtime::component::bindgen;
use wasmtime_wasi::{ResourceTable, WasiCtx, WasiCtxBuilder, WasiView};

bindgen!({
    path: "wit/plugin.wit",
    world: "source-plugin-world",
});

/// Per-instantiation state passed to a plugin's `Store`. Holds whatever the `host` interface
/// implementation below needs - the calling plugin's own id, used to namespace
/// `settings`/`plugin_data` access so plugins can't read/write each other's data, and a
/// dedicated Rust-side SQLite connection to the same `library.db` the frontend's
/// `tauri-plugin-sql` connection uses. This app's DB is otherwise frontend-owned (see
/// CLAUDE.md) - Rust needs its own connection here only because `Host` trait methods are
/// synchronous calls made deep inside wasmtime execution, with no path back to the
/// frontend's async connection. Multiple SQLite connections to the same file is standard
/// and safe (that's what SQLite's own file locking is for).
///
/// Also carries a bare, no-capability WASI context: components built via `cargo component`
/// for the `wasm32-wasip1` target import baseline `wasi:cli/*` interfaces even when they
/// never touch real WASI filesystem/env access (as ours doesn't - it only calls our own
/// `host` interface), so the host still has to satisfy those imports at instantiation time.
pub struct PluginHostState {
    pub plugin_id: String,
    db: rusqlite::Connection,
    wasi_ctx: WasiCtx,
    resource_table: ResourceTable,
}

impl PluginHostState {
    pub fn new(plugin_id: String, db_path: &Path) -> rusqlite::Result<Self> {
        let db = rusqlite::Connection::open(db_path)?;
        Ok(Self {
            plugin_id,
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

impl gamelib::plugin::host::Host for PluginHostState {
    fn read_registry_string(&mut self, hive: String, path: String, value: String) -> Option<String> {
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

    fn read_file(&mut self, path: String) -> Result<String, String> {
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
    }

    fn list_dir(&mut self, path: String) -> Result<Vec<String>, String> {
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

    fn path_exists(&mut self, path: String) -> bool {
        std::path::Path::new(&path).exists()
    }

    /// Fire-and-forget, matching how launch() is used elsewhere in this app - the host's
    /// own folder-based playtime tracking (launcher.rs::track_folder_playtime) covers
    /// session duration rather than waiting on this process directly.
    fn spawn_process(&mut self, path: String, args: Vec<String>) -> Result<(), String> {
        std::process::Command::new(&path)
            .args(&args)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn {}: {}", path, e))?;
        Ok(())
    }

    /// Uses reqwest's blocking client rather than the async one used elsewhere in this
    /// codebase (sgdb.rs/igdb.rs) - wasmtime component calls are synchronous, and this must
    /// only ever be invoked from a blocking context (e.g. spawn_blocking), never directly on
    /// the async runtime thread, same requirement wasmtime's own CPU-bound execution has.
    fn http_get(&mut self, url: String) -> Result<String, String> {
        reqwest::blocking::get(&url)
            .map_err(|e| e.to_string())?
            .text()
            .map_err(|e| e.to_string())
    }

    fn settings_get(&mut self, key: String) -> Option<String> {
        let namespaced = self.namespaced_settings_key(&key);
        self.db
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                [&namespaced],
                |row| row.get(0),
            )
            .ok()
    }

    fn settings_set(&mut self, key: String, value: String) {
        let namespaced = self.namespaced_settings_key(&key);
        let _ = self.db.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = ?2",
            rusqlite::params![namespaced, value],
        );
    }

    fn plugin_data_get(&mut self, game_id: i64, key: String) -> Option<String> {
        self.db
            .query_row(
                "SELECT value FROM plugin_data WHERE plugin_id = ?1 AND game_id = ?2 AND key = ?3",
                rusqlite::params![self.plugin_id, game_id, key],
                |row| row.get(0),
            )
            .ok()
    }

    fn plugin_data_set(&mut self, game_id: i64, key: String, value: String) {
        let _ = self.db.execute(
            "INSERT INTO plugin_data (plugin_id, game_id, key, value) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(plugin_id, game_id, key) DO UPDATE SET value = ?4",
            rusqlite::params![self.plugin_id, game_id, key, value],
        );
    }
}
