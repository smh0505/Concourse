import { invoke } from "@tauri-apps/api/core";
import { defineComponent, h } from "vue";

import { isPluginManifest, type PluginKind, type PluginManifest } from "./manifest";
import type {
  ControllerMappingPlugin,
  GameEntry,
  GamepadLayoutButton,
  GamepadMapping,
  GamepadSilhouette,
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
import GamepadRemapSettings from "./shared/gamepad/GamepadRemapSettings.vue";
import InstallableStatus from "@/components/desktop/common/InstallableStatus.vue";
import SettingsButton from "@/components/desktop/modalForms/SettingsButton.vue";
import { useWrapperPluginStore } from "@/stores/wrapperPlugins";

// Each plugin lives at src/plugins/<id>/plugin.json + an entry module exporting a SourcePlugin
// or ThemePlugin (per manifest `kind`). Vite discovers both at build time; which plugins run is
// decided at runtime via loadEnabledPlugins' enabled-id set.
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

/** Runtime-installed WASM plugins (Milestone 8) - only kinds a WIT world exists for. */
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

/** Data-only theme manifests (Milestone 8.5) - no compiled entry, `cssVariables` is the whole
 *  plugin. Not kind-restricted like WASM_SUPPORTED_KINDS since there's no WIT world involved. */
async function getInstalledDataThemeManifests(kind?: PluginKind): Promise<PluginManifest[]> {
  if (kind && kind !== "theme") return [];
  try {
    const manifests = await invoke<PluginManifest[]>("list_data_themes");
    return manifests.map((m) => ({ ...m, kind: "theme" as const, entry: "", runtime: "data" as const }));
  } catch {
    return [];
  }
}

/** Data-only controller-mapping manifests (Milestone 24) - same shape as data themes, `mapping`
 *  instead of `cssVariables`. */
async function getInstalledDataControllerManifests(kind?: PluginKind): Promise<PluginManifest[]> {
  if (kind && kind !== "controller") return [];
  try {
    const manifests = await invoke<PluginManifest[]>("list_data_controller_mappings");
    return manifests.map((m) => ({
      ...m,
      kind: "controller" as const,
      entry: "",
      runtime: "data" as const,
    }));
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
  manifests.push(...(await getInstalledDataControllerManifests(kind)));
  return manifests;
}

/** Thin wrapper over wasm_plugin_runtime.rs's Tauri commands - the frontend never talks to WASM
 *  plugin code directly. */
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

/** Attaches the generic SettingsButton.vue for a WASM plugin with a settingsSchema and no
 *  settingsComponent of its own - lets it collect config (e.g. an API key) with no custom UI. */
function attachSettingsSchemaForm(manifest: PluginManifest, plugin: PluginBase): void {
  if (!manifest.settingsSchema?.length || plugin.settingsComponent) return;
  const schema = manifest.settingsSchema;
  plugin.settingsComponent = defineComponent({
    render: () =>
      h(SettingsButton, { title: `${manifest.name} Settings`, pluginId: manifest.id, schema }),
  });
}

/** Thin wrapper over wasm_plugin_search_candidates/wasm_plugin_fetch_metadata_by_id - config is
 *  collected via attachSettingsSchemaForm, not passed here; the plugin reads it back itself via
 *  host::settings-get. */
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

/** A wrapper plugin owns its own install/found-status. Uses the generic InstallableStatus.vue
 *  but with its own onInstallChanged hook, since a fresh install needs wrapperPlugins.profiles
 *  refreshed - the generic component doesn't know about that. */
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

/** Auto-attaches InstallableStatus.vue for any `installable`-tagged plugin without its own
 *  settingsComponent - a fallback; kinds with extra needs (e.g. wrapper's profile refresh) set
 *  their own explicitly instead. */
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

/** Narrows an untrusted remote `mapping` (Rust only checked "is this an object") into a real
 *  `GamepadMapping`, defaulting unrecognized bindings to unassigned - same "must be learned via
 *  Listen" treatment `8bitdo-micro` gives its own unknown indices. */
function normalizeGamepadMapping(raw: unknown): GamepadMapping {
  const m = (raw && typeof raw === "object" ? raw : {}) as Partial<GamepadMapping>;
  const binding = (v: unknown) =>
    v && typeof v === "object" && "kind" in v ? (v as GamepadMapping["dpadUp"]) : null;
  return {
    dpadUp: binding(m.dpadUp),
    dpadDown: binding(m.dpadDown),
    dpadLeft: binding(m.dpadLeft),
    dpadRight: binding(m.dpadRight),
    buttonConfirm: binding(m.buttonConfirm),
    buttonCancel: binding(m.buttonCancel),
    axisThreshold: typeof m.axisThreshold === "number" ? m.axisThreshold : 0.5,
    repeatDelayMs: typeof m.repeatDelayMs === "number" ? m.repeatDelayMs : 350,
    repeatIntervalMs: typeof m.repeatIntervalMs === "number" ? m.repeatIntervalMs : 130,
  };
}

/** Narrows an untrusted remote `layout` into `GamepadLayoutButton[]`, dropping malformed
 *  entries. Returns `undefined` (not `[]`) when absent, so the component can tell "no layout,
 *  use my default" apart from "layout given but empty." */
function normalizeGamepadLayout(raw: unknown): GamepadLayoutButton[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const entries: GamepadLayoutButton[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { index, x, y, shape } = item as Record<string, unknown>;
    if (typeof index !== "number" || typeof x !== "number" || typeof y !== "number") continue;
    entries.push({
      index,
      x,
      y,
      shape: shape === "pill" || shape === "stick" ? shape : "round",
    });
  }
  return entries;
}

/** Same narrowing as `normalizeGamepadLayout` - `viewBox`/`path` required together, else falls
 *  back to `undefined` rather than a half-valid shape. */
function normalizeGamepadSilhouette(raw: unknown): GamepadSilhouette | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { viewBox, path } = raw as Record<string, unknown>;
  if (typeof viewBox !== "string" || typeof path !== "string") return undefined;
  return { viewBox, path };
}

/** Data-only controller mappings have no `index.ts` to attach `GamepadRemapSettings.vue` the
 *  way `standard-gamepad`/`8bitdo-micro` do - the loader attaches it here instead. */
function createDataControllerMappingPlugin(manifest: PluginManifest): ControllerMappingPlugin {
  const plugin: ControllerMappingPlugin = {
    id: manifest.id,
    name: manifest.name,
    mapping: normalizeGamepadMapping(manifest.mapping),
  };
  plugin.settingsComponent = defineComponent({
    render: () =>
      h(GamepadRemapSettings, {
        pluginId: manifest.id,
        defaultMapping: plugin.mapping,
        hasSticks: manifest.hasSticks ?? true,
        layout: normalizeGamepadLayout(manifest.layout),
        silhouette: normalizeGamepadSilhouette(manifest.silhouette),
      }),
  });
  return plugin;
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
    if (manifest.kind === "controller") return createDataControllerMappingPlugin(manifest) as T;
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

/** Loads in enabledIds' own order, not discovery order - lets the caller control priority for
 *  kinds where sequence matters (metadata's first-non-null-wins merge, source's last-scan-wins). */
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

/** Loads every installed plugin of a kind regardless of enabled state - the settings panel
 *  needs each instance (for its optional settingsComponent) independent of activity. */
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
