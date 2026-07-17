import { defineStore } from "pinia";
import { ref } from "vue";
import { settings as settingsRepo } from "../db";
import { getAvailablePluginManifests, loadEnabledPlugins } from "../plugins/loader";
import type { PluginManifest } from "../plugins/manifest";
import type { SourcePlugin } from "../plugins/types";

const ENABLED_PLUGINS_SETTING = "enabled_plugins";

export const usePluginStore = defineStore("plugins", () => {
  const manifests = ref<PluginManifest[]>([]);
  const enabledIds = ref<Set<string>>(new Set());
  const loadedPlugins = ref<SourcePlugin[]>([]);

  async function persistEnabledIds() {
    await settingsRepo.set(ENABLED_PLUGINS_SETTING, JSON.stringify([...enabledIds.value]));
  }

  async function reloadPlugins() {
    loadedPlugins.value = await loadEnabledPlugins(enabledIds.value);
  }

  async function togglePlugin(id: string) {
    if (enabledIds.value.has(id)) enabledIds.value.delete(id);
    else enabledIds.value.add(id);
    await persistEnabledIds();
    await reloadPlugins();
  }

  async function init() {
    manifests.value = getAvailablePluginManifests();

    const stored = await settingsRepo.get(ENABLED_PLUGINS_SETTING);
    if (stored) {
      try {
        enabledIds.value = new Set(JSON.parse(stored));
      } catch {
        enabledIds.value = new Set();
      }
    }

    await reloadPlugins();
  }

  return { manifests, enabledIds, loadedPlugins, togglePlugin, init };
});
