import { defineStore } from "pinia";
import { ref } from "vue";
import { settings as settingsRepo } from "../db";

const AUTO_LAUNCH_BIG_PICTURE_SETTING = "auto_launch_big_picture";

export const useAppSettingsStore = defineStore("appSettings", () => {
  const autoLaunchBigPicture = ref(false);

  async function setAutoLaunchBigPicture(value: boolean) {
    autoLaunchBigPicture.value = value;
    await settingsRepo.set(AUTO_LAUNCH_BIG_PICTURE_SETTING, value ? "true" : "false");
  }

  async function init() {
    autoLaunchBigPicture.value = (await settingsRepo.get(AUTO_LAUNCH_BIG_PICTURE_SETTING)) === "true";
  }

  return { autoLaunchBigPicture, setAutoLaunchBigPicture, init };
});
