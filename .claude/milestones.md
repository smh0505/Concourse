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
- [x] List view for desktop UI (proposal calls for "grid and list views"; only grid exists today)
- [x] Metadata provider plugin support — swap IGDB for another source (proposal's "Other Plugin Candidates"); needs a new plugin `kind` (e.g. `"metadata"`) alongside `source`/`theme`, following the same manifest/loader pattern
- [x] Controller mapping profile plugins — custom gamepad button/axis mappings, distinct from the existing hardcoded `useGamepadNav` bindings (proposal's "Other Plugin Candidates")
- [x] Background art/trailer preview on focus (Big Picture) — background art only; trailer preview stays out of scope (proposal marks it "(stretch)" within an already-stretch item, and needs a separate trailer-source integration nothing here provides)
- [ ] Additional source plugins
  - [x] Epic Games — parses `%PROGRAMDATA%\Epic\EpicGamesLauncher\Data\Manifests\*.item` JSON (verified against Playnite's EpicLibrary source, since Epic doesn't document the format), launches via `com.epicgames.launcher://apps/{AppName}?action=launch&silent=true`. Verified end-to-end against a real Epic install (Fortnite): scan and launch both work. Required adding `{"identifier": "opener:allow-open-url", "allow": [{"url": "com.epicgames.launcher:*"}]}` to `capabilities/default.json` (same class of fix as the earlier Steam URI scope issue).
  - [x] GOG — enumerates `HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\{gameID}` (gameName/path values), launches via `GalaxyClient.exe /gameid {id} /command runGame` (verified against tkashkin/GOGWrapper source - GOG has no registered URI scheme, so this is a direct process spawn with args, not `openUrl()`). Pseudo-URI `gog://{gameId}` used in `executable_path` purely to route `launchGame()` to `invoke("launch_gog_game", ...)` instead of `openUrl()`. Verified end-to-end against a real GOG install: scan and launch both work.
  - [ ] Emulator/ROM scanner
- [x] Big Picture scroll fixes: hide visible scrollbars in Big Picture mode (console-UI aesthetic, still scrollable via gamepad/keyboard `scrollIntoView`, just not visually shown), and stop the underlying desktop page from scrolling along with it - Big Picture is a `position: fixed` overlay on top of `<main>`, but the desktop page behind it is still scrollable, so mouse-wheel input while Big Picture is open scrolls the hidden desktop content instead of staying scoped to the overlay. Needs the desktop page's scroll locked (e.g. `overflow: hidden` on `<body>`/`<html>`) while `bigPicture` is active, restored on close, to keep the two modes properly separate
- [x] Auto-launch into Big Picture on boot (toggle)
- [x] Per-game launch options / compatibility wrappers via [Locale Remulator](https://github.com/InWILL/Locale_Remulator) + [Locale Emulator](https://github.com/xupefei/Locale-Emulator) (both LGPL-3.0) — LR preferred as primary (LE is archived/32-bit-only), LE added as a fallback after real-world testing found a game LR couldn't get past its startup popup on (reproduced identically launching LR directly, no app involved - a genuine LR compatibility gap, not our integration) that LE ran fine
  - Plan revised twice: first from "bundle as a Tauri sidecar" (both need their own installer + GUI-created locale profiles, not a portable exe to bundle - same category as "assume Steam/GOG client is already installed"), then again after testing against real releases: both actually ship as portable folders (extract the zip anywhere), and their installers only register a right-click context-menu extension, not a discoverable app install - confirmed via registry inspection that neither writes an "App Paths"/Uninstall entry or dedicated key anywhere, so true auto-detection isn't possible for either
  - [x] Global path settings in `AppSettings` for both (`appSettings.localeRemulatorPath`/`localeEmulatorPath`, mirrors the SGDB-API-key settings pattern), validated via the shared `locale_remulator.rs::wrapper_path_exists` — verified working against real extractions of both
  - [x] `games.locale_profile_guid` + `games.locale_wrapper` (migrations v5/v6) — per-game opt-in via a GUID from `LRConfig.xml`/`LEConfig.xml` (same `Name`/`Guid` shape, LE is the project LR forked from), `locale_wrapper` (`"lr" | "le"`) disambiguates which tool the GUID belongs to since neither namespaces against the other. `EditGameModal` presents both profile lists in one `<select>`, split into `<optgroup>`s per wrapper
  - [x] `launcher.rs::launch_via_locale_remulator` spawns `LRProc.exe <guid> <path>`; `locale_emulator.rs::launch_via_locale_emulator` spawns `LEProc.exe -runas <guid> <path>` (different CLI shape - LE needs the `-runas` flag before the guid, bare positional args run the target's own per-app profile instead)
  - [x] Playtime fallback — neither wrapper's exit behavior after handing off to the hooked game is confirmed, so (like the URI-based sources) tracking falls back to `track_folder_playtime` using `install_dir` or the executable's parent folder
  - [x] End-to-end verification — wrapper plumbing confirmed correct for both (`LRProc.exe`/`LEProc.exe` spawn, hook, and show the expected pre-game popup). The one test game hung past that popup under LR (both non-admin and admin profiles) but ran fine under LE; no code-side fix available for the LR gap short of the "build our own hook engine" approach already rejected as not worth the reverse-engineering/AV-risk cost
- [x] Playtime tracking for URI-launched games (Steam/Epic/GOG) — implemented Playnite-style "Folder" tracking: `games.install_dir` (migration v4) records each entry's known install folder (Steam: `library_path/steamapps/common/<installdir>`, Epic: manifest `InstallLocation`, GOG: registry `path`). `launcher.rs::track_folder_playtime` (uses `sysinfo`) polls the running-process list every 3s, treats any process whose exe path falls under the normalized install folder as "the game is running", and emits the same `game-session-ended` event `launch_game` does once no matching process remains (2-poll grace period to survive launcher-to-game handoff; gives up quietly if nothing matches within 120s). `library.ts::launchGame` fires this after a URI-based launch whenever `install_dir` is known. Not Steam-specific - generalizes to any future protocol-launched source plugin. Verified end-to-end: a real play session gets recorded. Separately, historical playtime accumulated before this app was ever used could still be imported via Steam's `IPlayerService/GetOwnedGames` Web API (`playtime_forever`), tracked as a future stretch, not done here.

## Milestone 8 — Remote/Downloadable Plugins (future)
- [ ] Rust command to download plugin bundles (e.g. from GitHub releases) into the app-data plugins dir, via `reqwest`
- [ ] Zip extraction for downloaded plugin bundles
- [ ] SHA256 checksum pinned in manifest, verified before load
- [ ] Enable Tauri asset protocol scoped to the plugins dir; runtime `import()` via `convertFileSrc`
- [ ] Second loader strategy alongside the current build-time `import.meta.glob` one (bundled vs. remote-downloaded)
- [ ] Revisit `tauri.conf.json` CSP (`csp: null` today) once loading remote-sourced code is real

## Milestone 9 — Desktop UI Polish
Current UI is a single flat top-to-bottom stack (settings panels, forms, and grid all visible on one scrolling page) using the OS's default title bar and largely unstyled form controls - reads as a webpage, not a desktop app. This milestone reworks visual structure/chrome for both Desktop UI and Big Picture without changing underlying functionality.
- [ ] Custom window chrome — `decorations: false` in `tauri.conf.json`, custom draggable titlebar component (drag region + min/maximize/close), replacing the default OS title bar
- [ ] Navigation shell — sidebar or top nav splitting Library / Settings / Plugins into separate views instead of one long stacked page; `AppSettings`/`SteamGridDbSettings`/`PluginSettings` move out of the always-visible flow
- [ ] Design token pass — consistent spacing scale, border-radius, shadow/elevation system layered on top of the existing Catppuccin CSS variables; restyle raw `<button>`/`<input>`/`<textarea>` elements consistently across desktop components
- [ ] Toast/notification system replacing the plain-text `ErrorBanner` for errors and confirmations (e.g. "scan complete: 3 added, 1 merged")
- [ ] Empty/loading states — placeholder for an empty library, skeleton loaders for grid/list while a scan or metadata fetch is in flight
- [ ] Modal polish — `EditGameModal` transition/animation, focus trap, click-outside/Escape-to-close consistency
- [ ] Big Picture visual pass — apply the same design tokens, add tile focus/selection transitions consistent with the new desktop chrome
- [ ] Big Picture slideshow view — new selectable view mode alongside the existing tile grid (toggle, like desktop's grid/list). Full-bleed background art of the selected game as backdrop, cover-art strip pinned to the bottom with the selected cover centered and 3 neighbors visible on each side (7 visible at once), gamepad/keyboard nav shifts the centered selection left/right through the library

Note: Milestone 3 (Big Picture) is sequenced before the plugin system to validate the controller UX early. Milestone 4's current loader only discovers plugins bundled into the app at build time (`src/plugins/*`); Milestone 8 tracks true runtime-downloadable third-party plugin support as a distinct, larger feature.
