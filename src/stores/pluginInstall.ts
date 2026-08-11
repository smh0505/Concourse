import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

import { usePluginStore } from "./plugins";
import { useMetadataProviderStore } from "./metadataProviders";
import { useThemeStore } from "./theme";
import { useControllerMappingStore } from "./controllerMapping";
import { useToastStore } from "./toasts";
import { i18n } from "@/i18n";
import type { PluginPreview } from "@/plugins/manifest";

/** Mirrors the Rust `InstallResult` (`plugin_installer.rs`) - Milestone 14's provenance
 *  verification is advisory only, surfaced here rather than enforced (install always
 *  proceeds regardless of `verified`). */
interface InstallResult {
  id: string;
  verified: boolean;
  verificationNote: string;
}

/** Mirrors the Rust `RegistryEntry` (`plugin_registry.rs`) - one hand-reviewed, pinned-hash
 *  entry from github.com/smh0505/concourse-plugin-registry. Unlike `verified` above, a
 *  mismatch against `wasmSha256` is a hard install reject, not advisory - this hash was
 *  chosen by hand after actually reviewing that specific version. */
export interface RegistryEntry {
  id: string;
  name: string;
  kind: string;
  repo: string;
  manifestUrl: string;
  wasmSha256: string;
}

/** Shared install-by-URL flow (modalForms/AddPlugin -> modalForms/ConfirmInstall) for every plugin kind
 *  that supports it - source (WASM) plugins and data-only themes both go through the same
 *  fetch-preview / confirm / install steps, backed by the merged `plugin_installer.rs`. Kept
 *  as its own store (rather than living in `plugins.ts` or `theme.ts`) since it needs to
 *  refresh whichever of those two stores actually owns the installed kind once done. */
export const usePluginInstallStore = defineStore("pluginInstall", () => {
  const pendingManifest = ref<PluginPreview | null>(null);
  const pendingUrl = ref("");
  // Set only when previewing a registry entry (not a freeform-pasted URL) - carried through to
  // confirmInstall's install_plugin call, where the host hard-rejects on mismatch. null for
  // any freeform-URL install, which never gets this check.
  const pendingExpectedSha256 = ref<string | null>(null);
  const fetchingPreview = ref(false);
  const installing = ref(false);

  const registryEntries = ref<RegistryEntry[]>([]);
  const loadingRegistry = ref(false);

  async function loadRegistry() {
    loadingRegistry.value = true;
    try {
      registryEntries.value = await invoke<RegistryEntry[]>("fetch_plugin_registry");
    } catch {
      // Registry being unreachable isn't an error worth toasting - freeform install-by-URL
      // still works fine either way, this is just an additional, more-trusted path.
      registryEntries.value = [];
    } finally {
      loadingRegistry.value = false;
    }
  }

  async function previewInstall(url: string, expectedSha256: string | null = null) {
    const toasts = useToastStore();
    fetchingPreview.value = true;
    try {
      pendingManifest.value = await invoke<PluginPreview>("fetch_plugin_preview", { url });
      pendingUrl.value = url;
      pendingExpectedSha256.value = expectedSha256;
    } catch (e) {
      toasts.push(String(e), "error");
    } finally {
      fetchingPreview.value = false;
    }
  }

  function cancelInstall() {
    pendingManifest.value = null;
    pendingUrl.value = "";
    pendingExpectedSha256.value = null;
  }

  async function confirmInstall() {
    const toasts = useToastStore();
    if (!pendingUrl.value) return;
    const kind = pendingManifest.value?.kind;
    installing.value = true;
    try {
      const result = await invoke<InstallResult>("install_plugin", {
        url: pendingUrl.value,
        expectedSha256: pendingExpectedSha256.value,
      });
      if (kind === "source") await usePluginStore().refreshManifests();
      else if (kind === "metadata") await useMetadataProviderStore().refreshManifests();
      else if (kind === "theme") await useThemeStore().refreshManifests();
      else if (kind === "controller") await useControllerMappingStore().refreshManifests();
      toasts.push(i18n.global.t("pluginInstall.installed"), "success");
      toasts.push(result.verificationNote, result.verified ? "success" : "info");
    } catch (e) {
      toasts.push(i18n.global.t("pluginInstall.installFailed", { error: String(e) }), "error");
    } finally {
      installing.value = false;
      cancelInstall();
    }
  }

  return {
    pendingManifest,
    fetchingPreview,
    installing,
    registryEntries,
    loadingRegistry,
    loadRegistry,
    previewInstall,
    confirmInstall,
    cancelInstall,
  };
});
