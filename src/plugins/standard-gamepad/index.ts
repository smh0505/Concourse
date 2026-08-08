import { defineComponent, h } from "vue";

import type { ControllerMappingPlugin } from "@/plugins/types";
import GamepadRemapSettings from "@/plugins/shared/gamepad/GamepadRemapSettings.vue";

// Standard XInput/PS-layout mapping per the Gamepad API's "standard" gamepad mapping:
// https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/mapping
// This is the plugin's own default - a user's remapped buttons are layered on top of it as a
// per-plugin override in useControllerMappingStore, not edited here.
const plugin: ControllerMappingPlugin = {
  id: "standard-gamepad",
  name: "Standard Gamepad",
  mapping: {
    dpadUp: 12,
    dpadDown: 13,
    dpadLeft: 14,
    dpadRight: 15,
    buttonConfirm: 0, // A / Cross
    buttonCancel: 1, // B / Circle
    axisThreshold: 0.5,
    repeatDelayMs: 350,
    repeatIntervalMs: 130,
  },
};
plugin.settingsComponent = defineComponent({
  render: () => h(GamepadRemapSettings, { pluginId: plugin.id, defaultMapping: plugin.mapping }),
});

export default plugin;
