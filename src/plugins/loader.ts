import { invoke } from "@tauri-apps/api/core";
import { defineComponent, h } from "vue";
import { isPluginManifest, type PluginKind, type PluginManifest } from "./manifest";
import type { GameEntry, LocaleProfile, SourcePlugin, WrapperPlugin } from "./types";
import WrapperInstallStatus from "../components/desktop/WrapperInstallStatus.vue";

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

/** WASM plugins are installed at runtime into the app-data dir (Milestone 8), not
 *  discovered by Vite at build time - only "source" and "wrapper" are supported so far (the
 *  only kinds the WIT worlds define an export for), so this is skipped for other kinds. */
const WASM_SUPPORTED_KINDS: readonly PluginKind[] = ["source", "wrapper"];

async function getInstalledWasmManifests(kind?: PluginKind): Promise<PluginManifest[]> {
  if (kind && !WASM_SUPPORTED_KINDS.includes(kind)) return [];
  try {
    const manifests = await invoke<PluginManifest[]>("list_wasm_plugins");
    return manifests
      .filter((m) => (kind ? m.kind === kind : WASM_SUPPORTED_KINDS.includes(m.kind)))
      .map((m) => ({ ...m, runtime: "wasm" as const }));
  } catch {
    return [];
  }
}

export async function getAvailablePluginManifests(kind?: PluginKind): Promise<PluginManifest[]> {
  const manifests: PluginManifest[] = [];
  for (const mod of Object.values(manifestModules)) {
    const data = mod.default;
    if (isPluginManifest(data) && (!kind || data.kind === kind)) manifests.push(data);
  }
  manifests.push(...(await getInstalledWasmManifests(kind)));
  return manifests;
}

/** Thin wrapper implementing SourcePlugin over the wasm_plugin_runtime.rs Tauri commands -
 *  the frontend never talks to WASM plugin code directly, only through these. */
function createWasmSourcePlugin(manifest: PluginManifest): SourcePlugin {
  return {
    id: manifest.id,
    name: manifest.name,
    scan: () => invoke<GameEntry[]>("wasm_plugin_scan", { pluginId: manifest.id }),
    launch: (entry: GameEntry) =>
      invoke("wasm_plugin_launch", { pluginId: manifest.id, entry }),
    getInstallStatus: (entry: GameEntry) =>
      invoke<boolean>("wasm_plugin_get_install_status", { pluginId: manifest.id, entry }),
  };
}

/** Each wrapper plugin now fully owns its own install/found-status (install()/isInstalled()
 *  are its own exports, no host-side path to pass in), so its settingsComponent can be
 *  generic across any wrapper plugin - bound to this specific plugin instance since
 *  settingsComponent is rendered with no props (`<component :is="..." />` in
 *  PluginSettings.vue). Built after the plugin object itself so the component can call back
 *  into it directly. */
function createWasmWrapperPlugin(manifest: PluginManifest): WrapperPlugin {
  const plugin: WrapperPlugin = {
    id: manifest.id,
    name: manifest.name,
    install: () => invoke("wasm_wrapper_install", { pluginId: manifest.id }),
    isInstalled: () => invoke<boolean>("wasm_wrapper_is_installed", { pluginId: manifest.id }),
    listProfiles: () => invoke<LocaleProfile[]>("wasm_wrapper_list_profiles", { pluginId: manifest.id }),
    launch: (profileGuid: string, executablePath: string) =>
      invoke("wasm_wrapper_launch", { pluginId: manifest.id, profileGuid, executablePath }),
  };
  plugin.settingsComponent = defineComponent({
    render: () => h(WrapperInstallStatus, { plugin }),
  });
  return plugin;
}

async function loadPlugin<T>(manifest: PluginManifest): Promise<T | null> {
  if (manifest.runtime === "wasm") {
    if (manifest.kind === "source") return createWasmSourcePlugin(manifest) as T;
    if (manifest.kind === "wrapper") return createWasmWrapperPlugin(manifest) as T;
    return null;
  }

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
  const manifests = (await getAvailablePluginManifests(kind)).filter((m) => enabledIds.has(m.id));
  const plugins: (T | null)[] = await Promise.all(manifests.map((m) => loadPlugin<T>(m)));
  return plugins.filter((p): p is T => p !== null);
}

/** Loads every installed plugin of a kind, regardless of enabled/selected state - used
 *  by the settings panel, which needs each plugin's instance (for its optional
 *  settingsComponent) independent of whether it's currently active. */
export async function loadAllPlugins<T>(kind: PluginKind): Promise<Map<string, T>> {
  const manifests = await getAvailablePluginManifests(kind);
  const entries = await Promise.all(
    manifests.map(async (m) => [m.id, await loadPlugin<T>(m)] as const),
  );
  const map = new Map<string, T>();
  for (const [id, plugin] of entries) {
    if (plugin !== null) map.set(id, plugin);
  }
  return map;
}
