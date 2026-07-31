import { onMounted, onUnmounted, ref } from "vue";
import { useControllerMappingStore } from "../stores/controllerMapping";
import { suppressMouseActivity } from "./useMouseActivity";

type Direction = "up" | "down" | "left" | "right";

export interface UseGamepadNavOptions {
  itemCount: () => number;
  columns: () => number;
  onSelect: (index: number) => void;
  onCancel?: () => void;
}

export function useGamepadNav(options: UseGamepadNavOptions) {
  const controllerMapping = useControllerMappingStore();
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

    suppressMouseActivity();
    focusedIndex.value = next;
  }

  function handleDirection(direction: Direction, active: boolean, now: number) {
    const { repeatDelayMs = 350, repeatIntervalMs = 130 } = controllerMapping.activeMapping;

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
    if (held >= repeatDelayMs && sinceLastRepeat >= repeatIntervalMs) {
      lastRepeatAt[direction] = now;
      move(direction);
    }
  }

  function poll() {
    const pads = navigator.getGamepads();
    const pad = pads[0];
    if (pad) {
      const mapping = controllerMapping.activeMapping;
      const axisThreshold = mapping.axisThreshold ?? 0.5;
      const now = performance.now();
      const axisX = pad.axes[0] ?? 0;
      const axisY = pad.axes[1] ?? 0;

      handleDirection("up", pad.buttons[mapping.dpadUp]?.pressed || axisY < -axisThreshold, now);
      handleDirection("down", pad.buttons[mapping.dpadDown]?.pressed || axisY > axisThreshold, now);
      handleDirection("left", pad.buttons[mapping.dpadLeft]?.pressed || axisX < -axisThreshold, now);
      handleDirection(
        "right",
        pad.buttons[mapping.dpadRight]?.pressed || axisX > axisThreshold,
        now,
      );

      const confirmPressed = pad.buttons[mapping.buttonConfirm]?.pressed ?? false;
      if (confirmPressed && !confirmWasPressed) {
        options.onSelect(focusedIndex.value);
      }
      confirmWasPressed = confirmPressed;

      const cancelPressed = pad.buttons[mapping.buttonCancel]?.pressed ?? false;
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
