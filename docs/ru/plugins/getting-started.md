# Начало работы: минимальный плагин source

Здесь описывается создание реального, рабочего WASM-плагина `source` - сканера, который находит
файлы `.exe` в папке и предлагает каждый как игру. Он повторяет собственный референсный плагин
Concourse, [`examples/exe-scanner-plugin`](https://github.com/smh0505/Concourse/tree/main/examples/exe-scanner-plugin)
в основном репозитории.

## Предварительные требования

```sh
rustup target add wasm32-wasip1   # once
cargo install cargo-component     # once
```

Плагины source - это обычные crate'ы Rust, компилируемые в WASM-компонент через
[`cargo-component`](https://github.com/bytecodealliance/cargo-component) - никакого специфичного
для Concourse инструментария сверх этого.

## 1. Создание заготовки crate

```sh
cargo component new my-scanner-plugin --lib
cd my-scanner-plugin
```

Скопируйте `wit/plugin.wit` со страницы [WIT-интерфейс](./wit-interface) (или прямо из
`src-tauri/wit/plugin.wit` в основном репозитории) в папку `wit/` вашего нового crate - это
контракт, который реализует ваш плагин, и функции хоста, которые он может вызывать.

## 2. Реализация мира `source-plugin`

Плагин source реализует три функции против трейта `Guest`, который `cargo-component` генерирует
из `world source-plugin-world`: `scan`, `launch`, `get-install-status`. Вот полная реализация
референсного плагина:

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

Обратите внимание, что всё, что плагин может *сделать*, идёт через функции `host::*`
(`settings_get`, `list_dir`, `spawn_process`, `path_exists`, ...) - никакого прямого доступа к
файловой системе/процессам вообще нет. См. справочник [WIT-интерфейс](./wit-interface) для
полного списка функций и [Модель безопасности](./security-model) о том, что ограничено и как.

## 3. Сборка

```sh
cargo component build
```

Результат: `target/wasm32-wasip1/debug/my_scanner_plugin.wasm`.

## 4. Написание манифеста

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

См. [Справочник манифеста](./manifest-reference) для каждого поля, которое может объявить
манифест (возможности, области путей, схема настроек, ...).

## 5. Локальная проверка

Скопируйте скомпилированный `.wasm` и `plugin.json` в:

```
<app data dir>/wasm-plugins/source/my-scanner-plugin/
```

(В Windows `<app data dir>` - это `%APPDATA%\com.bloppy.concourse\`.) Затем откройте вкладку
Settings → Source в Concourse - ваш плагин должен появиться в списке, готовый к включению и
сканированию.

## Далее

- [Справочник манифеста](./manifest-reference) для каждого поля `plugin.json`
- [Модель безопасности](./security-model), чтобы понять ограничение путей/сети/процессов до того,
  как вашему плагину понадобится больше, чем `list_dir`/`spawn_process`
- [Публикация](./publishing), когда будете готовы его распространять
