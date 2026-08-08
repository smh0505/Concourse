<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";

import { useControllerMappingStore } from "@/stores/controllerMapping";
import type { GamepadMapping } from "@/plugins/types";
import BaseModal from "@/components/desktop/common/BaseModal.vue";
import defaultPlugin from "./index";
import { gamepadButtonLabel, STANDARD_GAMEPAD_LAYOUT_BUTTONS } from "./buttonNames";

const { t } = useI18n();
const controllerMapping = useControllerMappingStore();

const PLUGIN_ID = defaultPlugin.id;
const DEFAULT_MAPPING = defaultPlugin.mapping;

// Only the actions with a real button index - stick direction is handled by axisThreshold below,
// not remappable per-direction (a physical stick only has the two axes, not four buttons).
const BUTTON_ACTIONS: Array<keyof Pick<
  GamepadMapping,
  "dpadUp" | "dpadDown" | "dpadLeft" | "dpadRight" | "buttonConfirm" | "buttonCancel"
>> = ["dpadUp", "dpadDown", "dpadLeft", "dpadRight", "buttonConfirm", "buttonCancel"];

const open = ref(false);
const mapping = ref<GamepadMapping>({ ...DEFAULT_MAPPING });
const listeningFor = ref<(typeof BUTTON_ACTIONS)[number] | null>(null);
// Live-pressed state per physical button index, driving the "what am I pressing" diagram -
// reactive() over a plain object (not a Map) so :class bindings in the template stay simple.
const pressed = reactive<Record<number, boolean>>({});
let frameHandle: number | undefined;

async function loadMapping() {
  const override = await controllerMapping.getMappingOverride(PLUGIN_ID);
  mapping.value = { ...DEFAULT_MAPPING, ...override };
}

async function persist() {
  await controllerMapping.setMappingOverride(PLUGIN_ID, { ...mapping.value });
}

function stopPolling() {
  if (frameHandle !== undefined) cancelAnimationFrame(frameHandle);
  frameHandle = undefined;
}

// Single poll loop drives both the live diagram (always, while the modal is open) and, when
// actively remapping an action, captures the first newly-pressed button for it - one gamepad
// read per frame instead of two competing loops.
function pollGamepad() {
  const pad = navigator.getGamepads()[0];
  if (pad) {
    let newlyPressedIndex = -1;
    pad.buttons.forEach((b, index) => {
      const isPressed = b.pressed || b.value > 0.5;
      if (isPressed && !pressed[index]) newlyPressedIndex = newlyPressedIndex === -1 ? index : newlyPressedIndex;
      pressed[index] = isPressed;
    });
    if (listeningFor.value && newlyPressedIndex !== -1) {
      mapping.value[listeningFor.value] = newlyPressedIndex;
      listeningFor.value = null;
      void persist();
    }
  }
  frameHandle = requestAnimationFrame(pollGamepad);
}

function startListening(action: (typeof BUTTON_ACTIONS)[number]) {
  listeningFor.value = action;
}

async function onThresholdOrRepeatChange() {
  await persist();
}

async function onReset() {
  listeningFor.value = null;
  await controllerMapping.resetMappingOverride(PLUGIN_ID);
  mapping.value = { ...DEFAULT_MAPPING };
}

function onOpen() {
  open.value = true;
  void loadMapping();
  stopPolling();
  frameHandle = requestAnimationFrame(pollGamepad);
}

function onClose() {
  listeningFor.value = null;
  stopPolling();
  open.value = false;
}

onBeforeUnmount(stopPolling);
</script>

<template>
  <button type="button" class="settings-trigger" @click="onOpen">
    {{ t("gamepadRemap.settingsTrigger") }}
  </button>
  <BaseModal :open="open" :title="t('gamepadRemap.title')" max-width="460px" @close="onClose">
    <template #body>
      <div class="pad-layout">
        <div
          v-for="btn in STANDARD_GAMEPAD_LAYOUT_BUTTONS"
          :key="btn.index"
          class="pad-btn"
          :class="[`pad-btn-${btn.index}`, { pressed: pressed[btn.index] }]"
        >
          {{ btn.label }}
        </div>
      </div>

      <div class="remap-fields">
        <div class="remap-row" v-for="action in BUTTON_ACTIONS" :key="action">
          <span class="action-label">{{ t(`gamepadRemap.actions.${action}`) }}</span>
          <span class="button-index">{{ gamepadButtonLabel(mapping[action]) }}</span>
          <button type="button" class="compact-button" @click="startListening(action)">
            {{ listeningFor === action ? t("gamepadRemap.listening") : t("gamepadRemap.listen") }}
          </button>
        </div>
        <label class="remap-row">
          {{ t("gamepadRemap.axisThreshold") }}
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            v-model.number="mapping.axisThreshold"
            @change="onThresholdOrRepeatChange"
          />
        </label>
        <label class="remap-row">
          {{ t("gamepadRemap.repeatDelayMs") }}
          <input
            type="number"
            step="10"
            min="0"
            v-model.number="mapping.repeatDelayMs"
            @change="onThresholdOrRepeatChange"
          />
        </label>
        <label class="remap-row">
          {{ t("gamepadRemap.repeatIntervalMs") }}
          <input
            type="number"
            step="10"
            min="0"
            v-model.number="mapping.repeatIntervalMs"
            @change="onThresholdOrRepeatChange"
          />
        </label>
      </div>
    </template>
    <template #footer>
      <button type="button" @click="onReset">{{ t("gamepadRemap.reset") }}</button>
      <button type="button" @click="onClose">{{ t("common.close") }}</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.settings-trigger {
  font-size: 0.85rem;
}

/* A rough top-down physical layout (not pixel-accurate to any specific controller) - each
   button is placed by grid-column/row on a shared 12-column grid, purely so the live diagram
   reads as "left side / right side / shoulders / center" at a glance while pressing buttons. */
.pad-layout {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-auto-rows: 1.8rem;
  gap: 0.3rem;
  margin-bottom: var(--space-3);
  font-size: 0.75rem;
}

.pad-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border, currentColor);
  border-radius: var(--radius-sm);
  opacity: 0.6;
  transition: background-color 0.05s, opacity 0.05s;
}

.pad-btn.pressed {
  opacity: 1;
  background: var(--color-accent);
  color: var(--color-on-accent);
}

/* Shoulders/triggers - top row, far left and far right. */
.pad-btn-6 { grid-column: 1 / 3; grid-row: 1; } /* LT */
.pad-btn-4 { grid-column: 1 / 3; grid-row: 2; } /* LB */
.pad-btn-7 { grid-column: 11 / 13; grid-row: 1; } /* RT */
.pad-btn-5 { grid-column: 11 / 13; grid-row: 2; } /* RB */

/* D-pad diamond - left side. */
.pad-btn-12 { grid-column: 3 / 5; grid-row: 3; } /* D-Up */
.pad-btn-14 { grid-column: 2 / 4; grid-row: 4; } /* D-Left */
.pad-btn-15 { grid-column: 4 / 6; grid-row: 4; } /* D-Right */
.pad-btn-13 { grid-column: 3 / 5; grid-row: 5; } /* D-Down */

/* Back/Home/Start - center. */
.pad-btn-8 { grid-column: 5 / 6; grid-row: 3; } /* Back */
.pad-btn-16 { grid-column: 6 / 7; grid-row: 3; } /* Home */
.pad-btn-9 { grid-column: 7 / 8; grid-row: 3; } /* Start */

/* Face buttons diamond - right side. */
.pad-btn-3 { grid-column: 9 / 11; grid-row: 3; } /* Y */
.pad-btn-2 { grid-column: 8 / 10; grid-row: 4; } /* X */
.pad-btn-1 { grid-column: 10 / 12; grid-row: 4; } /* B */
.pad-btn-0 { grid-column: 9 / 11; grid-row: 5; } /* A */

/* Stick clicks - bottom row. */
.pad-btn-10 { grid-column: 4 / 6; grid-row: 6; } /* LS */
.pad-btn-11 { grid-column: 8 / 10; grid-row: 6; } /* RS */

.remap-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.remap-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.85rem;
}

.action-label {
  flex: 1;
}

.button-index {
  opacity: 0.7;
  min-width: 3.5rem;
  text-align: center;
}

.remap-row input {
  width: 4.5rem;
  margin-left: auto;
}
</style>
