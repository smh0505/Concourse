import { invoke } from "@tauri-apps/api/core";
import { defineComponent, h } from "vue";

import type { PresencePlugin } from "@/plugins/types";
import ObsPresenceSettings from "./ObsPresenceSettings.vue";

export const OBS_PRESENCE_PORT_SETTING = "obs_presence_port";
// Must match src-tauri/src/obs_presence.rs's DEFAULT_PORT constant.
export const OBS_PRESENCE_DEFAULT_PORT = 47474;

export const OBS_PRESENCE_TEMPLATE_SETTING = "obs_presence_template";
export const OBS_PRESENCE_MODE_SETTING = "obs_presence_mode";
export const OBS_PRESENCE_ALERT_SECONDS_SETTING = "obs_presence_alert_seconds";
// Must match src-tauri/src/obs_presence.rs's OverlayStyle::default().
export const OBS_PRESENCE_DEFAULT_TEMPLATE = "full";
export const OBS_PRESENCE_DEFAULT_MODE = "persistent";
export const OBS_PRESENCE_DEFAULT_ALERT_SECONDS = 5;

// obs_presence.rs's local HTTP server runs unconditionally from app startup - activate/
// deactivate only change *what it reports* (title, or None), never whether it's listening.
const plugin: PresencePlugin = {
  id: "obs-presence",
  name: "OBS Overlay",
  activate: (gameTitle: string, coverArtUrl?: string | null) =>
    invoke("set_now_playing", { title: gameTitle, coverUrl: coverArtUrl ?? null }),
  deactivate: () => invoke("set_now_playing", { title: null, coverUrl: null }),
};
plugin.settingsComponent = defineComponent({
  render: () => h(ObsPresenceSettings),
});

export default plugin;
