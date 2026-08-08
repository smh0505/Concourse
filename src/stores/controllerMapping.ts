import { defineStore } from "pinia";
import { ref } from "vue";

import { settings as settingsRepo } from "@/db";
import { getAvailablePluginManifests, loadEnabledPlugins } from "@/plugins/loader";
import type { PluginManifest } from "@/plugins/manifest";
import type { ControllerMappingPlugin, GamepadMapping } from "@/plugins/types";

const ACTIVE_MAPPING_SETTING = "active_controller_mapping_id";
const DEFAULT_MAPPING_ID = "standard-gamepad";
const MAPPING_OVERRIDE_PREFIX = "controller_mapping_override_";

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

  /** Per-plugin, user-remapped button/axis indices layered on top of a mapping plugin's own
   *  defaults - lets "Standard Gamepad" stay a plain data-shaped default while still letting a
   *  user override individual buttons (e.g. a controller whose face buttons enumerate
   *  differently) without forking the plugin itself. */
  async function getMappingOverride(id: string): Promise<Partial<GamepadMapping>> {
    const raw = await settingsRepo.get(`${MAPPING_OVERRIDE_PREFIX}${id}`);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Partial<GamepadMapping>;
    } catch {
      return {};
    }
  }

  async function setMappingOverride(id: string, override: Partial<GamepadMapping>) {
    await settingsRepo.set(`${MAPPING_OVERRIDE_PREFIX}${id}`, JSON.stringify(override));
    if (activeMappingId.value === id) await setActiveMapping(id);
  }

  async function resetMappingOverride(id: string) {
    await settingsRepo.set(`${MAPPING_OVERRIDE_PREFIX}${id}`, "");
    if (activeMappingId.value === id) await setActiveMapping(id);
  }

  async function setActiveMapping(id: string | null) {
    if (id) {
      const plugin = await loadMappingPlugin(id);
      const override = await getMappingOverride(id);
      activeMapping.value = plugin ? { ...plugin.mapping, ...override } : FALLBACK_MAPPING;
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

  return {
    manifests,
    activeMappingId,
    activeMapping,
    setActiveMapping,
    getMappingOverride,
    setMappingOverride,
    resetMappingOverride,
    init,
  };
});
