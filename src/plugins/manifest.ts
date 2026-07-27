export type PluginKind = "source" | "theme" | "metadata" | "controller" | "wrapper";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  /** Which capability this plugin provides — determines what its entry module must export. */
  kind: PluginKind;
  /** Path to the entry module, relative to the plugin's own folder (e.g. "index.ts"). */
  entry: string;
  /** Absent/"ts" = build-time TS module discovered via Vite (the default, existing kind of
   *  plugin). "wasm" = runtime-installed WASM component (Milestone 8) - `entry` is a
   *  `.wasm` file loaded by the Rust host via wasm_plugin_runtime.rs, not a Vite module.
   *  "data" = runtime-installed, code-free theme manifest (Milestone 8.5) - no `entry` to
   *  load at all, the manifest's own `cssVariables` field *is* the whole plugin. */
  runtime?: "ts" | "wasm" | "data";
  /** True if this plugin implements the `Installable` shape (`install()`/`isInstalled()` -
   *  see src/plugins/types.ts). Not implied by `kind` - any plugin, of any kind, can opt in.
   *  Drives whether the loader auto-attaches the generic InstallableStatus.vue settings UI
   *  when the plugin doesn't already provide its own settingsComponent. */
  installable?: boolean;
  /** Only present for `runtime: "data"` theme manifests - the whole plugin's content, since
   *  there's no separate compiled/bundled entry module to load it from. */
  cssVariables?: Record<string, string>;
}

/** Returned by the backend's `fetch_plugin_preview` - just enough to show a confirm-before-
 *  install dialog (id/name/version/kind) before actually downloading a plugin's real content
 *  (a `.wasm` binary, or a theme's `cssVariables`). Deliberately narrower than `PluginManifest`
 *  (no `entry`, no `runtime`) since a preview isn't a fully-loadable plugin yet. */
export interface PluginPreview {
  id: string;
  name: string;
  version: string;
  kind: PluginKind;
}

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
