import { defineComponent, h } from "vue";

import type { ControllerMappingPlugin } from "@/plugins/types";
import GamepadRemapSettings from "@/plugins/shared/gamepad/GamepadRemapSettings.vue";

// The 8BitDo Micro has no analog sticks - just a d-pad and four face buttons - so it never
// reports "standard" Gamepad API mapping the way a full XInput/PS-layout pad does, and its real
// per-button indices vary by connection mode (Bluetooth vs. a 2.4G dongle) and OS. Unlike
// Standard Gamepad's mapping (a verified, documented spec), there's no single correct index set
// to ship here - -1 is a "no button assigned yet" sentinel (pad.buttons[-1] is always undefined,
// so it's simply never pressed) rather than a guess presented as fact. Use this plugin's own
// remap UI (Settings → Controller → this row) to press each real button once and capture its
// actual index for your specific unit/connection mode.
const plugin: ControllerMappingPlugin = {
  id: "8bitdo-micro",
  name: "8BitDo Micro",
  mapping: {
    dpadUp: -1,
    dpadDown: -1,
    dpadLeft: -1,
    dpadRight: -1,
    buttonConfirm: -1,
    buttonCancel: -1,
    repeatDelayMs: 350,
    repeatIntervalMs: 130,
  },
};
plugin.settingsComponent = defineComponent({
  render: () =>
    h(GamepadRemapSettings, {
      pluginId: plugin.id,
      defaultMapping: plugin.mapping,
      hasSticks: false,
    }),
});

export default plugin;
