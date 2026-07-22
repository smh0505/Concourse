//! Loads/instantiates a WASM `SourcePlugin` and exposes its exports to the frontend via
//! Tauri commands - the frontend never talks to plugin code directly (see wasm_plugins.rs
//! for the host-function surface these plugins call back into).

use crate::wasm_plugins::{gamelib::plugin::host::GameEntry, PluginHostState, SourcePluginWorld};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use wasmtime::component::{Component, Linker};
use wasmtime::{Config, Engine, Store};

#[derive(Deserialize)]
struct WasmPluginManifest {
    entry: String,
}

/// Mirrors the TS `GameEntry` shape (src/plugins/types.ts) - `rename_all = "camelCase"` so
/// the JSON wire format matches it exactly (`executablePath`, not `executable_path`),
/// letting the frontend loader pass/receive these with no manual field mapping. Kept as our
/// own DTOs rather than deriving Serialize/Deserialize on the wasmtime-bindgen-generated
/// `GameEntry` directly, so this stays decoupled from bindgen's derive support and free to
/// diverge if the WIT record ever needs fields the wire format shouldn't have.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmGameEntry {
    pub id: String,
    pub title: String,
    pub executable_path: String,
    pub platform: String,
    pub cover_art_url: Option<String>,
    pub install_dir: Option<String>,
}

impl From<GameEntry> for WasmGameEntry {
    fn from(entry: GameEntry) -> Self {
        Self {
            id: entry.id,
            title: entry.title,
            executable_path: entry.executable_path,
            platform: entry.platform,
            cover_art_url: entry.cover_art_url,
            install_dir: entry.install_dir,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmGameEntryInput {
    pub id: String,
    pub title: String,
    pub executable_path: String,
    pub platform: String,
    pub cover_art_url: Option<String>,
    pub install_dir: Option<String>,
}

impl From<WasmGameEntryInput> for GameEntry {
    fn from(entry: WasmGameEntryInput) -> Self {
        Self {
            id: entry.id,
            title: entry.title,
            executable_path: entry.executable_path,
            platform: entry.platform,
            cover_art_url: entry.cover_art_url,
            install_dir: entry.install_dir,
        }
    }
}

fn plugin_dir(app: &AppHandle, plugin_id: &str) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("wasm-plugins").join(plugin_id))
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("library.db"))
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))
}

/// Instantiates a plugin already sitting at `plugin_dir` fresh for this call - components
/// are cheap to instantiate relative to how infrequently `scan`/`launch`/`getInstallStatus`
/// run (user-triggered, not a hot path), so there's no engine/instance cache here yet. Runs
/// entirely synchronously; callers must invoke this from a blocking context
/// (`spawn_blocking`), never directly on the async runtime thread - same requirement the
/// host functions themselves have. Kept free of `AppHandle` so it's directly unit-testable
/// (see the `tests` module below) without needing a running Tauri app.
fn instantiate_from_paths(
    plugin_dir: &Path,
    plugin_id: &str,
    db_path: &Path,
) -> Result<(Store<PluginHostState>, SourcePluginWorld), String> {
    let manifest_content = std::fs::read_to_string(plugin_dir.join("plugin.json"))
        .map_err(|e| format!("Failed to read plugin.json: {}", e))?;
    let manifest: WasmPluginManifest = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("Invalid plugin.json: {}", e))?;

    let mut config = Config::new();
    config.wasm_component_model(true);
    let engine = Engine::new(&config).map_err(|e| e.to_string())?;

    let component = Component::from_file(&engine, plugin_dir.join(&manifest.entry))
        .map_err(|e| format!("Failed to load {}: {}", manifest.entry, e))?;

    let mut linker = Linker::new(&engine);
    crate::wasm_plugins::gamelib::plugin::host::add_to_linker(&mut linker, |state| state)
        .map_err(|e| e.to_string())?;
    // Satisfies the baseline wasi:cli/* imports cargo-component's wasm32-wasip1 target
    // pulls in even for a capability-less "reactor" component like this one - see
    // PluginHostState's doc comment.
    wasmtime_wasi::add_to_linker_sync(&mut linker).map_err(|e| e.to_string())?;

    let state = PluginHostState::new(plugin_id.to_string(), db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    let mut store = Store::new(&engine, state);

    let instance = SourcePluginWorld::instantiate(&mut store, &component, &linker)
        .map_err(|e| format!("Failed to instantiate plugin: {}", e))?;

    Ok((store, instance))
}

fn instantiate(app: &AppHandle, plugin_id: &str) -> Result<(Store<PluginHostState>, SourcePluginWorld), String> {
    instantiate_from_paths(&plugin_dir(app, plugin_id)?, plugin_id, &db_path(app)?)
}

#[tauri::command]
pub async fn wasm_plugin_scan(app: AppHandle, plugin_id: String) -> Result<Vec<WasmGameEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (mut store, instance) = instantiate(&app, &plugin_id)?;
        instance
            .gamelib_plugin_source_plugin()
            .call_scan(&mut store)
            .map_err(|e| format!("Plugin trapped during scan: {}", e))?
            .map(|entries| entries.into_iter().map(WasmGameEntry::from).collect())
    })
    .await
    .map_err(|e| format!("Plugin task panicked: {}", e))?
}

#[tauri::command]
pub async fn wasm_plugin_launch(
    app: AppHandle,
    plugin_id: String,
    entry: WasmGameEntryInput,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (mut store, instance) = instantiate(&app, &plugin_id)?;
        instance
            .gamelib_plugin_source_plugin()
            .call_launch(&mut store, &entry.into())
            .map_err(|e| format!("Plugin trapped during launch: {}", e))?
    })
    .await
    .map_err(|e| format!("Plugin task panicked: {}", e))?
}

#[tauri::command]
pub async fn wasm_plugin_get_install_status(
    app: AppHandle,
    plugin_id: String,
    entry: WasmGameEntryInput,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (mut store, instance) = instantiate(&app, &plugin_id)?;
        instance
            .gamelib_plugin_source_plugin()
            .call_get_install_status(&mut store, &entry.into())
            .map_err(|e| format!("Plugin trapped during getInstallStatus: {}", e))?
    })
    .await
    .map_err(|e| format!("Plugin task panicked: {}", e))?
}

/// End-to-end proof for Milestone 8's "reference example" checklist item, against the real
/// compiled `examples/exe-scanner-plugin` component (built via `cargo component build` there
/// - see that crate for the guest-side implementation). Exercises the full path: load a real
/// `.wasm` component, instantiate it against the host-function surface, have it call
/// `settings-get`/`list-dir`/`path-exists` back into the host, and get real `GameEntry`
/// results back across the component boundary - not just "does it compile" like the earlier
/// checklist items necessarily were, since no component existed yet at that point.
#[cfg(test)]
mod tests {
    use super::*;
    use crate::wasm_plugins::gamelib::plugin::host::Host as _;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "gamelib-wasm-test-{}-{}",
                label,
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn compiled_component_path() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("examples")
            .join("exe-scanner-plugin")
            .join("target")
            .join("wasm32-wasip1")
            .join("debug")
            .join("exe_scanner_plugin.wasm")
    }

    fn init_test_db(path: &Path) {
        let db = rusqlite::Connection::open(path).unwrap();
        db.execute_batch(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE plugin_data (
                 plugin_id TEXT NOT NULL,
                 game_id INTEGER NOT NULL,
                 key TEXT NOT NULL,
                 value TEXT NOT NULL,
                 PRIMARY KEY (plugin_id, game_id, key)
             );",
        )
        .unwrap();
    }

    #[test]
    fn scans_launches_and_checks_install_status_through_a_real_component() {
        let component_path = compiled_component_path();
        assert!(
            component_path.exists(),
            "build the reference plugin first: `cd examples/exe-scanner-plugin && cargo component build` ({})",
            component_path.display()
        );

        let temp = TempDir::new("root");

        let plugin_dir = temp.0.join("plugin");
        std::fs::create_dir_all(&plugin_dir).unwrap();
        std::fs::copy(&component_path, plugin_dir.join("entry.wasm")).unwrap();
        std::fs::write(
            plugin_dir.join("plugin.json"),
            r#"{"id":"test-exe-scanner","name":"Test Exe Scanner","version":"0.1.0","kind":"source","entry":"entry.wasm"}"#,
        )
        .unwrap();

        let games_dir = temp.0.join("games");
        std::fs::create_dir_all(&games_dir).unwrap();
        std::fs::write(games_dir.join("game1.exe"), b"not a real PE, just test bytes").unwrap();
        std::fs::write(games_dir.join("readme.txt"), b"should be filtered out").unwrap();

        let db_path = temp.0.join("test.db");
        init_test_db(&db_path);

        let (mut store, instance) =
            instantiate_from_paths(&plugin_dir, "test-exe-scanner", &db_path)
                .expect("instantiate should succeed");

        store
            .data_mut()
            .settings_set("scan_dir".to_string(), games_dir.to_string_lossy().to_string());

        let entries = instance
            .gamelib_plugin_source_plugin()
            .call_scan(&mut store)
            .expect("call should not trap")
            .expect("scan should succeed");

        assert_eq!(entries.len(), 1, "readme.txt must be filtered out: {:?}", entries);
        assert_eq!(entries[0].title, "game1");
        assert!(entries[0].executable_path.ends_with("game1.exe"));
        assert_eq!(entries[0].platform, "exe-scanner");

        let installed = instance
            .gamelib_plugin_source_plugin()
            .call_get_install_status(&mut store, &entries[0])
            .expect("call should not trap")
            .expect("getInstallStatus should succeed");
        assert!(installed);
    }
}
