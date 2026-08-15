/** Shared across every PIN input (desktop ProfileCreateForm.vue/ProfilesPanel.vue, Big Picture's
 *  OnScreenKeyboard.vue) - letters and digits only, no symbols/spaces/punctuation. Applied at
 *  input time (strips as you type) rather than only validated on submit, so there's never a
 *  moment where an invalid character sits in the field looking accepted. */
export function sanitizePin(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "");
}

export function isPinChar(char: string): boolean {
  return /^[a-zA-Z0-9]$/.test(char);
}
