import { defineStore } from "pinia";
import { ref } from "vue";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useToastStore } from "./toasts";

export const useAppUpdateStore = defineStore("appUpdate", () => {
  const available = ref<Update | null>(null);
  const checking = ref(false);
  const installing = ref(false);
  // A dismissed update stays dismissed until a newer version ships - re-checking (app focus,
  // install-plugin modal open) shouldn't re-surface the same version the user already said
  // "later" to.
  let dismissedVersion: string | null = null;

  async function checkForUpdate() {
    if (checking.value || installing.value) return;
    checking.value = true;
    try {
      const update = await check();
      if (update && update.version !== dismissedVersion) {
        available.value = update;
      }
    } catch (e) {
      console.error("Update check failed:", e);
    } finally {
      checking.value = false;
    }
  }

  function dismiss() {
    if (available.value) dismissedVersion = available.value.version;
    available.value = null;
  }

  async function installUpdate() {
    if (!available.value) return;
    const toasts = useToastStore();
    installing.value = true;
    try {
      await available.value.downloadAndInstall();
      await relaunch();
    } catch (e) {
      toasts.push(`Update failed: ${String(e)}`, "error");
      installing.value = false;
    }
  }

  return { available, checking, installing, checkForUpdate, dismiss, installUpdate };
});
