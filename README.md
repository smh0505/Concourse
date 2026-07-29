# Concourse

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
- `theme` - component-slot overrides (e.g. swap `GameCard`) plus CSS variables (single
  active); a `cssVariables`-only theme needs no code at all
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

Each of these is a real, separate repo - not vendored into this one - since a plugin whose
source lives inside the host app's own repo doesn't genuinely exercise the "install arbitrary
third-party code" model the plugin system is for.

| Plugin | Kind | Repo | Latest release |
| --- | --- | --- | --- |
| Steam | source | [steam-source-wasm-plugin](https://github.com/smh0505/steam-source-wasm-plugin) | [Download](https://github.com/smh0505/steam-source-wasm-plugin/releases/latest) |
| GOG | source | [gog-source-wasm-plugin](https://github.com/smh0505/gog-source-wasm-plugin) | [Download](https://github.com/smh0505/gog-source-wasm-plugin/releases/latest) |
| Epic Games | source | [epic-source-wasm-plugin](https://github.com/smh0505/epic-source-wasm-plugin) | [Download](https://github.com/smh0505/epic-source-wasm-plugin/releases/latest) |
| SteamGridDB | metadata | [sgdb-metadata-wasm-plugin](https://github.com/smh0505/sgdb-metadata-wasm-plugin) | [Download](https://github.com/smh0505/sgdb-metadata-wasm-plugin/releases/latest) |
| IGDB | metadata | [igdb-metadata-wasm-plugin](https://github.com/smh0505/igdb-metadata-wasm-plugin) | [Download](https://github.com/smh0505/igdb-metadata-wasm-plugin/releases/latest) |
| Locale Remulator | wrapper | [locale-remulator-wasm-plugin](https://github.com/smh0505/locale-remulator-wasm-plugin) | [Download](https://github.com/smh0505/locale-remulator-wasm-plugin/releases/latest) |
| Locale Emulator | wrapper | [locale-emulator-wasm-plugin](https://github.com/smh0505/locale-emulator-wasm-plugin) | [Download](https://github.com/smh0505/locale-emulator-wasm-plugin/releases/latest) |
| Themes (data-only) | theme | [data-theme-plugins](https://github.com/smh0505/data-theme-plugins) | [Download](https://github.com/smh0505/data-theme-plugins/releases/latest) |

Source/wrapper/metadata plugins install by pasting their release's `plugin.json` URL directly
into Settings → the matching tab → Add Plugin; themes install the same way from a theme's own
manifest URL. See each repo's own README for manual-copy install paths if you'd rather build
locally or skip the URL flow.

**Security note (partially addressed, tracked as Milestone 13):** wasmtime's Component Model
sandbox guarantees memory safety (a plugin can't corrupt host memory or escape its own
execution), but most of the host functions exposed to plugins (`read-file`/`write-file`/
`remove-dir`/registry access/network) are still unscoped - a plugin can call them with any
path/URL it wants. `spawn-process`/`run-and-wait` are the one exception now gated behind an
explicit, visible per-plugin grant: a plugin must declare `capabilities: ["run-programs"]` in
its manifest, and the app refuses to run anything on its behalf until you've actually granted
it (a checkbox in the install-confirmation dialog for install-by-URL, or a "Permission needed"
row with a Grant button in Settings for an already-installed plugin). In practice, installing a
WASM plugin from an untrusted URL still carries meaningful real-world risk (file/registry/
network access is unrestricted) - only install plugins from sources you fully trust. Path
allowlisting for file/registry access is planned but not yet implemented.

## Status

Actively developed, milestone by milestone. See [`.claude/proposal.md`](.claude/proposal.md)
for the original design proposal, [`.claude/milestones.md`](.claude/milestones.md) for
up-to-date progress tracking against it, and [`.claude/devlog.md`](.claude/devlog.md) for the
implementation history/rationale behind each milestone item.

As of now: core library, metadata/playtime tracking, Big Picture mode, the plugin system
(including the WebAssembly runtime-plugin pipeline and managed install for the compatibility
wrappers), and a desktop UI polish pass are all done. All official plugins listed above are
live. Open work includes an emulator/ROM scanner plugin, WASM plugin capability sandboxing
(Milestone 13), and a plugin trust/signing model (Milestone 14).

## License

MIT - see [`LICENSE`](LICENSE).
