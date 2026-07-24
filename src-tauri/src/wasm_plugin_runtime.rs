//! Loads/instantiates a WASM `SourcePlugin` and exposes its exports to the frontend via
//! Tauri commands - the frontend never talks to plugin code directly (see wasm_plugins.rs
//! for the host-function surface these plugins call back into).

use crate::wasm_plugins::{
    gamelib::plugin::host::GameEntry, wrapper_world::WrapperPluginWorld, PluginHostState,
    SourcePluginWorld,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use wasmtime::component::{Component, Linker};
use wasmtime::{Config, Engine, Store};

#[derive(Deserialize)]
struct WasmPluginManifest {
    entry: String,
}

/// Mirrors the TS `GameEntry` shape (src/plugins/types.ts); `rename_all = "camelCase"` matches
/// the wire format exactly. Kept as our own DTOs rather than deriving Serialize/Deserialize on
/// the bindgen-generated `GameEntry` directly, decoupling this from bindgen's derive support.
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

/// Mirrors the TS `LocaleProfile` shape (src/plugins/types.ts).
#[derive(Serialize)]
pub struct WasmLocaleProfile {
    pub name: String,
    pub guid: String,
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

/// Instantiates a plugin at `plugin_dir` fresh for this call - no engine/instance cache, since
/// `scan`/`launch`/`getInstallStatus` are user-triggered, not a hot path. Runs synchronously;
/// callers must invoke from a blocking context (`spawn_blocking`), never the async runtime
/// thread. Kept `AppHandle`-free so it's directly unit-testable without a running Tauri app.
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
    // Satisfies baseline wasi:cli/* imports cargo-component's wasm32-wasip1 target pulls in
    // even for a capability-less component - see PluginHostState's doc comment.
    wasmtime_wasi::add_to_linker_sync(&mut linker).map_err(|e| e.to_string())?;

    let state = PluginHostState::new(plugin_id.to_string(), plugin_dir.to_path_buf(), db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    let mut store = Store::new(&engine, state);

    let instance = SourcePluginWorld::instantiate(&mut store, &component, &linker)
        .map_err(|e| format!("Failed to instantiate plugin: {}", e))?;

    Ok((store, instance))
}

fn instantiate(app: &AppHandle, plugin_id: &str) -> Result<(Store<PluginHostState>, SourcePluginWorld), String> {
    instantiate_from_paths(&plugin_dir(app, plugin_id)?, plugin_id, &db_path(app)?)
}

/// Same shape as `instantiate_from_paths` above, just against `wrapper-plugin-world` instead
/// of `source-plugin-world` - see that function's doc comment.
fn instantiate_wrapper_from_paths(
    plugin_dir: &Path,
    plugin_id: &str,
    db_path: &Path,
) -> Result<(Store<PluginHostState>, WrapperPluginWorld), String> {
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
    crate::wasm_plugins::wrapper_world::gamelib::plugin::host::add_to_linker(&mut linker, |state| state)
        .map_err(|e| e.to_string())?;
    wasmtime_wasi::add_to_linker_sync(&mut linker).map_err(|e| e.to_string())?;

    let state = PluginHostState::new(plugin_id.to_string(), plugin_dir.to_path_buf(), db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    let mut store = Store::new(&engine, state);

    let instance = WrapperPluginWorld::instantiate(&mut store, &component, &linker)
        .map_err(|e| format!("Failed to instantiate plugin: {}", e))?;

    Ok((store, instance))
}

fn instantiate_wrapper(
    app: &AppHandle,
    plugin_id: &str,
) -> Result<(Store<PluginHostState>, WrapperPluginWorld), String> {
    instantiate_wrapper_from_paths(&plugin_dir(app, plugin_id)?, plugin_id, &db_path(app)?)
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

/// Runs a plugin's own managed install (download, extract, seed config, run the vendor
/// installer) - the plugin decides all of that itself now, this just gives it enough time to.
/// No timeout: a visible installer window is expected to stay open until the user closes it.
#[tauri::command]
pub async fn wasm_wrapper_install(app: AppHandle, plugin_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (mut store, instance) = instantiate_wrapper(&app, &plugin_id)?;
        instance
            .gamelib_plugin_wrapper_plugin()
            .call_install(&mut store)
            .map_err(|e| format!("Plugin trapped during install: {}", e))?
    })
    .await
    .map_err(|e| format!("Plugin task panicked: {}", e))?
}

#[tauri::command]
pub async fn wasm_wrapper_is_installed(app: AppHandle, plugin_id: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (mut store, instance) = instantiate_wrapper(&app, &plugin_id)?;
        instance
            .gamelib_plugin_wrapper_plugin()
            .call_is_installed(&mut store)
            .map_err(|e| format!("Plugin trapped during isInstalled: {}", e))
    })
    .await
    .map_err(|e| format!("Plugin task panicked: {}", e))?
}

#[tauri::command]
pub async fn wasm_wrapper_list_profiles(
    app: AppHandle,
    plugin_id: String,
) -> Result<Vec<WasmLocaleProfile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (mut store, instance) = instantiate_wrapper(&app, &plugin_id)?;
        instance
            .gamelib_plugin_wrapper_plugin()
            .call_list_profiles(&mut store)
            .map_err(|e| format!("Plugin trapped during listProfiles: {}", e))?
            .map(|profiles| {
                profiles
                    .into_iter()
                    .map(|p| WasmLocaleProfile { name: p.name, guid: p.guid })
                    .collect()
            })
    })
    .await
    .map_err(|e| format!("Plugin task panicked: {}", e))?
}

#[tauri::command]
pub async fn wasm_wrapper_launch(
    app: AppHandle,
    plugin_id: String,
    profile_guid: String,
    executable_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (mut store, instance) = instantiate_wrapper(&app, &plugin_id)?;
        instance
            .gamelib_plugin_wrapper_plugin()
            .call_launch(&mut store, &profile_guid, &executable_path)
            .map_err(|e| format!("Plugin trapped during launch: {}", e))?
    })
    .await
    .map_err(|e| format!("Plugin task panicked: {}", e))?
}

/// End-to-end test against the real compiled `examples/exe-scanner-plugin` component (build
/// first via `cargo component build` there): loads the `.wasm`, instantiates it against the
/// host-function surface, and round-trips real `GameEntry` results across the boundary.
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
