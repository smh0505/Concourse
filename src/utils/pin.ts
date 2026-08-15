/** Only OnScreenKeyboard.vue (Big Picture) uses this now - desktop PIN inputs are plain
 *  `<input type="password" pattern="[a-zA-Z0-9]*">`, enforced natively by the browser's own
 *  constraint validation, not JS. The on-screen keyboard has no real `<input>` to attach a
 *  `pattern` to (it's a custom click/gamepad-driven grid), so it still needs this check
 *  per-keypress. */
export function isPinChar(char: string): boolean {
  return /^[a-zA-Z0-9]$/.test(char);
}
