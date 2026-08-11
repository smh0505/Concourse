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
  /** Milestone 17 - a closed-vocabulary JSON AST overriding GameCard's cover-visual region,
   *  optionally present alongside `cssVariables` on a `runtime: "data"` theme manifest.
   *  Untyped here deliberately (not `AstNode` from `theme/cardVisualAst`) - untrusted data
   *  regardless of source, always goes through `validateCardVisualAst` before use (see
   *  `theme/cardVisualRegistry.ts`), same as `ThemePlugin.cardVisual`. */
  cardVisual?: unknown;
  /** Only present for `runtime: "data"` theme manifests wanting a real loaded font - see
   *  `ThemePlugin.fontFaces`'s doc comment (src/plugins/types.ts) for the validation this goes
   *  through before ever being trusted. */
  fontFaces?: unknown;
  /** Milestone 24 - only present for `runtime: "data"` controller-mapping manifests; the whole
   *  plugin's content, mirroring `cssVariables`' role for data-only themes. Untyped here (not
   *  `GamepadMapping` from `types.ts`) since it's remote, untrusted data until actually consumed -
   *  `createDataControllerMappingPlugin` (loader.ts) is what narrows it, same arm's-length
   *  treatment `cardVisual`/`fontFaces` already get. */
  mapping?: unknown;
  /** Milestone 24 - only present for `runtime: "data"` controller-mapping manifests. False for a
   *  pad with no analog sticks - see `GamepadRemapSettings.vue`'s identical prop. Defaults true
   *  when absent (most pads have sticks), matching the Rust-side manifest's own default. */
  hasSticks?: boolean;
  /** Milestone 24 (post-close) - only present for `runtime: "data"` controller-mapping
   *  manifests wanting to reposition the live diagram's buttons. Untyped here (not
   *  `GamepadLayoutButton[]` from `types.ts`) since it's remote, untrusted data until actually
   *  consumed - `createDataControllerMappingPlugin` (loader.ts) is what narrows it. Absent
   *  falls back to `GamepadRemapSettings.vue`'s own built-in default layout. */
  layout?: unknown;
  /** Milestone 24 (post-close) - only present for `runtime: "data"` controller-mapping
   *  manifests wanting a custom controller-body outline instead of the diagram's built-in one.
   *  Untyped here (not `GamepadSilhouette` from `types.ts`) for the same reason `layout` above
   *  is - narrowed by `createDataControllerMappingPlugin`, absent falls back to the built-in
   *  shape. */
  silhouette?: unknown;
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
  /** Milestone 20 - host-added install provenance, not something the plugin/theme author's own
   *  manifest declares. The exact URL this was installed from, so a later update-check can
   *  re-fetch it and compare versions. Absent for build-time TS plugins (never "installed" this
   *  way) and for anything installed by an app build older than this field. */
  sourceUrl?: string;
  /** True if installed via the curated registry's pinned-hash entry rather than a freeform
   *  pasted URL - see `plugin_installer.rs`'s `WasmPluginManifest::installed_via_registry` doc
   *  comment for why this changes the update-check strategy (a registry-pinned `sourceUrl` is
   *  commit-SHA'd and frozen forever; checking for an update means re-fetching the registry's
   *  *current* entry for this plugin's `id`, not re-fetching `sourceUrl` again). */
  installedViaRegistry?: boolean;
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
