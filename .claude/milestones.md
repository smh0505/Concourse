# Milestones

## Milestone 1 — Core Library Foundation
- [x] Pick stack (Tauri + Vue/TypeScript, SQLite)
- [x] Set up SQLite schema (games, tags, playtime sessions)
- [x] Manual "add game" flow (name + executable path)
- [x] Grid view UI listing added games
- [x] Launch button (spawn process from path)

## Milestone 2 — Metadata & Playtime
- [ ] Integrate SteamGridDB API for cover art
- [ ] Integrate IGDB for genre/description/release date
- [ ] Manual metadata edit/override UI
- [ ] Playtime tracking (process-exit detection, session log)
- [ ] Tagging + basic filter/search

## Milestone 3 — Big Picture Mode
- [ ] Full-screen layout, large-tile grid
- [ ] Gamepad input wiring (D-pad/stick nav, face buttons)
- [ ] Focus/selection states for controller nav
- [ ] Launch game from Big Picture
- [ ] Toggle between desktop UI and Big Picture

## Milestone 4 — Plugin System
- [ ] Define plugin interface (`scan()`, `launch()`, `getInstallStatus()`)
- [ ] Plugin loader (discover/load modules at runtime)
- [ ] Plugin manifest format
- [ ] Settings UI to enable/disable installed plugins

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

Note: Milestone 3 (Big Picture) is sequenced before the plugin system to validate the controller UX early.
