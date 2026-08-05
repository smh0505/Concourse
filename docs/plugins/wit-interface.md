# WIT Interface

This is the actual [WIT](https://component-model.bytecodealliance.org/design/wit.html) contract
every WASM plugin builds against — the source of truth is `src-tauri/wit/plugin.wit` in the main
repo; this page explains it, but that file is authoritative if the two ever disagree.

## The `host` interface

Every host function below is a capability the Rust host implements and exposes to your plugin -
deliberately generic primitives (registry/file/process/network/scoped-storage) rather than
semantic, per-integration functions. A source plugin composes these itself (e.g. parsing a
vendor's own VDF/XML format) instead of Concourse writing a bespoke module per source.

### Registry (Windows)

```wit
read-registry-string: func(hive: string, path: string, value: string) -> option<string>;
list-registry-keys: func(hive: string, path: string) -> result<list<string>, string>;
```

`hive` is `"HKLM"` or `"HKCU"`. A missing key/value returns `none`/an empty list, not an error -
"doesn't exist" is a normal, expected outcome (e.g. checking if a platform is installed at all).

### Filesystem

```wit
read-file: func(path: string) -> result<string, string>;
write-file: func(path: string, contents: string) -> result<_, string>;
list-dir: func(path: string) -> result<list<string>, string>;
path-exists: func(path: string) -> bool;
remove-dir: func(path: string) -> result<_, string>;
plugin-dir: func() -> result<string, string>;
```

`plugin-dir()` returns this plugin's own writable directory
(`<app data>/wasm-plugins/<kind>/<plugin-id>/`) - always implicitly readable/writable. Every
other path needs to fall within a scope your manifest declares, or be requested at runtime (see
[Security Model](./security-model#path-scoping)).

```wit
request-read-scope: func(path: string) -> result<_, string>;
```

For a directory discovered at runtime rather than known statically (e.g. wherever the user
actually installed Steam) - the host only grants this if it recognizes your plugin id *and* the
path passes a real structural check for that vendor.

### Process

```wit
spawn-process: func(path: string, args: list<string>) -> result<_, string>;
run-and-wait: func(path: string, args: list<string>, cwd: string) -> result<_, string>;
```

`spawn-process` is fire-and-forget (no wait/exit-code) - matches how `launch()` is used
elsewhere; Concourse's own folder-based playtime tracking covers session duration separately.
`run-and-wait` blocks until the process exits, for cases that genuinely need to (e.g. a visible
third-party installer window your plugin needs to know has closed before continuing). Both
require the `"run-programs"` capability grant - see [Security Model](./security-model).

### Network

```wit
http-get: func(url: string) -> result<string, string>;
download-bytes: func(url: string) -> result<list<u8>, string>;
http-request: func(method: string, url: string, headers: list<tuple<string, string>>, body: option<string>) -> result<string, string>;
```

`http-request` is for anything `http-get` can't express - custom headers (an `Authorization`
bearer token) or a non-GET method with a body (e.g. a POST-based query API). Use
`download-bytes` instead of `http-get`/`http-request` for binary responses.

### Zip archives

```wit
extract-zip: func(bytes: list<u8>, dest-dir: string) -> result<_, string>;
unwrap-single-subdir: func(dir: string) -> result<string, string>;
replace-dir: func(src: string, dest: string) -> result<_, string>;
```

Together these cover the common "download a release zip, extract it, and install it" flow (used
by `wrapper` plugins for their own managed installs). `unwrap-single-subdir` handles the common
case where a release zip wraps its contents in one top-level folder matching the archive name.

### Scoped storage

```wit
settings-get: func(key: string) -> option<string>;
settings-set: func(key: string, value: string);
plugin-data-get: func(game-id: s64, key: string) -> option<string>;
plugin-data-set: func(game-id: s64, key: string, value: string);
```

Both auto-namespaced by the host per plugin id - your plugin can never read or write another
plugin's settings or per-game data, or reach a core app table directly.

## The three plugin worlds

Each `kind` a WASM plugin can implement exports one of these worlds:

### `source-plugin-world`

```wit
interface source-plugin {
    use host.{game-entry};

    scan: func() -> result<list<game-entry>, string>;
    launch: func(entry: game-entry) -> result<_, string>;
    get-install-status: func(entry: game-entry) -> result<bool, string>;
}
```

Mirrors the built-in `SourcePlugin` TypeScript interface - a WASM source plugin is a drop-in
alternative implementation of the same contract. See [Getting Started](./getting-started) for a
full walkthrough of implementing one.

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

A compatibility wrapper (e.g. a locale emulator) - fully self-contained. `install()` downloads
the latest release, extracts it, seeds a default profile config if none exists, and runs the
real vendor installer for whatever registration step only it can do. Unlike source plugins,
there's no host-owned path to pass in anywhere - the plugin always installs to (and resolves)
the same deterministic location under its own `plugin-dir()`.

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

`search-candidates` returns every plausible match - usually 0 or 1, but can be more when your
provider's own listings are genuinely ambiguous (e.g. a duplicate/reissue sharing the same
title). The host auto-picks the sole candidate when exactly one comes back, shows the user a
picker when more than one does, and skips your provider entirely when none do.
`fetch-metadata-by-id` then fetches full metadata for one specific candidate by its `id`.

## `game-entry` and `locale-profile`

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
