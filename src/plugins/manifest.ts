export type PluginKind = "source" | "theme" | "metadata";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  /** Which capability this plugin provides — determines what its entry module must export. */
  kind: PluginKind;
  /** Path to the entry module, relative to the plugin's own folder (e.g. "index.ts"). */
  entry: string;
}

export function isPluginManifest(value: unknown): value is PluginManifest {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.name === "string" &&
    typeof m.version === "string" &&
    (m.kind === "source" || m.kind === "theme" || m.kind === "metadata") &&
    typeof m.entry === "string"
  );
}
