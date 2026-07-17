import { onMounted, onUnmounted, ref } from "vue";

const DPAD_UP = 12;
const DPAD_DOWN = 13;
const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;
const BUTTON_CONFIRM = 0; // A / Cross
const BUTTON_CANCEL = 1; // B / Circle

const AXIS_THRESHOLD = 0.5;
const REPEAT_DELAY_MS = 350;
const REPEAT_INTERVAL_MS = 130;

type Direction = "up" | "down" | "left" | "right";

export interface UseGamepadNavOptions {
  itemCount: () => number;
  columns: () => number;
  onSelect: (index: number) => void;
  onCancel?: () => void;
}

export function useGamepadNav(options: UseGamepadNavOptions) {
  const focusedIndex = ref(0);

  const heldSince: Partial<Record<Direction, number>> = {};
  let lastRepeatAt: Partial<Record<Direction, number>> = {};
  let confirmWasPressed = false;
  let cancelWasPressed = false;
  let frameHandle: number | undefined;

  function move(direction: Direction) {
    const count = options.itemCount();
    if (count === 0) return;
    const cols = Math.max(1, options.columns());
    const current = Math.min(focusedIndex.value, count - 1);
    const col = current % cols;

    let next = current;
    if (direction === "up" && current - cols >= 0) next = current - cols;
    else if (direction === "down" && current + cols < count) next = current + cols;
    else if (direction === "left" && col > 0) next = current - 1;
    else if (direction === "right" && col < cols - 1 && current + 1 < count) next = current + 1;

    focusedIndex.value = next;
  }

  function handleDirection(direction: Direction, active: boolean, now: number) {
    if (!active) {
      delete heldSince[direction];
      delete lastRepeatAt[direction];
      return;
    }
    if (heldSince[direction] === undefined) {
      heldSince[direction] = now;
      lastRepeatAt[direction] = now;
      move(direction);
      return;
    }
    const held = now - heldSince[direction]!;
    const sinceLastRepeat = now - (lastRepeatAt[direction] ?? now);
    if (held >= REPEAT_DELAY_MS && sinceLastRepeat >= REPEAT_INTERVAL_MS) {
      lastRepeatAt[direction] = now;
      move(direction);
    }
  }

  function poll() {
    const pads = navigator.getGamepads();
    const pad = pads[0];
    if (pad) {
      const now = performance.now();
      const axisX = pad.axes[0] ?? 0;
      const axisY = pad.axes[1] ?? 0;

      handleDirection("up", pad.buttons[DPAD_UP]?.pressed || axisY < -AXIS_THRESHOLD, now);
      handleDirection("down", pad.buttons[DPAD_DOWN]?.pressed || axisY > AXIS_THRESHOLD, now);
      handleDirection("left", pad.buttons[DPAD_LEFT]?.pressed || axisX < -AXIS_THRESHOLD, now);
      handleDirection("right", pad.buttons[DPAD_RIGHT]?.pressed || axisX > AXIS_THRESHOLD, now);

      const confirmPressed = pad.buttons[BUTTON_CONFIRM]?.pressed ?? false;
      if (confirmPressed && !confirmWasPressed) {
        options.onSelect(focusedIndex.value);
      }
      confirmWasPressed = confirmPressed;

      const cancelPressed = pad.buttons[BUTTON_CANCEL]?.pressed ?? false;
      if (cancelPressed && !cancelWasPressed) {
        options.onCancel?.();
      }
      cancelWasPressed = cancelPressed;
    }

    frameHandle = requestAnimationFrame(poll);
  }

  onMounted(() => {
    frameHandle = requestAnimationFrame(poll);
  });

  onUnmounted(() => {
    if (frameHandle !== undefined) cancelAnimationFrame(frameHandle);
  });

  return { focusedIndex };
}
