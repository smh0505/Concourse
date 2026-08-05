# Plugin Architecture Overview

Concourse aggregates games from many sources into one library, and re-skins itself, through a
single plugin system with five kinds. Every kind shares one manifest format and loader; what
differs is the contract a plugin of that kind implements.

## The five plugin kinds

| Kind | Job | Selection |
|---|---|---|
| `source` | Scan a platform (Steam, GOG, Epic, ...) for installed games, launch them | multi-enabled |
| `theme` | Re-skin colors/fonts/card visuals | exclusive (one active at a time) |
| `metadata` | Fetch description/release date/art for a game from an external database | multi-enabled |
| `controller` | Map physical gamepad buttons/axes for Big Picture navigation | exclusive |
| `wrapper` | Launch a game through a compatibility layer it manages itself (e.g. a locale emulator) | multi-enabled |

Source and metadata-provider plugins are independently **multi-enabled** (checkboxes in
Settings) — you can run several source plugins and several metadata providers at once, each
contributing games/fields the others don't. Theme and controller-mapping plugins are **exclusive
single-select** (radio) — you're always browsing one skin and one physical input scheme at a
time.

## Two ways to ship a plugin

1. **WASM plugin** — a separately-installed `.wasm` component, downloaded by URL (or via the
   curated registry) at runtime, running in a sandboxed [wasmtime](https://wasmtime.dev/)
   Component Model instance. This is the path for third-party `source`/`wrapper`/`metadata`
   plugins today — see [Getting Started](./getting-started) and the
   [WIT Interface](./wit-interface) reference.
2. **Data-only theme manifest** — for `theme` plugins specifically, a manifest can be pure JSON
   (`cssVariables`/`cardVisual`/`fontFaces`, no code at all) if it doesn't need the full WASM
   plugin machinery. See the [Manifest Reference](./manifest-reference)'s `cssVariables`/
   `cardVisual`/`fontFaces` fields.

WASM plugins only exist for the three kinds a
[WIT world](https://component-model.bytecodealliance.org/design/wit.html) has been defined for
so far: `source`, `wrapper`, `metadata`. Building a third-party `theme` plugin today means the
data-only manifest path above. There's currently no third-party path for `controller` mapping
plugins - Concourse's built-in gamepad mappings are compiled directly into the app, and adding a
new one today means contributing to Concourse itself rather than shipping a separate plugin.

## Why WASM, not native code or scripting

Concourse used to consider downloadable native executables and a scripting language for
third-party plugins. Both were rejected for the same reason: a plugin needs real filesystem/
registry/network/process access to do its job (scanning a Steam install, launching a game
through a wrapper), and neither option can grant *scoped* access — a native binary or an
unsandboxed script gets the same privileges as the whole app. WASM via the Component Model gets
genuine capability-based sandboxing instead: a plugin only gets a `host` interface function if
Concourse's Rust side implements and grants it, and even then, most functions are further scoped
per-plugin (see [Security Model](./security-model)).

## Next

- [Getting Started](./getting-started) — build a minimal WASM source plugin end-to-end
- [Manifest Reference](./manifest-reference) — every `plugin.json` field
- [WIT Interface](./wit-interface) — the actual host capability surface and plugin worlds
- [Security Model](./security-model) — path scopes, capability gating, signing
- [Publishing](./publishing) — submitting to the curated plugin registry
