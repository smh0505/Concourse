import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

import { settings as settingsRepo } from "@/db";
import { i18n, messages } from "@/i18n";

type LocaleCode = keyof typeof messages;

const AUTO_LAUNCH_BIG_PICTURE_SETTING = "auto_launch_big_picture";
const LOCALE_SETTING = "locale";
const QUICK_LAUNCH_HOTKEY_SETTING = "quick_launch_hotkey";
const CLOSE_TO_TRAY_SETTING = "close_to_tray";
const DISCORD_PRESENCE_SETTING = "discord_presence_enabled";

const DEFAULT_QUICK_LAUNCH_HOTKEY = "Ctrl+Alt+Space";

export const useAppSettingsStore = defineStore("appSettings", () => {
  const autoLaunchBigPicture = ref(false);
  const locale = ref("en");
  const quickLaunchHotkey = ref(DEFAULT_QUICK_LAUNCH_HOTKEY);
  const closeToTray = ref(true);
  // Global toggle, opt-out (defaults on) - matches how Rich Presence itself normally defaults
  // for supported apps; a per-game skip_discord_presence flag (games.ts) handles the opt-out
  // case. No Rust-side mirroring needed like closeToTray's - library.ts reads this directly and
  // passes it as a plain argument into launch_game/track_folder_playtime per launch, not
  // something Rust needs to know synchronously outside a launch call.
  const discordPresenceEnabled = ref(true);

  async function setAutoLaunchBigPicture(value: boolean) {
    autoLaunchBigPicture.value = value;
    await settingsRepo.set(AUTO_LAUNCH_BIG_PICTURE_SETTING, value ? "true" : "false");
  }

  async function setLocale(value: string) {
    locale.value = value;
    i18n.global.locale.value = value as LocaleCode;
    await settingsRepo.set(LOCALE_SETTING, value);
  }

  /** Persists, then re-registers the OS-level shortcut immediately via the Rust command - the
   *  new binding works right away, no restart needed. */
  async function setQuickLaunchHotkey(value: string) {
    quickLaunchHotkey.value = value;
    await settingsRepo.set(QUICK_LAUNCH_HOTKEY_SETTING, value);
    await invoke("set_quick_launch_hotkey", { shortcut: value });
  }

  /** Persists, then mirrors into Rust's CloseToTrayState - that's the only copy the main
   *  window's CloseRequested handler can read synchronously, so it can't just trust the DB. */
  async function setCloseToTray(value: boolean) {
    closeToTray.value = value;
    await settingsRepo.set(CLOSE_TO_TRAY_SETTING, value ? "true" : "false");
    await invoke("set_close_to_tray", { enabled: value });
  }

  async function setDiscordPresenceEnabled(value: boolean) {
    discordPresenceEnabled.value = value;
    await settingsRepo.set(DISCORD_PRESENCE_SETTING, value ? "true" : "false");
  }

  async function init() {
    autoLaunchBigPicture.value = (await settingsRepo.get(AUTO_LAUNCH_BIG_PICTURE_SETTING)) === "true";
    locale.value = (await settingsRepo.get(LOCALE_SETTING)) || "en";
    i18n.global.locale.value = locale.value as LocaleCode;

    quickLaunchHotkey.value =
      (await settingsRepo.get(QUICK_LAUNCH_HOTKEY_SETTING)) || DEFAULT_QUICK_LAUNCH_HOTKEY;
    if (quickLaunchHotkey.value !== DEFAULT_QUICK_LAUNCH_HOTKEY) {
      // Rust's own setup() already registered the default hotkey before this ever runs -
      // re-register only when the persisted value actually differs from it.
      await invoke("set_quick_launch_hotkey", { shortcut: quickLaunchHotkey.value });
    }

    const storedCloseToTray = await settingsRepo.get(CLOSE_TO_TRAY_SETTING);
    closeToTray.value = storedCloseToTray === null ? true : storedCloseToTray === "true";
    await invoke("set_close_to_tray", { enabled: closeToTray.value });

    const storedDiscordPresence = await settingsRepo.get(DISCORD_PRESENCE_SETTING);
    discordPresenceEnabled.value = storedDiscordPresence === null ? true : storedDiscordPresence === "true";
  }

  return {
    autoLaunchBigPicture,
    locale,
    quickLaunchHotkey,
    closeToTray,
    discordPresenceEnabled,
    setAutoLaunchBigPicture,
    setLocale,
    setQuickLaunchHotkey,
    setCloseToTray,
    setDiscordPresenceEnabled,
    init,
  };
});
