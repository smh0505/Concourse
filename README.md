# Concourse

[한국어](readme/README.ko.md) | [日本語](readme/README.ja.md) |
[简体中文](readme/README.zh-Hans.md) | [Español](readme/README.es.md) |
[Français](readme/README.fr.md) | [Deutsch](readme/README.de.md) |
[Português (Brasil)](readme/README.pt-BR.md) | [Русский](readme/README.ru.md) |
[Italiano](readme/README.it.md)

*Translations other than English are machine-translated (same disclosed approach as the app's
own UI locales - see [Localization](#features) below), not yet native-speaker reviewed.*

A desktop app that aggregates games from multiple sources (Steam, Epic, GOG, manual entries,
and more via plugins) into one unified library, with a console-like controller-first "Big
Picture" mode - similar in spirit to Playnite or Steam's own library.

The core app stays lean; almost everything beyond the base library (source scanners, themes,
metadata providers, controller mappings, compatibility wrappers) is a plugin.

## Features

- **Library core** - manual "add game," SQLite-backed storage, grid and list views, tagging,
  search/filtering
- **Metadata & media** - cover art via SteamGridDB, description/genre/release date via IGDB,
  manual override
- **Launching & playtime tracking** - unified launch regardless of source (direct exe, Steam
  `steam://` URIs, Epic/GOG protocol handlers, compatibility-wrapper-launched games), with
  process-exit or folder-based playtime tracking depending on how a game was launched
- **Big Picture mode** - full-screen, gamepad-navigable UI with a tile grid and a coverflow
  slideshow view, background art crossfade, auto-launch-on-boot toggle
- **Compatibility wrappers** - per-game Locale Remulator / Locale Emulator profiles for games
  that need a non-default locale to run
- **Plugin system** - five plugin kinds (source, theme, metadata provider, controller
  mapping, compatibility wrapper), loaded either at build time (bundled TypeScript plugins
  under `src/plugins/`) or at runtime (downloadable WebAssembly plugins - see below)
- **Localization** - UI available in 10 languages (English plus 9 machine-translated locales),
  a theme-settable `--font-family` for full-app re-skinning, and a data-only theme tier
  (`cssVariables` + an optional `cardVisual` JSON-AST override for the cover art region, no code
  required)
- **Offline translation** - a game's title/description can be translated into your current UI
  language entirely on-device (no external service): download llama.cpp's own prebuilt server
  binary once, pick a model (a few CPU-friendly tiers, one uncensored for NSFW game
  descriptions), then translate/view-toggle/revoke title and content independently from a
  game's detail page. Translations persist per game and per field, invalidated automatically by
  a locale switch or an edited original
- **Auto-update** - both the app itself and every installed plugin/theme check for and apply
  updates automatically

## Tech stack

- **Tauri 2** (Rust backend) + **Vue 3** (`<script setup>`, TypeScript) frontend
- **SQLite** via `tauri-plugin-sql`, schema evolved through versioned migrations
- **Pinia** for frontend state, one store per domain
- **wasmtime** (Wasm Component Model) for the runtime-downloadable plugin system

## Development

This repo uses [`bun`](https://bun.sh), not npm/yarn/pnpm.

```sh
bun install          # install JS dependencies
bun run dev           # Vite dev server only (frontend)
bunx tauri dev         # full app (frontend + Rust backend), hot-reloading
bunx tauri build        # production desktop binary
```

From `src-tauri/`: `cargo check` for a quick Rust compile check without a full build.

## Plugin architecture

Every plugin has a `plugin.json` manifest (`{ id, name, version, kind, entry }`) and
implements one of five interfaces depending on `kind`:

- `source` - `scan()` / `launch()` / `getInstallStatus()`, for game source integrations
  (multi-enable)
- `theme` - CSS variables (colors, fonts, borders/radii) plus an optional JSON-AST `cardVisual`
  override for the cover-art region (single active); a `cssVariables`-only manifest needs no
  code at all. Component-slot overrides (swapping in a whole custom Vue component) were
  supported early on but retired in favor of this closed-vocabulary AST tier - no eval/executable
  code path exists for a theme to inject
- `metadata` - `fetchMetadata(title)`, for cover art / description / genre providers
  (multi-enable)
- `controller` - a `GamepadMapping` (button/axis indices) for a specific physical controller
  layout (single active)
- `wrapper` - compatibility wrappers (e.g. Locale Remulator/Emulator) that manage their own
  install and launch a target executable through a locale profile

Build-time plugins live under `src/plugins/<id>/` and are discovered via Vite's
`import.meta.glob`. Runtime plugins are WebAssembly components (`source`/`wrapper`/`metadata`
kinds) installed from a manifest URL (Settings → the matching tab → Add Plugin) or downloaded/
extracted manually into the app's data directory, loaded via a `wasmtime` host embedded in the
Rust backend. Data-only themes (`cssVariables` only, no code) are a separate, code-free
install-by-URL tier needing no WASM sandboxing at all.

### Official plugins

See **[Official Plugins](https://smh0505.github.io/Concourse/guide/official-plugins)** in the
docs site for the full list (repo links, latest-release download links, install instructions).

**Security note (Milestone 12, closed):** wasmtime's Component Model sandbox guarantees memory
safety (a plugin can't corrupt host memory or escape its own execution), and every host
function exposed to plugins that could do real-world damage is now gated:
- `spawn-process`/`run-and-wait` need an explicit, visible per-plugin grant - a plugin must
  declare `capabilities: ["run-programs"]` in its manifest, and the app refuses to run anything
  on its behalf until you've actually granted it (a checkbox in the install-confirmation dialog
  for install-by-URL, or a "Permission needed" row with a Grant button in Settings for an
  already-installed plugin).
- `write-file`/`remove-dir` are hard-confined to a plugin's own directory, unconditionally, no
  exceptions. `read-file`/`list-dir`/`path-exists`/registry access are scoped to a manifest-
  declared allowlist (`pathScopes`) plus, for the one plugin whose install location genuinely
  can't be known ahead of time (Steam), a verified runtime scope request - the host checks for
  a real structural signature (a `steamapps` subdirectory) before granting access, and rejects
  any plugin id it doesn't have a validator for outright.
- `http-get`/`http-request`/`download-bytes` are scoped to a manifest-declared hostname
  allowlist (`httpScopes`) - a plugin can only ever reach the hosts it declares (exact match or
  subdomain), not an arbitrary attacker-controlled URL.

Only install plugins from sources you fully trust regardless - this closes "a plugin can
silently reach anywhere on your system or network," not a full app-store-grade trust model.

**Trust model (Milestone 13, closed):** two complementary, independent layers.
- **Signing** - every official plugin release is signed with a
  [Sigstore](https://www.sigstore.dev/) build-provenance attestation, binding the published
  `.wasm` to the exact commit and CI run that built it. Concourse checks this on install and
  shows the result - **advisory only, not a hard gate**. It confirms an artifact really came
  from that repo's own CI, unmodified since (catches tampering, a compromised release token, a
  hijacked repo slipping in a rogue build) - it does **not** vouch for the repo author's
  intentions. A malicious author's own code gets a perfectly valid signature too, since their
  own CI genuinely built and signed exactly what they committed.
- **Curated registry** - [`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry),
  a hand-maintained list of plugins whose pinned version has actually been read, each entry
  locked to a specific release and its real SHA256. The "Add Plugin" dialog lists these
  alongside the freeform URL field; installing from the registry is a **hard reject** on hash
  mismatch, unlike signing's advisory check - this hash was chosen by hand after review, so a
  mismatch is a real "this isn't what was reviewed" signal. Pulling an entry from the registry
  *is* revocation for future installs (not retroactive against already-installed copies yet).
  Freeform install-by-URL still works exactly as before either way - the registry is an
  additional, more-trusted path, not a required gate.

## Documentation

Full plugin-developer and user docs are published at
**[smh0505.github.io/Concourse](https://smh0505.github.io/Concourse/)** (source in
[`docs/`](docs/), built with VitePress) - a user guide (installing, library management, Big
Picture mode) and a plugin-developer reference (architecture overview, a getting-started
walkthrough, the full manifest/WIT interface reference, the security model, and how to publish
a plugin).

## Status

Actively developed, milestone by milestone. See [`.claude/proposal.md`](.claude/proposal.md)
for the original design proposal, [`.claude/milestones.md`](.claude/milestones.md) for
up-to-date progress tracking against it, and [`.claude/devlog.md`](.claude/devlog.md) for the
implementation history/rationale behind each milestone item.

As of now: core library, metadata/playtime tracking, Big Picture mode, the plugin system
(including the WebAssembly runtime-plugin pipeline and managed install for the compatibility
wrappers), WASM plugin capability sandboxing (Milestone 12), a plugin trust/signing model
(Milestone 13), an ongoing desktop UI polish pass (Milestone 14), the JSON-AST theme tier
replacing component-swap theming (Milestones 17/19), a shared-styles convention pass
(Milestone 18), app + plugin/theme auto-update (Milestone 20), 10-language localization plus
offline on-device translation of game titles/descriptions (Milestone 21), and this documentation
site (Milestone 22) are all done. All official plugins listed above are live. Open work includes
an emulator/ROM scanner plugin and additional source plugins (Xbox/EA/Ubisoft, Milestone 16).

## License

MIT - see [`LICENSE`](LICENSE).

### Third-party notices

Concourse's own source is MIT-licensed; nothing third-party is bundled into the repo or the
built binary. The offline translation feature (Milestone 21) downloads two kinds of third-party
content directly to your machine at runtime, under their own separate terms - covered here for
transparency, not because Concourse redistributes any of it:

- **[llama.cpp](https://github.com/ggml-org/llama.cpp)** (MIT) - the translation engine itself.
  Concourse downloads its official prebuilt Windows release binary from GitHub and runs it as a
  subprocess; no llama.cpp code is compiled into or shipped with Concourse.
- **Model weights**, downloaded from Hugging Face on your own selection in Settings, each under
  its own model card's license - `qwen2.5-1.5b`/`qwen3-4b`/`gemma4-e2b` are all Apache 2.0
  (Gemma 4 specifically moved to Apache 2.0 in April 2026, replacing the more restrictive
  license earlier Gemma generations shipped under). The two abliterated tiers
  (`qwen3-4b-abliterated`, `gemma4-e2b-abliterated`) inherit their base model's license; check
  each one's own Hugging Face model card before relying on it commercially.
