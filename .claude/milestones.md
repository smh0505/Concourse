# Milestones

Tracks *what's done*. For implementation rationale, decisions, and fixes behind each item,
see `.claude/devlog.md`.

**1.0.0** marks Milestones 1–13 (the core roadmap) closed and the app considered stable for
real-world use. Further work continues under **Post-1.0 Roadmap** at the bottom of this file,
numbered as a continuing milestone sequence for the same devlog cross-reference convention.

**2.0.0**: user decision (no breaking change forcing it) - Milestone 21 was the last one counted
under the 1.x line (closed at 1.7.0); Milestone 22's close bumped the app to 2.0.0, shipped.
Milestones 23 (DLsite, scoped, unstarted) and 24-38 (brainstormed, unstarted) fall under the 2.x
line along with 22 - none of them were required to close before 2.0.0 shipped, since 22 was the
one that actually triggered it. The Icebox at the bottom of this file sits outside this numbering
entirely, not counted toward either line.

**3.0.0**: user decision (no breaking change forcing it, same as 2.0.0) - Milestone 32 is the
last one counted under the 2.x line; Milestone 33's close will bump the app to 3.0.0, not yet
shipped. Milestones 34-38 (brainstormed, unstarted) fall under the 3.x line along with 33 - none
of them are required to close before 3.0.0 ships, since 33 is the one that will actually trigger
it.

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
- [x] Additional source plugins — Epic Games, GOG (ROM scanner moved to Milestone 15)
- [x] Big Picture scroll fixes (hidden scrollbar, desktop scroll lock)
- [x] Auto-launch into Big Picture on boot (toggle)
- [x] Per-game compatibility wrappers (Locale Remulator + Locale Emulator)
- [x] Playtime tracking for URI-launched games (Steam/Epic/GOG)

Post-close: `standard-gamepad`'s controller mapping made user-configurable (remap UI, live
button-press diagram, axis-driven bindings for stickless pads) - see devlog. New `8bitdo-micro`
mapping plugin added alongside it.

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

## Milestone 9 — Further WASM Adoption (stretch)
- [x] Migrate GOG and Epic to WASM plugins, retire built-in `gog.rs`/`epic.rs`
- [x] Rename `steam-wasm` → `steam` display name (id unchanged) across all 7 plugin repos
- [x] External theme plugins: data-only tier (`cssVariables`, install-by-URL, no code/WASM)
- [x] Review component-override tier (`slots`) for external feasibility — blocked at the time;
  tracked separately as Milestone 16 (Post-1.0 Roadmap)
- [x] Migrate SteamGridDB and IGDB metadata providers to WASM plugins, retire built-in
  `sgdb.rs`/`igdb.rs`

(Locale Remulator/Locale Emulator's WASM migration moved into Milestone 10.)

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
Follows the M9 SGDB/IGDB precedent — ships as a standalone WASM plugin repo, not built-in.
- [x] `rawg-metadata-wasm-plugin` repo
- [x] Verify for real against a live API key, fetching real metadata
- [x] Verify merge behavior against IGDB (first-non-null-wins)

## Milestone 12 — WASM Plugin Capability Sandboxing (security)
Install-by-URL for WASM source plugins granted the same real-world system access as running an
arbitrary downloaded `.exe` — see devlog for the gap.
- [x] Interim: honest risk warning in the install confirmation UI and README
- [x] Path allowlisting for file/registry host primitives
- [x] Permission gating for `spawn-process`/`run-and-wait`
- [x] URL allowlisting/rate-limiting for `http-request`/`http-get`/`download-bytes`

## Milestone 13 — Plugin Trust Model: Signing & Review (stretch)
Even with Milestone 12 done, install-by-URL stayed trust-based, not verified — see devlog.
- [x] Code signing for published plugin releases (Sigstore attestation, advisory not a hard
  install-time gate)
- [x] Curated/reviewed plugin registry (`concourse-plugin-registry`, hash-pinned, hard reject
  on mismatch)
- [x] Revocation mechanism (pulling a registry entry *is* revocation, install-time only)

See devlog for the registry's own version-bump automation (dispatch on release → re-hash → PR),
added afterward.

## Milestone 14 — UI Polish (Continuous, ongoing)
This milestone doesn't close — UI polish is open-ended. See devlog for detail on each item;
new items get appended in place rather than opening a new milestone. Sits right after the
closed core roadmap (1–13) in sequence, but doesn't count toward it - it never closes, by its
own definition.
- [x] Custom window chrome, navigation shell, grid/list view toggle redesign, collapsible
  sidebar, themed scrollbars
- [x] Sidebar/titlebar rework (Add Game modal, Big Picture button relocation)
- [x] Design token pass; Play/Edit/Remove icon-only buttons; GameCard hover redesign
- [x] Toast/notification system; empty/loading states; modal polish
- [x] Big Picture visual pass + slideshow view
- [x] API-key/settings forms consolidated into `modalForms/` modal components
- [x] Big Picture tile title hover/selection reveal; fixed gamepad/mouse focus fighting in the grid
- [x] Pinned `GameFilters.vue` to the top of the scroll container (`position: sticky`)
- [x] New "UI Test" sidebar tab (dev-only, excluded from production builds)
- [x] Toast contrast/color-clash fixes under Brick Block; `.accent-active` opt-in color hooks
- [x] `BigPictureSlideshow.vue` wired onto the `cardVisual` AST
- [x] `GameListRow.vue` redesign (cover-as-background) + parity pass with `GameCard.vue`
- [x] `useSkeletonCount` composable - placeholder count now fills the real viewport
- [x] Fixed loaded games showing through skeletons during a scan; locked scroll while scanning
- [x] New "Stats" sidebar tab (`StatsPanel.vue`)
- [x] New "Tags" and "Collections" sidebar tabs, own stores (`stores/tags.ts`/`collections.ts`)
- [x] Sidebar tab components grouped under `src/components/desktop/tabs/`
- [x] `.settings-panel` inset moved from an `App.vue` wrapper onto each component's own root
- [x] Replaced the Edit modal with a full `GameDetail.vue` page (view/edit modes in place)
- [x] `GameDetail.vue`'s actions moved into one sticky bottom `.action-bar`; fixed a real
  `.content` bottom-padding bug this exposed, and `viewingGame` going stale after `refresh()`
- [x] `GameDetail.vue` edit mode reshaped to match view mode's two-column layout
- [x] Background-art page backdrop (`.hero`, gradient-masked, sticky), cover art + Back button
  grouped into a sticky `.sticky-side`; three real layout/scroll bugs fixed getting there,
  including `useImageBrightness` silently failing on cross-origin images (moved to a Rust
  command, `check_image_brightness`)
- [x] Backdrop text-reversal made theme-aware (`--color-text-reverse`, three real bugs fixed),
  then reworked into a live scroll-following flip (`.reverse-band`, `background-attachment: fixed`)
- [x] Cross-fade `<Transition>` between `GameDetail` and the browse view
- [x] `.game-detail` max-width widened 720px → 1200px
- [x] Edit form pass: Platform shows a real brand icon (`iconForPlatform()`), Executable
  path/Release date read-only, Title/labels restyled
- [x] Description renders as sanitized Markdown (`marked` + `DOMPurify.sanitize`)
- [x] `PluginSettings.vue` shows "Built-in" instead of a fake version for build-time TS plugins
- [x] Dark-on-dark scrim/text contrast fixes (`GameListRow`/`StatsPanel`), reworked into a
  theme-relative `color-mix()` tint (`--color-tint`) rather than a hardcoded literal
- [x] Tags/Collections rows and list/stat-row borders brought to `GameCard.vue`'s card-frame
  token parity (`--color-tint`, `--card-border-width`/`--card-radius`)
- [x] `src/components/desktop/`'s loose files sorted into `game/`/`shell/`/`common/` subfolders
- [x] `@/` → `src/` path alias adopted repo-wide (42 files); imports grouped per file (40 files);
  barrel `index.ts` added to `stores/` and every component subfolder
- [x] `src-tauri/` cleanup: `cargo fmt`, stray BOM stripped, dead `greet` scaffold command removed
- [x] `GameDetail.vue` cover thumbnail skeleton shimmer while metadata is fetching
- [x] `.info`'s invisible-text loading hack replaced with real skeleton bars
- [x] `GamepadRemapSettings.vue`'s live button diagram redrawn as an SVG gamepad silhouette with
  percentage-positioned round/pill/stick hitzones, replacing the plain CSS-grid box layout

Note: Milestone 3 (Big Picture) is sequenced before the plugin system to validate the
controller UX early. Milestone 4's loader only discovers plugins bundled into the app at
build time (`src/plugins/*`); Milestone 8 added true runtime-downloadable plugin support as
a distinct, larger feature.

---

# Post-1.0 Roadmap

Second wave of milestones, opened after 1.0.0 shipped. Numbering continues the same
sequence/heading convention as above for devlog cross-reference.

## Milestone 15 — Additional Source Plugins: Xbox/EA/Ubisoft (stretch)
Originally a core-roadmap stretch goal, moved here unstarted - no reason to hold up 1.0 for a
stretch goal nothing had been done on yet.
- [x] Xbox/EA/Ubisoft install-detection and launch mechanisms researched (community-sourced
  initially; Xbox/EA re-verified against real installs - see devlog)
- [x] `xbox-source-wasm-plugin` built, published (v0.1.1), registered, verified end-to-end
  in-app (real install/scan/launch/playtime against Minecraft for Windows) - see devlog
- [x] `ea-source-wasm-plugin` built, published (v0.1.1), registered, verified end-to-end in-app
  (real install/scan/launch/playtime against a purchased copy of Unravel) - see devlog
- [x] Two real bugs found and fixed along the way: `PluginPreview` serializing scope fields as
  snake_case (main repo), and neither Xbox's nor EA's `scan()` populating `install_dir` (broke
  playtime tracking for both) - see devlog
- [x] `ubisoft-source-wasm-plugin` built, published (v0.1.0), registered - detection/launch
  verified against a real install (Brawlhalla) before writing code, `install_dir` set correctly
  from the start (learned from the EA/Xbox bug above) - see devlog
- [x] Real in-app verification for Ubisoft Connect: scan, launch, and playtime all confirmed
  working (Brawlhalla). Caught two more real bugs along the way - a latent vue-i18n message-
  compiler escape bug in `confirmInstall.registryScope` (affected every locale, every plugin
  with a registry pathScope, not Ubisoft-specific) and a missing `uplay:` entry in the opener
  capability allowlist (same class of gap as EA's `origin2:` one) - both fixed, see devlog
- [x] Real-world gap caught by the user (XDefiant, a discontinued live-service game, still
  showing after its install was long gone): registry-only detection can outlive a real install.
  EA (v0.1.2) and Ubisoft (v0.1.1) both fixed - `scan()` now verifies the install folder still
  exists (new `ea-wasm`/`ubisoft-wasm` request-read-scope validators, directory-exists check)
  before including a game, consistent with every other plugin's "installed games only" scan
  semantics - see devlog
- [x] Each ships as its own WASM plugin in a separate repo from day one

Milestone 15 closed - Xbox, EA, and Ubisoft Connect source plugins all built, published,
registered, and verified end-to-end in-app.

## Milestone 16 — External Theme Plugins: JSON-AST Rendering Tier
Supersedes the original component-override design (blocked - see devlog legacy record). Ships
a constrained declarative template tier instead, measured against Brick Block's real gap.
- [x] Measure Brick Block's real gap against a template tier - small (a glyph swap, one wrapper
  element, missing CSS-variable hooks), no method-call/helper expressions needed
- [x] Decide the action-dispatch boundary - footer buttons stay host-rendered always, never
  themeable structure/callables
- [x] Prototype naive same-realm interpolation (`@vue/compiler-dom` + `new Function`) - verified
  a full sandbox escape for real, rejected outright
- [x] Evaluate Web Worker isolation - structurally sound but superseded before being built
- [x] Design and build the JSON-AST interpreter instead (`src/theme/cardVisualAst.ts`/
  `cardVisualRegistry.ts`) - no `eval`/`with`/`new Function` anywhere, so no code-execution
  primitive exists to escape from. 4 node types, closed field/transform enums, depth/node caps
- [x] Acceptance test against Brick Block's measured gap, plus interpreter safety tests (bad
  field, bad node type, depth/count overflow) - all pass
- [x] Sign the AST manifest itself for provenance, reusing the existing WASM-plugin signing path

- [x] Post-close: themes can now re-skin the whole UI's typeface, not just colors - `styles.css`'s
  base `font-family` reads from a new `--font-family` CSS variable (defaulting to the existing
  system stack) instead of a hardcoded value, so a theme's `cssVariables` can override it and
  every element inherits the change (paired with the existing `fontFaces` mechanism to load a
  real `@font-face` first, if needed)
- [x] Post-close: new `--content-background` hook - a theme can now paint the library content
  area with any CSS `background` value (gradient/pattern), not just a flat color, transparent
  by default so every existing theme is unaffected. Added for a new `arc-raiders-theme` (dark
  base, the game's real signature diagonal stripe colors - cyan/yellow/orange/red, verified
  against the actual logo - as a low-opacity repeating diagonal pattern), registered in
  `concourse-plugin-registry` (`concourse-plugin-registry#26`)

`concourse-plugin-registry` extended to `kind: "theme"`
(`brick-block-data-theme` as first entry, hash-pinned and enforced same as WASM plugins - a gap
caught and fixed here, not shipped silently unenforced). Post-ship fidelity pass (from real use,
not just the acceptance test) fixed two real bugs (`cardVisual` silently dropped by the Rust
struct; several card/placeholder values still had no variable hooks), added
`--card-border-width`/`--card-radius`/`--cover-placeholder-*`/`--balloon-background` hooks, and
added a new `fontFaces` capability (real `@font-face` loading, strictly validated,
commit-pinned-URL only) since `cssVariables` can only select a font, never load one.

## Milestone 17 — Shared Styles Convention
Style-convention shift: less `<style scoped>` per component, more centralized shared CSS
(`src/styles.css`), prompted by Brick Block work repeatedly hitting hardcoded, unoverridable
values in individual components' scoped blocks.
- [x] Audit 22 components' scoped styles for real duplicate/hardcoded-token findings
- [x] Absorb `App.vue`'s `:root` token block and primitive-element resets into `styles.css`
- [x] Migrate identified duplicate patterns (shimmer, list-row, tag-pill, empty-state, Big
  Picture's backdrop cluster) into shared classes
- [x] Resolve off-token radius values, fold into the named scale (`--radius-panel` → `--radius-lg`,
  old `--radius-lg` → `--radius-xl`)
- [x] Migrate remaining unused-token findings (hardcoded borders/gaps/radii/colors → tokens)

Post-close follow-ups (see devlog for full detail): vestigial
now-empty local classes removed; `.hint` converted to primitive `<small>`; `.error` → shared
`.error-text`; a full button-styling consistency pass (two real bugs -
`.view-toggle-button`/`.icon-action-row` - plus a clean duplicate, a font-size fork collapsed to
one tier, and the `.active` accent-swap idiom, all folded into shared classes). `TitleBar.vue`'s
chromeless buttons and a `--space-*` tokenization pass remain open, deliberately unscoped.

## Milestone 18 — Retire Component-Swap Theming
Milestone 16's JSON-AST/token mechanism was built to replace `slots`/component-swap theming;
this milestone finishes that job (`slotRegistry.ts`/`ThemeSlotName` had exactly one real
consumer - the built-in `brick-block-theme` plugin).
- [x] Opt-in `--button-radius`/`--button-border-color`/`--tile-*` hooks added, closing the
  visual gaps between `brick-block-data-theme` and the built-in swap version
- [x] Gave `BigPictureTile.vue` a `cardVisual`-AST render path, same pattern as `GameCard.vue`
  (second consumer of the same registry)
- [x] Ported Brick Block's Big Picture tile look to `brick-block-data-theme`'s manifest, then
  verified full property-by-property parity against the built-in version - two more real gaps
  found and closed (tile corner radius, focus-ring style); two cosmetic-only gaps deliberately
  left open (balloon type sizing, cover-placeholder star size)
- [x] Removed the built-in `brick-block-theme` plugin folder, `slotRegistry.ts`, `ThemeSlotName`,
  and every `useThemeSlot`/`setActiveSlots`/`clearActiveSlots` call site - `GameGrid.vue`/
  `BigPictureGrid.vue` render `GameCard`/`BigPictureTile` directly now

Component-swap theming is retired; `cardVisual` AST + CSS-variable hooks is now the only
theming mechanism for both desktop and Big Picture, for every theme kind.

## Milestone 19 — Auto-Update: App + Plugins/Themes
Two genuinely separate mechanisms, both checked at the same three moments (app start, app
focus, install-plugin modal open) via one orchestrating call. See devlog for the design
tradeoffs behind the split.

**App self-update** (Tauri's own official plugin, not custom):
- [x] Added `tauri-plugin-updater` + `tauri-plugin-process`
- [x] Generated the signing keypair, wired into `tauri.conf.json`
- [x] New `.github/workflows/release.yml` (Windows-only), builds/signs/publishes via
  `tauri-apps/tauri-action`
- [x] Frontend: `stores/appUpdate.ts`, wired into app start/focus/install-plugin-modal-open
- [x] Verified end-to-end against a real published release (took 3 failed test releases to
  get here; see devlog)
- [x] Added `Swatinem/rust-cache@v2` to `release.yml`
- [x] Fixed a real bug caught by GUI testing: `Update` class instance stored in a plain `ref()`
  broke on `downloadAndInstall()` (deep-reactivized Proxy vs. private fields) - fixed with
  `shallowRef`
- [x] Confirmed working end to end by the user, testing a real install/update/relaunch

**Plugin/theme self-update** (custom - no existing mechanism covers this):
- [x] Persisted each installed plugin/theme's install origin (`source_url`/
  `installed_via_registry`) - not a breaking change
- [x] New `check_plugin_update` command - numeric version comparison, two lookup strategies by
  install origin
- [x] Frontend: `stores/pluginUpdates.ts` + an "Update available" badge in `PluginSettings.vue`
- [x] Apply-update path (`applyUpdate`) reuses `install_plugin` directly; added
  `refreshManifests()` to `wrapperPlugins.ts` (a real pre-existing gap)
- [x] Wired `pluginUpdates.checkAll` into the same trigger moments as `appUpdate`, plus
  `PluginSettings.vue`'s own mount as a fourth, genuinely distinct moment

Milestone 19 fully closed - app self-update verified end to end; plugin/theme self-update
built and wired in, though not GUI-tested the same way (no real newer-version plugin/theme
available to test against).

- [x] Post-close: replaced `AppUpdateBanner.vue` with an actionable toast (`stores/toasts.ts`
  gained `pushAction()`), closing the earlier `shallowRef` fix's root cause structurally
- [x] Fixed a real bug: `AddPlugin.vue`'s registry list only ever refreshed once (`onMounted`),
  going stale on repeat opens - added the same re-fetch to its `open`-prop watcher, and
  removed the same watcher's now-redundant update-check calls (`PluginSettings.vue`'s own
  mount already covers it). Update checks now fire at three moments, not four
- [x] Post-close, on request: re-added the update-check call to `AddPlugin.vue`'s `open`-prop
  watcher as a genuine fourth trigger moment (not a duplicate this time) - a long Settings
  session can reopen this modal many times without `PluginSettings.vue` ever remounting, so
  its own mount-time check doesn't cover repeat opens the way it first seemed to

## Milestone 20 — Internationalization & Offline Translation
- [x] UI string localization via `vue-i18n`, 10 locales, exact key parity verified
- [x] `translation` host-native Rust module - downloads llama.cpp's own prebuilt server binary,
  runs it as a subprocess over HTTP (not a Rust ML crate dependency)
- [x] 5 model tiers, all under ~3.5GB RAM: `qwen2.5-1.5b`, `qwen3-4b` (recommended),
  `gemma4-e2b`, `qwen3-4b-abliterated`/`gemma4-e2b-abliterated` (opt-in, uncensored) - see
  devlog for the full model-research history, rejected candidates, and `translategemma-4b`'s
  removal (confirmed
  llama.cpp `--jinja` parser bug)
- [x] Settings UI: engine row + a model dropdown (not per-tier radio rows) with one status
  button that follows the selected model's install state, live progress, Remove buttons - shares
  a new `DropdownMenu.vue` shell component with `GameDetail.vue`'s translate menu
- [x] `GameDetail.vue`: "Translate" button opens a 3-group paged dropdown (translate
  title/content/both, view-toggle each independently or together, revoke per field or both) -
  wheel/arrow-key paged, animated, 3-dot indicator. Title/content translate, display, revert,
  and skeleton independently
- [x] "Show" toggle state persisted per game (migration v5)
- [x] Translated title shown in place of the original (when valid) on `GameCard`'s balloon,
  `GameListRow`, and `StatsPanel` - via a shared `displayTitle()` helper
- [x] Translated title/description persisted alongside the originals (migration v4), not
  overwriting them - stale on locale mismatch or an edited original
- [x] App-exit hook + 5-minute idle-timeout auto-kill the `llama-server.exe` subprocess
- [x] `enable_thinking: false` and `max_tokens: 1024` on every request (Qwen3 thinking-mode
  latency, unbounded-generation risk)
- [x] Engine research: `llama-cpp-2` (Windows CMake bugs) → `mistralrs` (can't load `gemma3`
  GGUF) → llama.cpp prebuilt binary - see devlog for the full comparison

Milestone 20 fully closed. See devlog for full rationale on every decision above. Deliberately
deferred: translating other fields (release date, tags), canceling an in-progress download,
detecting already-installed Ollama/LM Studio.

## Milestone 21 — Plugin-Developer Documentation Site
- [x] New `docs/` VitePress project (own `package.json`, decoupled from the app's own frontend
  build) - architecture overview, getting-started walkthrough, manifest reference, WIT interface
  reference, security model, and publishing pages for third-party plugin authors
- [x] `.github/workflows/docs.yml` - builds and deploys to GitHub Pages via
  `upload-pages-artifact`/`deploy-pages` on every push to `docs/**`, no `gh-pages` branch needed
- [x] One-time manual step done: repo Settings → Pages → Source → "GitHub Actions" - live at
  https://smh0505.github.io/Concourse/, workflow run confirmed successful
- [x] End-user documentation added under `docs/guide/` (Getting Started, Library & Games,
  Plugins & Themes, Big Picture Mode) - new "User Guide" nav entry alongside "Plugin Docs"
- [ ] Reminder: add real app screenshots to the docs site (currently none). No screenshot
  tooling in this dev environment, so the user needs to capture them manually - swap out
  `%APPDATA%\com.bloppy.concourse\library.db*` for a throwaway/fake-data copy first (real
  library has NSFW entries not meant for public docs), screenshot, then restore the originals

## Milestone 22 — Docs Site Internationalization
Same 10 languages as the app's own UI (Milestone 20). See devlog for rationale/detail.
- [x] `docs/.vitepress/config.ts` `locales` config, per-locale `themeConfig`, lowercase URL
  subpaths, built-in VitePress locale switcher
- [x] All 13 pages under `docs/guide/`/`docs/plugins/` (+ `docs/index.md`) translated into all 9
  non-English locales (117 files, mirrored under `docs/<locale>/`)
- [x] `bun run docs:build` verified clean for the full multi-locale site; CI unchanged

## Milestone 23 — DLsite Metadata Provider (unofficial, stretch)
No official public API - unlike every other metadata provider plugin (IGDB/SteamGridDB/RAWG/
TheGamesDB/VNDB, all built against a real sanctioned API). Would depend on an unofficial/
undocumented access path instead. Deliberately not detailed further here - see
`.claude/dlsite-plugin-notes.md` (gitignored, not tracked) for the full research and open
questions before this gets started.
- [ ] Not started - research/scoping only exists in the private notes file above

## Milestone 24 — Detachable Controller Mapping Plugins (data tier)
`standard-gamepad`/`8bitdo-micro` detached into separately-installed data-only plugins (same
tier Milestone 16 built for themes), not the WASM tier - a controller mapping is pure data, no
`scan()`/`launch()` behavior. See devlog for rationale/detail.
- [x] `plugin_installer.rs`: `DataControllerManifest` (opaque `mapping`), install/list/uninstall
  commands, `detect_kind`/`install_plugin` extended to `"controller"`
- [x] `loader.ts`: `createDataControllerMappingPlugin` + `normalizeGamepadMapping` narrowing
  untrusted remote JSON
- [x] `PluginSettings.vue`/`pluginInstall.ts`/`controllerMapping.ts` wired, same treatment the
  Theme tab has
- [x] New repo [`data-controller-plugins`](https://github.com/smh0505/data-controller-plugins) -
  `8bitdo-micro` migrated out; `standard-gamepad` stays built-in (Gamepad API baseline fallback)
- [x] `concourse-plugin-registry` extended to `kind: "controller"`, fixing two real bugs in
  `validate.sh`/`bump-entry.sh`'s data-only-vs-WASM branching along the way
- [x] Post-close: `GamepadRemapSettings.vue`'s diagram redrawn as an SVG gamepad silhouette with
  stick-tilt direction lights and a popup axis readout; fixed `gamepadRemap` i18n strings only
  ever existing in `en.json`
- [x] Post-close: manifest gained optional `layout`/`silhouette` fields for a fully custom
  diagram, opaque passthrough narrowed only at point of use

## Milestone 25 — Library Functions Update: Batch Ops + Filter/Sort
Two workstreams, scoped together since both touch the same filter-bar area and library
selection state. See devlog for full rationale/design evolution.

**Batch operations.**
- [x] Multi-select mode for the grid/list view (`stores/librarySelection.ts`, checkbox UI in
  `GameCard.vue`/`GameListRow.vue`)
- [x] Batch actions on a selection: add tag, add to collection, remove from library
  (remove-specific-tag/collection deferred - see devlog)
- [x] Selection UI affordance ("N selected" bar, Select All/Clear) in `GameFilters.vue`

**Filter/sort expansion.**
- [x] Platform/tag/collection filtering via search-box tokens (`platform:`/`tag:`/
  `collection:`), the search box being the single source of truth
- [x] Multi-selectable, clickable pills for all three kinds - one merged row under the search
  bar (capped, "+N more" opens a "browse all filters" modal), per-kind OR/AND match mode, plus a
  `manual` pseudo-platform pill for games with no source-plugin platform
- [x] Sort options (title A-Z, recently played, most played, recently added), persisted like
  `viewMode`
- [x] Expandable sort dropdown under `GameFilters.vue`'s bar; playtime-range/install-status
  filters remain deliberately deferred (no data hooks decided yet)

## Milestone 26 — Quick-Launch Search
Spotlight/Alfred-style overlay: global hotkey opens a search box, type to filter the library,
launch directly - faster than opening the app to the desktop UI for a single launch. Confirmed
via research this is a real, precedented pattern (Playnite's "Keyboard Launcher"). See devlog
for the full design rationale.
- [x] Global hotkey registration (`tauri-plugin-global-shortcut`) - default `Ctrl+Alt+Space`,
  configurable in `AppSettings` via a listening-for-input recorder
- [x] Dedicated always-on-top overlay window (separate Vite entry/Tauri window, not an in-app
  modal) - required adding system tray support (not originally scoped) so the app can stay
  alive after the main window closes; close (X) now hides to tray instead of quitting
- [x] Fuzzy title search over `library.ts`'s `games` (new in-house `fuzzyMatch.ts`, not a
  dependency), keyboard-navigable, results lazy-load in batches as the list scrolls
- [x] Enter launches the selected game via `library.ts`'s real `launchGame()` (same path
  `GameCard`/`GameListRow` use), then closes the overlay
- [x] Behavior when main window isn't running: works whenever the app process is alive (tray-
  backed), same inherent limitation any tray app has if fully quit rather than closed
- [x] Overlay follows the active theme (`--content-background`/`cssVariables` etc.) - re-applied
  on every show, since the window is created once and reused rather than recreated per toggle

## Milestone 27 — Library Backup/Export (not started)
Export/import games, tags, collections, and settings as a portable file - covers reinstall/
migration without re-scanning every source plugin and redoing manual metadata edits.
- [ ] Export command - serialize `games`/`tags`/`game_tags`/`collections`/`settings` tables
  (excluding secrets like API keys, or exporting them separately with a clear warning) to JSON
- [ ] Import command - restore from an exported file, decide merge-vs-replace semantics against
  an existing library
- [ ] Settings UI: Export/Import buttons, file picker (Tauri's dialog plugin)
- [ ] Decide what happens to `executable_path`s that don't exist on the importing machine
  (different install locations) - flag rather than silently break
- [ ] Version the export format (so a future schema migration can still read an older export)

## Milestone 28 — Discord Rich Presence
Shows "Playing <game>" on the user's Discord status while a game is running - a built-in
feature, not a plugin: there's only ever one Discord client to report to, unlike source/
metadata's multi-enable model. See Milestone 29 for generalizing this into a real presence
plugin kind, if a second real target (Twitch/Slack/OBS webhook) is ever actually wanted. See
devlog for full rationale (including why Discord's client_id is safe to hardcode, unlike a
metadata provider's API key/secret).
- [x] Discord IPC/RPC integration via the `discord-rich-presence` crate (local Discord client,
  not a bot/webhook - no server-side component)
- [x] Wired into `launcher.rs`'s existing launch/session-end lifecycle (same hook playtime
  tracking already uses) to set/clear presence
- [x] Settings toggle (on/off) plus a per-game opt-out checkbox in `GameDetail.vue`'s edit mode
- [x] Discord not running / IPC connection failure handled gracefully (quiet no-op, connection
  state cleared and retried fresh next launch rather than erroring)
- [x] Real `DISCORD_CLIENT_ID` supplied (`discord_presence.rs`), `cargo check` clean
- [x] Manually verified end-to-end (`bunx tauri dev`) - Discord shows "Playing <title>" while a
  game runs

## Milestone 29 — Presence Plugin Type
Generalizes Milestone 28's Discord-only integration into a real multi-enable plugin kind
(Discord + a new local OBS webhook). See devlog for design rationale and platform research.
- [x] New `PresencePlugin` interface (`activate`/`deactivate`), manifest/loader wiring
- [x] Discord migrated to a real plugin (`discord-presence`); `launcher.rs` no longer knows
  presence exists at all
- [x] OBS Overlay (`obs-presence`) - always-on local HTTP server (`tiny_http`), zero external auth
- [x] Settings UI: new "Presence" tab, multi-enable checkboxes
- [x] Manually verified end-to-end
- [ ] Stretch: detach presence plugins into the WASM tier - not started, no `activate`/
  `deactivate` WIT interface exists yet; see devlog

**OBS webhook follow-ups, stretch** (all done):
- [x] Richer overlay content - cover art + live elapsed-time counter
- [x] Raw JSON `/status` endpoint alongside the HTML page
- [x] Configurable, testable overlay port - "Configure Overlay" modal (added ad hoc)
- [x] Overlay presentation options - alert-popup mode + minimal template
- [x] Real `obs-websocket` integration - scene auto-switch on game launch/exit (`obws` crate)
- [x] Configurable overlay corner - card anchors to any screen corner, cover art flips to the
  near edge (added ad hoc)
- [x] Title/elapsed stacked on two lines instead of one row; overflowing titles marquee
  instead of clipping (added ad hoc)

**Candidate presence platforms - trimmed to the two that actually match the goal** (a persistent
ambient status your friends see live, same mechanism as Discord - not a one-off social post, not
a broadcast/channel-info overwrite, not workspace-scoped). See devlog for the full per-platform
auth research, including everything dropped below.
- [x] Discord - done (Milestone 28/29), one shared hardcoded `client_id`
- [ ] Matrix protocol - the only other real ambient-presence match found
  (`PUT /_matrix/client/v3/presence/{userId}/status`, same set/clear shape as Discord).
  Secret-free PKCE auth path exists but is still mid-rollout across homeservers, so a legacy
  password-login fallback would be needed too. Parked, not dropped - unfamiliar platform, more
  setup than a first build needs, revisit later

**Dropped - wrong mechanism, wrong audience, or blocked by a real secret requirement:**
- Twitch, Chzzk, Kick, SOOP - all overwrite a public *channel's* title/category (broadcast info),
  not a personal status - "sync my channel to what I'm playing," not "notify my friends."
  Chzzk/Kick/SOOP are also blocked outright (need a real per-user `client_secret`); Twitch's
  Authorization Code grant needs one too (Device Code Grant is the only secret-free path, and
  still risks clobbering an actual live stream's title)
- Slack - right shape (ambient status), wrong audience (workspace/coworker-scoped, far fewer
  people run a gaming-community Slack than Discord)
- Bluesky, Mastodon/Fediverse - different feature shape entirely (a one-off public post per
  session, not a persistent status) - genuinely reaches "anybody," just not the same mechanism
  this milestone is actually building toward
- Steam Rich Presence (needs a real Steamworks App ID), Telegram (no free-text status),
  X/Twitter (API now pay-per-post), YouTube (Desktop-secret safety unclear), Home Assistant (no
  real use case), ntfy.sh (no native outbound relay, third-party glue only), Guilded (no
  ambient-status API exists at all)

## Milestone 30 — Multi-Library / Profile Support (not started)
Separate libraries per user profile on a shared PC (couples/family sharing one machine), or a
filtered "kids mode" view. Real schema/architecture question, not just a UI toggle - today
there's exactly one SQLite DB (`library.db`) and no concept of "whose library this is."
- [ ] Decide scope: fully separate DB files per profile (simplest, but no shared source-plugin
  scan reuse) vs. a `profile_id` column threaded through every table (shared scan results,
  per-profile visibility/filtering)
- [ ] Profile switcher UI (likely at app launch, before the main library loads)
- [ ] Decide what's global vs. per-profile: plugin enablement/settings, theme, controller
  mapping are probably global; games/tags/collections/playtime are probably per-profile
- [ ] "Kids mode" as a filtered view of one profile (age-rating/tag-based hide-list) vs. a real
  separate profile - decide which before building

## Milestone 31 — Custom Launch Arguments Per Game (not started)
`launcher.rs`'s `launch_game` spawns `executable_path` bare - some games need `-windowed`,
mod-loader flags, or other CLI args that currently have no home.
- [ ] New `launch_args` column on `games` (migration)
- [ ] `launch_game` passes stored args to the spawned process
- [ ] `GameDetail.vue` edit-mode field for launch args, alongside the existing executable path
- [ ] Decide handling for URI-launched entries (`steam://`, etc.) - args likely don't apply the
  same way there

## Milestone 32 — Pre-Launch Scripts/Hooks (not started)
Run a script before/after launch (mount a virtual drive, kill a background app, apply a mod) -
builds on Milestone 31's launch-args groundwork but is a materially bigger trust/security
surface (arbitrary script execution, not just CLI flags).
- [ ] Decide trust model first - this is arbitrary code execution tied to a game entry, a
  bigger surface than anything in the existing WASM capability-gating model (Milestone 12)
- [ ] Schema: pre-launch/post-exit script path (or inline command) per game
- [ ] `launcher.rs` wiring - run pre-launch script, wait/decide on failure behavior, launch game,
  run post-exit script after the existing session-end detection
- [ ] `GameDetail.vue` UI for setting the hook scripts
- [ ] Explicit user-facing warning given the security surface - this isn't sandboxed like a
  plugin is

## Milestone 33 — Game Notes/Journal (not started)
Free-text per-game notes (playthrough progress, build order, "where I left off").
- [ ] New `notes` column on `games` (migration) or a separate `game_notes` table if history/
  timestamps per note entry matter (a journal, not just one overwritable field)
- [ ] `GameDetail.vue` - a notes section, markdown-rendered same as the existing description
  field (`marked` + `DOMPurify.sanitize`, already wired for descriptions)
- [ ] Decide: one note per game (simple) vs. a dated log (more journal-like, more schema)

## Milestone 34 — Random Game Picker (not started)
"Surprise me" button for a big backlog - optionally filtered ("something under 2 hours", by
tag/collection).
- [ ] Picker button (sidebar or library toolbar) - random selection from `filteredGames`
  (respects whatever search/tag/collection/sort filters, including Milestone 25's new ones, are
  already active)
- [ ] Optional playtime-range filter specific to the picker (distinct from Milestone 25's general
  filters, if that one doesn't already cover it)
- [ ] Result presentation - jump straight to `GameDetail`, or a lightweight reveal
  animation/modal before committing to navigation

## Milestone 35 — Recently-Removed / Trash Bin (not started)
Soft-delete with an undo window instead of immediate removal - more important once Milestone
25's batch-remove ships (accidental mass-delete becomes much easier).
- [ ] Soft-delete: `deleted_at` column on `games` (migration) instead of a hard `DELETE`,
  filtered out of normal library queries
- [ ] "Recently Removed" view (sidebar tab or a filter toggle) listing soft-deleted games with
  Restore/Delete Forever actions
- [ ] Auto-purge policy - permanently delete after N days, or manual-only
- [ ] Toast with an inline "Undo" action on removal (`stores/toasts.ts` already supports
  `pushAction()`, added for Milestone 19's update banner) - immediate undo without needing to
  visit the trash view at all

## Milestone 36 — Time-Played Goals/Reminders (not started)
"Haven't played X in 3 months" surfacing, or backlog-clearing nudges - encourages using the
library rather than just cataloging it.
- [ ] Decide trigger model: computed from existing `playtime_sessions`/`total_playtime` (no new
  tracking needed) vs. explicit user-set goals ("play this for 10 hours") needing new schema
- [ ] Surfacing UI - a dashboard/stats-panel callout (`StatsPanel.vue` already exists) vs. a
  toast/notification on app start
- [ ] Decide whether this needs OS-level notifications (app must be running vs. a true
  background nudge) - likely app-open-only for a first pass

## Milestone 37 — Touch/Mouse-as-Gamepad Input for Big Picture (not started)
Second Big Picture input method for handheld/tablet Windows devices without a physical
controller - `useGamepadNav` today reads only real Gamepad API input via the active
`ControllerMappingPlugin`.
- [ ] On-screen virtual d-pad/buttons overlay for Big Picture, mapped to the same `focusedIndex`/
  `onSelect`/`onCancel` interface `useGamepadNav` already exposes - not a separate nav
  implementation
- [ ] Touch-drag/swipe gesture nav as an alternative to on-screen buttons
- [ ] Decide auto-detection (no real gamepad connected -> show virtual overlay) vs. a manual
  toggle in settings

## Milestone 38 — Bulk Cover Art Auto-Crop/Regen Tool (not started)
Bulk re-fetch/fix missing or misformatted art after adding many manual games at once, or after
enabling a new metadata provider retroactively.
- [ ] "Fetch metadata for all missing" bulk action (library-wide, not per-game) - reuses the
  existing `metadataProviders.ts` fetch/merge logic already used for single-game fetches
- [ ] Auto-crop/aspect-ratio normalization for cover art that doesn't match the expected
  card ratio (some manual/community sources return arbitrary image dimensions)
- [ ] Progress UI for a bulk operation (this could take a while across a large library) -
  likely the same event-based progress pattern `wasm_plugin_installer.rs`'s download flow uses
- [ ] Rate-limit awareness - bulk-fetching against SGDB/IGDB/RAWG/etc. for every game at once
  risks hitting per-provider API rate limits

## Milestone 39 — Borderless Window Pseudo-Fullscreen (not started)
Pseudo-fullscreen: strips a game window's border/title bar and resizes/repositions it to fill
the display while preserving the game's own aspect ratio - letterbox/pillarbox filler bars fill
the remaining margin instead of stretching the image, unlike a naive borderless-stretch. Same
idea as third-party tools like Borderless Gaming. User-proposed, not scoped in code yet.

Built as a **built-in feature, not a plugin** - same call Milestone 28 made for Discord presence
before OBS gave it a second real target to justify generalizing (see M29). Exactly one
implementation exists here too, and `WrapperPlugin`'s existing shape (`listProfiles`/`launch`,
WASM-tier, built for Locale Emulator's launch-substitution pattern) doesn't fit a post-launch
window-styling hook anyway - forcing it in would mean changing the shared WIT interface's
contract (affecting the existing Locale Emulator plugin) for a single, unproven consumer.
Revisit as a real plugin kind only if a second such window-hook idea actually gets built (see
the stretch list below for candidates).
- [ ] Settings toggle (global or per-game, TBD) to enable pseudo-fullscreen for a launch
- [ ] Windows-only mechanism (matches this project's other Windows-only pieces - `winreg`,
  `steam.rs`'s registry reads): find the launched game's window from its known PID, strip
  `WS_CAPTION`/`WS_THICKFRAME` via `SetWindowLongPtr`, `SetWindowPos` to full display bounds
- [ ] Compute the letterboxed rect from the game's *original* aspect ratio (captured before
  restyling) against the display's resolution - likely a separate always-black, click-through
  overlay window behind the game, rather than painting into the game's own client area
- [ ] Revert cleanly on `game-session-ended` - restore window style/rect, tear down the overlay
- [ ] Multi-monitor targeting undecided (which display's bounds - the game's own, or primary?)
- [ ] Research whether a game's true resolution/aspect ratio is knowable before render starts,
  since some games change resolution *after* window creation

**Window behavior, stretch - speculative, none started, no tab/kind unless one of these is
actually built.** Grouped here since they'd share the same "act on the game's window after
launch" mechanism as pseudo-fullscreen above, not because any is planned yet.
- [ ] Always-on-top pinning for the game window
- [ ] Remembered window position/size per game (restore where you last left it)
- [ ] Forced resolution/DPI override at launch

---

# Icebox

Not part of the active numbered sequence - unlike a milestone still queued in the roadmap
above, nothing here is planned to start soon. Distinct from "not started" (every unstarted
milestone above is still an active intent); an icebox item lacks a real reason to start it
right now. Revive by moving an entry back into the numbered sequence above (give it a fresh
milestone number reflecting whenever it's actually picked up, don't reuse the old one) if that
ever changes.

## Structured Errors Across Rust Commands
Every `#[tauri::command]` outside `obs_presence.rs`/`obs_websocket.rs` still returns flat
`Result<_, String>` (`plugin_installer.rs`/`wasm_plugin_runtime.rs`/`wasm_plugins.rs` alone
account for 20+). Iceboxed, not started - genuinely different failure domains per module, real
architecture work (one enum or a per-module hierarchy), no `thiserror` needed. See devlog.
- [ ] Design the enum shape before touching any command
- [ ] Migrate `plugin_installer.rs`/`wasm_plugin_runtime.rs`/`wasm_plugins.rs` (largest cluster)
- [ ] Migrate the rest (`translation.rs`, `plugin_registry.rs`, `zip_install.rs`,
  `plugin_verification.rs`, `image_utils.rs`, `launcher.rs`, `quick_launch.rs`)

## Additional Source Plugins: Emulator/ROM Scanner
Carried over from Milestone 7, then parked here (no milestone number - see this section's own
intro) - every other Post-1.0 source plugin (Milestone 15's Xbox/EA/Ubisoft) got built against
something real: a real install, verified
directory/registry conventions, a real launch test. No emulator/ROM setup exists to verify
against here (checked directly, not assumed - a PPSSPP config folder exists on this machine but
is empty, no ROMs, no locatable executable), and the user doesn't currently play emulated games
at all. Building this against documentation alone, with nothing real to check it against, would
break the "verify before shipping" discipline every other source plugin this project has used -
better left icebound than built blind.
- [ ] Research emulator/ROM directory conventions worth supporting first
- [ ] Scan configured ROM directories, map entries into core `GameEntry` format
- [ ] Launch mechanism (emulator + ROM path)
- [ ] Dedup against manually-added / other source-plugin entries
