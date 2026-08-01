# Milestones

Tracks *what's done*. For implementation rationale, decisions, and fixes behind each item,
see `.claude/devlog.md`.

**1.0.0** marks Milestones 1–14 (the core roadmap) closed and the app considered stable for
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

(Milestone 12, Xbox/EA/Ubisoft source plugins, moved to Post-1.0 Roadmap, Milestone 16 — none
of its items were started, no reason to hold up 1.0 for a stretch goal untouched.)

## Milestone 13 — WASM Plugin Capability Sandboxing (security)
Install-by-URL for WASM source plugins granted the same real-world system access as running an
arbitrary downloaded `.exe` — see devlog for the gap.
- [x] Interim: honest risk warning in the install confirmation UI and README
- [x] Path allowlisting for file/registry host primitives
- [x] Permission gating for `spawn-process`/`run-and-wait`
- [x] URL allowlisting/rate-limiting for `http-request`/`http-get`/`download-bytes`

## Milestone 14 — Plugin Trust Model: Signing & Review (stretch)
Even with Milestone 13 done, install-by-URL stayed trust-based, not verified — see devlog.
- [x] Code signing for published plugin releases (Sigstore attestation, advisory not a hard
  install-time gate)
- [x] Curated/reviewed plugin registry (`concourse-plugin-registry`, hash-pinned, hard reject
  on mismatch)
- [x] Revocation mechanism (pulling a registry entry *is* revocation, install-time only)

See devlog for the registry's own version-bump automation (dispatch on release → re-hash → PR),
added afterward.

## Milestone 14.5 — UI Polish (Continuous, ongoing)
This milestone doesn't close — UI polish is open-ended. See devlog for detail on each item;
new items get appended in place rather than opening a new milestone. Numbered 14.5 (not 9)
since it sits alongside/after the closed core roadmap rather than blocking any milestone in
sequence.
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
- [x] Fixed keyboard/gamepad focus fighting the mouse cursor in Big Picture's grid (a tile's
  `mouseenter` firing when it moves under a stationary cursor, not just on real mouse movement)
- [x] Pinned `GameFilters.vue` to the top of the desktop library's scroll container
  (`position: sticky`) instead of letting it scroll away with the list - see devlog for the
  false start (a per-container-scrollbar approach, reverted) and the run of follow-on visual
  fixes (stacking/z-index vs. hovered cards and their balloon, horizontal overflow, filter-bar
  width/padding, and a real `useBalloonAnchor.ts` placement bug the pinned bar exposed)

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
Carried over from Milestone 12 unstarted, in full.
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

## Milestone 20 — Auto-Update: App + Plugins/Themes (in progress)
Two genuinely separate mechanisms, both checked at the same three moments (app start, app
focus, install-plugin modal open) via one orchestrating call. See devlog for the design
tradeoffs behind the split.

**App self-update** (Tauri's own official plugin, not custom):
- [x] Added `tauri-plugin-updater` + `tauri-plugin-process` (Rust crates, JS packages,
  `capabilities/default.json` permissions, registered in `lib.rs`)
- [x] Generated the signing keypair (user's own machine, private key never touched this
  session); public key + `endpoints` added to `tauri.conf.json`, CSP `connect-src` opened for
  `github.com`/`*.githubusercontent.com`
- [x] New `.github/workflows/release.yml` (none existed before) - builds/signs/publishes via
  `tauri-apps/tauri-action`, Windows-only per user's own call given the app's
  Windows-specific dependencies (registry access, WebView2, LR/LE wrappers)
- [x] Frontend: new `stores/appUpdate.ts` + `AppUpdateBanner.vue`, wired into all three trigger
  moments (`App.vue`'s `onMounted`/window focus listener, `AddPlugin.vue`'s `open`-prop watcher)
- [x] Verified end-to-end against a real published release (`v1.3.5`) - `latest.json` +
  signed `.exe`/`.sig` all present and correct. Took 3 failed test releases to get here; see
  devlog for the real root causes (`bundle.createUpdaterArtifacts` never set, and the repo's
  default Actions permission capping `contents: write` even with the workflow's own grant)
- [x] Added `Swatinem/rust-cache@v2` to `release.yml` - every run was a from-scratch ~15min
  Rust compile with no caching at all. Confirmed via `gh api .../actions/caches` why it never
  actually hits during this milestone's own testing: GitHub Actions scopes cache access per
  ref, with fallback only to the repo's default branch - each test release uses a brand-new
  tag, and one tag's cache is invisible to a different tag's run regardless of matching key.
  Not a misconfiguration; would work as intended on `main` or across commits on the same ref
- [x] Fixed a real bug caught by testing the actual GUI: `stores/appUpdate.ts` stored
  `@tauri-apps/plugin-updater`'s `Update` (a real class instance) in a plain `ref()`, which
  deep-reactivizes it into a Proxy that fails the class's private-field checks the moment
  `downloadAndInstall()` is called - same bug class as the earlier `slotRegistry.ts` fix this
  session. Fixed with `shallowRef`
- [x] Confirmed fixed by the user, testing for real: a locally-built `1.3.6` install (current,
  fixed source) updating to the published `v1.3.7` release completed successfully - download,
  install, and relaunch all worked, no `TypeError`. App self-update is fully working end to end

App self-update closed. Plugin/theme self-update (below) remains open.

**Plugin/theme self-update** (custom - no existing mechanism covers this):
- [ ] Persist each installed WASM plugin/data theme's install origin (`source_url` for
  direct-URL installs, `registry_id` for curated-registry installs) - not currently stored at
  all, the real gap blocking any update-checking
- [ ] Rust command: re-fetch a plugin/theme's manifest from its stored origin, compare
  version/hash against installed, report whether an update is available
- [ ] Frontend: "update available" indicator per plugin/theme row in `PluginSettings.vue`
- [ ] Apply-update path reuses the existing `install_wasm_plugin`/`install_data_theme`
  pipeline, re-triggered from the update-available state instead of a fresh user-typed
  URL/registry pick
- [ ] Wire checks into the same three trigger moments as the app self-update
