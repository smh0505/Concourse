# Plugin Ufficiali

Ciascuno di questi è un repo reale e separato - non vendorizzato nel repo principale di
Concourse, dato che un plugin il cui sorgente vive dentro il repo stesso dell'app host non
esercita realmente il modello "installa codice arbitrario di terze parti" per cui esiste il
sistema di plugin.

| Plugin | Tipo | Repo | Ultima release |
| --- | --- | --- | --- |
| Steam | source | [steam-source-wasm-plugin](https://github.com/smh0505/steam-source-wasm-plugin) | [Download](https://github.com/smh0505/steam-source-wasm-plugin/releases/latest) |
| GOG | source | [gog-source-wasm-plugin](https://github.com/smh0505/gog-source-wasm-plugin) | [Download](https://github.com/smh0505/gog-source-wasm-plugin/releases/latest) |
| Epic Games | source | [epic-source-wasm-plugin](https://github.com/smh0505/epic-source-wasm-plugin) | [Download](https://github.com/smh0505/epic-source-wasm-plugin/releases/latest) |
| SteamGridDB | metadata | [sgdb-metadata-wasm-plugin](https://github.com/smh0505/sgdb-metadata-wasm-plugin) | [Download](https://github.com/smh0505/sgdb-metadata-wasm-plugin/releases/latest) |
| IGDB | metadata | [igdb-metadata-wasm-plugin](https://github.com/smh0505/igdb-metadata-wasm-plugin) | [Download](https://github.com/smh0505/igdb-metadata-wasm-plugin/releases/latest) |
| RAWG | metadata | [rawg-metadata-wasm-plugin](https://github.com/smh0505/rawg-metadata-wasm-plugin) | [Download](https://github.com/smh0505/rawg-metadata-wasm-plugin/releases/latest) |
| TheGamesDB | metadata | [thegamesdb-metadata-wasm-plugin](https://github.com/smh0505/thegamesdb-metadata-wasm-plugin) | [Download](https://github.com/smh0505/thegamesdb-metadata-wasm-plugin/releases/latest) |
| VNDB | metadata | [vndb-metadata-wasm-plugin](https://github.com/smh0505/vndb-metadata-wasm-plugin) | [Download](https://github.com/smh0505/vndb-metadata-wasm-plugin/releases/latest) |
| Locale Remulator | wrapper | [locale-remulator-wasm-plugin](https://github.com/smh0505/locale-remulator-wasm-plugin) | [Download](https://github.com/smh0505/locale-remulator-wasm-plugin/releases/latest) |
| Locale Emulator | wrapper | [locale-emulator-wasm-plugin](https://github.com/smh0505/locale-emulator-wasm-plugin) | [Download](https://github.com/smh0505/locale-emulator-wasm-plugin/releases/latest) |
| Themes | theme | [data-theme-plugins](https://github.com/smh0505/data-theme-plugins) | [Download](https://github.com/smh0505/data-theme-plugins/releases/latest) |

I plugin source/wrapper/metadata si installano incollando l'URL del `plugin.json` della loro
release direttamente in Settings → la scheda corrispondente → Add Plugin; i temi si installano
allo stesso modo dall'URL del manifest di un tema - vedi [Plugin e Temi](./plugins-and-themes)
per il flusso di installazione generale (incluso il registro curato). Consulta il README di
ciascun repo per i percorsi di installazione con copia manuale se preferisci compilare in locale
o saltare il flusso via URL.
