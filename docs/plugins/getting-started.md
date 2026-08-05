# Getting Started: A Minimal Source Plugin

This walks through building a real, working WASM `source` plugin — a scanner that finds
`.exe` files in a folder and offers each as a game. It mirrors Concourse's own reference plugin,
[`examples/exe-scanner-plugin`](https://github.com/smh0505/Concourse/tree/main/examples/exe-scanner-plugin)
in the main repo.

## Prerequisites

```sh
rustup target add wasm32-wasip1   # once
cargo install cargo-component     # once
```

Source plugins are ordinary Rust crates compiled to a WASM component via
[`cargo-component`](https://github.com/bytecodealliance/cargo-component) — no Concourse-specific
toolchain beyond that.

## 1. Scaffold the crate

```sh
cargo component new my-scanner-plugin --lib
cd my-scanner-plugin
```

Copy `wit/plugin.wit` from the [WIT Interface](./wit-interface) page (or straight from
`src-tauri/wit/plugin.wit` in the main repo) into your new crate's `wit/` folder — this is the
contract your plugin implements and the host functions it can call.

## 2. Implement the `source-plugin` world

A source plugin implements three functions against the `Guest` trait `cargo-component`
generates from `world source-plugin-world`: `scan`, `launch`, `get-install-status`. Here's the
reference plugin's entire implementation:

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

Notice everything a plugin can *do* goes through `host::*` functions (`settings_get`,
`list_dir`, `spawn_process`, `path_exists`, ...) — there's no direct filesystem/process access
at all. See the [WIT Interface](./wit-interface) reference for the full function list, and
[Security Model](./security-model) for what's scoped and how.

## 3. Build it

```sh
cargo component build
```

Output: `target/wasm32-wasip1/debug/my_scanner_plugin.wasm`.

## 4. Write a manifest

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

See the [Manifest Reference](./manifest-reference) for every field a manifest can declare
(capabilities, path scopes, settings schema, ...).

## 5. Try it locally

Copy the compiled `.wasm` and `plugin.json` into:

```
<app data dir>/wasm-plugins/source/my-scanner-plugin/
```

(On Windows, `<app data dir>` is `%APPDATA%\com.bloppy.concourse\`.) Then open Concourse's
Settings → Source tab — your plugin should appear in the list, ready to enable and scan.

## Next

- [Manifest Reference](./manifest-reference) for every `plugin.json` field
- [Security Model](./security-model) to understand path/network/process scoping before your
  plugin needs more than `list_dir`/`spawn_process`
- [Publishing](./publishing) once you're ready to distribute it
