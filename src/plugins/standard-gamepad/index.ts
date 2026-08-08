import { defineAsyncComponent } from "vue";

import type { ControllerMappingPlugin } from "@/plugins/types";

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
  // Async import, not a static one - Settings.vue imports this module back (for DEFAULT_MAPPING/
  // PLUGIN_ID) to avoid duplicating the default mapping, and a static import here would be a
  // circular import evaluated at module-init time.
  settingsComponent: defineAsyncComponent(() => import("./Settings.vue")),
};

export default plugin;
