# Concourse

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-Hans.md) |
[Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) |
[Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Italiano](README.it.md)

*이 번역은 기계 번역이며 (앱 UI 로케일과 동일한 방식 - 아래 [Localization](#기능) 참고),
아직 원어민 검수를 거치지 않았습니다.*

여러 소스(Steam, Epic, GOG, Xbox, EA app, Ubisoft Connect, 수동 등록, 그리고 플러그인을 통한
더 많은 소스)의 게임을 하나의
통합 라이브러리로 모아주는 데스크톱 앱입니다. 콘솔풍의 컨트롤러 우선 "Big Picture" 모드를
갖추고 있으며, Playnite나 Steam 자체 라이브러리와 취지가 비슷합니다.

핵심 앱은 가볍게 유지됩니다. 기본 라이브러리를 넘어서는 거의 모든 것(소스 스캐너, 테마,
메타데이터 제공자, 컨트롤러 매핑, 호환성 래퍼)은 플러그인입니다.

## 기능

- **라이브러리 코어** - 수동 "게임 추가", SQLite 기반 저장소, 그리드/리스트 보기, 태그,
  검색/필터링
- **메타데이터 및 미디어** - SteamGridDB를 통한 커버 아트, IGDB를 통한 설명/장르/출시일,
  수동 재정의
- **실행 및 플레이타임 추적** - 소스에 관계없이 통합된 실행(직접 exe, Steam `steam://` URI,
  Epic/GOG 프로토콜 핸들러, 호환성 래퍼로 실행되는 게임), 게임 실행 방식에 따라 프로세스
  종료 기반 또는 폴더 기반 플레이타임 추적
- **Big Picture 모드** - 타일 그리드와 커버플로우 슬라이드쇼 뷰를 갖춘 전체 화면 게임패드
  탐색 UI, 배경 아트 크로스페이드, 부팅 시 자동 실행 토글
- **호환성 래퍼** - 기본이 아닌 로케일이 필요한 게임을 위한 게임별 Locale Remulator /
  Locale Emulator 프로필
- **플러그인 시스템** - 다섯 가지 플러그인 종류(source, theme, metadata provider,
  controller mapping, compatibility wrapper), 빌드 타임(`src/plugins/` 아래 번들된
  TypeScript 플러그인) 또는 런타임(다운로드 가능한 WebAssembly 플러그인 - 아래 참고)에
  로드됨
- **다국어 지원** - 10개 언어로 UI 제공(영어 및 기계 번역된 9개 로케일), 앱 전체 리스킨을
  위한 테마 설정 가능한 `--font-family`, 코드 없이 사용 가능한 데이터 전용 테마 티어
  (`cssVariables` + 커버 아트 영역을 위한 선택적 `cardVisual` JSON-AST 오버라이드)
- **오프라인 번역** - 게임의 제목/설명을 외부 서비스 없이 현재 UI 언어로 완전히 온디바이스
  번역(llama.cpp의 자체 사전 빌드 서버 바이너리를 한 번 다운로드하고, 모델을 선택(CPU
  친화적인 몇 가지 티어, NSFW 게임 설명용 무검열 티어 1개)한 뒤, 게임 상세 페이지에서
  제목과 내용을 독립적으로 번역/보기 전환/취소). 번역은 게임별·필드별로 저장되며, 로케일
  전환이나 원본 수정 시 자동으로 무효화됨
- **자동 업데이트** - 앱 자체와 설치된 모든 플러그인/테마가 자동으로 업데이트를 확인하고
  적용

## 기술 스택

- **Tauri 2**(Rust 백엔드) + **Vue 3**(`<script setup>`, TypeScript) 프론트엔드
- **SQLite** (`tauri-plugin-sql` 사용), 버전 관리 마이그레이션을 통해 스키마 발전
- 프론트엔드 상태 관리에 **Pinia**, 도메인별로 하나의 스토어
- 런타임 다운로드 가능한 플러그인 시스템을 위한 **wasmtime**(Wasm Component Model)

## 개발

이 저장소는 npm/yarn/pnpm이 아니라 [`bun`](https://bun.sh)을 사용합니다.

```sh
bun install          # JS 의존성 설치
bun run dev           # Vite 개발 서버만 (프론트엔드)
bunx tauri dev         # 전체 앱 (프론트엔드 + Rust 백엔드), 핫 리로딩
bunx tauri build        # 프로덕션 데스크톱 바이너리
```

`src-tauri/`에서: 전체 빌드 없이 빠른 Rust 컴파일 확인을 위한 `cargo check`.

## 플러그인 아키텍처

모든 플러그인은 `plugin.json` 매니페스트(`{ id, name, version, kind, entry }`)를 가지며,
`kind`에 따라 다섯 가지 인터페이스 중 하나를 구현합니다:

- `source` - 게임 소스 연동을 위한 `scan()` / `launch()` / `getInstallStatus()`
  (다중 활성화 가능)
- `theme` - CSS 변수(색상, 폰트, 테두리/반경) 및 커버 아트 영역을 위한 선택적 JSON-AST
  `cardVisual` 오버라이드(단일 활성화); `cssVariables`만 있는 매니페스트는 코드가 전혀
  필요 없음. 컴포넌트 슬롯 오버라이드(커스텀 Vue 컴포넌트 전체 교체)는 초기에 지원되었으나
  이 폐쇄형 어휘 AST 티어로 대체되며 폐지됨 - 테마가 주입할 수 있는 eval/실행 코드 경로가
  전혀 없음
- `metadata` - 커버 아트/설명/장르 제공자를 위한 `fetchMetadata(title)`(다중 활성화 가능)
- `controller` - 특정 물리적 컨트롤러 레이아웃을 위한 `GamepadMapping`(버튼/축 인덱스)
  (단일 활성화)
- `wrapper` - 대상 실행 파일을 로케일 프로필을 통해 설치/실행을 직접 관리하는 호환성
  래퍼(예: Locale Remulator/Emulator)

빌드 타임 플러그인은 `src/plugins/<id>/` 아래에 있으며 Vite의 `import.meta.glob`을 통해
발견됩니다. 런타임 플러그인은 매니페스트 URL(설정 → 해당 탭 → 플러그인 추가)에서 설치되거나
앱의 데이터 디렉터리에 수동으로 다운로드/압축 해제되는 WebAssembly 컴포넌트
(`source`/`wrapper`/`metadata` 종류)이며, Rust 백엔드에 내장된 `wasmtime` 호스트를 통해
로드됩니다. 데이터 전용 테마(`cssVariables`만, 코드 없음)는 WASM 샌드박싱이 전혀 필요 없는
별도의, 코드 없는 URL 설치 티어입니다.

### 공식 플러그인

전체 목록(저장소 링크, 최신 릴리스 다운로드 링크, 설치 방법)은 문서 사이트의
**[Official Plugins](https://smh0505.github.io/Concourse/guide/official-plugins)**를
참고하세요.

**보안 참고 (Milestone 12, 완료):** wasmtime의 Component Model 샌드박스는 메모리 안전성을
보장하며(플러그인은 호스트 메모리를 손상시키거나 자신의 실행 범위를 벗어날 수 없음), 실제
피해를 줄 수 있는 플러그인에 노출된 모든 호스트 함수는 이제 게이팅됩니다:
- `spawn-process`/`run-and-wait`는 명시적이고 눈에 보이는 플러그인별 승인이 필요합니다 -
  플러그인은 매니페스트에 `capabilities: ["run-programs"]`를 선언해야 하며, 앱은 실제로
  승인하기 전까지 플러그인을 대신해 아무것도 실행하지 않습니다(URL 설치 시 설치 확인
  대화상자의 체크박스, 이미 설치된 플러그인의 경우 설정의 "권한 필요" 행과 승인 버튼).
- `write-file`/`remove-dir`은 예외 없이 플러그인 자체 디렉터리로 강제 제한됩니다.
  `read-file`/`list-dir`/`path-exists`/레지스트리 접근은 매니페스트에 선언된 허용
  목록(`pathScopes`)으로 범위가 지정되며, 설치 위치를 미리 알 수 없는 유일한 플러그인인
  Steam의 경우 검증된 런타임 범위 요청도 가능합니다 - 호스트는 접근을 허용하기 전에 실제
  구조적 시그니처(`steamapps` 하위 디렉터리)를 확인하며, 검증기가 없는 플러그인 ID는 무조건
  거부합니다.
- `http-get`/`http-request`/`download-bytes`는 매니페스트에 선언된 호스트 이름 허용
  목록(`httpScopes`)으로 범위가 지정됩니다 - 플러그인은 선언한 호스트(정확히 일치하거나
  서브도메인)에만 접근할 수 있으며, 임의의 공격자 제어 URL에는 접근할 수 없습니다.

그럼에도 전적으로 신뢰하는 출처의 플러그인만 설치하세요 - 이는 "플러그인이 시스템이나
네트워크 어디든 조용히 접근할 수 있는" 문제를 해결한 것이지, 완전한 앱스토어급 신뢰 모델은
아닙니다.

**신뢰 모델 (Milestone 13, 완료):** 두 개의 상호 보완적이고 독립적인 계층입니다.
- **서명** - 모든 공식 플러그인 릴리스는 [Sigstore](https://www.sigstore.dev/) 빌드 출처
  증명으로 서명되어, 게시된 `.wasm`을 그것을 빌드한 정확한 커밋과 CI 실행에 바인딩합니다.
  Concourse는 설치 시 이를 확인하고 결과를 보여줍니다 - **권고 사항일 뿐, 강제 게이트는
  아닙니다.** 이는 아티팩트가 실제로 해당 저장소의 CI에서 왔고 그 이후 변조되지 않았음을
  확인해줍니다(변조, 침해된 릴리스 토큰, 탈취된 저장소가 몰래 삽입한 악성 빌드를 잡아냄) -
  저장소 저자의 의도를 보증하지는 **않습니다**. 악의적인 저자의 코드도 자신의 CI가 실제로
  커밋한 그대로 빌드하고 서명했다면 완전히 유효한 서명을 받게 됩니다.
- **큐레이션된 레지스트리** -
  [`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry),
  실제로 읽어본 고정 버전의 플러그인 목록을 수동으로 관리하며, 각 항목은 특정 릴리스와 실제
  SHA256에 고정됩니다. "플러그인 추가" 대화상자는 자유 입력 URL 필드와 함께 이 목록을
  보여줍니다. 레지스트리에서 설치할 때 해시 불일치는 서명의 권고성 확인과 달리 **강제
  거부**입니다 - 이 해시는 검토 후 직접 선택된 것이므로, 불일치는 "검토된 것이 아니다"라는
  실제 신호입니다. 레지스트리에서 항목을 제거하는 것은 향후 설치에 대한 취소를
  의미합니다(아직 이미 설치된 사본에 소급 적용되지는 않음). 자유 입력 URL 설치는 어느 쪽이든
  이전과 동일하게 작동합니다 - 레지스트리는 필수 게이트가 아니라 추가적인, 더 신뢰할 수 있는
  경로입니다.

## 문서

전체 플러그인 개발자 및 사용자 문서는
**[smh0505.github.io/Concourse](https://smh0505.github.io/Concourse/)**에 게시되어
있습니다(소스는 [`docs/`](../docs/), VitePress로 빌드) - 사용자 가이드(설치, 라이브러리 관리,
Big Picture 모드)와 플러그인 개발자 참고 자료(아키텍처 개요, 시작하기 안내, 전체 매니페스트/
WIT 인터페이스 참고, 보안 모델, 플러그인 게시 방법)를 포함합니다.

## 상태

마일스톤 단위로 활발히 개발 중입니다. 원래 설계 제안서는
[`.claude/proposal.md`](../.claude/proposal.md), 최신 진행 상황 추적은
[`.claude/milestones.md`](../.claude/milestones.md), 각 마일스톤 항목의 구현 히스토리/근거는
[`.claude/devlog.md`](../.claude/devlog.md)를 참고하세요.

현재까지: 핵심 라이브러리, 메타데이터/플레이타임 추적, Big Picture 모드, 플러그인 시스템
(WebAssembly 런타임 플러그인 파이프라인과 호환성 래퍼의 관리형 설치 포함), WASM 플러그인
권한 샌드박싱(Milestone 12), 플러그인 신뢰/서명 모델(Milestone 13), 진행 중인 데스크톱 UI
개선 작업(Milestone 14), Xbox/EA/Ubisoft Connect 소스 플러그인(Milestone 15), 컴포넌트
교체 테마를 대체하는 JSON-AST 테마 티어(Milestone 16/18), 공유 스타일 컨벤션 작업
(Milestone 17), 앱 + 플러그인/테마 자동 업데이트(Milestone 19), 10개 언어 다국어 지원 및
게임 제목/설명의 오프라인 온디바이스 번역(Milestone 20), 플러그인 개발자 문서 사이트
(Milestone 21), 그리고 그 사이트 자체를 10개 앱 언어로 로컬라이징한 작업(Milestone 22)까지
모두 완료되었습니다. 위에 나열된 모든 공식 플러그인이 운영 중입니다. 현재 버전은
**2.0.0**입니다. 남은 작업은 `.claude/milestones.md`의 Post-1.0 Roadmap 및 Icebox 섹션을
참고하세요(Icebox에는 실제 환경에서 검증하기 전까지 보류 중인 에뮬레이터/ROM 스캐너
플러그인이 있습니다).

## 라이선스

MIT - [`LICENSE`](../LICENSE) 참고.

### 서드파티 고지

Concourse 자체 소스는 MIT 라이선스이며, 저장소나 빌드된 바이너리에 서드파티 콘텐츠가 번들되어
있지 않습니다. 오프라인 번역 기능(Milestone 20)은 두 종류의 서드파티 콘텐츠를 런타임에
사용자의 컴퓨터로 직접 다운로드합니다. 이는 각각 별도의 자체 약관을 따르며, Concourse가
재배포하는 것이 아니라 투명성을 위해 여기에 기재합니다:

- **[llama.cpp](https://github.com/ggml-org/llama.cpp)** (MIT) - 번역 엔진 자체. Concourse는
  GitHub에서 공식 사전 빌드된 Windows 릴리스 바이너리를 다운로드하여 서브프로세스로
  실행합니다. llama.cpp 코드는 Concourse에 컴파일되거나 포함되지 않습니다.
- **모델 가중치**는 설정에서 사용자가 직접 선택하여 Hugging Face에서 다운로드하며, 각각
  자체 모델 카드의 라이선스를 따릅니다 - `qwen2.5-1.5b`/`qwen3-4b`/`gemma4-e2b`는 모두
  Apache 2.0입니다(Gemma 4는 2026년 4월 Apache 2.0으로 전환되어, 이전 Gemma 세대가
  사용하던 더 제한적인 라이선스를 대체했습니다). 두 무검열 티어(`qwen3-4b-abliterated`,
  `gemma4-e2b-abliterated`)는 각 기반 모델의 라이선스를 상속합니다. 상업적으로 활용하기
  전에 각 모델의 Hugging Face 모델 카드를 직접 확인하세요.
