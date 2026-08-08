import { defineComponent, h } from "vue";

import type { ControllerMappingPlugin } from "@/plugins/types";
import GamepadRemapSettings from "@/plugins/shared/gamepad/GamepadRemapSettings.vue";

// The 8BitDo Micro has no analog sticks and no discrete d-pad buttons either - confirmed via a
// third-party gamepad tester that its d-pad actually reports as joystick axis crossings, not
// four buttons. That, plus real per-button indices varying by connection mode (Bluetooth vs. a
// 2.4G dongle) and OS, means there's no single correct mapping to ship here the way Standard
// Gamepad's is a documented spec. Every binding starts empty ({} for d-pad directions, -1 for
// confirm/cancel) rather than a guess presented as fact - GamepadRemapSettings' Listen capture
// detects whichever the real hardware reports (button press or axis crossing) and fills it in
// for your specific unit/connection mode.
const plugin: ControllerMappingPlugin = {
  id: "8bitdo-micro",
  name: "8BitDo Micro",
  mapping: {
    dpadUp: {},
    dpadDown: {},
    dpadLeft: {},
    dpadRight: {},
    buttonConfirm: -1,
    buttonCancel: -1,
    axisThreshold: 0.5,
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
