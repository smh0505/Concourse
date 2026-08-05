# Plugins & Themes

Settings has one tabbed panel covering every kind of plugin: **Source**, **Theme**, **Metadata
Provider**, **Controller**, and **Wrapper**. If you're building a plugin rather than installing
one, see the [Plugin Docs](/plugins/) instead - this page is the user-facing side. See
[Official Plugins](./official-plugins) for the current list of maintained plugins/themes.

## Installing a plugin

Click "Add Plugin" from any tab. You have two options:

- **Curated registry** - a reviewed, hash-verified list of known-good plugins. Pick one and
  click Install; Concourse verifies its content against a pinned hash before installing, so
  what you get is exactly what was reviewed.
- **Paste a manifest URL** - install anything else by pasting a direct link to its
  `plugin.json`. This works for any plugin, listed in the registry or not, but skips the hash
  verification the registry path gets - you're trusting whoever published that URL directly.
  Concourse still shows you what the plugin declares it needs (file/registry/network access,
  whether it can run other programs) before you confirm.

## Enabling/disabling and ordering

- **Source** and **Metadata Provider** plugins are independently multi-enabled (checkboxes) -
  run several source plugins and several metadata providers at once. Their order matters: for
  source plugins, it decides which one wins when the same game is found by more than one (see
  [dedup](./library#deduplication-across-sources)); for metadata providers, it decides which
  provider's answer wins per field (description, release date, cover/background art) when more
  than one has something to say. Reorder either list with the arrows next to each entry.
- **Theme** and **Controller** plugins are exclusive (radio) - you're always browsing one skin
  and using one physical controller mapping at a time.
- **Wrapper** plugins (compatibility layers, e.g. a locale emulator) are multi-enabled, each
  installable/manageable independently, and selectable per-game from that game's edit form.

## Updates

Concourse checks for plugin/theme updates automatically (app start, app window focus, and
whenever you open Settings or the Add Plugin dialog) and shows an "Update to vX.Y.Z" badge next
to anything with a newer version available. Click it to update in place.

## Uninstalling

Every installed (non-built-in) plugin/theme has a Remove/Uninstall action in its own row. Themes
and source/metadata/wrapper plugins that manage their own downloaded files (e.g. a wrapper's
installed runtime) clean those up too, not just the manifest entry.
