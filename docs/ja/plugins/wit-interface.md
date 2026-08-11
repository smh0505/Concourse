# WITインターフェース

これは、すべてのWASMプラグインがビルドする実際の
[WIT](https://component-model.bytecodealliance.org/design/wit.html)契約です — 信頼できる情報源は
メインリポジトリの`src-tauri/wit/plugin.wit`です。このページはそれを説明するものですが、両者が食い違う
場合はそのファイルの方が正となります。

## `host`インターフェース

以下のホスト関数はそれぞれ、Rustホストが実装しプラグインに公開する機能です - 意図的に、統合ごとの
意味的な関数ではなく汎用的な原始的機能(レジストリ/ファイル/プロセス/ネットワーク/スコープ付き
ストレージ)になっています。ソースプラグインは(例えばベンダー独自のVDF/XML形式をパースするなど)
これらを自ら組み合わせて使い、Concourse側がソースごとに専用のモジュールを書くことはありません。

### レジストリ(Windows)

```wit
read-registry-string: func(hive: string, path: string, value: string) -> option<string>;
list-registry-keys: func(hive: string, path: string) -> result<list<string>, string>;
```

`hive`は`"HKLM"`または`"HKCU"`です。存在しないキー/値はエラーではなく`none`/空リストを返します -
「存在しない」は正常な想定される結果です(例えばプラットフォームがそもそもインストールされているか
確認する場合など)。

### ファイルシステム

```wit
read-file: func(path: string) -> result<string, string>;
write-file: func(path: string, contents: string) -> result<_, string>;
list-dir: func(path: string) -> result<list<string>, string>;
path-exists: func(path: string) -> bool;
remove-dir: func(path: string) -> result<_, string>;
plugin-dir: func() -> result<string, string>;
```

`plugin-dir()`はこのプラグイン自身の書き込み可能なディレクトリ
(`<app data>/wasm-plugins/<kind>/<plugin-id>/`)を返します - 常に暗黙的に読み書き可能です。それ以外の
すべてのパスは、マニフェストが宣言するスコープの範囲内にあるか、実行時にリクエストされる必要があります
([セキュリティモデル](./security-model#path-scoping)参照)。

```wit
request-read-scope: func(path: string) -> result<_, string>;
```

静的に既知ではなく実行時に発見されるディレクトリ(例えばユーザーが実際にSteamをインストールした場所)
向けです - ホストは、プラグインidを認識し*かつ*リクエストされたパスがそのベンダーの実際の構造チェックに
合格した場合にのみこれを許可します。

### プロセス

```wit
spawn-process: func(path: string, args: list<string>) -> result<_, string>;
run-and-wait: func(path: string, args: list<string>, cwd: string) -> result<_, string>;
```

`spawn-process`は撃ちっぱなし(待機/終了コードなし)です - 他の場所で`launch()`が使われる方法と
一致します。Concourse自身のフォルダベースのプレイ時間追跡が、セッション時間を別途カバーします。
`run-and-wait`はプロセスが終了するまでブロックします。これは本当にそうする必要がある場合(例えば
プラグインが続行する前に閉じたことを知る必要がある可視のサードパーティインストーラーウィンドウなど)
のためのものです。どちらも`"run-programs"`機能グラントを必要とします -
[セキュリティモデル](./security-model)参照。

### ネットワーク

```wit
http-get: func(url: string) -> result<string, string>;
download-bytes: func(url: string) -> result<list<u8>, string>;
http-request: func(method: string, url: string, headers: list<tuple<string, string>>, body: option<string>) -> result<string, string>;
```

`http-request`は`http-get`では表現できないもの向けです - カスタムヘッダー(`Authorization`ベアラー
トークン)や、ボディ付きの非GETメソッド(POSTベースのクエリAPIなど)です。バイナリレスポンスには
`http-get`/`http-request`ではなく`download-bytes`を使ってください。

### Zipアーカイブ

```wit
extract-zip: func(bytes: list<u8>, dest-dir: string) -> result<_, string>;
unwrap-single-subdir: func(dir: string) -> result<string, string>;
replace-dir: func(src: string, dest: string) -> result<_, string>;
```

これらを組み合わせることで、一般的な「リリースzipをダウンロードし、展開し、インストールする」という
流れ(`wrapper`プラグインが自身の管理するインストールに使用)をカバーします。`unwrap-single-subdir`は、
リリースzipがアーカイブ名に一致する1つのトップレベルフォルダで内容をラップしている一般的なケースを
処理します。

### スコープ付きストレージ

```wit
settings-get: func(key: string) -> option<string>;
settings-set: func(key: string, value: string);
plugin-data-get: func(game-id: s64, key: string) -> option<string>;
plugin-data-set: func(game-id: s64, key: string, value: string);
```

どちらもホストによってプラグインidごとに自動的に名前空間化されています - あなたのプラグインが
他のプラグインの設定やゲームごとのデータを読み書きしたり、コアアプリのテーブルに直接到達したり
することは決してできません。

## 3つのプラグインワールド

WASMプラグインが実装できる各`kind`は、これらのワールドのいずれか1つをエクスポートします。

### `source-plugin-world`

```wit
interface source-plugin {
    use host.{game-entry};

    scan: func() -> result<list<game-entry>, string>;
    launch: func(entry: game-entry) -> result<_, string>;
    get-install-status: func(entry: game-entry) -> result<bool, string>;
}
```

組み込みの`SourcePlugin` TypeScriptインターフェースを反映しています - WASMソースプラグインは同じ契約の
ドロップイン代替実装です。実装の完全なウォークスルーについては[はじめに](./getting-started)を参照して
ください。

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

互換ラッパー(ロケールエミュレータなど) - 完全に自己完結型です。`install()`は最新リリースを
ダウンロードし、展開し、存在しない場合はデフォルトのプロファイル設定をシードし、それだけができる
登録ステップのために実際のベンダーのインストーラーを実行します。ソースプラグインとは異なり、
どこかに渡すホスト所有のパスは存在しません - プラグインは常に自身の`plugin-dir()`の下の同じ決定論的な
場所にインストール(および解決)します。

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

`search-candidates`はあり得るすべての一致を返します - 通常は0か1ですが、あなた自身のプロバイダの
リスト自体が本当に曖昧な場合(同じタイトルを共有する重複/再発売など)にはそれ以上になることもあります。
ホストは、ちょうど1つの候補が返された場合はそれを自動選択し、複数返された場合はユーザーにピッカーを
表示し、何も返されなかった場合はあなたのプロバイダを完全にスキップします。`fetch-metadata-by-id`は
その後、`id`によって特定された1つの候補の完全なメタデータを取得します。

## `game-entry`と`locale-profile`

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
