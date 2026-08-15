<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { useGamepadDirections } from "@/composables/useGamepadNav";

/** Milestone 30 - Big Picture profile creation/unlock needs text entry (names, PINs that aren't
 *  numeral-only) without assuming a physical keyboard is attached. Gamepad/mouse-navigable grid
 *  of keys; real keydown typing also works (desktop users with a keyboard still attached to a
 *  Big Picture session shouldn't be forced through the on-screen grid), same "both work" pattern
 *  BigPictureGrid.vue's own onKeydown fallback already establishes for its gamepad nav. */
const props = withDefaults(defineProps<{ masked?: boolean }>(), { masked: false });

const emit = defineEmits<{ confirm: []; cancel: [] }>();

const { t } = useI18n();
const value = defineModel<string>({ required: true });

const shift = ref(false);

type CharKey = { kind: "char"; label: string; value: string };
type ActionKey = { kind: "shift" | "space" | "backspace" | "cancel" | "done"; label: string };
type Key = CharKey | ActionKey;

const CHAR_ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m", ",", "."],
];

const rows = computed<Key[][]>(() => [
  ...CHAR_ROWS.map((row) =>
    row.map((char): CharKey => {
      const display = shift.value ? char.toUpperCase() : char;
      return { kind: "char", label: display, value: display };
    }),
  ),
  [
    { kind: "shift", label: shift.value ? t("bigPicture.keyboardShiftOn") : t("bigPicture.keyboardShift") },
    { kind: "space", label: t("bigPicture.keyboardSpace") },
    { kind: "backspace", label: t("bigPicture.keyboardBackspace") },
    { kind: "cancel", label: t("common.cancel") },
    { kind: "done", label: t("common.continue") },
  ],
]);

const focusedRow = ref(0);
const focusedCol = ref(0);

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function moveRow(delta: number) {
  const nextRow = clamp(focusedRow.value + delta, 0, rows.value.length - 1);
  focusedRow.value = nextRow;
  focusedCol.value = Math.min(focusedCol.value, rows.value[nextRow].length - 1);
}

function moveCol(delta: number) {
  const row = rows.value[focusedRow.value];
  focusedCol.value = clamp(focusedCol.value + delta, 0, row.length - 1);
}

function activate(key: Key) {
  if (key.kind === "char") value.value += key.value;
  else if (key.kind === "space") value.value += " ";
  else if (key.kind === "backspace") value.value = value.value.slice(0, -1);
  else if (key.kind === "shift") shift.value = !shift.value;
  else if (key.kind === "done") emit("confirm");
  else if (key.kind === "cancel") emit("cancel");
}

function activateFocused() {
  activate(rows.value[focusedRow.value][focusedCol.value]);
}

useGamepadDirections({
  onUp: () => moveRow(-1),
  onDown: () => moveRow(1),
  onLeft: () => moveCol(-1),
  onRight: () => moveCol(1),
  onConfirm: activateFocused,
  onCancel: () => emit("cancel"),
});

/** Real typing works too - a desktop user with a keyboard still attached shouldn't be forced
 *  through the on-screen grid just because this is Big Picture mode. Arrow keys/Enter double as
 *  a keyboard-only fallback for the grid nav itself, matching BigPictureGrid.vue's own pattern. */
function onKeydown(event: KeyboardEvent) {
  if (event.key === "ArrowUp") moveRow(-1);
  else if (event.key === "ArrowDown") moveRow(1);
  else if (event.key === "ArrowLeft") moveCol(-1);
  else if (event.key === "ArrowRight") moveCol(1);
  else if (event.key === "Enter") emit("confirm");
  else if (event.key === "Escape") emit("cancel");
  else if (event.key === "Backspace") value.value = value.value.slice(0, -1);
  else if (event.key.length === 1) value.value += event.key;
  else return;
  event.preventDefault();
}
</script>

<template>
  <div class="keyboard" tabindex="0" @keydown="onKeydown">
    <div class="preview">{{ props.masked ? "•".repeat(value.length) : value || " " }}</div>
    <div v-for="(row, rowIndex) in rows" :key="rowIndex" class="key-row">
      <button
        v-for="(key, colIndex) in row"
        :key="colIndex"
        type="button"
        class="key"
        :class="[`key-${key.kind}`, { focused: rowIndex === focusedRow && colIndex === focusedCol }]"
        @click="activate(key)"
        @mouseenter="
          focusedRow = rowIndex;
          focusedCol = colIndex;
        "
      >
        {{ key.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.keyboard {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  outline: none;
}

.preview {
  min-width: 12rem;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.08);
  font-size: 1.5rem;
  letter-spacing: 0.2em;
  text-align: center;
}

.key-row {
  display: flex;
  gap: var(--space-2);
}

.key {
  min-width: 2.75rem;
  padding: var(--space-2) var(--space-3);
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font-size: 1rem;
  cursor: pointer;
}

.key.focused {
  border-color: var(--color-accent);
  background: rgba(255, 255, 255, 0.16);
}

.key-space {
  min-width: 8rem;
}

.key-shift,
.key-backspace,
.key-cancel,
.key-done {
  min-width: 5rem;
}
</style>
