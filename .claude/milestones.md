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

## Milestone 5 — Theme/Skin Plugins
Themes are component-level skins, not just palette swaps — a theme plugin can override actual UI components (e.g. `GameCard`, `BigPictureGrid` tile), not only colors/fonts. Distinct from `SourcePlugin`s: only one theme is active at a time (exclusive selection), vs. source plugins which are independently multi-enabled.
- [x] Define `ThemePlugin` interface — component-slot overrides (e.g. `{ GameCard?: Component, BigPictureTile?: Component, ... }`) plus optional `activate()`/`deactivate()`
- [x] Add a `kind: "source" | "theme"` field to the plugin manifest so the loader/settings UI can distinguish plugin types (reuses existing `plugin.json`/loader infra from Milestone 4)
- [x] Slot registry — named, swappable UI regions that app components render via `<component :is="resolveSlot('GameCard')" />`, falling back to the current built-in component when no active theme overrides that slot
- [x] Theme store (`useThemeStore`) tracking the single active theme id, persisted via `settings` table
- [x] Settings UI: exclusive theme picker (radio-style, not checkboxes like source plugins)

## Milestone 6 — First Source Plugin (Steam)
- [x] Parse `libraryfolders.vdf` for install locations
- [x] Parse appmanifest files for owned/installed games
- [x] Map Steam entries into core `GameEntry` format
- [x] Dedup against manually-added games
- [x] Test end-to-end: scan → library → launch → playtime (playtime tracking for URI-launched games deferred, tracked in Milestone 7)

## Milestone 7 — Polish & Extras
- [ ] Background art/trailer preview on focus (Big Picture)
- [ ] Additional source plugins (Epic, GOG, emulator scanner)
- [ ] Auto-launch into Big Picture on boot (toggle)
- [ ] Per-game launch options / compatibility wrappers via [Locale Remulator](https://github.com/InWILL/Locale_Remulator) (bundled as a Tauri sidecar, LGPL-3.0) — preferred over the original xupefei/Locale-Emulator, which is archived and 32-bit only, since Locale Remulator is actively maintained and supports 64-bit games (Detours-based hooking). Extend `launch_game`/`GameEditFields` with an optional wrapper-command flag instead of direct spawn; not a `SourcePlugin`, since it wraps launch rather than scanning for games
- [ ] Playtime tracking for URI-launched games (Steam and future protocol-based plugins) — `launch_game`'s process-spawn-and-wait mechanism doesn't apply to `openUrl()` launches (no child process handle; Steam's client owns the real game process). Researched how Playnite solves this: it uses "Folder" tracking mode — periodically poll the OS's running-process list and check whether any running process's executable path falls under the game's known install folder (we already have this: `library_path/steamapps/common/<installdir>` from the appmanifest), rather than needing the exact `.exe` filename or relying on Steam's undocumented, per-game-unreliable `HKCU\Software\Valve\Steam\Apps\<appid>\Running` registry key (confirmed via search: doesn't update reliably for every game). Start polling on launch, stop when no matching process remains, record the elapsed span as a session. Generalizes to any future protocol-launched plugin, not Steam-specific. Separately, historical playtime accumulated before this app was ever used could be imported via Steam's `IPlayerService/GetOwnedGames` Web API (`playtime_forever`), which is what Playnite's own historical-import likely uses, though this needs a user-provided Steam Web API key + SteamID64.

## Milestone 8 — Remote/Downloadable Plugins (future)
- [ ] Rust command to download plugin bundles (e.g. from GitHub releases) into the app-data plugins dir, via `reqwest`
- [ ] Zip extraction for downloaded plugin bundles
- [ ] SHA256 checksum pinned in manifest, verified before load
- [ ] Enable Tauri asset protocol scoped to the plugins dir; runtime `import()` via `convertFileSrc`
- [ ] Second loader strategy alongside the current build-time `import.meta.glob` one (bundled vs. remote-downloaded)
- [ ] Revisit `tauri.conf.json` CSP (`csp: null` today) once loading remote-sourced code is real

Note: Milestone 3 (Big Picture) is sequenced before the plugin system to validate the controller UX early. Milestone 4's current loader only discovers plugins bundled into the app at build time (`src/plugins/*`); Milestone 8 tracks true runtime-downloadable third-party plugin support as a distinct, larger feature.
