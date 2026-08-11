# Plugins officiels

Chacun de ces éléments est un dépôt réel et séparé - non intégré dans le dépôt principal de
Concourse - puisqu'un plugin dont le code source vit dans le dépôt de l'application hôte elle-même
n'exerce pas véritablement le modèle « installer du code tiers arbitraire » pour lequel le système
de plugins existe.

| Plugin | Type | Dépôt | Dernière version |
| --- | --- | --- | --- |
| Steam | source | [steam-source-wasm-plugin](https://github.com/smh0505/steam-source-wasm-plugin) | [Télécharger](https://github.com/smh0505/steam-source-wasm-plugin/releases/latest) |
| GOG | source | [gog-source-wasm-plugin](https://github.com/smh0505/gog-source-wasm-plugin) | [Télécharger](https://github.com/smh0505/gog-source-wasm-plugin/releases/latest) |
| Epic Games | source | [epic-source-wasm-plugin](https://github.com/smh0505/epic-source-wasm-plugin) | [Télécharger](https://github.com/smh0505/epic-source-wasm-plugin/releases/latest) |
| SteamGridDB | metadata | [sgdb-metadata-wasm-plugin](https://github.com/smh0505/sgdb-metadata-wasm-plugin) | [Télécharger](https://github.com/smh0505/sgdb-metadata-wasm-plugin/releases/latest) |
| IGDB | metadata | [igdb-metadata-wasm-plugin](https://github.com/smh0505/igdb-metadata-wasm-plugin) | [Télécharger](https://github.com/smh0505/igdb-metadata-wasm-plugin/releases/latest) |
| RAWG | metadata | [rawg-metadata-wasm-plugin](https://github.com/smh0505/rawg-metadata-wasm-plugin) | [Télécharger](https://github.com/smh0505/rawg-metadata-wasm-plugin/releases/latest) |
| TheGamesDB | metadata | [thegamesdb-metadata-wasm-plugin](https://github.com/smh0505/thegamesdb-metadata-wasm-plugin) | [Télécharger](https://github.com/smh0505/thegamesdb-metadata-wasm-plugin/releases/latest) |
| VNDB | metadata | [vndb-metadata-wasm-plugin](https://github.com/smh0505/vndb-metadata-wasm-plugin) | [Télécharger](https://github.com/smh0505/vndb-metadata-wasm-plugin/releases/latest) |
| Locale Remulator | wrapper | [locale-remulator-wasm-plugin](https://github.com/smh0505/locale-remulator-wasm-plugin) | [Télécharger](https://github.com/smh0505/locale-remulator-wasm-plugin/releases/latest) |
| Locale Emulator | wrapper | [locale-emulator-wasm-plugin](https://github.com/smh0505/locale-emulator-wasm-plugin) | [Télécharger](https://github.com/smh0505/locale-emulator-wasm-plugin/releases/latest) |
| Thèmes | theme | [data-theme-plugins](https://github.com/smh0505/data-theme-plugins) | [Télécharger](https://github.com/smh0505/data-theme-plugins/releases/latest) |

Les plugins source/wrapper/metadata s'installent en collant l'URL du `plugin.json` de leur
release directement dans Settings → l'onglet correspondant → Add Plugin ; les thèmes s'installent
de la même façon depuis l'URL du manifeste propre au thème - voir
[Plugins & thèmes](./plugins-and-themes) pour le déroulement général de l'installation (y compris
le registre organisé). Consultez le README de chaque dépôt pour les chemins d'installation par
copie manuelle si vous préférez compiler en local ou vous passer du flux par URL.
