import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { PluginManifest } from "../plugins/manifest";

export interface UpdateCheckResult {
  id: string;
  updateAvailable: boolean;
  latestVersion: string | null;
  latestManifestUrl: string | null;
}

/** Tracks `check_plugin_update` results per plugin/theme id, for the "update available"
 *  indicator in PluginSettings.vue. Only runtime-installed plugins/themes (`runtime === "wasm"
 *  | "data"`) were ever installed through the pipeline that records `sourceUrl`/
 *  `installedViaRegistry` at all - a build-time TS plugin has neither, so checking one would be
 *  meaningless (there's no origin to re-fetch), not just a wasted network call. */
export const usePluginUpdatesStore = defineStore("pluginUpdates", () => {
  const results = ref<Record<string, UpdateCheckResult>>({});

  async function checkOne(manifest: PluginManifest) {
    if (manifest.runtime !== "wasm" && manifest.runtime !== "data") return;
    try {
      const result = await invoke<UpdateCheckResult>("check_plugin_update", {
        id: manifest.id,
        currentVersion: manifest.version,
        sourceUrl: manifest.sourceUrl ?? null,
        installedViaRegistry: manifest.installedViaRegistry ?? false,
      });
      results.value = { ...results.value, [manifest.id]: result };
    } catch (e) {
      console.error(`Update check failed for ${manifest.id}:`, e);
    }
  }

  async function checkAll(manifests: PluginManifest[]) {
    await Promise.all(manifests.map(checkOne));
  }

  function isUpdateAvailable(id: string): boolean {
    return results.value[id]?.updateAvailable ?? false;
  }

  return { results, checkOne, checkAll, isUpdateAvailable };
});
