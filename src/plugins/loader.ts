import { isPluginManifest, type PluginManifest } from "./manifest";
import type { SourcePlugin } from "./types";

// Each plugin lives at src/plugins/<id>/plugin.json + an entry module (e.g. index.ts)
// exporting a SourcePlugin as its default export. Vite discovers both at build time;
// which plugins actually run is decided at runtime via the enabled-id set below.
const manifestModules = import.meta.glob("./*/plugin.json", { eager: true }) as Record<
  string,
  { default: unknown }
>;

const entryLoaders = import.meta.glob("./*/*.ts") as Record<
  string,
  () => Promise<{ default: SourcePlugin }>
>;

function folderOf(manifestPath: string): string {
  return manifestPath.replace(/\/plugin\.json$/, "");
}

export function getAvailablePluginManifests(): PluginManifest[] {
  const manifests: PluginManifest[] = [];
  for (const mod of Object.values(manifestModules)) {
    const data = mod.default;
    if (isPluginManifest(data)) manifests.push(data);
  }
  return manifests;
}

async function loadPlugin(manifest: PluginManifest): Promise<SourcePlugin | null> {
  const manifestPath = Object.keys(manifestModules).find((path) => {
    const data = manifestModules[path].default;
    return isPluginManifest(data) && data.id === manifest.id;
  });
  if (!manifestPath) return null;

  const entryPath = `${folderOf(manifestPath)}/${manifest.entry}`;
  const loadEntry = entryLoaders[entryPath];
  if (!loadEntry) return null;

  const mod = await loadEntry();
  return mod.default;
}

export async function loadEnabledPlugins(enabledIds: ReadonlySet<string>): Promise<SourcePlugin[]> {
  const manifests = getAvailablePluginManifests().filter((m) => enabledIds.has(m.id));
  const plugins = await Promise.all(manifests.map(loadPlugin));
  return plugins.filter((p): p is SourcePlugin => p !== null);
}
