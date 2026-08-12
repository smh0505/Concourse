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

## Searching, filtering & sorting

The search bar accepts plain title text plus three special tokens, all combinable in one query:
`platform:steam`, `tag:coop`, `collection:"final fantasy"` (quote a value that contains spaces).
Typing `platform:steam zelda` searches titles for "zelda" within Steam games only.

Below the search bar, clickable pills mirror the same platforms/tags/collections - clicking one
adds or removes its token from the search box, so the search bar and the pills always agree with
each other. Multiple pills of the same kind combine with either **OR** (any selected value
matches - the default) or **AND** (must match every selected value); toggle which one a
category uses from the "browse all filters" pill (the row is capped, and that pill opens a modal
listing everything uncapped, grouped by platform/tags/collections). A game added manually
without a source plugin's platform shows up under a `manual` platform pill.

A separate sort dropdown next to the view-mode toggle offers Title (A-Z), Recently Played, Most
Played, and Recently Added - your choice persists across restarts, same as grid/list view mode.

## Batch operations

Click the checkbox-style toggle next to the sort dropdown to enter selection mode: every
card/row becomes a single click-to-select target, with a small checkbox badge showing what's
currently selected. A "N selected" bar appears with Select All (respects whatever filter/search
is currently active) and Clear buttons, plus batch actions: add a tag, add to a collection, or
remove the whole selection from your library. Exit selection mode with the X button to return to
normal browsing.

## Deduplication across sources

If the same game is both manually added and later found by a source plugin scan (or found by
two different source plugins), Concourse merges them into one entry rather than showing
duplicates - matched by title. When more than one source found the same title, the plugin
that's later in your Source tab's priority order wins for the launch path/platform (reorder
plugins there if you want a different one to take priority).

If you genuinely want two same-titled entries to stay separate (e.g. two different versions of
the same game), a game's edit form has a "Keep separate from plugin scans" checkbox
(`skip_dedup`) - check it to exclude that specific entry from the merge logic.

## Offline translation

A game's title and description can be translated into your current UI language entirely
offline - no external translation service, nothing leaves your machine. From a game's detail
page, the "Translate" button opens a menu with three groups (scroll or use the arrow keys to
move between them):

- **Translate** - translate the title only, the description only, or both. Re-running this with
  a different selected model overwrites the previous translation for that field.
- **Show** - toggle between the translated and original text, per field or both together. This
  choice is remembered per game, so reopening a game later shows whichever you last picked for
  it specifically.
- **Remove** - clears a cached translation for a field (or both), reverting to the original with
  nothing left cached.

**One-time setup** (Settings): download the translation engine once (a small, one-time
download), then pick a model from the dropdown and download it too. A few model tiers are
offered, trading size/RAM against quality - all run entirely on CPU, so a smaller tier translates
faster and uses less memory while a game is running alongside it. One tier is uncensored,
intended for translating NSFW games' own descriptions without a safety-tuned model refusing to
translate legitimate third-party text.

A cached translation is tied to the UI language it was made for - switching your UI language, or
editing a game's original title/description, invalidates it automatically (translate again to
get a fresh one for the new language or edited text).

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
