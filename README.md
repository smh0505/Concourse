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
- **Plugin system** - four plugin kinds (source, theme, metadata provider, controller
  mapping), loaded either at build time (bundled TypeScript plugins under `src/plugins/`) or
  at runtime (downloadable WebAssembly plugins - see below)

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
implements one of four interfaces depending on `kind`:

- `source` - `scan()` / `launch()` / `getInstallStatus()`, for game source integrations
  (multi-enable)
- `theme` - component-slot overrides (e.g. swap `GameCard`) plus CSS variables (single
  active)
- `metadata` - `fetchMetadata(title)`, for cover art / description / genre providers
  (multi-enable)
- `controller` - a `GamepadMapping` (button/axis indices) for a specific physical controller
  layout (single active)

Build-time plugins live under `src/plugins/<id>/` and are discovered via Vite's
`import.meta.glob`. Runtime plugins are WebAssembly components (`source` kind only, so far):
downloaded from a URL, extracted into the app's data directory, and loaded via a `wasmtime`
host embedded in the Rust backend, sandboxed from the rest of the app. `steam-source-wasm-plugin`
(a separate, local-only repo) is a real example - a from-scratch reimplementation of the
built-in Steam source plugin, verified against a real Steam install.

## Status

Actively developed, milestone by milestone. See [`.claude/proposal.md`](.claude/proposal.md)
for the original design proposal, [`.claude/milestones.md`](.claude/milestones.md) for
up-to-date progress tracking against it, and [`.claude/devlog.md`](.claude/devlog.md) for the
implementation history/rationale behind each milestone item.

As of now: core library, metadata/playtime tracking, Big Picture mode, the plugin system
(including the WebAssembly runtime-plugin pipeline), Steam/Epic/GOG source plugins, Locale
Remulator/Emulator compatibility wrappers, and a desktop UI polish pass are all done. Open
work includes an emulator/ROM scanner plugin, further WASM plugin migrations, and managed
install for the compatibility wrappers.

## License

MIT - see [`LICENSE`](LICENSE).
