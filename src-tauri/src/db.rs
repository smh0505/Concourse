use tauri_plugin_sql::{Migration, MigrationKind};

pub const DB_URL: &str = "sqlite:library.db";

// Each entry here is a shipped migration, tracked per-version against every existing
// library.db via tauri-plugin-sql's own migration ledger. Once a version has shipped, its
// `sql`/`version` must never change - editing one in place desyncs that ledger from what's
// already been applied to real databases. Add a new migration instead (see CLAUDE.md).
//
// Squashed to a single baseline pre-1.0.0 (was v1-v8, incremental `ALTER TABLE`s added over
// the course of development) - safe only because the app has never shipped to a real user, so
// no live database anywhere depends on the old incremental ledger except local dev copies
// (reset those by deleting library.db; the squashed v1 recreates the same final schema from
// scratch). Once 1.0.0 ships, migrations go back to strictly additive/append-only.
pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_baseline_schema",
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
                total_playtime INTEGER NOT NULL DEFAULT 0,
                skip_dedup INTEGER NOT NULL DEFAULT 0,
                install_dir TEXT,
                locale_profile_guid TEXT,
                locale_wrapper TEXT
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

            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- Generic per-game key-value storage for WASM plugins (Milestone 8) - the
            -- sanctioned alternative to a plugin getting its own `games` column. Rows are
            -- namespaced by plugin_id, so a plugin's data is deletable in one statement on
            -- uninstall and can never collide with another plugin's or core `games` fields.
            CREATE TABLE plugin_data (
                plugin_id TEXT NOT NULL,
                game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                PRIMARY KEY (plugin_id, game_id, key)
            );
        "#,
        kind: MigrationKind::Up,
    }]
}
