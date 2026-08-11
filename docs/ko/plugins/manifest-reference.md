# Manifest Reference

내장 TypeScript, WASM, 데이터 전용 테마를 막론하고 모든 플러그인은 `plugin.json` 매니페스트로
기술됩니다. 이 페이지는 Concourse의 로더가 이해하는 모든 필드를 문서화합니다(출처:
`src/plugins/manifest.ts`의 `PluginManifest` 인터페이스).

## 핵심 필드 (모든 플러그인 공통)

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `id` | `string` | 예 | 고유 식별자입니다. WASM 플러그인의 설치 디렉터리 이름으로도 쓰이므로 파일시스템에 안전한 값을 사용하세요. |
| `name` | `string` | 예 | Settings에 표시되는 이름입니다. |
| `version` | `string` | 예 | 앱 자체 버전과 무관한 일반 SemVer입니다. 아래 [versioning](#versioning)을 참고하세요. |
| `kind` | `"source" \| "theme" \| "metadata" \| "controller" \| "wrapper"` | 예 | 이 플러그인이 제공하는 capability를 나타내며, 엔트리 모듈/컴포넌트가 무엇을 export해야 하는지를 결정합니다. |
| `entry` | `string` | 예 | 컴파일된 `.wasm` 파일 경로로, 플러그인 자체 폴더 기준 상대 경로입니다. |
| `runtime` | `"wasm" \| "data"` | 아니요 | WASM 플러그인이면 `"wasm"`, 코드 없는 테마 매니페스트면 `"data"`를 설정하세요(로드할 `entry`가 아예 없고 - `cssVariables`가 곧 플러그인 전체입니다). 서드파티 매니페스트는 항상 이 둘 중 하나를 설정해야 합니다. (`"ts"`/미지정도 로더가 인식하는 세 번째 값이지만, 앱 자체에 번들된 빌드 타임 TypeScript 모듈을 의미하는 것으로 내부 전용입니다 - 배포하는 매니페스트에는 설정할 일이 없습니다.) |
| `installable` | `boolean` | 아니요 | 이 플러그인이 설치/제거 생명주기(`install()`/`uninstall()`/`isInstalled()`)를 구현하는지를 나타내며, 일반적인 "Install" 버튼 UI가 자동으로 표시되는지 여부를 결정합니다. |

테마 매니페스트는 별도의 전용 필드 세트(`cssVariables`/`cardVisual`/`fontFaces`)를 가지고
있습니다 - 해당 내용은 이 페이지가 아니라 [Theme Manifests](./theme-manifests)를 참고하세요.

## WASM 플러그인 필드

| 필드 | 타입 | 비고 |
|---|---|---|
| `settingsSchema` | `{ key, label, type? }` 배열 | 사용자가 설정 가능한 항목(예: API 키)을 선언합니다 - 호스트가 이 정보로부터 범용 설정 폼을 하나 렌더링해주므로 플러그인이 직접 커스텀 설정 UI를 만들 필요가 없습니다. `type: "password"`는 입력을 마스킹합니다. |
| `capabilities` | `string[]` | 이 플러그인이 실제로 호출하는, 게이팅된 호스트 capability입니다. 오늘날은 `"run-programs"`(`spawn-process`/`run-and-wait`를 게이팅)뿐입니다 - [Security Model](./security-model)을 참고하세요. 호스트는 여기에 무엇을 선언하든 상관없이 게이트를 강제하며, 이 필드는 설치 확인 UI가 사용자에게 명시적 승인을 요청할지 여부만 결정합니다. |

`pathScopes`/`httpScopes`(자체 플러그인 디렉터리를 넘어선 선언된 읽기 접근과 허용된 네트워크
호스트)는 사용자 가시성을 위해 설치 확인 대화상자에 표시되지만, `plugin.json`에 직접 선언하는
것이 아니라 플러그인의 실제 WIT 레벨 요청으로부터 호스트가 계산합니다 - 실제 범위 지정이 어떻게
동작하는지는 [Security Model](./security-model)을 참고하세요.

## 호스트가 추가하는 필드 (직접 설정하지 마세요)

| 필드 | 타입 | 비고 |
|---|---|---|
| `sourceUrl` | `string` | 이것이 설치된 정확한 URL로, 나중에 업데이트 확인 시 다시 가져와 버전을 비교할 수 있도록 설치 시점에 호스트가 추가합니다. |
| `installedViaRegistry` | `boolean` | 자유 형식으로 붙여넣은 URL이 아니라 큐레이션된 레지스트리의 고정 해시 항목을 통해 설치되었는지를 나타내며, 업데이트 확인 방식을 바꿉니다(레지스트리에 고정된 `sourceUrl`은 커밋 SHA로 고정되어 영구히 변하지 않으므로, 업데이트 확인은 `sourceUrl`을 다시 가져오는 것이 아니라 레지스트리의 이 id에 대한 *현재* 항목을 다시 가져오는 것을 의미합니다). |

## 예시: 최소한의 소스 플러그인 매니페스트

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

테마 매니페스트 예시는 [Theme Manifests](./theme-manifests)를 참고하세요.

## 버전 관리 {#versioning}

플러그인 버전은 앱 자체 버전과 독립적으로 관리되는 일반 SemVer입니다:

- **Patch**: 버그 수정, 매니페스트/동작 변경 없음.
- **Minor**: 새 기능 추가, 하위 호환 - 동일한 호스트 WIT 인터페이스(WASM 플러그인) 또는
  `PluginBase` 형태(TS 플러그인)에서 여전히 동작함.
- **Major**: 호환성이 깨지는 변경 - 매니페스트 형태가 바뀌었거나, (WASM 플러그인의 경우) 이전
  Concourse 빌드에는 없는 `wit/plugin.wit` 인터페이스 버전이 필요해짐. "이전 앱 빌드에는 설치하지
  말 것"이라는 신호입니다.

별도로 설치되는 WASM 플러그인과 데이터 전용 테마 매니페스트는 관례적으로 각각 `0.1.0`/`1.0.0`에서
시작합니다 - 콘텐츠만 있는 테마 매니페스트는 `1.0.0`으로 시작해도 될 만큼 안정적인 반면, 실제
설치/실행 로직이 있는 WASM 플러그인은 실사용에서 검증되기 전까지 보통 `0.1.0`에서 시작합니다.
