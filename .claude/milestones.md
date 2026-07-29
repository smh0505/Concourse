# Milestones

Tracks *what's done*. For implementation rationale, decisions, and fixes behind each item,
see `.claude/devlog.md`.

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
- [ ] Additional source plugins
  - [x] Epic Games
  - [x] GOG
  - [ ] Emulator/ROM scanner
- [x] Big Picture scroll fixes (hidden scrollbar, desktop scroll lock)
- [x] Auto-launch into Big Picture on boot (toggle)
- [x] Per-game compatibility wrappers (Locale Remulator + Locale Emulator)
  - [x] Global path settings for both wrappers
  - [x] `games.locale_profile_guid` + `games.locale_wrapper` (migrations v5/v6)
  - [x] Launch commands for both wrappers
  - [x] Playtime fallback via folder tracking
  - [x] End-to-end verification (both wrappers)
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

## Milestone 8.5 — Further WASM Adoption (stretch)
- [x] Migrate GOG and/or Epic to WASM plugins
  - [x] GOG — done (`gog-source-wasm-plugin`); built-in `gog.rs`/`src/plugins/gog/` fully retired (launch moved into the plugin's own `launch()` too, no host-side GOG code left)
  - [x] Epic — done (`epic-source-wasm-plugin`); built-in `epic.rs`/`src/plugins/epic/` fully retired, verified against a real installed game
- [x] Rename `steam-wasm` → `steam` cleanly — settled on the display-name-only version:
  every plugin's `id` stays as-is (avoids desyncing anyone's persisted `enabled_plugins`),
  just the `name` field drops the vestigial "(WASM)" suffix now that no built-in coexists
  with any WASM plugin anymore (across all 7 repos, not just Steam)
- [x] External theme plugins
  - [x] Data-only tier (`cssVariables` only, install-by-URL, no code/WASM)
  - [x] Review component-override tier (`slots`) for external feasibility —
    **reviewed, blocked, no path forward right now.** WASM export is structurally impossible
    (can't cross a live Vue component across the Component Model boundary); the only technical
    alternative (raw remote JS via `defineAsyncComponent`) is a bigger security regression than
    the already-documented Milestone 13 gap, not a smaller one - full JS-realm access instead
    of a scoped `host::` surface. Not pursued until/unless Milestone 13/14 land first.
- [x] Migrate SteamGridDB and IGDB metadata providers to WASM plugins
  - [x] New `metadata-plugin-world` WIT world + `http-request` host primitive (custom
    headers/method/body, needed for both providers' auth) + manifest-declared `settingsSchema`
    (generic settings-form UI for WASM plugins needing user-supplied config, e.g. an API key)
  - [x] `sgdb-metadata-wasm-plugin`, `igdb-metadata-wasm-plugin` — both verified for real
    against live API keys, fetching real cover art / metadata
  - [x] Built-in `sgdb.rs`/`igdb.rs`/`src/plugins/igdb/` fully retired once verified; GameCard's
    dedicated cover-art button folded into the unified "Fetch Metadata" flow along the way

(Locale Remulator/Locale Emulator's WASM migration moved into Milestone 10.)

## Milestone 9 — Desktop UI Polish (ongoing)
This milestone doesn't close — UI polish is open-ended. See devlog for full detail on each
item below; new ideas get appended under Backlog rather than opening a new milestone.
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

### Backlog
Ad-hoc polish items land here as they come up, checked off in place rather than moved
elsewhere.
- [x] API-key/settings forms moved into modals (was inline under each plugin row); GameCard's
  cover-art fetch folded into the unified "Fetch Metadata" button; all modal-form components
  consolidated under `src/components/desktop/modalForms/`, `BaseModal.vue` absorbed the
  separate title/layout wrapper

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
Follows the M8.5 SGDB/IGDB precedent — ships as a standalone WASM plugin repo, not built-in.
- [x] `rawg-metadata-wasm-plugin` repo — fetch description/genres/release date from the RAWG API,
  `metadata-plugin-world` + `http-request` + `settingsSchema` for the API key
- [x] Verify for real against a live API key, fetching real metadata
- [x] Verify merge behavior against IGDB (first-non-null-wins)

## Milestone 12 — Additional Source Plugins: Xbox/EA/Ubisoft (stretch)
- [ ] Xbox — research install detection and launch mechanism
- [ ] EA app — research install detection and launch mechanism
- [ ] Ubisoft Connect — research install detection and launch mechanism
- [ ] Each ships as its own WASM plugin in a separate repo from day one

## Milestone 13 — WASM Plugin Capability Sandboxing (security)
Install-by-URL for WASM source plugins (Milestone 8) currently grants a plugin the same
real-world system access as running an arbitrary downloaded `.exe` — see devlog for the gap.
- [x] Interim: honest risk warning in the install confirmation UI and README (no real
  sandboxing yet)
- [x] Path allowlisting for file/registry host primitives (scope `read-file`/`write-file`/
  `remove-dir`/`list-dir`/`path-exists`/registry reads to a plugin-declared directory
  allowlist instead of arbitrary absolute paths)
- [x] Permission gating for `spawn-process`/`run-and-wait` (visible, explicit user grant of
  "this plugin can run other programs" before install, not silent)
- [x] URL allowlisting or rate-limiting for `http-request`/`http-get`/`download-bytes` (the
  new `http-request` primitive - arbitrary method/headers/body, added for metadata providers
  like SGDB/IGDB - meaningfully widens exfiltration potential over plain GET: a plugin can now
  POST stolen data to an attacker's server, not just leak it via a GET URL's query string)

Milestone 13 fully closed - all four items done.

## Milestone 14 — Plugin Trust Model: Signing & Review (stretch)
Even with Milestone 13 done, install-by-URL stays trust-based, not verified - anyone can paste
any URL. This is a further, larger tier beyond capability sandboxing, not a prerequisite for it.
- [x] Code signing for published plugin releases (sign `.wasm` + manifest; verify against a
  known publisher key before install) - implemented as advisory (shown to the user, not yet a
  hard install-time gate); proves provenance/integrity, explicitly not author trustworthiness
  (see devlog)
- [x] Curated/reviewed plugin registry (a moderated list of known-good plugin URLs) as an
  alternative to freeform paste-any-URL - new `concourse-plugin-registry` repo, hand-pinned
  `{id, manifestUrl, wasmSha256}` entries, install-time hash check is a hard reject (unlike
  signing's advisory check)
- [x] Revocation mechanism (blocklist a previously-trusted plugin id/version if later found
  malicious) - pulling an entry from the registry repo *is* revocation, no separate mechanism;
  install-time only for now, doesn't retroactively flag already-installed plugins (see devlog)

Milestone 14 fully closed - all three bullets done.

Idea: a separate whitelist repo/wiki listing `{plugin id, version, manifest URL, expected
sha256}` entries, reviewed and pinned by hand, could cover the registry + revocation bullets
in one lightweight piece (checking a download against a *pinned* hash you chose, not the
hash the plugin's own release self-reports). Doesn't cover the signing bullet - GitHub's
per-asset SHA256 proves integrity (bytes weren't corrupted/tampered in transit), not
authenticity (it comes from the same channel as the artifact, so a compromised
account/repo produces an equally legitimate-looking hash for a malicious release too).

Update: the signing bullet turns out to be cheap too. GitHub Artifact Attestations
(`actions/attest-build-provenance`) is free for public repos - all plugin repos are public -
and uses Sigstore's public-good instance to bind a short-lived signing cert to the GitHub
Actions OIDC identity (repo + workflow + commit), with the signature recorded in Rekor, a
public transparency log independent of the repo/account itself. Verification is one command
(`gh attestation verify <file> --repo <owner>/<repo>`). Unlike the whitelist-repo idea, this
answers "did this really come from that repo's CI," not just "does this match a hash someone
pinned" - real authenticity, not a integrity-only proxy for it. Wired in - see devlog for the
full reasoning and implementation notes.

Note: Milestone 3 (Big Picture) is sequenced before the plugin system to validate the
controller UX early. Milestone 4's loader only discovers plugins bundled into the app at
build time (`src/plugins/*`); Milestone 8 added true runtime-downloadable plugin support as
a distinct, larger feature.
