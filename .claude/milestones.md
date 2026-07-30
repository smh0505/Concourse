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
- [x] Migrate the identified shared patterns (Category 1 findings above) - done as the two
  entries below (desktop duplicates, then Big Picture's cluster)
- [x] Resolve the off-token radius values - `3px` tag pills snapped onto `--radius-sm` (1px
  nudge, negligible); `8px` genuinely new (`--radius-panel`), since it sat exactly between
  `--radius-md`/`--radius-lg` with no better-fitting existing step. A third, previously-unaudited
  `8px` site (`BaseModal.vue`'s `.modal-frame`) turned up while migrating - fixed too, and the
  new token renamed from an initial `--radius-row` to `--radius-panel` once it became clear a
  modal frame isn't a "row." Verified via compiled-CSS grep: token present, zero literal
  `8px`/`3px` radii left anywhere in `src/`
- [x] `--radius-panel` folded into the named scale proper: shifted the old `--radius-lg`
  (10px) to `--radius-xl`, renamed `--radius-panel` (8px) to `--radius-lg` - a real scale
  change (sm/md/lg → sm/md/lg/xl), touching `BigPictureTile.vue`/`BigPictureSlideshow.vue`'s
  existing `--radius-lg` consumers too. Also fixed a real pre-existing bug while touching those
  two lines: their fallback literal (`var(--radius-lg, 12px)`) never matched the real token's
  actual value (10px) - now `var(--radius-xl, 10px)`, correctly in sync
- [x] Moved `App.vue`'s entire unscoped `<style>` block (primitive-element resets: `*`,
  `html`/`body`/`#app`, `button`/`input`/`textarea`/`select` baselines, scrollbars) into
  `styles.css` too - none of it was App.vue-specific, only its own `<style scoped>` block
  (`.app-window`, `.view-toggle-button`, etc.) stayed. Verified via compiled output: no
  duplicated rules, scoped rules still carry their `data-v-*` attribute correctly
- [x] Migrated 4 of the audit's Category 1 duplicate blocks into shared `styles.css` classes:
  `.shimmer` (skeleton loading effect + `@keyframes`), `.list-row-shell`/`.list-row-thumb`
  (row shell + thumbnail dimensions), `.tag-pill`, `.empty-state`. Each component keeps only
  its genuinely extra properties locally, layered via a second class on the same element.
  CSS bundle shrank 22.65kB → 21.85kB. Big Picture's backdrop cluster and the remaining
  Category 2 (unused-token) findings stay open, not part of this pass
- [x] Migrated Big Picture's whole backdrop cluster (the audit's biggest single finding) into
  7 shared `styles.css` classes: `.bp-surface`, `.bp-backdrop`, the `backdrop-fade-*`
  transition classes, `.bp-backdrop-overlay-base`, `.bp-cover-frame`, `.bp-cover-focused`,
  `.bp-cover-placeholder`, `.bp-empty-state` - spanning `BigPictureGrid.vue`/
  `BigPictureSlideshow.vue`/`BigPictureTile.vue`. Also fixed three more mismatched fallback
  literals found directly on the lines being touched (`--color-accent, #fff`,
  `--shadow-lg`'s alpha, `--radius-md, 10px`) - none matched their tokens' real values;
  dropped the fallbacks entirely rather than correcting them, since these are base tokens
  always defined in `:root`, not opt-in ones. CSS bundle shrank again, 21.85kB → 20.92kB
- [x] Migrated the remaining Category 2 unused-token findings across ~20 sites: hardcoded
  `1px` borders → `--button-border-width`, `0.5rem`/`0.75rem` gaps → `--space-2`/`--space-3`,
  `4px` radius → `--radius-sm`, `1.5rem` padding → `--space-5` (plus one `2rem` companion value
  → `--space-6`), `color: white` → `--color-on-accent`. Found two more sites the original audit
  had missed while doing the exhaustive final check (`GameListRow.vue`'s `.meta`,
  `NavSidebar.vue`'s `border-right`/`border-top`, which used longhand properties the audit's
  `border: 1px solid` search pattern didn't match). Deliberately excluded `brick-block-theme`'s
  own files - its hardcoded values are the built-in theme's own deliberate visual choices, not
  shared-component bugs, same as its intentionally-thicker button borders elsewhere. Verified
  via exhaustive `grep -rn` across all of `src/` before and after, plus compiled-CSS spot
  checks confirming `var()` references replaced every targeted literal

Milestone 18 fully closed - audit, `:root`/primitive-styles relocation, all identified
duplicate-pattern migrations, the radius-scale decisions, and the unused-token cleanup are
all done.

Post-close follow-up: user noticed several migrated components still carried a now-fully-empty
local class alongside the new shared one (e.g. `class="row list-row-shell"`, where `.row` had
zero properties left - fully covered by `.list-row-shell`). Since scoped styles aren't reused
across components, a local class with no rule targeting it is pure vestige. Removed 6 such
cases: `.row`/`.skeleton-row`/`.backdrop` (×2) class names and their now-pointless
comment-only rules, plus `focused`/`centered` state-toggle classes on the base
`BigPictureTile.vue`/`BigPictureSlideshow.vue` (nothing targeted them standalone anymore, only
`.bp-cover-focused` did - confirmed via `grep`, not assumed, including checking JS didn't
reference them via `classList`/`querySelector`). Re-verified every other shared-class site
individually first - most still have real local content and correctly keep both classes.
`brick-block-theme`'s own `.focused` usage is unrelated (a different, separate component's own
scoped rule) and untouched.

Post-close follow-up 2: user proposed going further - some "unique" classes recurring across
components could become real primitive-element styles instead of a shared class, since HTML
already has a semantically-correct tag for some of them. Found `.hint` (5 sites across
`CandidatePicker.vue`/`ConfirmInstall.vue`/`EditGame.vue`/`PluginSettings.vue`, mixed `<p>`/
`<span>`, near-identical secondary/muted-text styling) as the real match - converted every site
to `<small>`, styled globally in `styles.css` with no class needed anywhere. Standardized on
`font-size: 0.8rem; opacity: 0.7` (a real fork - two files used `0.75rem`/`0.8` instead - user's
call). Verified `<small>`'s inline-vs-`<p>`'s-block difference wouldn't visually break anything
before converting: flex-column containers (`BaseModal.vue`'s `.modal-body`, `EditGame.vue`'s
`label`) blockify children regardless of their own display, safe as-is; `PluginSettings.vue`'s
`.tab-panel` isn't flex, so those two sites got an explicit local `display: block` override.
`.error` (byte-identical in 2 files) found as a related but different finding - a plain shared-
class candidate, not a primitive-element match (no HTML tag fits "error message") - left open,
not bundled into this pass.

Post-close follow-up 3: migrated `.error` too, as a plain shared class (`.error-text`,
`AddGame.vue`/`EditGame.vue`) - byte-identical, no design decision needed. Verified via
compiled CSS: shared class present, zero leftover local `.error` rules.

Post-close follow-up 4: user requested a button-styling consistency pass across components.
Delegated audit surfaced two real inconsistency *bugs* (not just duplication) - fixed both,
per user's choice to prioritize bugs first:
- `.view-toggle-button`: `App.vue` and `GameFilters.vue` shared the exact class name but only
  `GameFilters.vue` had the square icon-button treatment (fixed width, zero padding); `App.vue`'s
  was a wider, padded button that just happened to share a name. Promoted the correct
  (`GameFilters.vue`) version to `styles.css`, removed both local scoped rules.
- Icon-action row: `GameCard.vue`'s `.footer` (play/fetch-metadata/edit/remove) and
  `GameListRow.vue`'s `.actions` render the identical 4-button set with the same handlers, but
  only `GameCard.vue` had the tighter icon-button sizing - `GameListRow.vue`'s was left at
  default button padding. Added `.icon-action-row button` to `styles.css`, applied as a second
  class on both containers.
Verified via compiled-CSS grep: both shared rules present exactly once, zero leftover scoped
rules for either. `cargo check` run as formality (no Rust touched). Remaining audit findings
(one exact duplicate needing no decision, a small-button font-size fork needing a design call,
TitleBar's chromeless buttons, a repeated `.active` accent-swap idiom) deliberately left open,
pending further direction.

Migrated the clean exact duplicate next: `AddPlugin.vue`'s `.registry-list button`
(install-from-registry) and `PluginSettings.vue`'s `.permission-needed button` (grant-permission
prompt, 2 sites) were byte-identical (`font-size: 0.75rem; padding: 0.2rem 0.6rem`) - no design
decision needed. New `.compact-button` in `styles.css`, applied directly to each button element
(not via a container descendant selector, since these aren't uniform button rows like
`.icon-action-row`). Verified via compiled CSS: shared class present exactly once, zero leftover
`.registry-list button`/`.permission-needed button` rules. `bun run build`/`cargo check` both
clean.

Resolved the small-button font-size fork - user's call: collapse to one tier, `0.75rem`. Actual
work was smaller than it looked once inspected: `.reorder-buttons button`/`.uninstall-theme`
were already `0.75rem`, only `EditGame.vue`'s `.input-with-button button`/`.tag-remove` (both
`0.8rem`) needed changing. Also found `.scan-button`/`.add-plugin-button`'s explicit `0.85rem`
was pure redundancy (already the global `button` default) - removed both declarations;
`.add-plugin-button` then had zero properties left, so removed the now-vestigial class from its
template too, same as the earlier vestigial-class cleanup. Verified via compiled CSS:
`.input-with-button button`/`.tag-remove` both compile at `.75rem`, `.scan-button` keeps only
`margin-top`, zero `add-plugin-button` left anywhere. `bun run build`/`cargo check` both clean;
CSS bundle shrank slightly, 20.95kB → 20.88kB.
