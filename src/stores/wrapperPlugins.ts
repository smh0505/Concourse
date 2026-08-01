import { defineStore } from "pinia";
import { ref } from "vue";
import { settings as settingsRepo } from "../db";
import { getAvailablePluginManifests, loadEnabledPlugins } from "../plugins/loader";
import type { PluginManifest } from "../plugins/manifest";
import type { LocaleProfile, WrapperPlugin } from "../plugins/types";

const ENABLED_WRAPPERS_SETTING = "enabled_wrapper_plugins";
// Default both to enabled (unlike source/metadata plugins, which are opt-in) so existing
// per-game wrapper selections, remapped to these ids by db migration v8, keep working without
// requiring a new opt-in toggle.
const DEFAULT_WRAPPER_IDS = ["locale-remulator-wasm", "locale-emulator-wasm"];

export interface WrapperProfile extends LocaleProfile {
  pluginId: string;
  pluginName: string;
}

export const useWrapperPluginStore = defineStore("wrapperPlugins", () => {
  const manifests = ref<PluginManifest[]>([]);
  const enabledIds = ref<Set<string>>(new Set());
  const loadedPlugins = ref<WrapperPlugin[]>([]);
  const profiles = ref<WrapperProfile[]>([]);

  async function persistEnabledIds() {
    await settingsRepo.set(ENABLED_WRAPPERS_SETTING, JSON.stringify([...enabledIds.value]));
  }

  async function refreshManifests() {
    manifests.value = await getAvailablePluginManifests("wrapper");
  }

  async function refreshProfiles() {
    const perPlugin = await Promise.all(
      loadedPlugins.value.map(async (plugin) => {
        try {
          const list = await plugin.listProfiles();
          return list.map((p) => ({ ...p, pluginId: plugin.id, pluginName: plugin.name }));
        } catch {
          return [];
        }
      }),
    );
    profiles.value = perPlugin.flat();
  }

  async function reloadPlugins() {
    loadedPlugins.value = await loadEnabledPlugins<WrapperPlugin>("wrapper", enabledIds.value);
    await refreshProfiles();
  }

  async function toggleWrapper(id: string) {
    if (enabledIds.value.has(id)) enabledIds.value.delete(id);
    else enabledIds.value.add(id);
    await persistEnabledIds();
    await reloadPlugins();
  }

  /** Launches `executablePath` through whichever enabled wrapper plugin owns `profileGuid`. */
  async function launch(pluginId: string, profileGuid: string, executablePath: string) {
    const plugin = loadedPlugins.value.find((p) => p.id === pluginId);
    if (!plugin) throw new Error(`Wrapper plugin not enabled: ${pluginId}`);
    await plugin.launch(profileGuid, executablePath);
  }

  async function init() {
    manifests.value = await getAvailablePluginManifests("wrapper");

    const stored = await settingsRepo.get(ENABLED_WRAPPERS_SETTING);
    if (stored === null) {
      enabledIds.value = new Set(DEFAULT_WRAPPER_IDS);
      await persistEnabledIds();
    } else {
      try {
        enabledIds.value = new Set(JSON.parse(stored));
      } catch {
        enabledIds.value = new Set();
      }
    }

    await reloadPlugins();
  }

  return {
    manifests,
    enabledIds,
    loadedPlugins,
    profiles,
    toggleWrapper,
    launch,
    refreshProfiles,
    refreshManifests,
    init,
  };
});
