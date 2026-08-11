# はじめに: 最小限のソースプラグイン

このページでは、実際に動作するWASM `source`プラグイン — フォルダ内の`.exe`ファイルを見つけ、それぞれを
ゲームとして提供するスキャナー — の構築手順を説明します。これはConcourse自身のリファレンスプラグインである
メインリポジトリの
[`examples/exe-scanner-plugin`](https://github.com/smh0505/Concourse/tree/main/examples/exe-scanner-plugin)
を反映しています。

## 前提条件

```sh
rustup target add wasm32-wasip1   # once
cargo install cargo-component     # once
```

ソースプラグインは普通のRustクレートで、[`cargo-component`](https://github.com/bytecodealliance/cargo-component)
経由でWASMコンポーネントにコンパイルされます — それ以外にConcourse固有のツールチェーンは不要です。

## 1. クレートの雛形を作る

```sh
cargo component new my-scanner-plugin --lib
cd my-scanner-plugin
```

[WITインターフェース](./wit-interface)ページ(またはメインリポジトリの`src-tauri/wit/plugin.wit`から直接)から
`wit/plugin.wit`をコピーし、新しいクレートの`wit/`フォルダに配置してください — これがあなたのプラグインが
実装する契約であり、呼び出せるホスト関数です。

## 2. `source-plugin`ワールドを実装する

ソースプラグインは、`cargo-component`が`world source-plugin-world`から生成する`Guest`トレイトに対して
3つの関数を実装します: `scan`、`launch`、`get-install-status`。以下はリファレンスプラグインの実装全体です。

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

プラグインが*できる*ことはすべて`host::*`関数(`settings_get`、`list_dir`、`spawn_process`、
`path_exists`など)を経由することに注目してください — 直接のファイルシステム/プロセスアクセスは
一切ありません。関数の完全な一覧は[WITインターフェース](./wit-interface)リファレンスを、何が
スコープされどう機能するかは[セキュリティモデル](./security-model)を参照してください。

## 3. ビルドする

```sh
cargo component build
```

出力: `target/wasm32-wasip1/debug/my_scanner_plugin.wasm`。

## 4. マニフェストを書く

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

マニフェストが宣言できるすべてのフィールド(機能、パススコープ、設定スキーマなど)については、
[マニフェストリファレンス](./manifest-reference)を参照してください。

## 5. ローカルで試す

コンパイルされた`.wasm`と`plugin.json`を以下にコピーします。

```
<app data dir>/wasm-plugins/source/my-scanner-plugin/
```

(Windowsでは、`<app data dir>`は`%APPDATA%\com.bloppy.concourse\`です。)その後Concourseの
Settings → Sourceタブを開くと、プラグインがリストに表示され、有効化してスキャンできる状態になります。

## 次に読むもの

- すべての`plugin.json`フィールドについては[マニフェストリファレンス](./manifest-reference)
- プラグインが`list_dir`/`spawn_process`以上のものを必要とする前に、パス/ネットワーク/プロセスの
  スコープを理解するための[セキュリティモデル](./security-model)
- 配布する準備ができたら[公開](./publishing)
