import { nextTick, ref, type Ref } from "vue";

export interface BalloonAnchor {
  top: number;
  left: number;
  placement: "above" | "below";
}

// If the card's top edge is scrolled out of view there's no room to show the balloon above
// it, so it flips below instead.
const MIN_SPACE_ABOVE = 60;
// Horizontal breathing room kept between the balloon and the viewport edge when clamping.
const EDGE_MARGIN = 8;

/** Shared by GameCard.vue and any theme's own card slot override (e.g. BrickBlockGameCard.vue)
 *  - positions a Teleport-to-<body> balloon relative to a hovered card's own viewport rect,
 *  flipping above/below based on scroll position, and clamping horizontally so it never gets
 *  clipped off the left/right edge of the window (title length varies, so the balloon's own
 *  width isn't known until it's actually rendered - this measures it after mount via
 *  `nextTick` and shifts the anchor if needed, rather than guessing beforehand). */
export function useBalloonAnchor(cardEl: Ref<HTMLElement | null>) {
  const balloonEl = ref<HTMLElement | null>(null);
  const anchor = ref<BalloonAnchor | null>(null);

  async function onMouseEnter() {
    const rect = cardEl.value?.getBoundingClientRect();
    if (!rect) return;
    const placement = rect.top < MIN_SPACE_ABOVE ? "below" : "above";
    anchor.value = {
      top: placement === "above" ? rect.top : rect.bottom,
      left: rect.left + rect.width / 2,
      placement,
    };

    await nextTick();
    const el = balloonEl.value;
    if (!el || !anchor.value) return;

    const halfWidth = el.offsetWidth / 2;
    const minLeft = EDGE_MARGIN + halfWidth;
    const maxLeft = window.innerWidth - EDGE_MARGIN - halfWidth;
    const clamped = Math.min(Math.max(anchor.value.left, minLeft), maxLeft);
    if (clamped !== anchor.value.left) {
      anchor.value = { ...anchor.value, left: clamped };
    }
  }

  function onMouseLeave() {
    anchor.value = null;
  }

  return { balloonEl, anchor, onMouseEnter, onMouseLeave };
}
