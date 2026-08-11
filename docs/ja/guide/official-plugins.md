# 公式プラグイン

これらはそれぞれ実在する独立したリポジトリであり、メインのConcourseリポジトリにベンダリングされているわけでは
ありません - ホストアプリ自身のリポジトリ内にソースがあるプラグインは、プラグインシステム本来の目的である
「任意のサードパーティコードをインストールする」というモデルを真に体現しないためです。

| プラグイン | 種類 | リポジトリ | 最新リリース |
| --- | --- | --- | --- |
| Steam | source | [steam-source-wasm-plugin](https://github.com/smh0505/steam-source-wasm-plugin) | [Download](https://github.com/smh0505/steam-source-wasm-plugin/releases/latest) |
| GOG | source | [gog-source-wasm-plugin](https://github.com/smh0505/gog-source-wasm-plugin) | [Download](https://github.com/smh0505/gog-source-wasm-plugin/releases/latest) |
| Epic Games | source | [epic-source-wasm-plugin](https://github.com/smh0505/epic-source-wasm-plugin) | [Download](https://github.com/smh0505/epic-source-wasm-plugin/releases/latest) |
| Xbox | source | [xbox-source-wasm-plugin](https://github.com/smh0505/xbox-source-wasm-plugin) | [Download](https://github.com/smh0505/xbox-source-wasm-plugin/releases/latest) |
| EA app | source | [ea-source-wasm-plugin](https://github.com/smh0505/ea-source-wasm-plugin) | [Download](https://github.com/smh0505/ea-source-wasm-plugin/releases/latest) |
| Ubisoft Connect | source | [ubisoft-source-wasm-plugin](https://github.com/smh0505/ubisoft-source-wasm-plugin) | [Download](https://github.com/smh0505/ubisoft-source-wasm-plugin/releases/latest) |
| SteamGridDB | metadata | [sgdb-metadata-wasm-plugin](https://github.com/smh0505/sgdb-metadata-wasm-plugin) | [Download](https://github.com/smh0505/sgdb-metadata-wasm-plugin/releases/latest) |
| IGDB | metadata | [igdb-metadata-wasm-plugin](https://github.com/smh0505/igdb-metadata-wasm-plugin) | [Download](https://github.com/smh0505/igdb-metadata-wasm-plugin/releases/latest) |
| RAWG | metadata | [rawg-metadata-wasm-plugin](https://github.com/smh0505/rawg-metadata-wasm-plugin) | [Download](https://github.com/smh0505/rawg-metadata-wasm-plugin/releases/latest) |
| TheGamesDB | metadata | [thegamesdb-metadata-wasm-plugin](https://github.com/smh0505/thegamesdb-metadata-wasm-plugin) | [Download](https://github.com/smh0505/thegamesdb-metadata-wasm-plugin/releases/latest) |
| VNDB | metadata | [vndb-metadata-wasm-plugin](https://github.com/smh0505/vndb-metadata-wasm-plugin) | [Download](https://github.com/smh0505/vndb-metadata-wasm-plugin/releases/latest) |
| Locale Remulator | wrapper | [locale-remulator-wasm-plugin](https://github.com/smh0505/locale-remulator-wasm-plugin) | [Download](https://github.com/smh0505/locale-remulator-wasm-plugin/releases/latest) |
| Locale Emulator | wrapper | [locale-emulator-wasm-plugin](https://github.com/smh0505/locale-emulator-wasm-plugin) | [Download](https://github.com/smh0505/locale-emulator-wasm-plugin/releases/latest) |
| Themes | theme | [data-theme-plugins](https://github.com/smh0505/data-theme-plugins) | [Download](https://github.com/smh0505/data-theme-plugins/releases/latest) |

ソース/ラッパー/メタデータプラグインは、それぞれのリリースの`plugin.json`のURLをSettings →
該当するタブ → Add Pluginに直接貼り付けることでインストールできます。テーマも同様にテーマ自身の
マニフェストURLからインストールできます - キュレーションされたレジストリを含む一般的なインストールの
流れについては[プラグインとテーマ](./plugins-and-themes)を参照してください。ローカルビルドやURLフローを
使わない手動コピーによるインストール方法については、各リポジトリ自身のREADMEを参照してください。
