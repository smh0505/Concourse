import { defineStore } from "pinia";
import { ref } from "vue";
import { settings as settingsRepo } from "../db";
import { getAvailablePluginManifests, loadEnabledPlugins } from "../plugins/loader";
import type { PluginManifest } from "../plugins/manifest";
import type { ControllerMappingPlugin, GamepadMapping } from "../plugins/types";

const ACTIVE_MAPPING_SETTING = "active_controller_mapping_id";
const DEFAULT_MAPPING_ID = "standard-gamepad";

const FALLBACK_MAPPING: GamepadMapping = {
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
  buttonConfirm: 0,
  buttonCancel: 1,
  axisThreshold: 0.5,
  repeatDelayMs: 350,
  repeatIntervalMs: 130,
};

export const useControllerMappingStore = defineStore("controllerMapping", () => {
  const manifests = ref<PluginManifest[]>([]);
  const activeMappingId = ref<string | null>(null);
  const activeMapping = ref<GamepadMapping>(FALLBACK_MAPPING);

  async function loadMappingPlugin(id: string): Promise<ControllerMappingPlugin | null> {
    const plugins = await loadEnabledPlugins<ControllerMappingPlugin>("controller", new Set([id]));
    return plugins[0] ?? null;
  }

  async function setActiveMapping(id: string | null) {
    if (id) {
      const plugin = await loadMappingPlugin(id);
      activeMapping.value = plugin?.mapping ?? FALLBACK_MAPPING;
    } else {
      activeMapping.value = FALLBACK_MAPPING;
    }
    activeMappingId.value = id;
    await settingsRepo.set(ACTIVE_MAPPING_SETTING, id ?? "");
  }

  async function init() {
    manifests.value = await getAvailablePluginManifests("controller");

    const stored = await settingsRepo.get(ACTIVE_MAPPING_SETTING);
    if (stored === null) {
      await setActiveMapping(DEFAULT_MAPPING_ID);
    } else {
      await setActiveMapping(stored || null);
    }
  }

  return { manifests, activeMappingId, activeMapping, setActiveMapping, init };
});
