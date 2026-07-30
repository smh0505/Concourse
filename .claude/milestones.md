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

Milestone 13 fully closed - all four items done.

## Milestone 14 — Plugin Trust Model: Signing & Review (stretch)
Even with Milestone 13 done, install-by-URL stayed trust-based, not verified — see devlog.
- [x] Code signing for published plugin releases (Sigstore attestation, advisory not a hard
  install-time gate)
- [x] Curated/reviewed plugin registry (`concourse-plugin-registry`, hash-pinned, hard reject
  on mismatch)
- [x] Revocation mechanism (pulling a registry entry *is* revocation, install-time only)

Milestone 14 fully closed - all three bullets done. See devlog for the registry's own
version-bump automation (dispatch on release → re-hash → PR), added after the milestone closed.

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

## Milestone 17 — External Theme Plugins: JSON-AST Rendering Tier (scoped, not built)
Supersedes the original Milestone 17 (see devlog, kept as legacy record — its conclusion still
stands: `slots`/raw-JS component-override for *external* theme plugins is blocked). This
milestone scopes a narrower, different mechanism instead — a constrained declarative template
tier — measured concretely against Brick Block (M5's own built-in proof of component-override
demand) rather than designed on a hypothetical. See devlog for the full measurement.
- [x] Measure how much of Brick Block a template tier would need to cover — color/typography
  already 100% `cssVariables`-portable; real gap was small (a static glyph swap, one wrapper
  element, missing CSS-variable hooks on the base components — the last unrelated to templating)
- [x] Evaluate whether the tier needs risky `{{ }}` interpolation — barely; Brick Block's
  surviving expressions are plain single-field `game` access, no method calls/helpers
- [x] Identify scope gap the original idea never covered — action-dispatch (footer buttons)
  exposure is undecided, left explicitly open rather than assumed solved

Scope going forward, not yet built:
- [x] Expand `GameCard.vue`/`BigPictureTile.vue`'s CSS-variable surface (`--button-border-width`
  app-wide, `--balloon-border-width`/`--balloon-radius`/`--balloon-font-family` on the balloon)
- [x] Decide the action-dispatch boundary — display/structure-only; action bar is always
  host-rendered at a fixed insertion point (restyleable, not restructurable), whitelisted scope
  never includes callables
- [x] Prototype the naive approach (`@vue/compiler-dom` + `new Function`, same JS realm) —
  **verified full sandbox escape, not a hypothetical.** `game.constructor.constructor(...)()`
  reaches `Function` and executes arbitrary code using only the "whitelisted" `game` object;
  separately, unresolved identifiers in `with(_ctx)` fall through to the real global scope
  (`window` reachable directly too). Naive same-realm compilation is fully equivalent to raw
  JS and is **not being built** — see devlog for both empirical tests
- [x] Investigate real isolation instead — a dedicated Web Worker. Verified structurally sound
  (no `window`/`invoke` access, CSP still gates the worker's own `fetch`), but superseded below
  before being built - see devlog
- [x] Pivoted away from Worker isolation to a JSON-AST / server-driven-UI tier instead, after
  weighing outside alternatives. A theme submits data (`{type, test, then, else, ...}`), a
  hand-written interpreter walks it choosing tags from a fixed allowlist and resolving
  `{field: ...}` via plain property lookup - no `eval`/`with`/`new Function` anywhere, so
  there's no code-execution primitive to escape from at all, unlike the Worker plan which
  still had to contain and validate real executed JS. Runs safely in the main realm - no
  iframe/Worker/postMessage-validation layer needed. Also a smaller build than the Worker
  protocol, and matches Brick Block's measured gap just as precisely
- [x] Design the AST vocabulary — 4 node types (`if`/`element`/`image`/`text`), closed
  `GameField` enum for `{field: ...}` refs, fixed `transform` enum (no method-call syntax at
  all), `image` hardcodes `src`/`alt` rather than a generic attrs bag, tag enum excludes every
  interactive element. Validated against both of Brick Block's measured gap items - sufficient
  and minimal. Needs depth/node-count caps at interpreter level (DoS guard, not a design gap)
- [x] Build the interpreter — `src/theme/cardVisualAst.ts` (`validateCardVisualAst`/
  `renderCardVisualAst`/`CardVisualRenderer`), `src/theme/cardVisualRegistry.ts` (validate-once
  at theme-activation, not per-render), `ThemePlugin.cardVisual` field, wired into
  `GameCard.vue`'s cover-visual region and `theme.ts`'s activate/deactivate lifecycle
- [x] Acceptance test: reproduce Brick Block's glyph + wrapper element on the new tier — both
  verified for real (not just typechecked): the if/image/else-text shape renders the correct
  branch for both cover-present and no-cover games, and wrapping that same subtree in one more
  `element` node reproduces the frame-wrapper case. Also verified the interpreter's safety
  properties directly: rejects an unknown field name, an unknown node type, depth overflow, and
  node-count overflow, all fail-closed rather than silently coerced
- [x] Addon, not a substitute for the above: sign the AST manifest file itself for provenance -
  `install_data_theme` now calls the same `verify_plugin_provenance`/`parse_github_owner_repo`
  used for WASM plugins, against the manifest's own bytes instead of a `.wasm` binary (that
  function was already fully generic, no changes needed there). Frontend needed no changes -
  `pluginInstall.ts`'s `verified`/`verificationNote` toast already applied to any plugin kind
  generically. Catches tampering-in-transit only, since the format has no code-execution
  primitive for signing to vouch for in the first place - complementary to the interpreter's
  own safety, not redundant with it

Milestone 17 fully closed - vocabulary, interpreter, acceptance test, and signing addon all
done. Registry `theme`-kind extension stays a deliberate, separate follow-up (see above).

Follow-up done: `concourse-plugin-registry` now covers `kind: "theme"` -
`brick-block-data-theme` added as the first entry, pinned via a commit-SHA'd raw URL rather
than a tagged release asset (`data-theme-plugins` reuses one release tag across every push,
which would make that asset's own URL equivalent to `releases/latest`). `install_data_theme`
now enforces the pinned hash as a hard reject, same as `install_wasm_plugin` - this was missing
even after the signing addon above, caught and fixed here rather than shipping a registry
extension that looked complete but didn't actually enforce anything for themes.

Post-ship fidelity pass, from actually using the converted Brick Block (Data) theme rather than
just the acceptance test - see devlog for full detail:
- Fixed two real bugs (`DataThemeManifest` silently dropped `cardVisual`; several
  `.card-visual`/`.cover-placeholder` values still had no variable hooks)
- Added `--card-border-width`/`--card-radius`/`--cover-placeholder-*`/`--balloon-background`
  hooks (same opt-in pattern as earlier), balloon arrow-tip now tracks `--balloon-background`
  automatically instead of risking drift
- New capability: `fontFaces` (real `@font-face` loading, since `cssVariables` can only select
  a font, never load one) - strictly validated, commit-pinned-URL only, CSP `font-src` opened
- Re-verified Fusion Pixel Font's license against live upstream before redistributing it again;
  added `FONTS.md` + a `fonts` attribution field

## Milestone 18 — Shared Styles Convention (scoped, not started)
Style-convention shift: less `<style scoped>` per component, more centralized shared CSS
(colors/borders/radii/other repeated patterns) collected into a `styles.css` - prompted directly
by this session's Brick Block work repeatedly hitting the same wall (a value hardcoded in one
component's own scoped block, invisible/unoverridable anywhere else, needing a one-off variable
hook added each time a real need surfaced). A dedicated milestone rather than ad hoc mid-session
- real scope (many existing components to audit), and a genuine convention change worth
measuring before executing, not assumed.
- [x] Audit existing `<style scoped>` blocks (22 components) for what's *actually*
  duplicated/hardcoded vs. genuinely component-specific - real findings, not vacuous: exact
  duplicate blocks (skeleton shimmer, list-row shell/thumbnail, tag pills, empty-state layout,
  most of Big Picture's dark-backdrop scheme across 3 files), tokens that exist but aren't used
  (hardcoded `1px`/`0.5rem`/`0.75rem`/`4px` matching `--button-border-width`/`--space-2`/
  `--space-3`/`--radius-sm` exactly), and two off-token values (`8px`, `3px` radii) needing a
  real design decision, not a mechanical move. No second live instance of this session's
  scoped-CSS/foreign-component bug found; one correct `:deep()` usage noted as the right
  pattern; one forward-looking risk flagged (a future Big Picture tile-visual AST would need
  the same unscoped treatment `GameCard.vue` already got). See devlog for the full report
- [x] Decide `styles.css`'s relationship to `App.vue`'s existing `:root` token block — absorb
  it entirely. Moved verbatim into new `src/styles.css`, imported once in `main.ts`; verified
  the compiled output still contains every token, byte-identical values, not just assumed
- [ ] Migrate the identified shared patterns (Category 1 findings above), verifying each move
  the same way this session's CSS fixes were verified (compiled-output check, not just visual
  assumption)
- [ ] Resolve the two off-token radius values (`8px` list-row shell, `3px` tag pills) - decide
  whether to standardize onto an existing token or add as a genuinely new shared value
