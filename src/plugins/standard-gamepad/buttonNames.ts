// Index -> name per the Gamepad API's "standard" gamepad mapping (the same layout this
// plugin's own default mapping targets): https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/mapping
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
export const STANDARD_GAMEPAD_LAYOUT_BUTTONS = Object.entries(STANDARD_GAMEPAD_BUTTON_LABELS).map(
  ([index, label]) => ({ index: Number(index), label }),
);
