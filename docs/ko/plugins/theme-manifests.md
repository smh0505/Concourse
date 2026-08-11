# Theme Manifests

테마는 다른 종류들과 의미 있게 다른 매니페스트 형태를 가진 유일한 플러그인 종류입니다 - 오늘날
서드파티 테마는 항상 데이터 전용(`runtime: "data"`) 등급이며, 컴파일된 코드가 전혀 없는
매니페스트입니다. 모든 플러그인 종류가 공유하는 필드(`id`/`name`/`version`/`kind`/`entry`/`runtime`)는
[Manifest Reference](./manifest-reference)를 참고하고, 이 페이지는 테마에 특화된 필드를
다룹니다.

## 필드

| 필드 | 타입 | 비고 |
|---|---|---|
| `cssVariables` | `Record<string, string>` | 이 테마가 활성화되어 있는 동안 `:root`에 적용되는 CSS 커스텀 프로퍼티(예: `"--color-base": "#1e1e2e"`)입니다. 데이터 전용 테마의 전체 내용이 바로 이것입니다. |
| `cardVisual` | 닫힌 어휘 JSON AST | 실제 코드 없이 게임 카드의 커버 비주얼 영역(이미지 또는 플레이스홀더)을 재정의합니다. |
| `fontFaces` | 폰트 선언 배열 | `@font-face`를 통해 로드할 실제 폰트 파일입니다. |

`cssVariables`만으로도 완전하고 유효한 테마가 됩니다 - `cardVisual`/`fontFaces`는 둘 다
선택적인 opt-in 확장입니다.

## `cardVisual`: 노드 어휘

`cardVisual`은 닫힌 노드 타입 집합(`theme/cardVisualAst.ts`의 `validateCardVisualAst`)에 대해
검증됩니다 - 이 형식에는 `eval`/`new Function`/표현식 평가가 전혀 없으므로, 악의적인
매니페스트가 탈출할 수 있는 코드 실행 지점 자체가 존재하지 않습니다. 깊이 5 또는 총 노드 수
50을 초과하는 AST, 그리고 아래 목록에 없는 노드 형태는 모두 거부됩니다.

| 노드 타입 | 형태 | 비고 |
|---|---|---|
| `if` | `{ type: "if", test: FieldRef, then: AstNode, else?: AstNode }` | 참조된 필드가 참(truthy)이면 `then`을, 아니면 `else`(또는 `else`가 생략되었으면 아무것도)를 렌더링합니다. |
| `element` | `{ type: "element", tag: "div" \| "span", class?: string, children?: AstNode[] }` | `tag`는 이 두 비인터랙티브 요소로 닫혀 있습니다 - 포커스를 받거나 이동할 수 있는 `button`/`a`/그 어떤 것도 렌더링할 경로가 없으며, 이는 푸터 액션이 항상 호스트에서 렌더링되고 테마가 제어하지 않는다는 규칙과 일치합니다. |
| `image` | `{ type: "image", class?: string, src: FieldRef, alt: FieldRef }` | 범용 속성 백을 가진 `element`가 아니라 자체 노드 타입입니다 - `src`/`alt`가 이 형식에서 바인딩 가능한 유일한 속성이므로, 매니페스트가 임의의 속성(`onerror` 핸들러, `url(...)`을 포함한 `style` 등)을 주입할 방법이 없습니다. |
| `text` | `{ type: "text", content?: string, field?: FieldRef }` | `field`가 있으면 그 해석된 값을, 없으면 리터럴 `content` 문자열을 렌더링합니다. |

`FieldRef`(`if.test`, `image.src`/`alt`, `text.field`에서 사용)는
`{ field: "cover_art_url" | "title", transform?: "firstLetterUpper" }`입니다 - `field`는
"이 게임 객체가 가진 아무 속성"이 아니라 `Game` 속성의 닫힌 허용 목록이며, `transform`은
임의의 표현식이 아니라 이름 매칭으로 디스패치되는 고정된 호스트 구현 함수 집합 중 하나입니다.

### 예시: 플레이스홀더 폴백이 있는 이미지

```json
{
  "cardVisual": {
    "type": "if",
    "test": { "field": "cover_art_url" },
    "then": {
      "type": "image",
      "class": "cover",
      "src": { "field": "cover_art_url" },
      "alt": { "field": "title" }
    },
    "else": {
      "type": "element",
      "tag": "div",
      "class": "cover-placeholder",
      "children": [{ "type": "text", "field": { "field": "title", "transform": "firstLetterUpper" } }]
    }
  }
}
```

## `fontFaces`: 필드 검증

각 항목은 `{ family: string, url: string, weight?: string, style?: string }`이며, 실제
`@font-face` 규칙으로 로드됩니다. 이는 신뢰할 수 없는 매니페스트 콘텐츠가 실제 `<style>`
블록으로 곧바로 들어가는 것이므로, CSS 텍스트가 구성되기 전에 모든 필드가 엄격한 허용
목록(`theme/fontFaceRegistry.ts`)으로 검사됩니다 - 이 중 하나라도 실패한 항목은 (로그를 남기고)
버려질 뿐, 강제 변환되지 않으며 나머지 테마 로딩을 막지도 않습니다:

| 필드 | 필수 | 제약 |
|---|---|---|
| `family` | 예 | 글자, 숫자, 공백, 하이픈만 허용, 1~100자 - CSS 인젝션 시도에 필요한 문자(`"`, `'`, `;`, `{`, `}`)를 특별히 제외합니다. |
| `url` | 예 | `https:` URL로 파싱되어야 하며, 추가로 `"`, `'`, `;`, `{`, `}`를 포함하지 않는지 확인합니다. |
| `weight` | 아니요 | `family`와 동일한 안전 문자 패턴, 1~30자. |
| `style` | 아니요 | 정확히 `"normal"`, `"italic"`, `"oblique"` 중 하나여야 합니다. |

```json
{
  "fontFaces": [
    {
      "family": "My Custom Font",
      "url": "https://raw.githubusercontent.com/you/your-theme-repo/<commit-sha>/my-font.woff2",
      "weight": "400"
    }
  ]
}
```

실제로 적용하려면 로드된 폰트를 `cssVariables`의 `--font-family`(아래 참고)에서 이름으로
참조하세요 - `fontFaces` 항목을 선언하는 것만으로는 폰트를 사용 가능하게 만들 뿐, 그 자체로는
어디에도 사용되지 않습니다.

## `cssVariables`: 사용 가능한 토큰

아래 각 토큰은 `styles.css`가 기본값을 설정했거나, 아무것도 선언하지 않은 채 폴백을 통해
(`var(--your-token, <default>)`) 읽어들이는 실제 CSS 커스텀 프로퍼티입니다. 목록에 없는 것을
설정해도 여전히 동작하지만(그냥 일반 CSS 커스텀 프로퍼티일 뿐 막을 것이 없습니다), 앱 자체
스타일시트의 그 무엇도 이를 읽지 않습니다.

### 기본 토큰 (항상 값이 있음)

이들은 실제 기본값과 함께 `:root`에 설정됩니다 - 원하는 하위 집합만 재정의하면 나머지는 아래
기본값을 유지합니다. 기본값은 [Catppuccin Latte](https://github.com/catppuccin/catppuccin)의
색상 스킴이며, 앱에 기본 탑재된 테마이기도 합니다 - 라이트 테마를 만들고 있다면 이 색상 값들이
비교할 만한 합리적인 출발 팔레트입니다.

| 토큰 | 기본값 | 비고 |
|---|---|---|
| `--color-base` | `#eff1f5` | 페이지 배경. |
| `--color-mantle` | `#e6e9ef` | 살짝 들어간 표면(예: 스티키 헤더 배경). |
| `--color-crust` | `#dce0e8` | base/mantle/crust 3종 중 가장 어둡고 채도가 높은 색상 - `--color-tint`의 기본값이 이 값입니다. |
| `--color-text` | `#4c4f69` | 일반 본문 텍스트. |
| `--color-text-reverse` | `#ffffff` | `--color-text`의 반대 밝기 끝값으로, 예측 불가능하게 밝은 배경 이미지(예: 게임 상세 백드롭) 위에 놓여 일반 텍스트 색상으로는 대비를 보장할 수 없을 때 사용합니다. |
| `--color-subtext` | `#5c5f77` | 덜 강조되는 텍스트(힌트, 보조 라벨). |
| `--color-surface0` | `#ccd0da` | 테두리, 은은한 채움. |
| `--color-surface1` | `#bcc0cc` | `--color-surface0`보다 살짝 강한 테두리/채움. |
| `--color-accent` | `#1e66f5` | 주요 강조색(제출 버튼, 활성 탭/내비게이션, 포커스 링). |
| `--color-accent-alt` | `#8839ef` | 보조 강조색. |
| `--color-danger` | `#d20f39` | 파괴적 액션(제거/삭제). |
| `--color-button-text` | `var(--color-text)` | 중립 버튼의 텍스트/아이콘 색상 - 채도 높은 버튼 배경을 쓰는 테마가 이 값만 재정의할 수 있도록 `--color-text`와 분리되어 있습니다. |
| `--color-on-accent` | `var(--color-base)` | `--color-accent` 위에 렌더링되는 모든 것(제출 버튼, 활성 탭, 토스트)의 텍스트/아이콘 색상. |
| `--color-tint` | `var(--color-crust)` | 커버 아트 스크림(리스트 행, 통계 행)의 배경 틴트 - 투명도와 섞였을 때 실제 대비를 내려면 `--color-base`보다 더 어둡고 채도가 높아야 합니다. `--color-crust`가 `--color-text`와 잘 어울리지 않는다면 재정의하세요(이 뒤에 있는 대비 계산은 [Security Model](./security-model) 참고). |
| `--space-1` … `--space-6` | `0.25rem` … `2rem` | 간격 스케일(`0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem`). |
| `--radius-sm` | `4px` | 작은 모서리 반경. |
| `--radius-md` | `6px` | 기본 모서리 반경(대부분의 컨트롤). |
| `--radius-lg` | `8px` | 더 큰 모서리 반경(행, 패널). |
| `--radius-xl` | `10px` | 가장 큰 모서리 반경. |
| `--button-border-width` | `1px` | 기본 버튼 테두리 두께. |
| `--shadow-sm` / `--shadow-md` / `--shadow-lg` | 점점 커지는 `rgba(0,0,0,...)` 블러 | 고도(elevation) 스케일. |
| `--font-family` | `Inter, Avenir, Helvetica, Arial, sans-serif` | UI 전체의 서체 - 모든 요소가 이를 직접 상속하거나 `font-family: inherit`을 설정합니다. 원하는 서체가 시스템 폰트가 아니라면 `fontFaces` 항목과 함께 사용하세요. |

### Opt-in 훅 (기본적으로 선언되지 않음)

이들은 `:root`에 기본값이 없습니다 - 앱은 `var(--token, <fallback>)`을 통해서만 사용하므로,
설정하지 않은 훅은 조용히 아래 표시된 값으로 폴백되며 설정하지 않는 한 아무 효과도 없습니다.

| 토큰 | 미설정 시 폴백 | 영향 범위 |
|---|---|---|
| `--button-border-color` | `var(--color-surface0)` | 중립 버튼 테두리 색상. |
| `--button-radius` | `var(--radius-md)` | 중립 버튼 모서리 반경. |
| `--card-border-width` | `1px` | 게임 카드/리스트 행/통계 행 테두리 두께. |
| `--card-radius` | `var(--radius-lg)` | 게임 카드/리스트 행/통계 행 모서리 반경. |
| `--cover-placeholder-background` | `var(--color-surface0)` | 커버 아트 없음 플레이스홀더 배경(단색뿐 아니라 `repeating-linear-gradient(...)` 패턴 등 유효한 `background` 값이면 무엇이든 허용). |
| `--tile-background` | `none` | Big Picture 타일 배경. |
| `--tile-border-width` | `3px` | Big Picture 타일 테두리 두께. |
| `--tile-border-color` | `transparent` | Big Picture 타일 테두리 색상. |
| `--tile-radius` | `var(--radius-xl, 10px)` | Big Picture 타일 모서리 반경. |
| `--tile-focus-shadow` | `var(--shadow-lg)` | Big Picture 타일의 포커스 상태 그림자/링. |
| `--accent-active-background` | `var(--color-accent)` | 활성 내비게이션/탭/필터 태그 배경 - 테마의 강조색이 활성 상태 표시를 강제로 맞추지 않도록 `--color-accent`와 분리되어 있습니다. |
| `--accent-active-color` | `var(--color-on-accent)` | 활성 내비게이션/탭/필터 태그 상태의 텍스트/아이콘 색상. |

`styles.css`가 아니라 개별 컴포넌트 레벨에 있는 opt-in 훅도 몇 가지 있습니다(예:
`GameCard.vue`의 `--balloon-background`/`--balloon-font-family`, `BigPictureTile.vue`의
`--tile-title-font-family`) - 여기 모두 정리되어 있지는 않지만 동일한 `var(--token, fallback)`
패턴을 따르므로, 컴포넌트의 `<style>` 블록에서 `var(--`를 검색하면 찾을 수 있습니다.

## 예시: 좀 더 완전한 테마 매니페스트

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "version": "1.0.0",
  "kind": "theme",
  "cssVariables": {
    "--color-base": "#1e1e2e",
    "--color-mantle": "#181825",
    "--color-crust": "#11111b",
    "--color-text": "#cdd6f4",
    "--color-text-reverse": "#000000",
    "--color-accent": "#89b4fa"
  }
}
```
