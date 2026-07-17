// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod db;
mod igdb;
mod launcher;
mod sgdb;

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
            sgdb::fetch_cover_art,
            igdb::fetch_igdb_metadata
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
