# Plugins oficiales

Cada uno de estos es un repositorio real y separado - no está incluido dentro del repositorio
principal de Concourse - ya que un plugin cuyo código fuente vive dentro del propio repositorio
de la aplicación anfitriona no ejerce genuinamente el modelo de "instalar código arbitrario de
terceros" para el que existe el sistema de plugins.

| Plugin | Tipo | Repositorio | Última versión |
| --- | --- | --- | --- |
| Steam | source | [steam-source-wasm-plugin](https://github.com/smh0505/steam-source-wasm-plugin) | [Descargar](https://github.com/smh0505/steam-source-wasm-plugin/releases/latest) |
| GOG | source | [gog-source-wasm-plugin](https://github.com/smh0505/gog-source-wasm-plugin) | [Descargar](https://github.com/smh0505/gog-source-wasm-plugin/releases/latest) |
| Epic Games | source | [epic-source-wasm-plugin](https://github.com/smh0505/epic-source-wasm-plugin) | [Descargar](https://github.com/smh0505/epic-source-wasm-plugin/releases/latest) |
| SteamGridDB | metadata | [sgdb-metadata-wasm-plugin](https://github.com/smh0505/sgdb-metadata-wasm-plugin) | [Descargar](https://github.com/smh0505/sgdb-metadata-wasm-plugin/releases/latest) |
| IGDB | metadata | [igdb-metadata-wasm-plugin](https://github.com/smh0505/igdb-metadata-wasm-plugin) | [Descargar](https://github.com/smh0505/igdb-metadata-wasm-plugin/releases/latest) |
| RAWG | metadata | [rawg-metadata-wasm-plugin](https://github.com/smh0505/rawg-metadata-wasm-plugin) | [Descargar](https://github.com/smh0505/rawg-metadata-wasm-plugin/releases/latest) |
| TheGamesDB | metadata | [thegamesdb-metadata-wasm-plugin](https://github.com/smh0505/thegamesdb-metadata-wasm-plugin) | [Descargar](https://github.com/smh0505/thegamesdb-metadata-wasm-plugin/releases/latest) |
| VNDB | metadata | [vndb-metadata-wasm-plugin](https://github.com/smh0505/vndb-metadata-wasm-plugin) | [Descargar](https://github.com/smh0505/vndb-metadata-wasm-plugin/releases/latest) |
| Locale Remulator | wrapper | [locale-remulator-wasm-plugin](https://github.com/smh0505/locale-remulator-wasm-plugin) | [Descargar](https://github.com/smh0505/locale-remulator-wasm-plugin/releases/latest) |
| Locale Emulator | wrapper | [locale-emulator-wasm-plugin](https://github.com/smh0505/locale-emulator-wasm-plugin) | [Descargar](https://github.com/smh0505/locale-emulator-wasm-plugin/releases/latest) |
| Themes | theme | [data-theme-plugins](https://github.com/smh0505/data-theme-plugins) | [Descargar](https://github.com/smh0505/data-theme-plugins/releases/latest) |

Los plugins de source/wrapper/metadata se instalan pegando la URL del `plugin.json` de su
versión directamente en Settings → la pestaña correspondiente → Add Plugin; los temas se
instalan de la misma manera desde la propia URL de manifiesto de un tema - consulta
[Plugins y temas](./plugins-and-themes) para el flujo general de instalación (incluido el
registro seleccionado). Consulta el propio README de cada repositorio para las rutas de
instalación manual por copia si prefieres compilar en local o saltarte el flujo de URL.
