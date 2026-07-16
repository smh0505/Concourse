# Project Proposal: Game Library Client

## Overview
A desktop app that aggregates games into one unified library with a console-like "Big Picture" mode, similar to Playnite/Steam. Core app ships lean; source integrations (Steam, Epic, GOG, etc.) are plugins added on top.

## Core Features (Base App)

### 1. Library Core
- Manual "add game" for any executable/emulator ROM
- Central SQLite-backed library (title, path, metadata, tags)
- Plugin API for source scanners to register games into this core library

### 2. Metadata & Media
- Auto-fetch cover art, screenshots, descriptions from IGDB / SteamGridDB / RAWG APIs
- Genre, platform, release date, playtime tags
- Manual metadata editing/override

### 3. Launching & Playtime Tracking
- Unified "Play" button, launches via plugin-provided or direct executable path
- Track session time, last played, total hours
- Process-exit detection to end sessions

### 4. Organization
- Custom collections/tags (e.g. "Co-op", "Backlog", "Completed")
- Filtering, sorting, search

### 5. Desktop UI
- Grid and list views
- Theming/skins

### 6. Big Picture Mode
- Full-screen, controller-first UI — large tiles, minimal text, console-menu feel
- Gamepad navigation (D-pad/analog stick → menu focus, face buttons → select/back)
- Auto-launch into Big Picture on boot (optional toggle), like a Steam Deck / console home screen
- Background game art / trailer preview on focus (stretch)
- Quick-access overlay (recently played, friends/status if applicable — later)

## Plugin System (moved from core)

### Source Import Plugins (optional, install separately)
- Steam plugin: reads `libraryfolders.vdf` + appmanifest files
- Epic, GOG, Xbox, EA, Ubisoft plugins: similar local-manifest or API-based detection
- Emulator/ROM scanner plugin
- Plugin API surface: `scan() -> [GameEntry]`, `launch(entry)`, `getInstallStatus(entry)`

### Other Plugin Candidates
- Metadata provider plugins (swap IGDB for another source)
- Theme/skin packs
- Controller mapping profiles

## Technical Considerations
- **Platform**: Desktop-first (Windows primary)
- **Stack options**: Electron/Tauri + React (flexible UI, easier Big Picture theming), or C#/.NET (WPF/Avalonia) for tighter Windows + controller API integration
- **Data storage**: Local SQLite for library metadata, cached images on disk
- **Controller input**: SDL2/XInput (Windows) or a library like `node-gamepad`/`SDL` bindings depending on stack
- **Plugin architecture**: Each plugin is a separate module/package implementing a defined interface, loaded at runtime (manifest + entry point)

## Suggested MVP Scope
1. Core library: manual add, SQLite storage, grid view with cover art (SteamGridDB)
2. Launch + playtime tracking
3. Big Picture mode: full-screen grid, gamepad nav, launch from controller
4. Steam plugin as first source integration (proves the plugin API)
5. Basic tagging/search

Big Picture mode is scoped early in the MVP since it's a core differentiator — worth validating the controller UX before building out more plugins.
