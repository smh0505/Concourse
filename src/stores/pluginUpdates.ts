import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

import { usePluginStore } from "./plugins";
import { useMetadataProviderStore } from "./metadataProviders";
import { useThemeStore } from "./theme";
import { useWrapperPluginStore } from "./wrapperPlugins";
import { useToastStore } from "./toasts";
import type { PluginManifest } from "@/plugins/manifest";

export interface UpdateCheckResult {
  id: string;
  updateAvailable: boolean;
  latestVersion: string | null;
  latestManifestUrl: string | null;
  /** The registry's pinned hash for the update, if this was a registry-sourced install - see
   *  the Rust `UpdateCheckResult::latest_sha256` doc comment. `null` for a direct-URL install. */
  latestSha256: string | null;
}

/** Mirrors the Rust `InstallResult` (`plugin_installer.rs`) - same shape `pluginInstall.ts`'s
 *  `confirmInstall` already uses for a fresh install; applying an update goes through the
 *  identical `install_plugin` command, just re-triggered with the *new* manifest URL instead
 *  of a freshly user-typed one. */
interface InstallResult {
  id: string;
  verified: boolean;
  verificationNote: string;
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

  /** Applies a pending update - reuses the exact same `install_plugin` command a fresh install
   *  goes through (installing over an existing id is just an overwrite, see
   *  `plugin_installer.rs`'s `replace_dir`), re-triggered with the update's own
   *  `latestManifestUrl`/`latestSha256` instead of a freshly user-typed URL/registry pick. No
   *  separate confirm-install dialog first, unlike a brand-new install - this id is already
   *  installed and trusted, an update is refreshing it, not vetting something unknown. */
  async function applyUpdate(manifest: PluginManifest) {
    const result = results.value[manifest.id];
    if (!result?.updateAvailable || !result.latestManifestUrl) return;
    const toasts = useToastStore();
    try {
      await invoke<InstallResult>("install_plugin", {
        url: result.latestManifestUrl,
        expectedSha256: result.latestSha256,
      });
      if (manifest.kind === "source") await usePluginStore().refreshManifests();
      else if (manifest.kind === "metadata") await useMetadataProviderStore().refreshManifests();
      else if (manifest.kind === "theme") await useThemeStore().refreshManifests();
      else if (manifest.kind === "wrapper") await useWrapperPluginStore().refreshManifests();

      const updated = { ...results.value };
      delete updated[manifest.id];
      results.value = updated;
      toasts.push(`${manifest.name} updated to ${result.latestVersion}.`, "success");
    } catch (e) {
      toasts.push(`Failed to update ${manifest.name}: ${String(e)}`, "error");
    }
  }

  return { results, checkOne, checkAll, isUpdateAvailable, applyUpdate };
});
