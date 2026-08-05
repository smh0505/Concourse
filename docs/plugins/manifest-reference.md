# Manifest Reference

Every plugin — built-in TypeScript, WASM, or a data-only theme — is described by a
`plugin.json` manifest. This page documents every field Concourse's loader understands
(source: `src/plugins/manifest.ts`'s `PluginManifest` interface).

## Core fields (every plugin)

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `string` | yes | Unique identifier. Used as the install directory name for WASM plugins - keep it filesystem-safe. |
| `name` | `string` | yes | Display name shown in Settings. |
| `version` | `string` | yes | Plain SemVer, independent of the app's own version. See [versioning](#versioning) below. |
| `kind` | `"source" \| "theme" \| "metadata" \| "controller" \| "wrapper"` | yes | Which capability this plugin provides - determines what its entry module/component must export. |
| `entry` | `string` | yes | Path to the entry module (built-in TS plugins) or the compiled `.wasm` file (WASM plugins), relative to the plugin's own folder. |
| `runtime` | `"ts" \| "wasm" \| "data"` | no | Absent or `"ts"` = a build-time TypeScript module (only possible for plugins bundled into the app itself). `"wasm"` = a runtime-installed WASM component. `"data"` = a runtime-installed, code-free theme manifest - no `entry` to load at all, `cssVariables` *is* the whole plugin. Third-party plugins are always `"wasm"` (or `"data"` for a code-free theme). |
| `installable` | `boolean` | no | True if this plugin implements the install/uninstall lifecycle (`install()`/`uninstall()`/`isInstalled()`) - drives whether the generic "Install" button UI is shown automatically. |

## Theme-specific fields

Only meaningful for `kind: "theme"`, and only for the data-only (`runtime: "data"`) tier - a
manifest with no compiled code at all:

| Field | Type | Notes |
|---|---|---|
| `cssVariables` | `Record<string, string>` | CSS custom properties (e.g. `"--color-base": "#1e1e2e"`) applied to `:root` while this theme is active. This is the entire content of a data-only theme. |
| `cardVisual` | closed-vocabulary JSON AST | Overrides the game-card's cover-visual region (image-or-placeholder) without needing real code. Validated strictly before use - see `theme/cardVisualAst.ts` in the main repo for the exact node types. |
| `fontFaces` | array of `{ family, url, weight?, style? }` | Real font files to load via `@font-face`. Every field is validated against a strict allowlist (`family`/`weight` against a safe-character pattern, `url` must be `https:`) before any CSS text is constructed, since this is untrusted content going into a real `<style>` block. |

## WASM-plugin fields

| Field | Type | Notes |
|---|---|---|
| `settingsSchema` | array of `{ key, label, type? }` | Declares user-configurable settings (e.g. an API key) - the host renders one generic settings form from this instead of your plugin needing its own custom settings UI. `type: "password"` masks the input. |
| `capabilities` | `string[]` | Which gated host capabilities this plugin actually calls. Today just `"run-programs"` (gates `spawn-process`/`run-and-wait`) - see [Security Model](./security-model). The host enforces this regardless of what you declare here; this field only drives whether the install-confirmation UI asks the user for an explicit grant. |

`pathScopes`/`httpScopes` (declared read access beyond your own plugin directory, and allowed
network hosts) are surfaced in the install-confirmation dialog for user visibility, but are
computed by the host from your plugin's actual WIT-level requests, not declared directly in
`plugin.json` - see [Security Model](./security-model) for how scoping actually works.

## Host-added fields (never set these yourself)

| Field | Type | Notes |
|---|---|---|
| `sourceUrl` | `string` | The exact URL this was installed from - added by the host at install time so a later update check can re-fetch and compare versions. |
| `installedViaRegistry` | `boolean` | True if installed via the curated registry's pinned-hash entry rather than a freeform pasted URL - changes how update-checking works (a registry-pinned `sourceUrl` is commit-SHA'd and frozen forever; checking for an update means re-fetching the registry's *current* entry for this id, not re-fetching `sourceUrl` again). |

## Example: a minimal source plugin manifest

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

## Example: a data-only theme manifest

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "version": "1.0.0",
  "kind": "theme",
  "cssVariables": {
    "--color-base": "#1e1e2e",
    "--color-text": "#cdd6f4",
    "--color-accent": "#89b4fa"
  }
}
```

## Versioning

Plugin versions are plain SemVer, tracked independently from the app's own version:

- **Patch**: bug fix, no manifest/behavior change.
- **Minor**: new capability, backward compatible - still works against the same host WIT
  interface (WASM plugins) or `PluginBase` shape (TS plugins).
- **Major**: breaking change - manifest shape changes, or (WASM plugins) the plugin now requires
  a `wit/plugin.wit` interface version an older Concourse build doesn't have. This is the signal
  "don't install this on an older app build."

Separately-installed WASM plugins and data-only theme manifests conventionally start at
`0.1.0`/`1.0.0` respectively - a content-only theme manifest is stable enough to start at
`1.0.0`, while a WASM plugin with real install/launch logic usually starts at `0.1.0` until
proven in real use.
