# Milestones

Tracks *what's done*. For implementation rationale, decisions, and fixes behind each item,
see `.claude/devlog.md`.

**1.0.0** marks Milestones 1–13 (the core roadmap) closed and the app considered stable for
real-world use. Further work continues under **Post-1.0 Roadmap** at the bottom of this file,
numbered as a continuing milestone sequence for the same devlog cross-reference convention.

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
  tracked separately as Milestone 17 (Post-1.0 Roadmap)
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
- [x] API-key/settings forms moved into modals; modal-form components consolidated under
  `src/components/desktop/modalForms/`
- [x] Big Picture tile title hidden by default, reveals on hover/selection, ellipsis on overflow
- [x] Fixed keyboard/gamepad focus fighting the mouse cursor in Big Picture's grid
- [x] Pinned `GameFilters.vue` to the top of the library's scroll container (`position: sticky`)
- [x] New "UI Test" sidebar tab (manual triggers for hard-to-reach UI states)
- [x] Fixed `.toast-info`'s poor contrast under Brick Block
- [x] Fixed toast success/error color clash under Brick Block (theme's own `--color-accent`
  changed, not the shared toast component)
- [x] Gave `.accent-active` its own opt-in color hooks so a theme's accent color doesn't force
  the active-tab/nav indicator to match
- [x] Wired `BigPictureSlideshow.vue`'s strip covers into the `cardVisual` AST, matching
  `GameCard.vue`/`BigPictureTile.vue`
- [x] `GameListRow.vue` redesigned: cover art as background, collapses to title-only until
  hovered (plus three follow-up spacing/padding passes)
- [x] New `useSkeletonCount` composable - skeleton placeholder count now fills the actual
  viewport instead of a fixed guess
- [x] Fixed loaded games staying visible/interactable under skeleton placeholders during a
  scan; locked scroll while scanning
- [x] `GameListRow.vue` brought to `GameCard.vue` parity: themed cover-placeholder hooks,
  fetch-metadata spinner overlay, icon-only Info button
- [x] New "Stats" sidebar tab (`StatsPanel.vue`) - total games/hours, Most Played, Recently
  Played
- [x] "UI Test" made genuinely dev-only (excluded from production builds via a `DEV`-gated
  dynamic import, not just hidden from the nav)
- [x] New "Tags" and "Collections" sidebar tabs (separate, not combined) - standalone tag
  create/rename/delete, and a new Collections feature (separate schema, groups a
  series/franchise) with the same management + per-game assignment + library filter as tags
- [x] Fixed the new tabs' sticky "add" header touching the titlebar on scroll (same fix
  `GameFilters.vue` already needed), then moved their now-identical styles into `styles.css`
- [x] Moved `.settings-panel` off an `App.vue`-owned wrapper div onto each affected
  component's own root - inset is now each component's own concern, not the caller's
- [x] Split tag/collection state out of `library.ts` into their own `stores/tags.ts`/
  `stores/collections.ts` - a genuinely separate domain now, not just "a lot of actions"
- [x] Grouped every sidebar tab's own top-level component into `src/components/desktop/tabs/`,
  separate from the smaller supporting components they render
- [x] Replaced the "Edit" modal with a full `GameDetail.vue` page (view mode by default,
  toggles to an edit mode in place) - `library.ts`'s `editingGame`/`openEdit`/`cancelEdit`
  renamed `viewingGame`/`openDetail`/`closeDetail`; saving no longer closes the page
- [x] Moved `GameDetail.vue`'s page actions into a single sticky, bottom-right-aligned
  `.action-bar` (both view mode's Play/Fetch Metadata/Edit/Remove and edit mode's
  Cancel/Save), pinned to the bottom of the scroll container instead of scrolling away
  inline with the page content. Removed the bar's border/margin, and gave the page itself
  top/left/right padding it was missing entirely
- [x] Fixed a real bug: the sticky action bar still floated above `.content`'s true bottom
  edge - a negative margin on `GameDetail.vue`'s own root can't reach into `App.vue`'s
  `.content` padding, a different element entirely. Fixed on the actual owning element
  instead: `.content` gets a conditional `no-bottom-inset` class (same pattern as its existing
  `scroll-locked` binding) zeroing its bottom padding while `GameDetail.vue` is active
- [x] Fixed a real bug: `viewingGame` was a static ref, going stale after any `refresh()`
  (metadata fetch, background art fetch, ...) since `refresh()` replaces `games` wholesale
  with fresh objects from a new query - changed to a computed derived from `games` by id
- [x] `GameDetail.vue` reshaped: edit mode now mirrors view mode's two-column layout (cover
  art preview on the left, tracking the live form value; fields on the right) instead of a
  flat single-column form. Moved "Fetch Metadata" into edit mode's action bar (was view mode's)
- [x] Added the game's background art as a page backdrop (`.hero`, sticky top-of-scrollport
  banner, gradient-masked fade), tags/collections moved under the cover art, cover art + Back
  button grouped into a sticky `.sticky-side` alongside the description column
- [x] Three real bugs fixed getting the backdrop's layout/scroll behavior right: `.hero` as a
  flex child pushing the page down instead of overlapping it; the backdrop/cover/back-button
  scrolling away entirely once `.game-detail-page` itself became the scroller; and
  `useImageBrightness` silently never working at all (browser `<canvas>`/`getImageData` can't
  read cross-origin CDN images without matching CORS headers) - moved sampling to a new Rust
  command, `check_image_brightness` (`image_utils.rs`)
- [x] Three real bugs fixed getting backdrop text-reversal correct: hardcoded white-only flip
  unreadable on dark themes (new theme-aware `--color-text-reverse` token + `isLightTheme()`
  trigger); no-backdrop games still getting reversed (explicit guard); `--color-text-reverse`
  defaulting to `var(--color-base)` going invisible once a long description scrolled onto the
  flat page background sharing that same color (dedicated hardcoded value per theme instead,
  across every built-in Catppuccin flavor and third-party theme - Brick Block, Midnight Neon,
  Sakura, bumped in `concourse-plugin-registry` too)
- [x] Reworked backdrop text-reversal from one static whole-page decision into a live,
  scroll-following one: `.reverse-band`'s `background-clip: text` + `background-attachment:
  fixed` gradient flips color only while a line of text is actually passing behind the
  viewport-anchored sticky backdrop, reverting to normal `--color-text` once scrolled past -
  `.hero`'s height and the reversal band are both viewport-ratio-based (2/3 and 1/2) rather
  than fixed px, so the effect scales with window size. `useImageBrightness` gained a
  module-level cache (keyed by URL, dedupes in-flight requests) since the Rust check
  re-downloads/re-decodes the full image every call otherwise, plus an `isReady` flag so
  text stays hidden rather than flashing the pre-flip color while a check is in flight. The
  sticky-pinned back button uses a flat (non-scroll-following) swap of the same token instead,
  since it doesn't scroll independently of the backdrop the way the description does
- [x] Added a cross-fade `<Transition>` between `GameDetail` and the grid/list browse view in
  `App.vue` (clicking a card's Edit button, or leaving detail) instead of an instant swap
- [x] `.game-detail`'s max-width widened 720px -> 1200px (standard wide-content width; 720px
  cramped the two-column layout on a maximized window)
- [x] Edit form pass: Platform + Executable path share a row; Platform is no longer a free-text
  field - shows the game's actual source-plugin brand icon instead (new `iconForPlatform()`
  match-style lookup: `simple-icons` glyphs for Steam/GOG/Epic, generic `IconDeviceGamepad2`
  fallback for manually-added/unrecognized platforms; Epic's icon forced to strict black/white
  per its own no-recolor trademark guideline, checked against all three platforms' brand
  guidelines before use). Executable path and Release date made read-only pending future
  file-picker/calendar dialogs. Title/Platform/Executable path labels dropped for placeholder
  text; Title restyled to match the view page's `<h1>` with a dashed-underline edit cue
- [x] Description now renders as sanitized Markdown (`marked` + `DOMPurify.sanitize` - this
  text can come from metadata provider plugins, not just the user, so it's untrusted input) on
  the view page; the edit textarea still holds the raw Markdown source
- [x] `PluginSettings.vue` shows "Built-in" instead of a fake `v1.0.0` for build-time TS plugins
  (absent/`"ts"` runtime) - their version never actually changes, unlike installed WASM/data ones
- [x] Fixed a real bug: `GameListRow.vue`'s title/details text and both list/card rows'
  `.fetch-overlay` used `--color-on-accent` (tracks `--color-base`, dark for dark themes) as
  text color over a hardcoded black scrim - unreadable dark-on-dark on Catppuccin Frappe/
  Macchiato/Mocha and Midnight Neon. `.fetch-overlay` fixed to a hardcoded white; `.info` (and
  `StatsPanel.vue`'s identical stat-row bug, found the same way) instead given a proper new
  design token, `--color-scrim-text`, rather than another hardcoded literal
- [x] Reworked that same fix again after further review: `.scrim`'s hardcoded black gradient
  replaced with a `color-mix()` tint toward a new `--color-tint` token (defaults to
  `--color-crust`, the darkest/most-saturated of the base/mantle/crust trio), letting `.info`/
  `.stat-row-title`/`.stat-row-subtitle` go back to plain `--color-text` instead of the
  `--color-scrim-text` token - the theme's own text/base contrast pair holds again since the
  scrim now darkens *relative to the theme*, not a fixed literal. Brick Block's own crust
  (`#0058f8`, same as its accent) measured ~3:1 contrast against its `--color-text` (fails
  normal-text AA) - overrides `--color-tint` to `--color-mantle` instead (same value/reasoning
  its balloon tooltip already uses via `--balloon-background`)
- [x] Tags/Collections rows (`TagsPanel.vue`/`CollectionsPanel.vue`'s `.item-row`) given the
  same `--color-tint` gradient background (layered over `--cover-placeholder-background` so a
  theme's dedicated placeholder pattern, e.g. Brick Block's stripes, shows through here too) for
  visual consistency with GameListRow/StatsPanel's cover-art rows
- [x] `.list-row-shell`/`.stat-row`'s border/radius switched from `--button-border-width`/
  `--radius-lg` to `--card-border-width`/`--card-radius` (`GameCard.vue`'s existing opt-in card-
  frame hooks) - these rows are cards-as-rows, so they pick up a theme's card frame (e.g. Brick
  Block's chunkier square-cornered look) instead of the button frame
- [x] `src/components/desktop/`'s 10 loose `.vue` files sorted into three new subfolders
  (`game/`, `shell/`, `common/`), same convention as the existing `modalForms/`/`tabs/` split -
  no behavior change, import paths updated everywhere
- [x] Added a `@/` → `src/` path alias (`vite.config.ts`'s `resolve.alias` + `tsconfig.json`'s
  `paths`) and rewrote every `../`-style import across the codebase (42 files, 119 specifiers)
  to use it - avoids `../../../` chains getting longer every time components move into a
  subfolder
- [x] Grouped imports per file (external packages, blank line, then internal) across 40 files
- [x] Added a barrel `index.ts` to `stores/` and every `components/desktop/` subfolder (plus
  `components/bigpicture/`), re-exporting everything in that folder - `App.vue`'s ~24 individual
  store/component import lines collapsed to one import per directory (8 total)
- [x] `src-tauri/` cleanup: ran `cargo fmt` (7 of 9 files had drifted from canonical style),
  a stray UTF-8 BOM in `wasm_plugin_runtime.rs` (stripped by the same `cargo fmt` run), and
  removed the dead `greet` scaffold command from `lib.rs` (leftover from `create-tauri-app`,
  never called by the frontend)
- [x] `GameDetail.vue`'s cover thumbnail shows a skeleton shimmer (same look as `SkeletonCard.vue`/
  `SkeletonRow.vue`) while `fetchingMetadata` is in flight - `cover_art_url` is one of the fields
  a metadata fetch can overwrite
- [x] Replaced `.info`'s invisible-text hack (`color: transparent`, no visual feedback at all)
  during `textPending` (backdrop loaded, brightness not yet resolved) with real skeleton bars
  standing in for the title/meta/description, sized to roughly match so there's minimal reflow
  once the real content replaces them

Note: Milestone 3 (Big Picture) is sequenced before the plugin system to validate the
controller UX early. Milestone 4's loader only discovers plugins bundled into the app at
build time (`src/plugins/*`); Milestone 8 added true runtime-downloadable plugin support as
a distinct, larger feature.

---

# Post-1.0 Roadmap

Second wave of milestones, opened after 1.0.0 shipped. Numbering continues the same
sequence/heading convention as above for devlog cross-reference.

## Milestone 15 — Additional Source Plugins: Emulator/ROM Scanner
Carried over from Milestone 7 unstarted.
- [ ] Research emulator/ROM directory conventions worth supporting first
- [ ] Scan configured ROM directories, map entries into core `GameEntry` format
- [ ] Launch mechanism (emulator + ROM path)
- [ ] Dedup against manually-added / other source-plugin entries

## Milestone 16 — Additional Source Plugins: Xbox/EA/Ubisoft (stretch)
Originally a core-roadmap stretch goal, moved here unstarted - no reason to hold up 1.0 for a
stretch goal nothing had been done on yet.
- [ ] Xbox — research install detection and launch mechanism
- [ ] EA app — research install detection and launch mechanism
- [ ] Ubisoft Connect — research install detection and launch mechanism
- [ ] Each ships as its own WASM plugin in a separate repo from day one

## Milestone 17 — External Theme Plugins: JSON-AST Rendering Tier
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

`concourse-plugin-registry` extended to `kind: "theme"`
(`brick-block-data-theme` as first entry, hash-pinned and enforced same as WASM plugins - a gap
caught and fixed here, not shipped silently unenforced). Post-ship fidelity pass (from real use,
not just the acceptance test) fixed two real bugs (`cardVisual` silently dropped by the Rust
struct; several card/placeholder values still had no variable hooks), added
`--card-border-width`/`--card-radius`/`--cover-placeholder-*`/`--balloon-background` hooks, and
added a new `fontFaces` capability (real `@font-face` loading, strictly validated,
commit-pinned-URL only) since `cssVariables` can only select a font, never load one.

## Milestone 18 — Shared Styles Convention
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

## Milestone 19 — Retire Component-Swap Theming
Milestone 17's JSON-AST/token mechanism was built to replace `slots`/component-swap theming;
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

## Milestone 20 — Auto-Update: App + Plugins/Themes
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

Milestone 20 fully closed - app self-update verified end to end; plugin/theme self-update
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

## Milestone 21 — Internationalization & Offline Translation
- [x] UI string localization via `vue-i18n`, 10 locales, language picker in Settings, exact key
  parity verified across all locale JSON files
- [x] `translation` host-native Rust module (`src-tauri/src/translation.rs`) - downloads
  llama.cpp's own prebuilt server binary, runs it as a subprocess, talks to it over HTTP (not a
  Rust ML crate dependency)
- [x] 4 selectable model tiers, all Q4_K_M and under ~3.1GB RAM: `qwen2.5-1.5b` (cheapest),
  `qwen3-4b` (recommended), `gemma4-e2b` (general-purpose), `qwen3-4b-abliterated` (opt-in,
  uncensored, for NSFW game descriptions) - see devlog for the full model-research history and
  rejected candidates, including `translategemma-4b`'s removal (real, empirically-confirmed
  llama.cpp bug, not a quantizer defect) and `gemma4-e2b`'s addition (works fine once `--jinja`
  was removed entirely - confirmed via direct testing, not just documentation)
- [x] Settings UI: engine + per-tier model download rows in `AppSettings.vue`, live progress,
  download-on-first-use, Remove buttons to delete a downloaded engine/model
- [x] `GameDetail.vue`: "Translate" button opens a 9-item dropdown (translate title/content/both,
  toggle each field's translated/original view independently or together, revoke a cached
  translation per field or both) - title and content translate, display, and revert fully
  independently. Button reads "Translating..." mid-request; title/description each show their
  own skeleton only while that specific field is being translated
- [x] Translated title (when a valid cached translation exists for the current locale) now
  shows in place of the original on `GameCard`'s hover balloon, `GameListRow`, and both
  `StatsPanel` game lists - shared via a `displayTitle(game, locale)` helper (`src/db/types.ts`)
  rather than duplicated per component
- [x] Translated title/description persisted to the DB (new `translated_title`/
  `translated_description`/`translated_locale` columns, migration v4) alongside the originals,
  not overwriting them - a locale mismatch or an edited original invalidates the cached
  translation automatically
- [x] App-exit hook and 5-minute idle-timeout both auto-kill the `llama-server.exe` subprocess
- [x] `enable_thinking: false` sent on every translation request - Qwen3's default "thinking"
  reasoning block was adding real unnecessary latency for a task this simple
- [x] `max_tokens: 1024` cap - no limit existed at all, a real risk of unbounded generation
- [x] `translategemma-4b` removed entirely after real testing (not just guessing): confirmed
  via direct download-and-run against both `mradermacher`'s and `bullerwins`' GGUF conversions
  that `llama-server.exe` crashes at model-load time when `--jinja` tries to parse its chat
  template - a genuine, currently-open llama.cpp bug in this specific template, not fixable from
  this app's side. `qwen3-4b` promoted to recommended default. See devlog for the full
  investigation and test log
- [x] Engine research: `llama-cpp-2` (Windows CMake bugs) → `mistralrs` (compiled clean but
  can't load `gemma3` GGUF, caught by real user testing) → llama.cpp prebuilt binary - see
  devlog for the full alternatives comparison

Milestone 21 fully closed. See devlog for full rationale on every decision above. Deliberately
deferred: translating other fields (release date, tags), canceling an in-progress download,
detecting already-installed Ollama/LM Studio.

## Milestone 22 — Plugin-Developer Documentation Site
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
