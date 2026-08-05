# Official Plugins

Each of these is a real, separate repo - not vendored into the main Concourse repo - since a
plugin whose source lives inside the host app's own repo doesn't genuinely exercise the
"install arbitrary third-party code" model the plugin system is for.

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
manifest URL - see [Plugins & Themes](./plugins-and-themes) for the general install flow
(including the curated registry). See each repo's own README for manual-copy install paths if
you'd rather build locally or skip the URL flow.
