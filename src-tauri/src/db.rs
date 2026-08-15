use tauri_plugin_sql::{Migration, MigrationKind};

pub const DB_URL: &str = "sqlite:library.db";

// Each entry here is a shipped migration, tracked per-version against every existing
// library.db via tauri-plugin-sql's own migration ledger. Once a version has shipped, its
// `sql`/`version` must never change - editing one in place desyncs that ledger from what's
// already been applied to real databases. Add a new migration instead (see CLAUDE.md).
//
// Squashed to a single baseline pre-1.0.0 - safe only because the app has never shipped to a
// real user, so no live database anywhere depends on the old incremental ledger except local
// dev copies (reset those by deleting library.db; the squashed v1 recreates the same final
// schema from scratch). Once 1.0.0 ships, migrations go back to strictly additive/append-only.
//
// v1's `sql` string below must stay byte-for-byte identical to what already shipped (including
// indentation) - tauri-plugin-sql hashes the migration content and refuses to run at all if a
// previously-applied migration doesn't match anymore ("migration 1 was previously applied but
// has been modified").
pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
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
        },
        Migration {
            version: 2,
            description: "add_plugin_capability_grants",
            sql: r#"
            -- Explicit, host-enforced capability grants (Milestone 13) - deliberately its
            -- own table rather than reusing `settings`'s `plugin:<id>:<key>` convention,
            -- since a WASM guest's own settings-get/settings-set host functions can freely
            -- read/write any key under its own `plugin:<id>:` prefix. If a grant lived in
            -- that same table/namespace, a plugin could just call settings-set on its own
            -- grant key and self-grant the very capability this table exists to gate. A
            -- WASM guest has no code path to this table at all - only spawn-process/
            -- run-and-wait's host-side implementation reads it, and only the frontend
            -- (Settings UI / install confirmation) ever writes it.
            CREATE TABLE plugin_capability_grants (
                plugin_id TEXT NOT NULL,
                capability TEXT NOT NULL,
                PRIMARY KEY (plugin_id, capability)
            );
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_collections",
            sql: r#"
            -- Deliberately its own table, not a `tags` row under some "collection:" naming
            -- convention - a collection groups a series/franchise (e.g. "Final Fantasy"),
            -- a different organizing concept than a tag (e.g. "Co-op", "Backlog"), and
            -- keeping them structurally separate means neither's management UI/filter ever
            -- has to guess which kind a given name is. Mirrors tags/game_tags exactly
            -- otherwise (same UNIQUE name, same cascade-on-delete join table).
            CREATE TABLE collections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );

            CREATE TABLE game_collections (
                game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
                PRIMARY KEY (game_id, collection_id)
            );
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_translated_title_description",
            sql: r#"
            -- Milestone 21's deferred "persist a translated description" follow-up, now
            -- covering title too. Kept alongside the originals rather than overwriting
            -- title/description in place - translated_locale records which UI locale the
            -- cached translation was made for, so the frontend can tell a stale translation
            -- (made for a since-changed UI language, or before an edited original) from a
            -- current one without re-calling the engine just to find out.
            ALTER TABLE games ADD COLUMN translated_title TEXT;
            ALTER TABLE games ADD COLUMN translated_description TEXT;
            ALTER TABLE games ADD COLUMN translated_locale TEXT;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_show_translated_flags",
            sql: r#"
            -- Which of title/description GameDetail.vue's "show" toggle currently displays for
            -- this specific game, persisted per-game rather than reset to "show original" every
            -- time the detail page is reopened. Independent of translated_locale validity -
            -- these just record the user's last choice; GameDetail.vue's own hasValidTranslated*
            -- checks still gate whether that choice actually has something to show.
            ALTER TABLE games ADD COLUMN show_translated_title INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE games ADD COLUMN show_translated_description INTEGER NOT NULL DEFAULT 0;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_skip_discord_presence",
            sql: r#"
            -- Milestone 28's per-game opt-out - the global Discord Rich Presence toggle
            -- (appSettings.ts) defaults on, this lets a specific game (e.g. something the user
            -- doesn't want visible on their status) stay hidden regardless.
            ALTER TABLE games ADD COLUMN skip_discord_presence INTEGER NOT NULL DEFAULT 0;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "rename_skip_discord_presence_to_skip_presence",
            sql: r#"
            -- Milestone 29 generalized presence from Discord-only into a real multi-enable
            -- plugin kind - the per-game opt-out now applies to every enabled presence plugin,
            -- not just Discord, so it gets the generic name. A real rename (not a new column
            -- plus a dead old one) since SQLite's RENAME COLUMN preserves existing data.
            ALTER TABLE games RENAME COLUMN skip_discord_presence TO skip_presence;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add_pseudo_fullscreen",
            sql: r#"
            -- Milestone 39 - per-game opt-in for borderless pseudo-fullscreen (built-in feature,
            -- not a plugin; see milestones.md for why). Off by default since not every game
            -- benefits (some already run real exclusive fullscreen fine).
            ALTER TABLE games ADD COLUMN pseudo_fullscreen INTEGER NOT NULL DEFAULT 0;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add_always_on_top",
            sql: r#"
            -- Milestone 39 stretch - per-game opt-in to keep the game window pinned above every
            -- other window for the session. Independent of pseudo_fullscreen - either, neither,
            -- or both can be enabled for the same game.
            ALTER TABLE games ADD COLUMN always_on_top INTEGER NOT NULL DEFAULT 0;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add_remember_window",
            sql: r#"
            -- Milestone 39 stretch - per-game opt-in to restore the game window's last position/
            -- size on the next launch. window_x/y/width/height stay NULL until a session with
            -- this enabled actually ends and captures one - nothing to restore before that.
            ALTER TABLE games ADD COLUMN remember_window INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE games ADD COLUMN window_x INTEGER;
            ALTER TABLE games ADD COLUMN window_y INTEGER;
            ALTER TABLE games ADD COLUMN window_width INTEGER;
            ALTER TABLE games ADD COLUMN window_height INTEGER;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add_dpi_override",
            sql: r#"
            -- Milestone 39 stretch - per-game DPI-awareness compatibility override, applied via
            -- the same AppCompatFlags\Layers registry mechanism as Explorer's own "Change high
            -- DPI settings" dialog. Unlike pseudo_fullscreen/always_on_top/remember_window this
            -- isn't a session-lifecycle treatment - it's a persistent per-exe registry flag,
            -- written/cleared once when the setting is saved, not on every launch.
            ALTER TABLE games ADD COLUMN dpi_override TEXT NOT NULL DEFAULT 'none';
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "add_force_resolution",
            sql: r#"
            -- Milestone 39 stretch - per-game forced resolution at launch, the remaining half of
            -- "forced resolution/DPI override" (dpi_override above shipped the DPI half). Unlike
            -- that column, this one runs a real session-lifecycle apply/revert (resolution_x/y/
            -- refresh applied before launch, reverted after game-session-ended) - see
            -- resolution_override.rs and library.ts's launchGame/init.
            ALTER TABLE games ADD COLUMN force_resolution INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE games ADD COLUMN resolution_width INTEGER;
            ALTER TABLE games ADD COLUMN resolution_height INTEGER;
            ALTER TABLE games ADD COLUMN resolution_refresh INTEGER;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "add_profiles",
            sql: r#"
            -- Milestone 30, step 1 - multi-library/profile support. games/tags/collections are
            -- per-profile (a shared PC's separate users don't want to see, tag, or organize each
            -- other's libraries); playtime_sessions stays scoped transitively through game_id
            -- rather than duplicating profile_id onto every session row. Theme and app-level
            -- settings (hotkey, close-to-tray) stay global - see milestones.md for the scoping
            -- decision.
            --
            -- Every existing row backfills onto profile 1 ("Default") via DEFAULT 1, so an
            -- upgrade from a pre-M30 single-library install is transparent - nothing needs to
            -- migrate data between profiles, there's just one profile holding everything that
            -- was already there.
            CREATE TABLE profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL
            );
            INSERT INTO profiles (id, name) VALUES (1, 'Default');

            -- No REFERENCES clause here - SQLite's ALTER TABLE ADD COLUMN forbids combining a
            -- REFERENCES clause with a non-NULL DEFAULT (allowed fine in CREATE TABLE, which is
            -- why tags_new/collections_new below can have both). The FK relationship still
            -- holds logically; it's just not schema-enforced for this particular column.
            ALTER TABLE games ADD COLUMN profile_id INTEGER NOT NULL DEFAULT 1;

            -- tags/collections each need profile_id in the recreated table, not just an ALTER
            -- ADD COLUMN, because their UNIQUE(name) constraint has to become UNIQUE(name,
            -- profile_id) - two profiles must each be able to have their own "Co-op" tag without
            -- colliding. SQLite can't ALTER a UNIQUE constraint in place, so this rebuilds both
            -- tables rather than the plain additive ALTER every other migration here uses.
            -- game_tags/game_collections keep referencing the same tag/collection ids by rowid,
            -- untouched by the rebuild - only the parent tables move.
            CREATE TABLE tags_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profiles(id),
                UNIQUE(name, profile_id)
            );
            INSERT INTO tags_new (id, name, profile_id) SELECT id, name, 1 FROM tags;
            DROP TABLE tags;
            ALTER TABLE tags_new RENAME TO tags;

            CREATE TABLE collections_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profiles(id),
                UNIQUE(name, profile_id)
            );
            INSERT INTO collections_new (id, name, profile_id) SELECT id, name, 1 FROM collections;
            DROP TABLE collections;
            ALTER TABLE collections_new RENAME TO collections;
        "#,
            kind: MigrationKind::Up,
        },
    ]
}
