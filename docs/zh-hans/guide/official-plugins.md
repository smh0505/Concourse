# 官方插件

以下每一个都是真实的独立仓库 —— 并未内嵌于 Concourse 主仓库中,因为如果一个插件的源码就存在于
宿主应用自己的仓库内,就无法真正体现插件系统所追求的"安装任意第三方代码"模型。

| 插件 | 类型 | 仓库 | 最新发布 |
| --- | --- | --- | --- |
| Steam | source | [steam-source-wasm-plugin](https://github.com/smh0505/steam-source-wasm-plugin) | [下载](https://github.com/smh0505/steam-source-wasm-plugin/releases/latest) |
| GOG | source | [gog-source-wasm-plugin](https://github.com/smh0505/gog-source-wasm-plugin) | [下载](https://github.com/smh0505/gog-source-wasm-plugin/releases/latest) |
| Epic Games | source | [epic-source-wasm-plugin](https://github.com/smh0505/epic-source-wasm-plugin) | [下载](https://github.com/smh0505/epic-source-wasm-plugin/releases/latest) |
| Xbox | source | [xbox-source-wasm-plugin](https://github.com/smh0505/xbox-source-wasm-plugin) | [下载](https://github.com/smh0505/xbox-source-wasm-plugin/releases/latest) |
| EA app | source | [ea-source-wasm-plugin](https://github.com/smh0505/ea-source-wasm-plugin) | [下载](https://github.com/smh0505/ea-source-wasm-plugin/releases/latest) |
| Ubisoft Connect | source | [ubisoft-source-wasm-plugin](https://github.com/smh0505/ubisoft-source-wasm-plugin) | [下载](https://github.com/smh0505/ubisoft-source-wasm-plugin/releases/latest) |
| SteamGridDB | metadata | [sgdb-metadata-wasm-plugin](https://github.com/smh0505/sgdb-metadata-wasm-plugin) | [下载](https://github.com/smh0505/sgdb-metadata-wasm-plugin/releases/latest) |
| IGDB | metadata | [igdb-metadata-wasm-plugin](https://github.com/smh0505/igdb-metadata-wasm-plugin) | [下载](https://github.com/smh0505/igdb-metadata-wasm-plugin/releases/latest) |
| RAWG | metadata | [rawg-metadata-wasm-plugin](https://github.com/smh0505/rawg-metadata-wasm-plugin) | [下载](https://github.com/smh0505/rawg-metadata-wasm-plugin/releases/latest) |
| TheGamesDB | metadata | [thegamesdb-metadata-wasm-plugin](https://github.com/smh0505/thegamesdb-metadata-wasm-plugin) | [下载](https://github.com/smh0505/thegamesdb-metadata-wasm-plugin/releases/latest) |
| VNDB | metadata | [vndb-metadata-wasm-plugin](https://github.com/smh0505/vndb-metadata-wasm-plugin) | [下载](https://github.com/smh0505/vndb-metadata-wasm-plugin/releases/latest) |
| Locale Remulator | wrapper | [locale-remulator-wasm-plugin](https://github.com/smh0505/locale-remulator-wasm-plugin) | [下载](https://github.com/smh0505/locale-remulator-wasm-plugin/releases/latest) |
| Locale Emulator | wrapper | [locale-emulator-wasm-plugin](https://github.com/smh0505/locale-emulator-wasm-plugin) | [下载](https://github.com/smh0505/locale-emulator-wasm-plugin/releases/latest) |
| Themes | theme | [data-theme-plugins](https://github.com/smh0505/data-theme-plugins) | [下载](https://github.com/smh0505/data-theme-plugins/releases/latest) |

来源/包装器/元数据插件的安装方式是,将其发布版本中的 `plugin.json` URL 直接粘贴到
Settings(设置) → 对应标签页 → Add Plugin(添加插件)中;主题的安装方式相同,使用主题自身的
manifest URL —— 一般安装流程(包括精选注册表)见[插件与主题](./plugins-and-themes)。如果你想
本地构建或跳过 URL 流程,可参阅各仓库自己的 README 以了解手动复制安装的方法。
