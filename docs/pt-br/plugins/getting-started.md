# Primeiros Passos: Um Plugin de Source Mínimo

Este guia percorre a construção de um plugin `source` WASM real e funcional - um scanner que
encontra arquivos `.exe` em uma pasta e oferece cada um como um jogo. Ele espelha o próprio
plugin de referência do Concourse,
[`examples/exe-scanner-plugin`](https://github.com/smh0505/Concourse/tree/main/examples/exe-scanner-plugin)
no repositório principal.

## Pré-requisitos

```sh
rustup target add wasm32-wasip1   # once
cargo install cargo-component     # once
```

Plugins de source são crates Rust comuns compilados para um componente WASM via
[`cargo-component`](https://github.com/bytecodealliance/cargo-component) - nenhuma ferramenta
específica do Concourse além disso.

## 1. Estruturando o crate

```sh
cargo component new my-scanner-plugin --lib
cd my-scanner-plugin
```

Copie `wit/plugin.wit` da página [Interface WIT](./wit-interface) (ou diretamente de
`src-tauri/wit/plugin.wit` no repositório principal) para a pasta `wit/` do seu novo crate - este
é o contrato que seu plugin implementa e as funções do host que ele pode chamar.

## 2. Implementando o world `source-plugin`

Um plugin de source implementa três funções contra a trait `Guest` que o `cargo-component` gera a
partir de `world source-plugin-world`: `scan`, `launch`, `get-install-status`. Aqui está a
implementação completa do plugin de referência:

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

Note que tudo que um plugin pode *fazer* passa por funções `host::*` (`settings_get`,
`list_dir`, `spawn_process`, `path_exists`, ...) - não há acesso direto ao sistema de
arquivos/processo em nenhum momento. Veja a referência de [Interface WIT](./wit-interface) para a
lista completa de funções, e [Modelo de Segurança](./security-model) para o que tem escopo
restrito e como.

## 3. Compilando

```sh
cargo component build
```

Saída: `target/wasm32-wasip1/debug/my_scanner_plugin.wasm`.

## 4. Escrevendo um manifesto

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

Veja a [Referência de Manifesto](./manifest-reference) para todos os campos que um manifesto pode
declarar (capacidades, escopos de caminho, esquema de configurações, ...).

## 5. Testando localmente

Copie o `.wasm` compilado e o `plugin.json` para:

```
<app data dir>/wasm-plugins/source/my-scanner-plugin/
```

(No Windows, `<app data dir>` é `%APPDATA%\com.bloppy.concourse\`.) Depois abra a aba Settings →
Source do Concourse - seu plugin deve aparecer na lista, pronto para habilitar e escanear.

## A seguir

- [Referência de Manifesto](./manifest-reference) para todos os campos de `plugin.json`
- [Modelo de Segurança](./security-model) para entender o escopo de caminho/rede/processo antes
  que seu plugin precise de mais do que `list_dir`/`spawn_process`
- [Publicação](./publishing) quando estiver pronto para distribuí-lo
