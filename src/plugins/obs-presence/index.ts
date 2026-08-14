import { invoke } from "@tauri-apps/api/core";
import { defineComponent, h } from "vue";

import { settings as settingsRepo } from "@/db";
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

export const OBS_WS_ENABLED_SETTING = "obs_ws_enabled";
export const OBS_WS_HOST_SETTING = "obs_ws_host";
export const OBS_WS_PORT_SETTING = "obs_ws_port";
export const OBS_WS_PASSWORD_SETTING = "obs_ws_password";
export const OBS_WS_START_SCENE_SETTING = "obs_ws_start_scene";
export const OBS_WS_END_SCENE_SETTING = "obs_ws_end_scene";
export const OBS_WS_DEFAULT_HOST = "127.0.0.1";
// obs-websocket's own default port (distinct from OBS_PRESENCE_DEFAULT_PORT, the overlay's own
// unrelated tiny_http server).
export const OBS_WS_DEFAULT_PORT = 4455;

/** No-op unless scene-switching is enabled and a scene is configured for this event - a fresh
 *  connect-switch-disconnect per call (obs_websocket.rs), so this only touches the network when
 *  actually configured to. `.catch(() => {})`'d by the caller, same "one bad thing doesn't block
 *  the rest" isolation `set_now_playing` already gets. */
async function switchObsScene(sceneSetting: string) {
  const enabled = await settingsRepo.get(OBS_WS_ENABLED_SETTING);
  if (enabled !== "true") return;
  const scene = await settingsRepo.get(sceneSetting);
  if (!scene) return;
  const [host, portStr, password] = await Promise.all([
    settingsRepo.get(OBS_WS_HOST_SETTING),
    settingsRepo.get(OBS_WS_PORT_SETTING),
    settingsRepo.get(OBS_WS_PASSWORD_SETTING),
  ]);
  await invoke("obs_ws_switch_scene", {
    host: host || OBS_WS_DEFAULT_HOST,
    port: portStr ? Number(portStr) : OBS_WS_DEFAULT_PORT,
    password: password || null,
    scene,
  });
}

// obs_presence.rs's local HTTP server runs unconditionally from app startup - activate/
// deactivate only change *what it reports* (title, or None), never whether it's listening.
// Scene-switching (obs_websocket.rs) is a separate, independently-configured concern bundled
// into the same plugin/settings-modal rather than a second plugin entry, since both are "what
// this game session tells OBS" - the Presence tab's single enable checkbox still gates the
// overlay; scene-switching has its own enable toggle inside this plugin's own settings.
const plugin: PresencePlugin = {
  id: "obs-presence",
  name: "OBS Overlay",
  activate: async (gameTitle: string, coverArtUrl?: string | null) => {
    await Promise.all([
      invoke("set_now_playing", { title: gameTitle, coverUrl: coverArtUrl ?? null }),
      switchObsScene(OBS_WS_START_SCENE_SETTING).catch(() => {}),
    ]);
  },
  deactivate: async () => {
    await Promise.all([
      invoke("set_now_playing", { title: null, coverUrl: null }),
      switchObsScene(OBS_WS_END_SCENE_SETTING).catch(() => {}),
    ]);
  },
};
plugin.settingsComponent = defineComponent({
  render: () => h(ObsPresenceSettings),
});

export default plugin;
