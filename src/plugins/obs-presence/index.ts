import { invoke } from "@tauri-apps/api/core";
import { defineComponent, h } from "vue";

import type { PresencePlugin } from "@/plugins/types";
import ObsPresenceSettings from "./ObsPresenceSettings.vue";

export const OBS_PRESENCE_PORT_SETTING = "obs_presence_port";
// Must match src-tauri/src/obs_presence.rs's DEFAULT_PORT constant.
export const OBS_PRESENCE_DEFAULT_PORT = 47474;

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
