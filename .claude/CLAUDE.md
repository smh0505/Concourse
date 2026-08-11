# Claude Code Project Instructions: Concourse

You are an expert software engineer guiding the development of **Concourse**, a desktop application that aggregates games into a unified library with a console-like "Big Picture" mode.

Your goal is to help implement this project step-by-step, adhering strictly to our architectural decisions, project proposal, and developmental milestones.

---

## 1. Reference Documents
Before performing any task, always read and align with these documents (all under `.claude/`):
- `proposal.md`: Contains the overall product vision, core features, and architectural design.
- `milestones.md`: Outlines the phased roadmap and implementation checklist — tracks *what's done*, kept short/scannable (one line per item, checkbox state).
- `devlog.md`: Detailed implementation history behind every `milestones.md` item — rationale, decisions, fixes, verification notes. Tracks *why/how*, not *what's done* (no checkboxes). Same headings as `milestones.md` for cross-reference. When completing a milestone item, write the short tracking line in `milestones.md` and the full detail in `devlog.md`, not both in one file.

---

## 2. General Principles & Workflow

### Development Flow
- **One Step at a Time**: Work incrementally. Do not try to implement multiple milestones at once. Focus on the current active milestone.
- **Versioning**: SemVer. `1.0.0` marked Milestones 1–14 (the core roadmap) closed and the app stable for real-world use. Post-1.0, minor version bumps track closing a Post-1.0 Roadmap milestone (see `milestones.md`); patch bumps for fixes within a milestone. Bump `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` together — they must always match.
- **Code Quality**: Write clean, modular, and self-documenting code. Prefer performance-focused, lightweight solutions where applicable.
- **Milestone Tracking**:
  - When a task or checklist item from `milestones.md` is fully completed and verified, update the corresponding `[ ]` to `[x]` in `milestones.md`.
  - Always commit your changes after completing a sub-task or milestone.

### Core Stack (DECIDED)
Stack is locked: **Tauri (Rust) + Vue 3/TypeScript** frontend, **SQLite** for local data persistence (via `tauri-plugin-sql`).
- Rust backend is split by domain module under `src-tauri/src/`: `db.rs` (migrations/schema), `launcher.rs` (process spawn + playtime tracking), `sgdb.rs` (SteamGridDB cover/background art), `igdb.rs` (IGDB metadata), `steam.rs` (Steam library/appmanifest parsing), `epic.rs` (Epic manifest parsing) — one module per external integration/source. Keep `lib.rs` limited to plugin wiring and command registration.
- Frontend data layer lives in `src/db/` as repository classes (`GameRepository`, `TagRepository`, `PlaytimeRepository`, `SettingsRepository`) over a shared `Database` connection — not loose exported functions.
- Frontend state lives in **Pinia stores** (`src/stores/*.ts`) — one store per domain (`library`, `plugins`, `theme`, `metadataProviders`, `controllerMapping`, `appSettings`). Components call store actions/state directly; do not route shared state through `App.vue` props/emits. Per-item props (e.g. `GameCard`'s `game`) are fine — only genuinely shared/cross-component state belongs in a store.
- Frontend components are split by surface: `src/components/desktop/` (desktop UI) vs. `src/components/bigpicture/` (Big Picture UI). `App.vue` composes both, toggled by a `bigPicture` boolean.

### Package Manager
**Use `bun`, not `npm`/`yarn`/`pnpm`**, for all TypeScript/frontend tooling in this repo.
- `bun install` — install JS dependencies
- `bun add <pkg>` — add a JS dependency
- `bun run dev` — start the Vite dev server (frontend only)
- `bun run build` — typecheck (`vue-tsc --noEmit`) + production build
- `bunx tauri dev` — run the full Tauri app (frontend + Rust backend) in dev mode
- `bunx tauri build` — build the production desktop binary
- `cargo check` (run from `src-tauri/`) — quick Rust compile check without a full build

---

## 3. Architecture & Implementation Guidelines

### SQLite Schema
Schema evolves via **versioned migrations** in `db.rs` (`db::migrations()`) — add new columns/tables as a new migration, never edit a shipped migration in place. Current tables:
- `games`: id, title, executable_path, platform, cover_art_url, background_art_url, description, release_date, total_playtime, skip_dedup
- `tags`: id, name
- `game_tags`: game_id, tag_id (many-to-many relationship)
- `playtime_sessions`: id, game_id, start_time, end_time, duration_seconds
- `settings`: key, value (generic app/plugin settings storage — API keys, active theme/provider ids, view mode, etc.)

### Process Launching & Playtime Tracking
- **Direct executable paths**: spawned via `launcher.rs`'s `launch_game`, which waits on the child process and emits a `game-session-ended` event with start/end/duration; the frontend logs it to `playtime_sessions`.
- **URI-based launches** (e.g. `steam://...`, `com.epicgames.launcher://...`, `origin2://...`, `uplay://...`): detected by a `://` substring in `executable_path`, routed through `@tauri-apps/plugin-opener`'s `openUrl()` instead of process spawn (`Command::new` can't execute a URI — this previously caused OS error 123). No child process handle exists this way, so playtime tracking uses folder-based polling instead (`launcher.rs::track_folder_playtime`, driven by the game's `install_dir` — a source plugin's `scan()` must set this or playtime silently never records, see Milestone 15's devlog for two real cases of this exact gap). **Every new URI scheme needs an entry in `src-tauri/capabilities/default.json`'s `opener:allow-open-url` allowlist** — missing this fails silently as "Not allowed to open url" at launch time, not at build/install time; bitten twice already (EA's `origin2:`, Ubisoft's `uplay:`) before this note existed.

### Gamepad Navigation & Big Picture Mode
- Big Picture nav (`useGamepadNav` composable) reads button/axis indices from the currently active `ControllerMappingPlugin` via `useControllerMappingStore` — not hardcoded. A different controller layout is a different plugin, not a code change.
- Keep controller/keyboard focus states highly visible (see `BigPictureTile`'s `.focused` styling).
- The `bigPicture` boolean in `App.vue` toggles between Desktop UI and Big Picture Mode, and also drives real OS-level fullscreen via Tauri's window API — not just a CSS overlay.

### Plugin Architecture
Four plugin kinds today, all sharing one manifest/loader/settings infrastructure:

```typescript
interface PluginBase {
  id: string;
  name: string;
  settingsComponent?: Component; // optional inline settings UI, rendered under this plugin's row in Settings
}

interface SourcePlugin extends PluginBase {
  scan(): Promise<GameEntry[]>;
  launch(entry: GameEntry): Promise<void>;
  getInstallStatus(entry: GameEntry): Promise<boolean>;
}

interface ThemePlugin extends PluginBase {
  slots?: Partial<Record<ThemeSlotName, Component>>; // component-level UI overrides (e.g. GameCard)
  cssVariables?: Record<string, string>;
  activate?(): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

interface MetadataProviderPlugin extends PluginBase {
  fetchMetadata(title: string): Promise<MetadataResult | null>;
}

interface ControllerMappingPlugin extends PluginBase {
  mapping: GamepadMapping; // button/axis indices
}
```

- Manifest format (`plugin.json` inside `src/plugins/<id>/`): `{ id, name, version, kind: "source" | "theme" | "metadata" | "controller", entry }`.
- Loader (`src/plugins/loader.ts`) discovers every `plugin.json`/entry module at **build time** via Vite's `import.meta.glob`; which plugins actually run is decided at **runtime** (enabled-id sets for source/metadata, a single active id for theme/controller). This means plugins must be bundled into the app at build time — true runtime-downloadable third-party plugins are a distinct, larger feature (tracked as Milestone 8).
- Selection semantics differ by kind: source and metadata-provider plugins are independently **multi-enabled** (checkboxes); theme and controller-mapping plugins are **exclusive single-select** (radio) — you're always browsing one skin / one physical input scheme at a time.
- Settings UI is one tabbed `PluginSettings.vue` (Source / Theme / Metadata Provider / Controller), not a separate component per kind.
- A plugin owns its own settings UI via the optional `settingsComponent` field (e.g. IGDB's API-key form) rather than that UI living in a separate top-level component.

### Plugin Versioning
Every plugin (`plugin.json`'s `version` field, and each WASM plugin repo's `Cargo.toml`) uses plain SemVer, independent of the app's own milestone-tracked version — plugins don't map to `.claude/milestones.md` entries the way the app does:
- **Patch**: bug fix, no manifest/behavior change.
- **Minor**: new capability, backward compatible — still works against the same host WIT interface (for WASM plugins) or `PluginBase` shape (for TS plugins).
- **Major**: breaking change — manifest shape changes, or (for WASM plugins) the plugin now requires a `wit/plugin.wit` interface version older Concourse builds don't have. This is the signal "don't install this on an older app build."

Built-in TS plugins (bundled with the app, vetted every release) start at `1.0.0` since they ship already-stable. Separately-installed WASM plugins and data-only theme manifests (`data-theme-plugins` repo) start at `0.1.0`/`1.0.0` per the same logic — content-only manifests (themes) are stable enough to start at `1.0.0`; WASM plugins with real install/launch logic start at `0.1.0` until proven.

---

## 4. Current Status
See `milestones.md` for the active milestone and remaining tasks. The tech stack and core architecture above are decided — do not re-ask about stack choice or re-litigate the decisions in this file; extend them instead.
