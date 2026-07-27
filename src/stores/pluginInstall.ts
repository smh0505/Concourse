import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { usePluginStore } from "./plugins";
import { useThemeStore } from "./theme";
import { useToastStore } from "./toasts";
import type { PluginPreview } from "../plugins/manifest";

/** Shared install-by-URL flow (AddPluginModal -> ConfirmInstallModal) for every plugin kind
 *  that supports it - source (WASM) plugins and data-only themes both go through the same
 *  fetch-preview / confirm / install steps, backed by the merged `plugin_installer.rs`. Kept
 *  as its own store (rather than living in `plugins.ts` or `theme.ts`) since it needs to
 *  refresh whichever of those two stores actually owns the installed kind once done. */
export const usePluginInstallStore = defineStore("pluginInstall", () => {
  const pendingManifest = ref<PluginPreview | null>(null);
  const pendingUrl = ref("");
  const fetchingPreview = ref(false);
  const installing = ref(false);

  async function previewInstall(url: string) {
    const toasts = useToastStore();
    fetchingPreview.value = true;
    try {
      pendingManifest.value = await invoke<PluginPreview>("fetch_plugin_preview", { url });
      pendingUrl.value = url;
    } catch (e) {
      toasts.push(String(e), "error");
    } finally {
      fetchingPreview.value = false;
    }
  }

  function cancelInstall() {
    pendingManifest.value = null;
    pendingUrl.value = "";
  }

  async function confirmInstall() {
    const toasts = useToastStore();
    if (!pendingUrl.value) return;
    const kind = pendingManifest.value?.kind;
    installing.value = true;
    try {
      await invoke("install_plugin", { url: pendingUrl.value });
      if (kind === "source") await usePluginStore().refreshManifests();
      else if (kind === "theme") await useThemeStore().refreshManifests();
      toasts.push("Plugin installed.", "success");
    } catch (e) {
      toasts.push(`Failed to install plugin: ${String(e)}`, "error");
    } finally {
      installing.value = false;
      cancelInstall();
    }
  }

  return {
    pendingManifest,
    fetchingPreview,
    installing,
    previewInstall,
    confirmInstall,
    cancelInstall,
  };
});
