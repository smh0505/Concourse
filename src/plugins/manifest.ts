export interface PluginManifest {
  id: string;
  name: string;
  version: string;
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
    typeof m.entry === "string"
  );
}
