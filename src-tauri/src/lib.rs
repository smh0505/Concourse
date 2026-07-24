// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod db;
mod epic;
mod gog;
mod igdb;
mod launcher;
mod sgdb;
mod wasm_plugin_installer;
mod wasm_plugin_runtime;
mod wasm_plugins;
mod zip_install;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(db::DB_URL, db::migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            greet,
            launcher::launch_game,
            launcher::track_folder_playtime,
            sgdb::fetch_cover_art,
            sgdb::fetch_background_art,
            igdb::fetch_igdb_metadata,
            epic::find_epic_apps,
            gog::find_gog_apps,
            gog::launch_gog_game,
            wasm_plugin_installer::install_wasm_plugin,
            wasm_plugin_installer::list_wasm_plugins,
            wasm_plugin_runtime::wasm_plugin_scan,
            wasm_plugin_runtime::wasm_plugin_launch,
            wasm_plugin_runtime::wasm_plugin_get_install_status,
            wasm_plugin_runtime::wasm_wrapper_install,
            wasm_plugin_runtime::wasm_wrapper_is_installed,
            wasm_plugin_runtime::wasm_wrapper_list_profiles,
            wasm_plugin_runtime::wasm_wrapper_launch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
