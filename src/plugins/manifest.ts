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
  /** Declares user-configurable settings a WASM plugin needs (e.g. an API key) - the loader
   *  renders one generic form from this instead of every plugin needing its own custom
   *  settings UI, which WASM plugins have no other mechanism for (unlike TS-authored plugins'
   *  `settingsComponent`). Absent for plugins that need no config. */
  settingsSchema?: SettingsSchemaField[];
  /** Declares which gated host capabilities (Milestone 13) this plugin actually calls - today
   *  just "run-programs" (spawn-process/run-and-wait). Host-enforced regardless of what this
   *  says (see `wasm_plugins.rs`'s `has_capability`) - this only drives whether the UI asks for
   *  an explicit grant at all. Absent/empty for plugins that never need one. */
  capabilities?: string[];
}

export interface SettingsSchemaField {
  key: string;
  label: string;
  /** Controls the rendered `<input>`'s `type` attribute - "password" masks the value. */
  type?: "text" | "password";
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
  capabilities: string[];
  pathScopes: PathScope[];
  httpScopes: string[];
}

/** The one gated capability today (Milestone 13) - a plugin declaring this in its manifest
 *  needs an explicit user grant before spawn-process/run-and-wait will do anything. */
export const RUN_PROGRAMS_CAPABILITY = "run-programs";

/** Mirrors the Rust `PathScope` enum (`wasm_plugins.rs`) - a plugin's self-declared read
 *  scope beyond its own plugin-dir(). Shown in the install-confirmation dialog for visibility
 *  only; the host enforces it regardless of whether anyone ever looks at this. */
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
