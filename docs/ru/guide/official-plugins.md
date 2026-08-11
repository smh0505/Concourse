# Официальные плагины

Каждый из них - это реальный, отдельный репозиторий, а не встроенный в основной репозиторий
Concourse, поскольку плагин, исходный код которого находится внутри репозитория самого
хост-приложения, не по-настоящему проверяет модель "установить произвольный сторонний код", для
которой и существует система плагинов.

| Плагин | Вид | Репозиторий | Последний релиз |
| --- | --- | --- | --- |
| Steam | source | [steam-source-wasm-plugin](https://github.com/smh0505/steam-source-wasm-plugin) | [Скачать](https://github.com/smh0505/steam-source-wasm-plugin/releases/latest) |
| GOG | source | [gog-source-wasm-plugin](https://github.com/smh0505/gog-source-wasm-plugin) | [Скачать](https://github.com/smh0505/gog-source-wasm-plugin/releases/latest) |
| Epic Games | source | [epic-source-wasm-plugin](https://github.com/smh0505/epic-source-wasm-plugin) | [Скачать](https://github.com/smh0505/epic-source-wasm-plugin/releases/latest) |
| SteamGridDB | metadata | [sgdb-metadata-wasm-plugin](https://github.com/smh0505/sgdb-metadata-wasm-plugin) | [Скачать](https://github.com/smh0505/sgdb-metadata-wasm-plugin/releases/latest) |
| IGDB | metadata | [igdb-metadata-wasm-plugin](https://github.com/smh0505/igdb-metadata-wasm-plugin) | [Скачать](https://github.com/smh0505/igdb-metadata-wasm-plugin/releases/latest) |
| RAWG | metadata | [rawg-metadata-wasm-plugin](https://github.com/smh0505/rawg-metadata-wasm-plugin) | [Скачать](https://github.com/smh0505/rawg-metadata-wasm-plugin/releases/latest) |
| TheGamesDB | metadata | [thegamesdb-metadata-wasm-plugin](https://github.com/smh0505/thegamesdb-metadata-wasm-plugin) | [Скачать](https://github.com/smh0505/thegamesdb-metadata-wasm-plugin/releases/latest) |
| VNDB | metadata | [vndb-metadata-wasm-plugin](https://github.com/smh0505/vndb-metadata-wasm-plugin) | [Скачать](https://github.com/smh0505/vndb-metadata-wasm-plugin/releases/latest) |
| Locale Remulator | wrapper | [locale-remulator-wasm-plugin](https://github.com/smh0505/locale-remulator-wasm-plugin) | [Скачать](https://github.com/smh0505/locale-remulator-wasm-plugin/releases/latest) |
| Locale Emulator | wrapper | [locale-emulator-wasm-plugin](https://github.com/smh0505/locale-emulator-wasm-plugin) | [Скачать](https://github.com/smh0505/locale-emulator-wasm-plugin/releases/latest) |
| Themes | theme | [data-theme-plugins](https://github.com/smh0505/data-theme-plugins) | [Скачать](https://github.com/smh0505/data-theme-plugins/releases/latest) |

Плагины source/wrapper/metadata устанавливаются вставкой URL их релизного `plugin.json`
напрямую в Settings → соответствующую вкладку → Add Plugin; темы устанавливаются так же, из URL
собственного манифеста темы - см. [Плагины и темы](./plugins-and-themes) для общего процесса
установки (включая проверенный реестр). Смотрите README каждого репозитория для путей ручной
установки копированием, если вы предпочитаете сборку локально или хотите обойтись без URL.
