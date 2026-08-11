# WIT Interface

이것은 모든 WASM 플러그인이 빌드 대상으로 삼는 실제
[WIT](https://component-model.bytecodealliance.org/design/wit.html) 계약입니다 — 신뢰할 수
있는 원본은 메인 저장소의 `src-tauri/wit/plugin.wit`이며, 이 페이지는 그것을 설명할 뿐, 둘이
서로 다르면 해당 파일이 우선합니다.

## `host` 인터페이스

아래의 모든 호스트 함수는 Rust 호스트가 구현하고 플러그인에 노출하는 capability입니다 -
통합별로 특화된 의미론적 함수가 아니라 의도적으로 범용적인(레지스트리/파일/프로세스/네트워크/범위
지정 저장소) 프리미티브입니다. 소스 플러그인은(예를 들어 벤더 고유의 VDF/XML 포맷을 파싱하는 등)
이를 직접 조합하며, Concourse가 소스마다 전용 모듈을 작성하지 않습니다.

### 레지스트리 (Windows)

```wit
read-registry-string: func(hive: string, path: string, value: string) -> option<string>;
list-registry-keys: func(hive: string, path: string) -> result<list<string>, string>;
```

`hive`는 `"HKLM"` 또는 `"HKCU"`입니다. 존재하지 않는 키/값은 오류가 아니라 `none`/빈 목록을
반환합니다 - "존재하지 않음"은 정상적으로 예상되는 결과입니다(예: 플랫폼이 아예 설치되어 있는지
확인하는 경우).

### 파일시스템

```wit
read-file: func(path: string) -> result<string, string>;
write-file: func(path: string, contents: string) -> result<_, string>;
list-dir: func(path: string) -> result<list<string>, string>;
path-exists: func(path: string) -> bool;
remove-dir: func(path: string) -> result<_, string>;
plugin-dir: func() -> result<string, string>;
```

`plugin-dir()`은 이 플러그인 자체의 쓰기 가능한 디렉터리
(`<app data>/wasm-plugins/<kind>/<plugin-id>/`)를 반환합니다 - 항상 암묵적으로 읽기/쓰기
가능합니다. 그 외의 모든 경로는 매니페스트가 선언한 범위 안에 있거나, 런타임에 요청되어야
합니다([Security Model](./security-model#path-scoping) 참고).

```wit
request-read-scope: func(path: string) -> result<_, string>;
```

정적으로 알려진 위치가 아니라 런타임에만 알 수 있는 디렉터리(예: 사용자가 실제로 Steam을 설치한
위치)를 위한 것입니다 - 호스트는 플러그인 id를 인식하고 *동시에* 요청된 경로가 해당 벤더에
대한 실제 구조적 검사를 통과하는 경우에만 이를 부여합니다.

### 프로세스

```wit
spawn-process: func(path: string, args: list<string>) -> result<_, string>;
run-and-wait: func(path: string, args: list<string>, cwd: string) -> result<_, string>;
```

`spawn-process`는 실행 후 신경 쓰지 않는(fire-and-forget) 방식입니다(대기/종료 코드 없음) -
다른 곳에서 `launch()`가 사용되는 방식과 일치하며, Concourse 자체 폴더 기반 플레이타임 추적이
세션 지속 시간을 별도로 다룹니다. `run-and-wait`는 정말로 필요한 경우(예: 서드파티 설치 프로그램
창이 닫혔는지 알아야만 계속 진행할 수 있는 경우)를 위해 프로세스가 종료될 때까지 블로킹합니다.
둘 다 `"run-programs"` capability 부여가 필요합니다 - [Security Model](./security-model)을
참고하세요.

### 네트워크

```wit
http-get: func(url: string) -> result<string, string>;
download-bytes: func(url: string) -> result<list<u8>, string>;
http-request: func(method: string, url: string, headers: list<tuple<string, string>>, body: option<string>) -> result<string, string>;
```

`http-request`는 `http-get`으로 표현할 수 없는 것들을 위한 것입니다 - 커스텀 헤더(`Authorization`
베어러 토큰)나 본문이 있는 비GET 메서드(예: POST 기반 쿼리 API)가 그렇습니다. 바이너리 응답에는
`http-get`/`http-request` 대신 `download-bytes`를 사용하세요.

### Zip 아카이브

```wit
extract-zip: func(bytes: list<u8>, dest-dir: string) -> result<_, string>;
unwrap-single-subdir: func(dir: string) -> result<string, string>;
replace-dir: func(src: string, dest: string) -> result<_, string>;
```

이 셋을 합치면 흔한 "릴리스 zip을 다운로드하고, 압축을 풀고, 설치한다" 흐름을 다룰 수 있습니다
(자체 관리 설치를 하는 `wrapper` 플러그인이 사용). `unwrap-single-subdir`은 릴리스 zip이 아카이브
이름과 같은 최상위 폴더 하나로 콘텐츠를 감싸는 흔한 경우를 처리합니다.

### 범위 지정 저장소

```wit
settings-get: func(key: string) -> option<string>;
settings-set: func(key: string, value: string);
plugin-data-get: func(game-id: s64, key: string) -> option<string>;
plugin-data-set: func(game-id: s64, key: string, value: string);
```

둘 다 호스트에 의해 플러그인 id별로 자동 네임스페이스가 지정됩니다 - 여러분의 플러그인은 다른
플러그인의 설정이나 게임별 데이터를 읽거나 쓸 수 없고, 핵심 앱 테이블에 직접 접근할 수도 없습니다.

## 세 가지 플러그인 world

WASM 플러그인이 구현할 수 있는 각 `kind`는 아래 world 중 하나를 export합니다:

### `source-plugin-world`

```wit
interface source-plugin {
    use host.{game-entry};

    scan: func() -> result<list<game-entry>, string>;
    launch: func(entry: game-entry) -> result<_, string>;
    get-install-status: func(entry: game-entry) -> result<bool, string>;
}
```

내장 `SourcePlugin` TypeScript 인터페이스를 그대로 반영합니다 - WASM 소스 플러그인은 동일한
계약의 드롭인 대체 구현입니다. 전체 구현 과정은 [Getting Started](./getting-started)를
참고하세요.

### `wrapper-plugin-world`

```wit
interface wrapper-plugin {
    use host.{locale-profile};

    install: func() -> result<_, string>;
    uninstall: func() -> result<_, string>;
    is-installed: func() -> bool;

    list-profiles: func() -> result<list<locale-profile>, string>;
    launch: func(profile-guid: string, executable-path: string) -> result<_, string>;
}
```

호환성 래퍼(예: 로케일 에뮬레이터)로, 완전히 자체 완결적입니다. `install()`은 최신 릴리스를
다운로드하고, 압축을 풀고, 없으면 기본 프로필 설정을 시드하고, 오직 그것만 할 수 있는 등록
단계를 위해 실제 벤더 설치 프로그램을 실행합니다. 소스 플러그인과 달리 어디에도 전달할
호스트 소유 경로가 없습니다 - 플러그인은 항상 자기 `plugin-dir()` 아래의 동일한 결정적 위치에
설치하고(그 위치를) 해석합니다.

### `metadata-plugin-world`

```wit
interface metadata-plugin {
    record metadata-result {
        description: option<string>,
        release-date: option<string>,
        genres: list<string>,
        cover-art-url: option<string>,
        background-art-url: option<string>,
    }

    record metadata-candidate {
        id: string,
        label: string,
        image-url: option<string>,
    }

    search-candidates: func(title: string) -> result<list<metadata-candidate>, string>;
    fetch-metadata-by-id: func(id: string) -> result<option<metadata-result>, string>;
}
```

`search-candidates`는 그럴듯한 모든 후보를 반환합니다 - 보통 0개나 1개지만, 여러분의 제공자
자체 목록이 정말로 모호한 경우(예: 같은 제목을 공유하는 중복/재발매) 더 많을 수 있습니다.
호스트는 정확히 하나의 후보가 돌아오면 자동으로 그것을 선택하고, 둘 이상이면 사용자에게 선택
UI를 보여주며, 하나도 없으면 해당 제공자를 완전히 건너뜁니다. `fetch-metadata-by-id`는 그다음
`id`로 특정 후보 하나의 전체 메타데이터를 가져옵니다.

## `game-entry`와 `locale-profile`

```wit
record game-entry {
    id: string,
    title: string,
    executable-path: string,
    platform: string,
    cover-art-url: option<string>,
    install-dir: option<string>,
}

record locale-profile {
    name: string,
    guid: string,
}
```
