// Index -> name per the Gamepad API's "standard" gamepad mapping (the same layout this
// plugin's own default mapping targets): https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/mapping
//
// Physical hardware legends, not translated - same reasoning this project already applies to
// other universal technical labels (platform icons, tab names): these are literal button
// names a user needs to match against real hardware, not prose. The d-pad directions
// (D-Up/D-Down/D-Left/D-Right) still resolve through here for `directionBindingLabel`'s "which
// button is this mapped to" text, but the live diagram's own on-shape labels render an arrow
// icon for those four instead of this text - see GamepadRemapSettings.vue's template.
const STANDARD_GAMEPAD_BUTTON_LABELS: Record<number, string> = {
  0: "A",
  1: "B",
  2: "X",
  3: "Y",
  4: "LB",
  5: "RB",
  6: "LT",
  7: "RT",
  8: "Back",
  9: "Start",
  10: "LS",
  11: "RS",
  12: "D-Up",
  13: "D-Down",
  14: "D-Left",
  15: "D-Right",
  16: "Home",
};

export function gamepadButtonLabel(index: number): string {
  return STANDARD_GAMEPAD_BUTTON_LABELS[index] ?? `#${index}`;
}

/** Fixed physical layout for the live "what am I pressing" diagram - always the real standard-
 *  mapping index for that physical button, independent of the user's own remapped actions
 *  (which action a button triggers is remappable; which physical button index it is, isn't). */
export const STANDARD_GAMEPAD_LAYOUT_INDICES: number[] = Object.keys(
  STANDARD_GAMEPAD_BUTTON_LABELS,
).map(Number);
