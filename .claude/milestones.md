# Milestones

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

## Milestone 5 — First Source Plugin (Steam)
- [ ] Parse `libraryfolders.vdf` for install locations
- [ ] Parse appmanifest files for owned/installed games
- [ ] Map Steam entries into core `GameEntry` format
- [ ] Dedup against manually-added games
- [ ] Test end-to-end: scan → library → launch → playtime

## Milestone 6 — Polish & Extras
- [ ] Theming/skin support
- [ ] Background art/trailer preview on focus (Big Picture)
- [ ] Additional source plugins (Epic, GOG, emulator scanner)
- [ ] Auto-launch into Big Picture on boot (toggle)
- [ ] Per-game launch options / compatibility wrappers via [Locale Remulator](https://github.com/InWILL/Locale_Remulator) (bundled as a Tauri sidecar, LGPL-3.0) — preferred over the original xupefei/Locale-Emulator, which is archived and 32-bit only, since Locale Remulator is actively maintained and supports 64-bit games (Detours-based hooking). Extend `launch_game`/`GameEditFields` with an optional wrapper-command flag instead of direct spawn; not a `SourcePlugin`, since it wraps launch rather than scanning for games

## Milestone 7 — Remote/Downloadable Plugins (future)
- [ ] Rust command to download plugin bundles (e.g. from GitHub releases) into the app-data plugins dir, via `reqwest`
- [ ] Zip extraction for downloaded plugin bundles
- [ ] SHA256 checksum pinned in manifest, verified before load
- [ ] Enable Tauri asset protocol scoped to the plugins dir; runtime `import()` via `convertFileSrc`
- [ ] Second loader strategy alongside the current build-time `import.meta.glob` one (bundled vs. remote-downloaded)
- [ ] Revisit `tauri.conf.json` CSP (`csp: null` today) once loading remote-sourced code is real

Note: Milestone 3 (Big Picture) is sequenced before the plugin system to validate the controller UX early. Milestone 4's current loader only discovers plugins bundled into the app at build time (`src/plugins/*`); Milestone 7 tracks true runtime-downloadable third-party plugin support as a distinct, larger feature.
