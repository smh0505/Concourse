# Plugin Architecture Overview

Concourse는 다섯 가지 종류로 이루어진 단일 플러그인 시스템을 통해 여러 소스의 게임을 하나의
라이브러리로 통합하고, 스스로를 다시 꾸밉니다. 모든 종류가 하나의 매니페스트 형식과 로더를
공유하며, 종류마다 다른 것은 플러그인이 구현하는 계약(contract)입니다.

## 다섯 가지 플러그인 종류

| 종류 | 역할 | 선택 방식 |
|---|---|---|
| `source` | 플랫폼(Steam, GOG, Epic 등)에서 설치된 게임을 스캔하고 실행 | 다중 활성화 |
| `theme` | 색상/폰트/카드 비주얼을 다시 꾸밈 | 배타적(한 번에 하나만 활성) |
| `metadata` | 외부 데이터베이스에서 게임의 설명/출시일/아트워크를 가져옴 | 다중 활성화 |
| `controller` | Big Picture 탐색을 위한 물리적 게임패드 버튼/축을 매핑 | 배타적 |
| `wrapper` | 자체 관리하는 호환성 레이어(예: 로케일 에뮬레이터)를 통해 게임을 실행 | 다중 활성화 |

소스 플러그인과 메타데이터 제공자 플러그인은 독립적으로 **다중 활성화**됩니다(Settings의
체크박스) - 여러 소스 플러그인과 여러 메타데이터 제공자를 동시에 실행하면서, 각각 다른 것이
채우지 못하는 게임/필드를 채울 수 있습니다. 테마와 컨트롤러 매핑 플러그인은 **배타적 단일
선택**(라디오)입니다 - 항상 하나의 스킨과 하나의 물리적 입력 방식만 사용합니다.

## 플러그인을 배포하는 두 가지 방법

1. **WASM 플러그인** — 런타임에 URL(또는 큐레이션된 레지스트리)을 통해 별도로 설치되는 `.wasm`
   컴포넌트로, 샌드박스화된 [wasmtime](https://wasmtime.dev/) Component Model 인스턴스에서
   실행됩니다. 오늘날 서드파티 `source`/`wrapper`/`metadata` 플러그인이 사용하는 경로입니다 -
   [Getting Started](./getting-started)와 [WIT Interface](./wit-interface) 레퍼런스를
   참고하세요.
2. **데이터 전용 테마 매니페스트** — `theme` 플러그인에 한해, 전체 WASM 플러그인 인프라가
   필요하지 않다면 매니페스트를 순수 JSON(`cssVariables`/`cardVisual`/`fontFaces`, 코드 없음)으로
   구성할 수 있습니다. [Theme Manifests](./theme-manifests)를 참고하세요.

WASM 플러그인은 지금까지 [WIT world](https://component-model.bytecodealliance.org/design/wit.html)가
정의된 세 종류(`source`, `wrapper`, `metadata`)에만 존재합니다. 오늘날 서드파티 `theme` 플러그인을
만든다는 것은 위의 데이터 전용 매니페스트 경로를 의미합니다. `controller` 매핑 플러그인에는
현재 서드파티 경로가 없습니다 - Concourse 내장 게임패드 매핑은 앱에 직접 컴파일되어 있으며, 새
매핑을 추가하려면 오늘날에는 별도 플러그인을 배포하는 대신 Concourse 자체에 기여해야 합니다.

## 왜 네이티브 코드나 스크립팅이 아니라 WASM인가

Concourse는 서드파티 플러그인을 위해 다운로드 가능한 네이티브 실행 파일과 스크립팅 언어를 한때
고려했습니다. 둘 다 같은 이유로 배제되었습니다: 플러그인이 자기 역할(Steam 설치를 스캔하거나
래퍼를 통해 게임을 실행하는 등)을 수행하려면 실제 파일시스템/레지스트리/네트워크/프로세스
접근이 필요한데, 두 방식 모두 *범위가 제한된(scoped)* 접근을 부여할 수 없습니다 - 네이티브
바이너리나 샌드박스화되지 않은 스크립트는 앱 전체와 동일한 권한을 갖게 됩니다. Component Model을
통한 WASM은 대신 진짜 capability 기반 샌드박싱을 제공합니다: 플러그인은 Concourse의 Rust
측이 구현하고 부여한 경우에만 `host` 인터페이스 함수를 얻으며, 그 경우에도 대부분의 함수는
플러그인별로 더 세밀하게 범위가 제한됩니다([Security Model](./security-model) 참고).

## 다음 단계

- [Getting Started](./getting-started) — 최소한의 WASM 소스 플러그인을 처음부터 끝까지 만들어보기
- [Manifest Reference](./manifest-reference) — 모든 `plugin.json` 필드
- [Theme Manifests](./theme-manifests) — 테마 플러그인을 위한 `cssVariables`/`cardVisual`/`fontFaces`
- [WIT Interface](./wit-interface) — 실제 호스트 capability 표면과 플러그인 world
- [Security Model](./security-model) — 경로 범위, capability 게이팅, 서명
- [Publishing](./publishing) — 큐레이션된 플러그인 레지스트리에 제출하기
