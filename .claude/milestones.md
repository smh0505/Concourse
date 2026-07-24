# Milestones

Tracks *what's done*. For implementation rationale, decisions, and fixes behind each item,
see `.claude/devlog.md`.

## Milestone 1 — Core Library Foundation
- [x] Pick stack (Tauri + Vue/TypeScript, SQLite)
- [x] Set up SQLite schema (games, tags, playtime sessions)
- [x] Manual "add game" flow (name + executable path)
- [x] Grid view UI listing added games
- [x] Launch button (spawn process from path)

## Milestone 2 — Metadata & Playtime
- [x] Integrate SteamGridDB API for cover art
- [x] Integrate IGDB for genre/description/release date
- [x] Manual metadata edit/override UI
- [x] Playtime tracking (process-exit detection, session log)
- [x] Tagging + basic filter/search

## Milestone 3 — Big Picture Mode
- [x] Full-screen layout, large-tile grid
- [x] Gamepad input wiring (D-pad/stick nav, face buttons)
- [x] Focus/selection states for controller nav
- [x] Launch game from Big Picture
- [x] Toggle between desktop UI and Big Picture

## Milestone 4 — Plugin System
- [x] Define plugin interface (`scan()`, `launch()`, `getInstallStatus()`)
- [x] Plugin loader (discover/load modules at runtime)
- [x] Plugin manifest format
- [x] Settings UI to enable/disable installed plugins

## Milestone 5 — Theme/Skin Plugins
- [x] Define `ThemePlugin` interface (component-slot overrides + activate/deactivate)
- [x] Add `kind` field to plugin manifest
- [x] Slot registry for swappable UI regions
- [x] Theme store, persisted active theme id
- [x] Settings UI: exclusive theme picker

## Milestone 6 — First Source Plugin (Steam)
- [x] Parse `libraryfolders.vdf` for install locations
- [x] Parse appmanifest files for owned/installed games
- [x] Map Steam entries into core `GameEntry` format
- [x] Dedup against manually-added games
- [x] Test end-to-end: scan → library → launch → playtime

## Milestone 7 — Polish & Extras
- [x] List view for desktop UI
- [x] Metadata provider plugin support (new `metadata` plugin kind)
- [x] Controller mapping profile plugins
- [x] Background art on focus (Big Picture)
- [ ] Additional source plugins
  - [x] Epic Games
  - [x] GOG
  - [ ] Emulator/ROM scanner
- [x] Big Picture scroll fixes (hidden scrollbar, desktop scroll lock)
- [x] Auto-launch into Big Picture on boot (toggle)
- [x] Per-game compatibility wrappers (Locale Remulator + Locale Emulator)
  - [x] Global path settings for both wrappers
  - [x] `games.locale_profile_guid` + `games.locale_wrapper` (migrations v5/v6)
  - [x] Launch commands for both wrappers
  - [x] Playtime fallback via folder tracking
  - [x] End-to-end verification (both wrappers)
- [x] Playtime tracking for URI-launched games (Steam/Epic/GOG)

## Milestone 8 — Remote/Downloadable Plugins (future)
Pivoted to WASM — see devlog.
- [x] Embed a WASM runtime (`wasmtime`, Component Model); define WIT world for `SourcePlugin`
- [x] Host-function capability surface (registry/file/process/network primitives)
- [x] DB access stays host-owned (`settings`/`plugin_data`, never raw SQL)
- [x] Download command (paste a URL, verify checksum, extract)
- [x] Load/instantiate pipeline (Tauri commands calling into a loaded `.wasm` component)
- [x] Loader integration (WASM manifests merged alongside build-time TS ones)
- [x] Reference example (`examples/exe-scanner-plugin`), tested end-to-end
- [x] Revisit `tauri.conf.json` CSP
- [x] (Stretch) Migrate Steam to a WASM plugin as a real-world proof

## Milestone 8.5 — Further WASM Adoption (stretch)
- [ ] Uniform `games.install_dir` → `plugin_data` migration for all source plugins
- [ ] Migrate GOG and/or Epic to WASM plugins
  - [x] GOG — done (`gog-source-wasm-plugin`)
  - [ ] Epic — not yet done
- [ ] Rename `steam-wasm` → `steam` cleanly

(Locale Remulator/Locale Emulator's WASM migration moved into Milestone 10.)

## Milestone 9 — Desktop UI Polish (ongoing)
This milestone doesn't close — UI polish is open-ended. See devlog for full detail on each
item below; new ideas get appended under Backlog rather than opening a new milestone.
- [x] Custom window chrome
- [x] Navigation shell
- [x] Grid/list view toggle redesign
- [x] Collapsible sidebar
- [x] Themed scrollbars
- [x] Sidebar/titlebar rework (Add Game modal, Big Picture button relocation)
- [x] Design token pass
- [x] Play/Edit/Remove icon-only buttons
- [x] GameCard hover redesign
- [x] Toast/notification system
- [x] Empty/loading states
- [x] Modal polish
- [x] Big Picture visual pass
- [x] Big Picture slideshow view

### Backlog
Ad-hoc polish items land here as they come up, checked off in place rather than moved
elsewhere. Empty for now.

## Milestone 10 — LR/LE Managed Install + WASM Migration
See devlog for context on why these two workstreams are combined.

**Managed install.**
- [x] Rust command to fetch latest release download URL (GitHub API)
- [x] Download + zip extraction into an app-data-managed directory
- [x] Auto-fill wrapper paths after extraction
- [x] "Install" button in `AppSettings`
- [x] Integrity check before extracting

**WASM migration.**
- [x] Design a `wrapper`-shaped WIT interface/plugin kind
- [x] Port LR/LE's launch logic into WASM plugins
- [x] Wire the new `wrapper` plugin kind into loader/settings UI

## Milestone 11 — RAWG Metadata Provider (stretch)
- [ ] `rawg.rs` — fetch description/genres/release date from the RAWG API
- [ ] `src/plugins/rawg/` `MetadataProviderPlugin`
- [ ] Verify merge behavior against IGDB

## Milestone 12 — Additional Source Plugins: Xbox/EA/Ubisoft (stretch)
- [ ] Xbox — research install detection and launch mechanism
- [ ] EA app — research install detection and launch mechanism
- [ ] Ubisoft Connect — research install detection and launch mechanism
- [ ] Each ships as its own WASM plugin in a separate repo from day one

Note: Milestone 3 (Big Picture) is sequenced before the plugin system to validate the
controller UX early. Milestone 4's loader only discovers plugins bundled into the app at
build time (`src/plugins/*`); Milestone 8 added true runtime-downloadable plugin support as
a distinct, larger feature.
