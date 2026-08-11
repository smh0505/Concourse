# Official Plugins

아래 각 항목은 실제로 별도로 존재하는 저장소이며, 메인 Concourse 저장소에 함께 포함(vendored)되어
있지 않습니다 - 호스트 앱 자체 저장소 안에 소스가 있는 플러그인은 플러그인 시스템이 지향하는
"임의의 서드파티 코드 설치" 모델을 제대로 검증하지 못하기 때문입니다.

| 플러그인 | 종류 | 저장소 | 최신 릴리스 |
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

소스/래퍼/메타데이터 플러그인은 릴리스의 `plugin.json` URL을 Settings → 해당 탭 → Add Plugin에
직접 붙여넣어 설치합니다. 테마도 테마 자체 매니페스트 URL로 동일한 방식으로 설치합니다 - 큐레이션된
레지스트리를 포함한 일반적인 설치 흐름은 [Plugins & Themes](./plugins-and-themes)를 참고하세요.
로컬 빌드나 URL 흐름을 건너뛰고 싶다면 각 저장소의 README에서 수동 복사 설치 경로를 확인하세요.
