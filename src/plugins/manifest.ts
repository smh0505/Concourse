export type PluginKind = "source" | "theme" | "metadata" | "controller" | "wrapper";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  /** Determines what this plugin's entry module must export. */
  kind: PluginKind;
  /** Entry module path, relative to the plugin's own folder (e.g. "index.ts"). */
  entry: string;
  /** Absent/"ts" = build-time TS module (Vite). "wasm" = runtime-installed WASM component
   *  (Milestone 8), `entry` is a `.wasm` file loaded via wasm_plugin_runtime.rs. "data" =
   *  runtime-installed, code-free manifest (Milestone 8.5) - no `entry`, the data fields below
   *  *are* the plugin. */
  runtime?: "ts" | "wasm" | "data";
  /** True if this plugin implements `Installable` (types.ts). Not implied by `kind` - any kind
   *  can opt in. Auto-attaches InstallableStatus.vue unless settingsComponent is already set. */
  installable?: boolean;
  /** `runtime: "data"` theme manifests only - the whole plugin's content. */
  cssVariables?: Record<string, string>;
  /** Milestone 17 - JSON AST overriding GameCard's cover-visual region, alongside
   *  `cssVariables` on a data theme. Untyped here - untrusted until `validateCardVisualAst`
   *  runs (`theme/cardVisualRegistry.ts`), same as `ThemePlugin.cardVisual`. */
  cardVisual?: unknown;
  /** `runtime: "data"` theme manifests wanting a loaded font - see `ThemePlugin.fontFaces`. */
  fontFaces?: unknown;
  /** Milestone 24 - `runtime: "data"` controller manifests only, mirrors `cssVariables`' role.
   *  Untyped - `createDataControllerMappingPlugin` (loader.ts) narrows it, same arm's-length
   *  treatment as `cardVisual`/`fontFaces`. */
  mapping?: unknown;
  /** Milestone 24 - `runtime: "data"` controller manifests only. False for a pad with no
   *  sticks. Defaults true, matching the Rust-side default. */
  hasSticks?: boolean;
  /** Milestone 24 (post-close) - repositions the live diagram's buttons; untyped/narrowed same
   *  as `mapping`. Absent falls back to the built-in default layout. */
  layout?: unknown;
  /** Milestone 24 (post-close) - custom controller-body outline; untyped/narrowed same as
   *  `layout`. Absent falls back to the built-in shape. */
  silhouette?: unknown;
  /** User-configurable settings a WASM plugin needs (e.g. an API key) - lets the loader render
   *  one generic form instead of every plugin needing its own settings UI. */
  settingsSchema?: SettingsSchemaField[];
  /** Gated host capabilities (Milestone 13) this plugin calls - today just "run-programs".
   *  Host-enforced regardless (see `wasm_plugins.rs`'s `has_capability`); this only drives
   *  whether the UI asks for an explicit grant. */
  capabilities?: string[];
  /** Milestone 20 - host-added install provenance, not author-declared. Lets a later
   *  update-check re-fetch and compare versions. Absent for build-time TS plugins. */
  sourceUrl?: string;
  /** True if installed via the curated registry's pinned hash, not a freeform URL - changes
   *  update-check strategy (see `WasmPluginManifest::installed_via_registry` in
   *  plugin_installer.rs): a registry `sourceUrl` is commit-pinned and never itself shows a
   *  newer version, so an update check re-fetches the registry's current entry instead. */
  installedViaRegistry?: boolean;
}

export interface SettingsSchemaField {
  key: string;
  label: string;
  /** Controls the rendered `<input>`'s `type` attribute - "password" masks the value. */
  type?: "text" | "password";
}

/** From `fetch_plugin_preview` - just enough for a confirm-before-install dialog, before
 *  downloading the real content. Narrower than `PluginManifest` (no `entry`/`runtime`) since
 *  a preview isn't a loadable plugin yet. */
export interface PluginPreview {
  id: string;
  name: string;
  version: string;
  kind: PluginKind;
  capabilities: string[];
  pathScopes: PathScope[];
  httpScopes: string[];
}

/** The one gated capability today (Milestone 13) - needs an explicit user grant before
 *  spawn-process/run-and-wait does anything. */
export const RUN_PROGRAMS_CAPABILITY = "run-programs";

/** Mirrors Rust's `PathScope` enum (`wasm_plugins.rs`) - a plugin's self-declared read scope
 *  beyond its own plugin-dir(). Visibility only in the install dialog; host-enforced either way. */
export type PathScope =
  | { type: "registry"; hive: string; prefix: string }
  | { type: "path"; prefix: string };

export function isPluginManifest(value: unknown): value is PluginManifest {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.name === "string" &&
    typeof m.version === "string" &&
    (m.kind === "source" ||
      m.kind === "theme" ||
      m.kind === "metadata" ||
      m.kind === "controller" ||
      m.kind === "wrapper") &&
    typeof m.entry === "string" &&
    (m.runtime === undefined || m.runtime === "ts" || m.runtime === "wasm" || m.runtime === "data") &&
    (m.installable === undefined || typeof m.installable === "boolean")
  );
}
