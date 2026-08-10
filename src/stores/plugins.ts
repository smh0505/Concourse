import { defineStore } from "pinia";
import { ref } from "vue";

import { settings as settingsRepo } from "@/db";
import { getAvailablePluginManifests, loadEnabledPlugins } from "@/plugins/loader";
import { useLibraryStore } from "./library";
import { useToastStore } from "./toasts";
import { i18n } from "@/i18n";
import type { PluginManifest } from "@/plugins/manifest";
import type { SourcePlugin } from "@/plugins/types";

const ENABLED_PLUGINS_SETTING = "enabled_plugins";

export const usePluginStore = defineStore("plugins", () => {
  const manifests = ref<PluginManifest[]>([]);
  // Ordered, not just a membership set - scanAll() walks this order, and on a title collision
  // across sources importEntries() overwrites with the later plugin's data, so this order is
  // the source-priority order (last enabled/reordered to the bottom wins a merge conflict).
  const enabledIds = ref<string[]>([]);
  const loadedPlugins = ref<SourcePlugin[]>([]);
  const scanning = ref(false);

  async function refreshManifests() {
    manifests.value = await getAvailablePluginManifests("source");
  }

  async function persistEnabledIds() {
    await settingsRepo.set(ENABLED_PLUGINS_SETTING, JSON.stringify(enabledIds.value));
  }

  async function reloadPlugins() {
    loadedPlugins.value = await loadEnabledPlugins<SourcePlugin>("source", enabledIds.value);
  }

  async function togglePlugin(id: string) {
    const idx = enabledIds.value.indexOf(id);
    if (idx !== -1) enabledIds.value.splice(idx, 1);
    else enabledIds.value.push(id);
    await persistEnabledIds();
    await reloadPlugins();
  }

  async function movePlugin(id: string, direction: -1 | 1) {
    const idx = enabledIds.value.indexOf(id);
    const target = idx + direction;
    if (idx === -1 || target < 0 || target >= enabledIds.value.length) return;
    const [entry] = enabledIds.value.splice(idx, 1);
    enabledIds.value.splice(target, 0, entry);
    await persistEnabledIds();
    await reloadPlugins();
  }

  async function scanAll() {
    const toasts = useToastStore();
    if (loadedPlugins.value.length === 0) {
      toasts.push(i18n.global.t("pluginSettings.noPluginsEnabled"), "error");
      return;
    }

    scanning.value = true;
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

      toasts.push(
        i18n.global.t("pluginSettings.scanComplete", { added: totalAdded, merged: totalMerged }),
        "success",
      );
    } catch (e) {
      toasts.push(i18n.global.t("pluginSettings.scanFailed", { error: String(e) }), "error");
    } finally {
      scanning.value = false;
    }
  }

  async function init() {
    await refreshManifests();

    const stored = await settingsRepo.get(ENABLED_PLUGINS_SETTING);
    if (stored) {
      try {
        enabledIds.value = JSON.parse(stored);
      } catch {
        enabledIds.value = [];
      }
    }

    await reloadPlugins();
  }

  return {
    manifests,
    enabledIds,
    loadedPlugins,
    scanning,
    refreshManifests,
    togglePlugin,
    movePlugin,
    scanAll,
    init,
  };
});
