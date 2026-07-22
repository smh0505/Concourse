import { defineStore } from "pinia";
import { ref } from "vue";
import { settings as settingsRepo } from "../db";
import { getAvailablePluginManifests, loadEnabledPlugins } from "../plugins/loader";
import { useLibraryStore } from "./library";
import type { PluginManifest } from "../plugins/manifest";
import type { SourcePlugin } from "../plugins/types";

const ENABLED_PLUGINS_SETTING = "enabled_plugins";

export const usePluginStore = defineStore("plugins", () => {
  const manifests = ref<PluginManifest[]>([]);
  const enabledIds = ref<Set<string>>(new Set());
  const loadedPlugins = ref<SourcePlugin[]>([]);
  const scanning = ref(false);
  const lastScanSummary = ref<string | null>(null);

  async function persistEnabledIds() {
    await settingsRepo.set(ENABLED_PLUGINS_SETTING, JSON.stringify([...enabledIds.value]));
  }

  async function reloadPlugins() {
    loadedPlugins.value = await loadEnabledPlugins<SourcePlugin>("source", enabledIds.value);
  }

  async function togglePlugin(id: string) {
    if (enabledIds.value.has(id)) enabledIds.value.delete(id);
    else enabledIds.value.add(id);
    await persistEnabledIds();
    await reloadPlugins();
  }

  async function scanAll() {
    if (loadedPlugins.value.length === 0) {
      lastScanSummary.value = "No plugins enabled.";
      return;
    }

    scanning.value = true;
    lastScanSummary.value = null;
    try {
      const library = useLibraryStore();
      let totalAdded = 0;
      let totalMerged = 0;

      for (const plugin of loadedPlugins.value) {
        const entries = await plugin.scan();
        const { added, merged } = await library.importEntries(entries);
        totalAdded += added;
        totalMerged += merged;
      }

      lastScanSummary.value = `Scan complete: ${totalAdded} added, ${totalMerged} merged.`;
    } catch (e) {
      lastScanSummary.value = `Scan failed: ${String(e)}`;
    } finally {
      scanning.value = false;
    }
  }

  async function init() {
    manifests.value = await getAvailablePluginManifests("source");

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

  return {
    manifests,
    enabledIds,
    loadedPlugins,
    scanning,
    lastScanSummary,
    togglePlugin,
    scanAll,
    init,
  };
});
