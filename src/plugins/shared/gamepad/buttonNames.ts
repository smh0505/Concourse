// Index -> name per the Gamepad API's "standard" mapping:
// https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/mapping
//
// Physical hardware legends, not translated (literal button names, not prose - same reasoning
// as other universal technical labels in this project). D-pad directions still resolve here for
// directionBindingLabel's "mapped to" text; the live diagram swaps those four for an arrow icon
// instead - see GamepadRemapSettings.vue's template.
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

/** Real standard-mapping indices, independent of the user's own remapped actions - which
 *  action a button triggers is remappable, which physical index it is, isn't. */
export const STANDARD_GAMEPAD_LAYOUT_INDICES: number[] = Object.keys(
  STANDARD_GAMEPAD_BUTTON_LABELS,
).map(Number);
