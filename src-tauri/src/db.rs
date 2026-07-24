use tauri_plugin_sql::{Migration, MigrationKind};

pub const DB_URL: &str = "sqlite:library.db";

// Each entry here is a shipped migration, tracked per-version against every existing
// library.db via tauri-plugin-sql's own migration ledger. Once a version has shipped, its
// `sql`/`version` must never change - editing one in place desyncs that ledger from what's
// already been applied to real databases. Add a new migration instead (see CLAUDE.md).
pub fn migrations() -> Vec<Migration> {
    vec![
        // v1-v2: initial schema
        Migration {
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
        },
        Migration {
            version: 2,
            description: "create_settings_table",
            sql: r#"
            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        "#,
            kind: MigrationKind::Up,
        },
        // v3-v6: incremental `games` columns added for plugin scans (skip_dedup),
        // folder-based playtime tracking (install_dir), and compatibility wrappers
        // (locale_profile_guid, locale_wrapper)
        Migration {
            version: 3,
            description: "add_games_skip_dedup",
            sql: r#"
            ALTER TABLE games ADD COLUMN skip_dedup INTEGER NOT NULL DEFAULT 0;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_games_install_dir",
            sql: r#"
            ALTER TABLE games ADD COLUMN install_dir TEXT;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_games_locale_profile_guid",
            sql: r#"
            ALTER TABLE games ADD COLUMN locale_profile_guid TEXT;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_games_locale_wrapper",
            sql: r#"
            ALTER TABLE games ADD COLUMN locale_wrapper TEXT;
        "#,
            kind: MigrationKind::Up,
        },
        // v7: generic per-game key-value storage for WASM plugins (Milestone 8) - the
        // sanctioned alternative to a plugin getting its own `games` column. Rows are
        // namespaced by plugin_id, so a plugin's data is deletable in one statement on
        // uninstall and can never collide with another plugin's or core `games` fields.
        Migration {
            version: 7,
            description: "create_plugin_data_table",
            sql: r#"
            CREATE TABLE plugin_data (
                plugin_id TEXT NOT NULL,
                game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                PRIMARY KEY (plugin_id, game_id, key)
            );
        "#,
            kind: MigrationKind::Up,
        },
        // v8: LR/LE's launch logic moved from the built-in "lr"/"le" literals to WASM
        // wrapper plugins (Milestone 10) - remaps existing games' locale_wrapper values to
        // the new plugin ids so their saved wrapper selection keeps working after the switch.
        Migration {
            version: 8,
            description: "remap_locale_wrapper_to_wasm_plugin_ids",
            sql: r#"
            UPDATE games SET locale_wrapper = 'locale-remulator-wasm' WHERE locale_wrapper = 'lr';
            UPDATE games SET locale_wrapper = 'locale-emulator-wasm' WHERE locale_wrapper = 'le';
        "#,
            kind: MigrationKind::Up,
        },
    ]
}
