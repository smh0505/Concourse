// Index -> physical button per the Gamepad API's "standard" gamepad mapping (the same layout
// this plugin's own default mapping targets): https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/mapping
//
// Split in two: letter/abbreviation legends (A/B/X/Y, LB/RB/LT/RT, LS/RS) are universal
// hardware labels printed the same way regardless of locale, so they're plain literals here -
// same reasoning this project already applies to other universal technical abbreviations. The
// remaining word-based legends (Back/Start/Home/D-Up/D-Down/D-Left/D-Right) are real English
// words, translated via `gamepadRemap.buttonNames.<key>` in the i18n locales instead -
// `GamepadRemapSettings.vue`'s own `t()` resolves the key, since a plain data module like this
// one has no reactive i18n context of its own.
const LITERAL_BUTTON_LABELS: Record<number, string> = {
  0: "A",
  1: "B",
  2: "X",
  3: "Y",
  4: "LB",
  5: "RB",
  6: "LT",
  7: "RT",
  10: "LS",
  11: "RS",
};

const TRANSLATABLE_BUTTON_KEYS: Record<number, string> = {
  8: "back",
  9: "start",
  16: "home",
  12: "dUp",
  13: "dDown",
  14: "dLeft",
  15: "dRight",
};

export function gamepadButtonLiteral(index: number): string | undefined {
  return LITERAL_BUTTON_LABELS[index];
}

export function gamepadButtonTranslationKey(index: number): string | undefined {
  return TRANSLATABLE_BUTTON_KEYS[index];
}

/** Fixed physical layout for the live "what am I pressing" diagram - always the real standard-
 *  mapping index for that physical button, independent of the user's own remapped actions
 *  (which action a button triggers is remappable; which physical button index it is, isn't). */
export const STANDARD_GAMEPAD_LAYOUT_INDICES: number[] = [
  ...Object.keys(LITERAL_BUTTON_LABELS).map(Number),
  ...Object.keys(TRANSLATABLE_BUTTON_KEYS).map(Number),
];
