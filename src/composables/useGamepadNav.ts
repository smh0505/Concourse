import { onMounted, onUnmounted, ref } from "vue";

import { useControllerMappingStore } from "@/stores/controllerMapping";
import type { GamepadDirectionBinding } from "@/plugins/types";
import { suppressMouseActivity } from "./useMouseActivity";

function isDirectionActive(
  binding: GamepadDirectionBinding,
  pad: Gamepad,
  axisThreshold: number,
): boolean {
  if (!binding) return false;
  if (binding.kind === "button") return pad.buttons[binding.index]?.pressed ?? false;
  const value = pad.axes[binding.axis] ?? 0;
  return binding.sign === 1 ? value > axisThreshold : value < -axisThreshold;
}

type Direction = "up" | "down" | "left" | "right";

export interface UseGamepadDirectionsOptions {
  onUp?: () => void;
  onDown?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}

/** Low-level building block behind `useGamepadNav` below - raw directional/confirm/cancel
 *  events with the same held-repeat timing (`repeatDelayMs`/`repeatIntervalMs` from the active
 *  controller mapping), but no assumption about a uniform grid. `useGamepadNav`'s `move()`
 *  (index ± columns) is exactly one way to consume these events; `OnScreenKeyboard.vue` is
 *  another - its rows aren't all the same length, so it tracks its own row/column state off
 *  these same onUp/onDown/onLeft/onRight calls instead. */
export function useGamepadDirections(options: UseGamepadDirectionsOptions) {
  const controllerMapping = useControllerMappingStore();

  const heldSince: Partial<Record<Direction, number>> = {};
  let lastRepeatAt: Partial<Record<Direction, number>> = {};
  let confirmWasPressed = false;
  let cancelWasPressed = false;
  let frameHandle: number | undefined;
  // Polling (unlike a DOM keydown/click) has no natural "this press already happened" edge -
  // whatever's still physically held on this composable's very first tick looks identical to a
  // fresh press. That matters here specifically because a confirm/select press on one screen
  // routinely mounts a brand new consumer of this composable in reaction (BigPictureProfileSwitcher
  // selecting a locked profile mounts OnScreenKeyboard.vue, still while that same button is
  // held) - without this, its first poll would see "confirm held, wasn't held before" and fire
  // immediately, e.g. inserting a stray character the instant the keyboard opens. The first
  // tick only records the current state as the baseline; real input starts on the next one.
  let firstPoll = true;

  const directionHandlers: Record<Direction, (() => void) | undefined> = {
    up: options.onUp,
    down: options.onDown,
    left: options.onLeft,
    right: options.onRight,
  };

  function handleDirection(direction: Direction, active: boolean, now: number) {
    const { repeatDelayMs = 350, repeatIntervalMs = 130 } = controllerMapping.activeMapping;
    const handler = directionHandlers[direction];

    if (!active) {
      delete heldSince[direction];
      delete lastRepeatAt[direction];
      return;
    }
    if (!handler) return;
    if (heldSince[direction] === undefined) {
      heldSince[direction] = now;
      lastRepeatAt[direction] = now;
      suppressMouseActivity();
      handler();
      return;
    }
    const held = now - heldSince[direction]!;
    const sinceLastRepeat = now - (lastRepeatAt[direction] ?? now);
    if (held >= repeatDelayMs && sinceLastRepeat >= repeatIntervalMs) {
      lastRepeatAt[direction] = now;
      suppressMouseActivity();
      handler();
    }
  }

  function poll() {
    const pads = navigator.getGamepads();
    const pad = pads[0];
    if (pad) {
      const mapping = controllerMapping.activeMapping;
      const axisThreshold = mapping.axisThreshold ?? 0.5;
      const now = performance.now();

      const confirmPressed = isDirectionActive(mapping.buttonConfirm, pad, axisThreshold);
      const cancelPressed = isDirectionActive(mapping.buttonCancel, pad, axisThreshold);

      if (firstPoll) {
        confirmWasPressed = confirmPressed;
        cancelWasPressed = cancelPressed;
        firstPoll = false;
      } else {
        handleDirection("up", isDirectionActive(mapping.dpadUp, pad, axisThreshold), now);
        handleDirection("down", isDirectionActive(mapping.dpadDown, pad, axisThreshold), now);
        handleDirection("left", isDirectionActive(mapping.dpadLeft, pad, axisThreshold), now);
        handleDirection("right", isDirectionActive(mapping.dpadRight, pad, axisThreshold), now);

        if (confirmPressed && !confirmWasPressed) {
          options.onConfirm?.();
        }
        confirmWasPressed = confirmPressed;

        if (cancelPressed && !cancelWasPressed) {
          options.onCancel?.();
        }
        cancelWasPressed = cancelPressed;
      }
    }

    frameHandle = requestAnimationFrame(poll);
  }

  onMounted(() => {
    frameHandle = requestAnimationFrame(poll);
  });

  onUnmounted(() => {
    if (frameHandle !== undefined) cancelAnimationFrame(frameHandle);
  });
}

export interface UseGamepadNavOptions {
  itemCount: () => number;
  columns: () => number;
  onSelect: (index: number) => void;
  onCancel?: () => void;
}

/** Uniform-grid gamepad navigation (every row has exactly `columns()` items) - BigPictureGrid.vue,
 *  BigPictureProfileSwitcher.vue's tile grid. For a ragged/non-uniform layout (OnScreenKeyboard.vue's
 *  keyboard rows), use `useGamepadDirections` directly instead. */
export function useGamepadNav(options: UseGamepadNavOptions) {
  const focusedIndex = ref(0);

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

  useGamepadDirections({
    onUp: () => move("up"),
    onDown: () => move("down"),
    onLeft: () => move("left"),
    onRight: () => move("right"),
    onConfirm: () => options.onSelect(focusedIndex.value),
    onCancel: options.onCancel,
  });

  return { focusedIndex };
}
