import { invoke } from "@tauri-apps/api/core";
import { defineComponent, h } from "vue";

import { isPluginManifest, type PluginKind, type PluginManifest } from "./manifest";
import type {
  GameEntry,
  Installable,
  LocaleProfile,
  MetadataCandidate,
  MetadataProviderPlugin,
  MetadataResult,
  PluginBase,
  SourcePlugin,
  ThemePlugin,
  WrapperPlugin,
} from "./types";
import InstallableStatus from "@/components/desktop/common/InstallableStatus.vue";
import SettingsButton from "@/components/desktop/modalForms/SettingsButton.vue";
import { useWrapperPluginStore } from "@/stores/wrapperPlugins";

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
 *  discovered by Vite at build time - only "source", "wrapper", and "metadata" are supported
 *  so far (the only kinds a WIT world exists for), so this is skipped for other kinds. */
const WASM_SUPPORTED_KINDS: readonly PluginKind[] = ["source", "wrapper", "metadata"];

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

/** Data-only theme manifests (Milestone 8.5) are installed at runtime the same way WASM
 *  plugins are (app-data dir), but have no compiled entry to load at all - the manifest's own
 *  `cssVariables` field is the entire plugin, so this is the only "installed" tier that isn't
 *  restricted by kind the way WASM_SUPPORTED_KINDS is (there's no WIT world to support). */
async function getInstalledDataThemeManifests(kind?: PluginKind): Promise<PluginManifest[]> {
  if (kind && kind !== "theme") return [];
  try {
    const manifests = await invoke<PluginManifest[]>("list_data_themes");
    return manifests.map((m) => ({ ...m, kind: "theme" as const, entry: "", runtime: "data" as const }));
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
  manifests.push(...(await getInstalledDataThemeManifests(kind)));
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

/** Attaches the generic SettingsButton.vue for any WASM plugin that declares a non-empty
 *  settingsSchema and doesn't already have its own settingsComponent - lets a WASM plugin
 *  collect user-typed config (e.g. an API key) without any custom UI code, on either side. */
function attachSettingsSchemaForm(manifest: PluginManifest, plugin: PluginBase): void {
  if (!manifest.settingsSchema?.length || plugin.settingsComponent) return;
  const schema = manifest.settingsSchema;
  plugin.settingsComponent = defineComponent({
    render: () =>
      h(SettingsButton, { title: `${manifest.name} Settings`, pluginId: manifest.id, schema }),
  });
}

/** Thin wrapper implementing MetadataProviderPlugin over wasm_plugin_runtime.rs's
 *  wasm_plugin_search_candidates/wasm_plugin_fetch_metadata_by_id - config (API keys etc.) is
 *  collected via attachSettingsSchemaForm below, not passed as arguments here, since the plugin
 *  reads its own settings back via host::settings-get the same way it would if it had set them
 *  itself. */
function createWasmMetadataProviderPlugin(manifest: PluginManifest): MetadataProviderPlugin {
  const plugin: MetadataProviderPlugin = {
    id: manifest.id,
    name: manifest.name,
    searchCandidates: (title: string) =>
      invoke<MetadataCandidate[]>("wasm_plugin_search_candidates", { pluginId: manifest.id, title }),
    fetchMetadataById: (id: string) =>
      invoke<MetadataResult | null>("wasm_plugin_fetch_metadata_by_id", { pluginId: manifest.id, id }),
  };
  attachSettingsSchemaForm(manifest, plugin);
  return plugin;
}

/** Each wrapper plugin now fully owns its own install/found-status (install()/isInstalled()
 *  are its own exports, no host-side path to pass in). Uses the generic InstallableStatus.vue
 *  (see attachInstallableStatus below) but passes its own onInstalled hook, since a fresh
 *  install needs wrapperPlugins.profiles refreshed - kind-specific behavior the generic
 *  component deliberately doesn't know about. */
function createWasmWrapperPlugin(manifest: PluginManifest): WrapperPlugin {
  const plugin: WrapperPlugin = {
    id: manifest.id,
    name: manifest.name,
    install: () => invoke("wasm_wrapper_install", { pluginId: manifest.id }),
    uninstall: () => invoke("wasm_wrapper_uninstall", { pluginId: manifest.id }),
    isInstalled: () => invoke<boolean>("wasm_wrapper_is_installed", { pluginId: manifest.id }),
    listProfiles: () => invoke<LocaleProfile[]>("wasm_wrapper_list_profiles", { pluginId: manifest.id }),
    launch: (profileGuid: string, executablePath: string) =>
      invoke("wasm_wrapper_launch", { pluginId: manifest.id, profileGuid, executablePath }),
  };
  plugin.settingsComponent = defineComponent({
    render: () =>
      h(InstallableStatus, {
        plugin,
        onInstallChanged: () => useWrapperPluginStore().refreshProfiles(),
      }),
  });
  return plugin;
}

function isInstallable(plugin: unknown): plugin is PluginBase & Installable {
  const p = plugin as Partial<PluginBase & Installable> | null;
  return (
    !!p &&
    typeof p.install === "function" &&
    typeof p.uninstall === "function" &&
    typeof p.isInstalled === "function"
  );
}

/** Auto-attaches the generic InstallableStatus.vue for any plugin tagged `installable` in its
 *  manifest that doesn't already provide its own settingsComponent - covers any future
 *  TS-authored plugin (of any kind) that implements `Installable` without needing its own
 *  settings UI. WASM plugin kinds with extra needs (e.g. wrapper's profile refresh) set their
 *  own settingsComponent explicitly instead, which takes precedence over this fallback. */
function attachInstallableStatus(manifest: PluginManifest, plugin: PluginBase): void {
  if (!manifest.installable || plugin.settingsComponent || !isInstallable(plugin)) return;
  plugin.settingsComponent = defineComponent({
    render: () => h(InstallableStatus, { plugin }),
  });
}

function createDataThemePlugin(manifest: PluginManifest): ThemePlugin {
  return {
    id: manifest.id,
    name: manifest.name,
    cssVariables: manifest.cssVariables,
    cardVisual: manifest.cardVisual,
    fontFaces: manifest.fontFaces,
  };
}

async function loadPlugin<T>(manifest: PluginManifest): Promise<T | null> {
  if (manifest.runtime === "wasm") {
    if (manifest.kind === "source") return createWasmSourcePlugin(manifest) as T;
    if (manifest.kind === "wrapper") return createWasmWrapperPlugin(manifest) as T;
    if (manifest.kind === "metadata") return createWasmMetadataProviderPlugin(manifest) as T;
    return null;
  }

  if (manifest.runtime === "data") {
    if (manifest.kind === "theme") return createDataThemePlugin(manifest) as T;
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
  const plugin = mod.default as PluginBase;
  attachInstallableStatus(manifest, plugin);
  return plugin as T;
}

/** Loads enabled plugins in enabledIds' own iteration order (not manifest-discovery order) -
 *  for kinds where sequence has real meaning (e.g. metadata providers' first-non-null-wins
 *  merge, source plugins' last-scan-wins field overwrite on a title collision), the caller
 *  controls priority by controlling what order it passes ids in. */
export async function loadEnabledPlugins<T>(
  kind: PluginKind,
  enabledIds: Iterable<string>,
): Promise<T[]> {
  const manifests = await getAvailablePluginManifests(kind);
  const byId = new Map(manifests.map((m) => [m.id, m]));
  const ordered = [...enabledIds]
    .map((id) => byId.get(id))
    .filter((m): m is PluginManifest => m !== undefined);
  const plugins: (T | null)[] = await Promise.all(ordered.map((m) => loadPlugin<T>(m)));
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
