import { defineStore } from "pinia";
import { ref } from "vue";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

import { useToastStore } from "./toasts";

export const useAppUpdateStore = defineStore("appUpdate", () => {
  const checking = ref(false);
  // A dismissed update stays dismissed until a newer version ships - re-checking (app focus,
  // install-plugin modal open) shouldn't re-surface the same version the user already said
  // "later" to.
  let dismissedVersion: string | null = null;
  // Tracks the currently-offered update toast (if any) so a re-check while it's still open
  // doesn't stack a second, identical toast on top of it.
  let activeToastId: number | null = null;

  function clearActiveToast() {
    if (activeToastId !== null) {
      useToastStore().dismiss(activeToastId);
      activeToastId = null;
    }
  }

  // update is captured directly in these closures, never stored in a Vue ref/reactive - Update
  // is a real class backed by private fields (it wraps a Tauri resource handle via `Resource`),
  // and putting it through Vue's reactivity would wrap it in a Proxy whose `this` fails the
  // class's private-field checks the moment downloadAndInstall() is called (see the earlier fix
  // for this exact bug). A plain closure variable is never proxied at all, so this is safe by
  // construction rather than needing a shallowRef workaround.
  async function applyUpdate(update: Update) {
    const toasts = useToastStore();
    clearActiveToast();
    toasts.push(`Downloading Concourse ${update.version}...`, "info");
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      toasts.push(`Update failed: ${String(e)}`, "error");
    }
  }

  function offerUpdate(update: Update) {
    const toasts = useToastStore();
    activeToastId = toasts.pushAction(
      `Concourse ${update.version} is available (you're on ${update.currentVersion}).`,
      [
        { label: "Update Now", onClick: () => applyUpdate(update) },
        {
          label: "Later",
          onClick: () => {
            dismissedVersion = update.version;
            clearActiveToast();
          },
        },
      ],
    );
  }

  async function checkForUpdate() {
    if (checking.value || activeToastId !== null) return;
    checking.value = true;
    try {
      const update = await check();
      if (update && update.version !== dismissedVersion) {
        offerUpdate(update);
      }
    } catch (e) {
      console.error("Update check failed:", e);
    } finally {
      checking.value = false;
    }
  }

  return { checking, checkForUpdate };
});
