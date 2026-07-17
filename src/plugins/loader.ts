import { isPluginManifest, type PluginKind, type PluginManifest } from "./manifest";

// Each plugin lives at src/plugins/<id>/plugin.json + an entry module (e.g. index.ts)
// exporting a SourcePlugin or ThemePlugin (per manifest `kind`) as its default export.
// Vite discovers both at build time; which plugins actually run is decided at runtime
// via the enabled-id set passed to loadEnabledPlugins.
const manifestModules = import.meta.glob("./*/plugin.json", { eager: true }) as Record<
  string,
  { default: unknown }
>;

const entryLoaders = import.meta.glob("./*/*.ts") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

function folderOf(manifestPath: string): string {
  return manifestPath.replace(/\/plugin\.json$/, "");
}

export function getAvailablePluginManifests(kind?: PluginKind): PluginManifest[] {
  const manifests: PluginManifest[] = [];
  for (const mod of Object.values(manifestModules)) {
    const data = mod.default;
    if (isPluginManifest(data) && (!kind || data.kind === kind)) manifests.push(data);
  }
  return manifests;
}

async function loadPlugin<T>(manifest: PluginManifest): Promise<T | null> {
  const manifestPath = Object.keys(manifestModules).find((path) => {
    const data = manifestModules[path].default;
    return isPluginManifest(data) && data.id === manifest.id;
  });
  if (!manifestPath) return null;

  const entryPath = `${folderOf(manifestPath)}/${manifest.entry}`;
  const loadEntry = entryLoaders[entryPath];
  if (!loadEntry) return null;

  const mod = await loadEntry();
  return mod.default as T;
}

export async function loadEnabledPlugins<T>(
  kind: PluginKind,
  enabledIds: ReadonlySet<string>,
): Promise<T[]> {
  const manifests = getAvailablePluginManifests(kind).filter((m) => enabledIds.has(m.id));
  const plugins: (T | null)[] = await Promise.all(manifests.map((m) => loadPlugin<T>(m)));
  return plugins.filter((p): p is T => p !== null);
}
