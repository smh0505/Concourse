# Getting Started: A Minimal Source Plugin

이 문서는 실제로 동작하는 WASM `source` 플러그인을 만드는 과정을 안내합니다 - 폴더에서 `.exe`
파일을 찾아 각각을 게임으로 제공하는 스캐너입니다. 메인 저장소의 Concourse 자체 레퍼런스
플러그인인
[`examples/exe-scanner-plugin`](https://github.com/smh0505/Concourse/tree/main/examples/exe-scanner-plugin)을
그대로 따라갑니다.

## 사전 준비

```sh
rustup target add wasm32-wasip1   # once
cargo install cargo-component     # once
```

소스 플러그인은 [`cargo-component`](https://github.com/bytecodealliance/cargo-component)를
통해 WASM 컴포넌트로 컴파일되는 일반적인 Rust crate입니다 — 그 외에는 Concourse 전용 툴체인이
필요하지 않습니다.

## 1. crate 스캐폴딩

```sh
cargo component new my-scanner-plugin --lib
cd my-scanner-plugin
```

[WIT Interface](./wit-interface) 페이지(또는 메인 저장소의 `src-tauri/wit/plugin.wit`)에서
`wit/plugin.wit`를 새 crate의 `wit/` 폴더로 복사하세요 — 이것이 여러분의 플러그인이 구현하는
계약이자, 호출할 수 있는 호스트 함수 목록입니다.

## 2. `source-plugin` world 구현하기

소스 플러그인은 `cargo-component`가 `world source-plugin-world`로부터 생성하는 `Guest` trait에
대해 세 개의 함수를 구현합니다: `scan`, `launch`, `get-install-status`. 레퍼런스 플러그인의
전체 구현은 다음과 같습니다:

```rust
#[allow(warnings)]
mod bindings;

use bindings::exports::gamelib::plugin::source_plugin::{GameEntry, Guest};
use bindings::gamelib::plugin::host;

struct ExeScannerPlugin;

impl Guest for ExeScannerPlugin {
    fn scan() -> Result<Vec<GameEntry>, String> {
        let dir = host::settings_get("scan_dir").ok_or_else(|| {
            "Set the 'scan_dir' setting to a folder to scan for .exe files".to_string()
        })?;

        let paths = host::list_dir(&dir)?;
        let entries = paths
            .into_iter()
            .filter(|path| path.to_lowercase().ends_with(".exe"))
            .map(|path| {
                let file_name = path.rsplit(['\\', '/']).next().unwrap_or(&path);
                let title = file_name
                    .strip_suffix(".exe")
                    .or_else(|| file_name.strip_suffix(".EXE"))
                    .unwrap_or(file_name)
                    .to_string();

                GameEntry {
                    id: format!("exe-scanner-{}", title),
                    title,
                    executable_path: path,
                    platform: "exe-scanner".to_string(),
                    cover_art_url: None,
                    install_dir: Some(dir.clone()),
                }
            })
            .collect();

        Ok(entries)
    }

    fn launch(entry: GameEntry) -> Result<(), String> {
        host::spawn_process(&entry.executable_path, &[])
    }

    fn get_install_status(entry: GameEntry) -> Result<bool, String> {
        Ok(host::path_exists(&entry.executable_path))
    }
}

bindings::export!(ExeScannerPlugin with_types_in bindings);
```

플러그인이 *할 수 있는* 모든 동작은 `host::*` 함수(`settings_get`, `list_dir`, `spawn_process`,
`path_exists` 등)를 거친다는 점에 주목하세요 — 직접적인 파일시스템/프로세스 접근은 전혀 없습니다.
전체 함수 목록은 [WIT Interface](./wit-interface) 레퍼런스를, 무엇이 어떻게 범위 제한되는지는
[Security Model](./security-model)을 참고하세요.

## 3. 빌드하기

```sh
cargo component build
```

출력: `target/wasm32-wasip1/debug/my_scanner_plugin.wasm`.

## 4. 매니페스트 작성하기

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

매니페스트가 선언할 수 있는 모든 필드(capability, 경로 범위, 설정 스키마 등)는
[Manifest Reference](./manifest-reference)를 참고하세요.

## 5. 로컬에서 테스트하기

컴파일된 `.wasm`과 `plugin.json`을 다음 위치에 복사하세요:

```
<app data dir>/wasm-plugins/source/my-scanner-plugin/
```

(Windows에서 `<app data dir>`는 `%APPDATA%\com.bloppy.concourse\`입니다.) 그런 다음 Concourse의
Settings → Source 탭을 열면 목록에 플러그인이 나타나며, 활성화하고 스캔할 준비가 됩니다.

## 다음 단계

- 모든 `plugin.json` 필드는 [Manifest Reference](./manifest-reference)를 참고하세요
- 플러그인에 `list_dir`/`spawn_process` 이상이 필요해지기 전에 경로/네트워크/프로세스 범위
  제한을 이해하려면 [Security Model](./security-model)을 참고하세요
- 배포할 준비가 되면 [Publishing](./publishing)을 참고하세요
