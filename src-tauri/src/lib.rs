// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;

mod db;
mod discord_presence;
mod image_utils;
mod launcher;
mod plugin_installer;
mod plugin_registry;
mod plugin_verification;
mod quick_launch;
mod translation;
mod tray;
mod wasm_plugin_runtime;
mod wasm_plugins;
mod zip_install;

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
        .manage(translation::TranslationState::new())
        .manage(tray::CloseToTrayState(std::sync::Mutex::new(true)))
        .manage(discord_presence::DiscordPresenceState::new())
        .setup(|app| {
            tray::build_tray(app.handle())?;
            quick_launch::init(app, quick_launch::DEFAULT_HOTKEY)?;
            if let Some(main_window) = app.get_webview_window("main") {
                tray::install_close_to_tray_handler(&main_window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            image_utils::check_image_brightness,
            launcher::launch_game,
            launcher::track_folder_playtime,
            tray::set_close_to_tray,
            quick_launch::set_quick_launch_hotkey,
            quick_launch::hide_quick_launch,
            plugin_installer::fetch_plugin_preview,
            plugin_installer::install_plugin,
            plugin_installer::list_data_themes,
            plugin_installer::uninstall_data_theme,
            plugin_installer::list_data_controller_mappings,
            plugin_installer::uninstall_data_controller_mapping,
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
            wasm_plugin_runtime::is_plugin_capability_granted,
            translation::list_translation_models,
            translation::is_translation_model_downloaded,
            translation::is_translation_engine_downloaded,
            translation::download_translation_engine,
            translation::remove_translation_engine,
            translation::download_translation_model,
            translation::remove_translation_model,
            translation::translate_text
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                app_handle
                    .state::<translation::TranslationState>()
                    .shutdown();
            }
        });
}
