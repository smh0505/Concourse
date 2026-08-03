// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod db;
mod image_utils;
mod launcher;
mod plugin_installer;
mod plugin_registry;
mod plugin_verification;
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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(db::DB_URL, db::migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            greet,
            image_utils::check_image_brightness,
            launcher::launch_game,
            launcher::track_folder_playtime,
            plugin_installer::fetch_plugin_preview,
            plugin_installer::install_plugin,
            plugin_installer::list_data_themes,
            plugin_installer::uninstall_data_theme,
            plugin_installer::list_wasm_plugins,
            plugin_installer::check_plugin_update,
            plugin_registry::fetch_plugin_registry,
            wasm_plugin_runtime::wasm_plugin_scan,
            wasm_plugin_runtime::wasm_plugin_launch,
            wasm_plugin_runtime::wasm_plugin_get_install_status,
            wasm_plugin_runtime::wasm_wrapper_install,
            wasm_plugin_runtime::wasm_wrapper_uninstall,
            wasm_plugin_runtime::wasm_wrapper_is_installed,
            wasm_plugin_runtime::wasm_wrapper_list_profiles,
            wasm_plugin_runtime::wasm_wrapper_launch,
            wasm_plugin_runtime::wasm_plugin_search_candidates,
            wasm_plugin_runtime::wasm_plugin_fetch_metadata_by_id,
            wasm_plugin_runtime::grant_plugin_capability,
            wasm_plugin_runtime::is_plugin_capability_granted
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
