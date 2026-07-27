# exe-scanner-plugin

Reference WASM `SourcePlugin` for Concourse's Milestone 8 plugin system
(`../../src-tauri/wit/plugin.wit`, `../../src-tauri/src/wasm_plugin_runtime.rs`).

Scans a folder (configured via the `scan_dir` setting) for `.exe` files and offers each as a
`GameEntry`. It exists to prove the WASM plugin pipeline end-to-end against a real compiled
component - not a template to copy for shipping plugins, and not installed into the app by
default.

This is a standalone crate, not part of the main Tauri app's build. It targets `wasm32-wasip1`
via [`cargo-component`](https://github.com/bytecodealliance/cargo-component), which this repo
doesn't otherwise depend on.

## Building

```sh
rustup target add wasm32-wasip1   # once
cargo install cargo-component     # once
cargo component build
```

Output: `target/wasm32-wasip1/debug/exe_scanner_plugin.wasm`.

## How it's used

`src-tauri`'s `wasm_plugin_runtime::tests::scans_launches_and_checks_install_status_through_a_real_component`
loads this compiled `.wasm` directly from this crate's `target/` directory, instantiates it,
and calls `scan()`/`getInstallStatus()` through it - so it must be built (see above) before
running `cargo test` in `src-tauri/`.

To try it against the real app instead of the test: copy the compiled `.wasm` plus a
`plugin.json` (`{ "id", "name", "version", "kind": "source", "entry": "<wasm filename>" }`)
into `<app data dir>/wasm-plugins/source/<id>/`, then set a `scan_dir` value for it to scan.
