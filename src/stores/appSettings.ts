import { defineStore } from "pinia";
import { ref } from "vue";
import { settings as settingsRepo } from "../db";
import { i18n } from "../i18n";

const AUTO_LAUNCH_BIG_PICTURE_SETTING = "auto_launch_big_picture";
const LOCALE_SETTING = "locale";

export const useAppSettingsStore = defineStore("appSettings", () => {
  const autoLaunchBigPicture = ref(false);
  const locale = ref("en");

  async function setAutoLaunchBigPicture(value: boolean) {
    autoLaunchBigPicture.value = value;
    await settingsRepo.set(AUTO_LAUNCH_BIG_PICTURE_SETTING, value ? "true" : "false");
  }

  async function setLocale(value: string) {
    locale.value = value;
    i18n.global.locale.value = value as "en";
    await settingsRepo.set(LOCALE_SETTING, value);
  }

  async function init() {
    autoLaunchBigPicture.value = (await settingsRepo.get(AUTO_LAUNCH_BIG_PICTURE_SETTING)) === "true";
    locale.value = (await settingsRepo.get(LOCALE_SETTING)) || "en";
    i18n.global.locale.value = locale.value as "en";
  }

  return {
    autoLaunchBigPicture,
    locale,
    setAutoLaunchBigPicture,
    setLocale,
    init,
  };
});
