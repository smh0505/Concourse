import type { ControllerMappingPlugin } from "../types";

// Standard XInput/PS-layout mapping per the Gamepad API's "standard" gamepad mapping:
// https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/mapping
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

export default plugin;
