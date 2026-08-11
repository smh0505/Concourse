# 快速上手:一个最简单的来源插件

本文将带你构建一个真实可用的 WASM `source`(来源)插件 —— 一个扫描文件夹中 `.exe` 文件并将
每一个都作为游戏提供的扫描器。它对应的正是 Concourse 自身的参考插件
[`examples/exe-scanner-plugin`](https://github.com/smh0505/Concourse/tree/main/examples/exe-scanner-plugin),
位于主仓库中。

## 前置条件

```sh
rustup target add wasm32-wasip1   # once
cargo install cargo-component     # once
```

来源插件本质上是普通的 Rust crate,通过
[`cargo-component`](https://github.com/bytecodealliance/cargo-component) 编译为 WASM
组件 —— 除此之外不需要任何 Concourse 专属的工具链。

## 1. 搭建 crate 骨架

```sh
cargo component new my-scanner-plugin --lib
cd my-scanner-plugin
```

从[WIT 接口](./wit-interface)页面(或直接从主仓库中的 `src-tauri/wit/plugin.wit`)复制
`wit/plugin.wit` 到你新建 crate 的 `wit/` 文件夹中 —— 这就是你的插件所实现的契约,以及它可以
调用的宿主函数。

## 2. 实现 `source-plugin` world

一个来源插件需要针对 `cargo-component` 从 `world source-plugin-world` 生成的 `Guest` trait
实现三个函数:`scan`、`launch`、`get-install-status`。以下是参考插件的完整实现:

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

注意,插件所能*执行*的一切操作都要经过 `host::*` 函数(`settings_get`、`list_dir`、
`spawn_process`、`path_exists` 等) —— 完全没有直接的文件系统/进程访问权限。完整的函数列表见
[WIT 接口](./wit-interface)参考文档,哪些内容受到限定范围以及如何限定见
[安全模型](./security-model)。

## 3. 构建

```sh
cargo component build
```

输出:`target/wasm32-wasip1/debug/my_scanner_plugin.wasm`。

## 4. 编写 manifest

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

manifest 可以声明的每一个字段(能力、路径范围、设置 schema 等)见
[Manifest 参考](./manifest-reference)。

## 5. 本地试用

将编译好的 `.wasm` 和 `plugin.json` 复制到:

```
<app data dir>/wasm-plugins/source/my-scanner-plugin/
```

(在 Windows 上,`<app data dir>` 是 `%APPDATA%\com.bloppy.concourse\`。)然后打开
Concourse 的 Settings(设置) → Source(来源)标签页 —— 你的插件应该会出现在列表中,可供启用
和扫描。

## 接下来

- [Manifest 参考](./manifest-reference) —— 每一个 `plugin.json` 字段
- [安全模型](./security-model) —— 在你的插件需要超出 `list_dir`/`spawn_process` 的权限之前,
  先了解路径/网络/进程的限定范围机制
- [发布](./publishing) —— 当你准备好分发插件时
