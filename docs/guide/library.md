# Library & Games

## Adding games

**Manually**: the "Add Game" button takes a title and an executable path (or a launcher URI
like `steam://run/<appid>` - see [below](#uri-launches-vs-direct-executables)). Use this for
anything a source plugin doesn't already cover.

**Via a source plugin**: once you've installed and enabled a source plugin (Settings → Source),
Settings has a "Scan Now" button that finds every game that plugin knows about and adds them to
your library. Re-running a scan later picks up newly-installed games without duplicating ones
already in your library (see dedup below).

## Editing a game

Open any game's detail page (click its cover/title, or the Edit icon) and toggle into edit mode.
You can override the title, cover/background art URLs, description (Markdown supported),
release date, and platform. A "Fetch Metadata" button re-runs your enabled metadata providers
(Settings → Metadata Provider) against the current title and fills in whatever it finds -
useful if the automatic fetch missed something, or a provider's data changed since you first
added the game.

## Tags & Collections

- **Tags** are free-form labels ("Co-op", "Backlog", "Completed") - create/rename/delete from
  the Tags sidebar tab, assign per-game from that game's detail page.
- **Collections** group a series/franchise ("Final Fantasy") - a distinct concept from tags,
  managed the same way from their own sidebar tab.

Both support search/filtering the library view alongside plain title search.

## Deduplication across sources

If the same game is both manually added and later found by a source plugin scan (or found by
two different source plugins), Concourse merges them into one entry rather than showing
duplicates - matched by title. When more than one source found the same title, the plugin
that's later in your Source tab's priority order wins for the launch path/platform (reorder
plugins there if you want a different one to take priority).

If you genuinely want two same-titled entries to stay separate (e.g. two different versions of
the same game), a game's edit form has a "Keep separate from plugin scans" checkbox
(`skip_dedup`) - check it to exclude that specific entry from the merge logic.

## URI launches vs. direct executables

Some source plugins (Steam, Epic) launch a game via a platform URI (`steam://run/...`,
`com.epicgames.launcher://...`) rather than a direct `.exe` path, since that's how the platform
itself expects to be told to start a game. Playtime tracking works differently for these -
see [Playtime Tracking](#playtime-tracking) below.

## Playtime Tracking

For a direct executable path, Concourse waits on the actual process and logs a real session
(start/end/duration) once it exits. For a URI-launched game, there's no process handle to wait
on the same way, so a session isn't logged the same way - the "Recently Played"/total-hours
figures on the Stats tab reflect what's actually trackable per launch method.
