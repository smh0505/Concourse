export type PluginKind = "source" | "theme" | "metadata" | "controller";

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
   *  `.wasm` file loaded by the Rust host via wasm_plugin_runtime.rs, not a Vite module. */
  runtime?: "ts" | "wasm";
}

export function isPluginManifest(value: unknown): value is PluginManifest {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.name === "string" &&
    typeof m.version === "string" &&
    (m.kind === "source" || m.kind === "theme" || m.kind === "metadata" || m.kind === "controller") &&
    typeof m.entry === "string" &&
    (m.runtime === undefined || m.runtime === "ts" || m.runtime === "wasm")
  );
}
