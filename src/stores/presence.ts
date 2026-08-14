import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { settings as settingsRepo } from "@/db";
import { getAvailablePluginManifests, loadEnabledPlugins } from "@/plugins/loader";
import type { PluginManifest } from "@/plugins/manifest";
import type { PresencePlugin } from "@/plugins/types";
import {
  OBS_PRESENCE_ALERT_SECONDS_SETTING,
  OBS_PRESENCE_DEFAULT_ALERT_SECONDS,
  OBS_PRESENCE_DEFAULT_MODE,
  OBS_PRESENCE_DEFAULT_TEMPLATE,
  OBS_PRESENCE_MODE_SETTING,
  OBS_PRESENCE_PORT_SETTING,
  OBS_PRESENCE_TEMPLATE_SETTING,
} from "@/plugins/obs-presence";
import { useLibraryStore } from "./library";

const ENABLED_PRESENCE_SETTING = "enabled_presence_plugins";
// Discord defaults on, preserving Milestone 28's original opt-out default now that it's a
// plugin instead of a hardcoded feature. OBS is new and has nothing configured on the OBS side
// yet for a fresh install, so it stays opt-in like source/metadata plugins.
const DEFAULT_PRESENCE_IDS = ["discord-presence"];

interface GameSessionStarted {
  game_id: number;
  title: string;
}

interface GameSessionEnded {
  game_id: number;
}

export const usePresenceStore = defineStore("presence", () => {
  const manifests = ref<PluginManifest[]>([]);
  const enabledIds = ref<Set<string>>(new Set());
  const loadedPlugins = ref<PresencePlugin[]>([]);

  let unlistenStarted: UnlistenFn | undefined;
  let unlistenEnded: UnlistenFn | undefined;

  async function persistEnabledIds() {
    await settingsRepo.set(ENABLED_PRESENCE_SETTING, JSON.stringify([...enabledIds.value]));
  }

  async function refreshManifests() {
    manifests.value = await getAvailablePluginManifests("presence");
  }

  async function reloadPlugins() {
    loadedPlugins.value = await loadEnabledPlugins<PresencePlugin>("presence", enabledIds.value);
  }

  async function toggle(id: string) {
    if (enabledIds.value.has(id)) enabledIds.value.delete(id);
    else enabledIds.value.add(id);
    await persistEnabledIds();
    await reloadPlugins();
  }

  /** A plugin throwing (e.g. Discord not running) shouldn't stop the others from
   *  activating/deactivating - same "one bad provider doesn't block the rest" reasoning
   *  metadataProviders.ts's fetchMetadata already uses. */
  async function activateAll(gameTitle: string, coverArtUrl: string | null) {
    await Promise.all(
      loadedPlugins.value.map((p) => p.activate(gameTitle, coverArtUrl).catch(() => {})),
    );
  }

  async function deactivateAll() {
    await Promise.all(loadedPlugins.value.map((p) => p.deactivate().catch(() => {})));
  }

  /** The overlay server always boots on obs_presence.rs's DEFAULT_PORT (Rust has no DB access
   *  to read a persisted value itself) - re-apply a saved custom port here so a fresh launch
   *  matches whatever the user last configured, without requiring Settings to be opened first. */
  async function applyPersistedObsPort() {
    const storedPort = await settingsRepo.get(OBS_PRESENCE_PORT_SETTING);
    if (!storedPort) return;
    const port = Number(storedPort);
    if (!Number.isInteger(port) || port <= 0) return;
    await invoke("set_obs_presence_port", { port }).catch(() => {});
  }

  /** Same rationale as `applyPersistedObsPort` - style also lives in `ObsPresenceState`, which
   *  Rust always boots with `OverlayStyle::default()`. */
  async function applyPersistedObsStyle() {
    const [template, mode, alertSecondsStr] = await Promise.all([
      settingsRepo.get(OBS_PRESENCE_TEMPLATE_SETTING),
      settingsRepo.get(OBS_PRESENCE_MODE_SETTING),
      settingsRepo.get(OBS_PRESENCE_ALERT_SECONDS_SETTING),
    ]);
    if (!template && !mode && !alertSecondsStr) return;
    const alertSeconds = alertSecondsStr ? Number(alertSecondsStr) : OBS_PRESENCE_DEFAULT_ALERT_SECONDS;
    await invoke("set_obs_overlay_style", {
      template: template ?? OBS_PRESENCE_DEFAULT_TEMPLATE,
      mode: mode ?? OBS_PRESENCE_DEFAULT_MODE,
      alertSeconds: Number.isInteger(alertSeconds) && alertSeconds > 0 ? alertSeconds : OBS_PRESENCE_DEFAULT_ALERT_SECONDS,
    }).catch(() => {});
  }

  async function init() {
    await refreshManifests();
    await applyPersistedObsPort();
    await applyPersistedObsStyle();

    const stored = await settingsRepo.get(ENABLED_PRESENCE_SETTING);
    if (stored === null) {
      enabledIds.value = new Set(DEFAULT_PRESENCE_IDS);
      await persistEnabledIds();
    } else {
      try {
        enabledIds.value = new Set(JSON.parse(stored));
      } catch {
        enabledIds.value = new Set();
      }
    }

    await reloadPlugins();

    // Own listeners, separate from library.ts's game-session-ended one (which records
    // playtime) - presence activation/deactivation is a distinct concern from playtime
    // tracking, even though both key off the same two Rust-emitted events.
    unlistenStarted = await listen<GameSessionStarted>("game-session-started", (event) => {
      const library = useLibraryStore();
      const game = library.games.find((g) => g.id === event.payload.game_id);
      if (game?.skip_presence === 1) return;
      activateAll(event.payload.title, game?.cover_art_url ?? null);
    });
    unlistenEnded = await listen<GameSessionEnded>("game-session-ended", () => {
      deactivateAll();
    });
  }

  function dispose() {
    unlistenStarted?.();
    unlistenEnded?.();
  }

  return {
    manifests,
    enabledIds,
    loadedPlugins,
    toggle,
    refreshManifests,
    init,
    dispose,
  };
});
