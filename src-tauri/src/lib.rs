// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn launch_game(executable_path: String) -> Result<(), String> {
    std::process::Command::new(&executable_path)
        .spawn()
        .map_err(|e| format!("Failed to launch {}: {}", executable_path, e))?;
    Ok(())
}

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_core_schema",
        sql: r#"
            CREATE TABLE games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                executable_path TEXT NOT NULL,
                platform TEXT,
                cover_art_url TEXT,
                background_art_url TEXT,
                description TEXT,
                release_date TEXT,
                total_playtime INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );

            CREATE TABLE game_tags (
                game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (game_id, tag_id)
            );

            CREATE TABLE playtime_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                start_time TEXT NOT NULL,
                end_time TEXT,
                duration_seconds INTEGER
            );
        "#,
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:library.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![greet, launch_game])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
