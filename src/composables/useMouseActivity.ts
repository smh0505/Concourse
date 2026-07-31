import { ref } from "vue";

/** Module-level singleton (not a per-component composable instance) - there's exactly one real
 *  mouse cursor and one Big Picture view active at a time, so a shared flag avoids prop-drilling
 *  it through every intermediate component between a keyboard/gamepad handler and a tile's own
 *  hover listener. */
const mouseActive = ref(true);

if (typeof window !== "undefined") {
  window.addEventListener("mousemove", () => (mouseActive.value = true), { passive: true });
}

/** Whether the mouse has moved since the last `suppressMouseActivity()` call. Gates
 *  hover-driven focus changes - a tile's `mouseenter` fires whenever the *element* moves under a
 *  stationary cursor (e.g. Big Picture's focus-lift transform), not only when the cursor itself
 *  moves, so hover can't be trusted on its own right after a keyboard/gamepad-driven focus
 *  change. */
export function useMouseActivity() {
  return mouseActive;
}

/** Call right before a keyboard/gamepad-driven focus change - marks the mouse as "not really
 *  moving" until a real `mousemove` event proves otherwise, so the very next `mouseenter` fired
 *  by a tile shifting under a stationary cursor doesn't silently steal focus back. */
export function suppressMouseActivity() {
  mouseActive.value = false;
}
