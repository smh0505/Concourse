import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { settings as settingsRepo } from "../db";

const AUTO_LAUNCH_BIG_PICTURE_SETTING = "auto_launch_big_picture";
const LOCALE_REMULATOR_PATH_SETTING = "locale_remulator_path";
const LOCALE_EMULATOR_PATH_SETTING = "locale_emulator_path";

export const useAppSettingsStore = defineStore("appSettings", () => {
  const autoLaunchBigPicture = ref(false);
  // Both wrappers ship as portable folders with no reliable auto-detect signal (see
  // locale_remulator.rs/locale_emulator.rs) - the user points these at their extracted
  // LRProc.exe/LEProc.exe once.
  const localeRemulatorPath = ref("");
  const localeEmulatorPath = ref("");

  async function setAutoLaunchBigPicture(value: boolean) {
    autoLaunchBigPicture.value = value;
    await settingsRepo.set(AUTO_LAUNCH_BIG_PICTURE_SETTING, value ? "true" : "false");
  }

  async function setLocaleRemulatorPath(value: string) {
    localeRemulatorPath.value = value;
    await settingsRepo.set(LOCALE_REMULATOR_PATH_SETTING, value);
  }

  async function setLocaleEmulatorPath(value: string) {
    localeEmulatorPath.value = value;
    await settingsRepo.set(LOCALE_EMULATOR_PATH_SETTING, value);
  }

  async function wrapperPathValid(path: string): Promise<boolean> {
    if (!path) return false;
    return invoke<boolean>("wrapper_path_exists", { path });
  }

  async function init() {
    autoLaunchBigPicture.value = (await settingsRepo.get(AUTO_LAUNCH_BIG_PICTURE_SETTING)) === "true";
    localeRemulatorPath.value = (await settingsRepo.get(LOCALE_REMULATOR_PATH_SETTING)) ?? "";
    localeEmulatorPath.value = (await settingsRepo.get(LOCALE_EMULATOR_PATH_SETTING)) ?? "";
  }

  return {
    autoLaunchBigPicture,
    setAutoLaunchBigPicture,
    localeRemulatorPath,
    setLocaleRemulatorPath,
    localeEmulatorPath,
    setLocaleEmulatorPath,
    wrapperPathValid,
    init,
  };
});
