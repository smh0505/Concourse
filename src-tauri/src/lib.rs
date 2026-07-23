// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod db;
mod epic;
mod gog;
mod igdb;
mod launcher;
mod locale_emulator;
mod locale_remulator;
mod sgdb;
mod wasm_plugin_installer;
mod wasm_plugin_runtime;
mod wasm_plugins;
mod wrapper_installer;

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
            locale_remulator::wrapper_path_exists,
            locale_remulator::list_locale_remulator_profiles,
            locale_remulator::launch_via_locale_remulator,
            locale_emulator::list_locale_emulator_profiles,
            locale_emulator::launch_via_locale_emulator,
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
            wrapper_installer::latest_locale_remulator_download_url,
            wrapper_installer::latest_locale_emulator_download_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
