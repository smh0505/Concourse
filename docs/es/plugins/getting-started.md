# Primeros pasos: un plugin de origen mínimo

Este tutorial recorre la construcción de un plugin WASM `source` real y funcional — un escáner
que encuentra archivos `.exe` en una carpeta y ofrece cada uno como un juego. Refleja el propio
plugin de referencia de Concourse,
[`examples/exe-scanner-plugin`](https://github.com/smh0505/Concourse/tree/main/examples/exe-scanner-plugin)
en el repositorio principal.

## Requisitos previos

```sh
rustup target add wasm32-wasip1   # una vez
cargo install cargo-component     # una vez
```

Los plugins de origen son crates de Rust ordinarios compilados a un componente WASM mediante
[`cargo-component`](https://github.com/bytecodealliance/cargo-component) — ninguna herramienta
específica de Concourse más allá de eso.

## 1. Crear el andamiaje del crate

```sh
cargo component new my-scanner-plugin --lib
cd my-scanner-plugin
```

Copia `wit/plugin.wit` desde la página de [Interfaz WIT](./wit-interface) (o directamente desde
`src-tauri/wit/plugin.wit` en el repositorio principal) a la carpeta `wit/` de tu nuevo crate —
este es el contrato que implementa tu plugin y las funciones del host que puede llamar.

## 2. Implementar el mundo `source-plugin`

Un plugin de origen implementa tres funciones contra el trait `Guest` que `cargo-component`
genera a partir de `world source-plugin-world`: `scan`, `launch`, `get-install-status`. Aquí está
la implementación completa del plugin de referencia:

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

Fíjate en que todo lo que un plugin puede *hacer* pasa por funciones `host::*` (`settings_get`,
`list_dir`, `spawn_process`, `path_exists`, ...) — no hay ningún acceso directo al sistema de
archivos/procesos en absoluto. Consulta la referencia de la [Interfaz WIT](./wit-interface) para
la lista completa de funciones, y el [Modelo de seguridad](./security-model) para saber qué está
acotado y cómo.

## 3. Compilarlo

```sh
cargo component build
```

Resultado: `target/wasm32-wasip1/debug/my_scanner_plugin.wasm`.

## 4. Escribir un manifiesto

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

Consulta la [Referencia del manifiesto](./manifest-reference) para conocer todos los campos que
puede declarar un manifiesto (capacidades, alcances de rutas, esquema de settings, ...).

## 5. Probarlo en local

Copia el `.wasm` compilado y `plugin.json` a:

```
<app data dir>/wasm-plugins/source/my-scanner-plugin/
```

(En Windows, `<app data dir>` es `%APPDATA%\com.bloppy.concourse\`.) Luego abre la pestaña
Settings → Source de Concourse — tu plugin debería aparecer en la lista, listo para habilitar y
escanear.

## Siguientes pasos

- [Referencia del manifiesto](./manifest-reference) para todos los campos de `plugin.json`
- [Modelo de seguridad](./security-model) para entender el acotamiento de rutas/red/procesos
  antes de que tu plugin necesite más que `list_dir`/`spawn_process`
- [Publicación](./publishing) cuando estés listo para distribuirlo
