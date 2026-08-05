# Getting Started

Concourse is a desktop app that aggregates games from many sources into one library, with a
console-like full-screen "Big Picture" mode for controller-first navigation. This guide covers
using the app day to day. If you're building a plugin instead, see the
[Plugin Docs](/plugins/).

## Installing

Download the latest installer from the
[Releases page](https://github.com/smh0505/Concourse/releases/latest) (Windows only for now).
Concourse checks for and installs its own updates automatically once running - no need to
re-download manually after the first install.

## First run

On first launch, your library is empty. You can populate it two ways, and most people end up
using both:

1. **Add a game manually** - the "Add Game" button (sidebar) takes a title and an executable
   path, for anything a source plugin doesn't already cover (an emulator, an itch.io download,
   ...).
2. **Install a source plugin** - Settings → Source tab lets you install a plugin that scans an
   existing platform (Steam, GOG, Epic, ...) for games you already own, and keeps that list in
   sync on later scans. See [Library & Games](./library) for how scanning/dedup works, and
   [Plugins & Themes](./plugins-and-themes) for how to actually install one.

## Where things live

- **Library** (sidebar) - your grid/list of games, the default view.
- **Stats** - total games/hours, Most Played, Recently Played.
- **Tags** / **Collections** - two separate organizing concepts: tags are free-form labels
  ("Co-op", "Backlog"); collections group a series/franchise ("Final Fantasy"). Manage both
  from their own sidebar tabs, or assign them per-game from a game's detail page.
- **Settings** - everything plugin/theme/app-preference related, see
  [Plugins & Themes](./plugins-and-themes).
