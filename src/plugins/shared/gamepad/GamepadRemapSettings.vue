<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";

import { useControllerMappingStore } from "@/stores/controllerMapping";
import type { GamepadDirectionBinding, GamepadMapping } from "@/plugins/types";
import BaseModal from "@/components/desktop/common/BaseModal.vue";
import { gamepadButtonLabel, STANDARD_GAMEPAD_LAYOUT_BUTTONS } from "./buttonNames";

// Reusable across every ControllerMappingPlugin, not just Standard Gamepad - each plugin passes
// its own id/default mapping in, so this component owns none of the plugin-specific data itself.
const props = withDefaults(
  defineProps<{
    pluginId: string;
    defaultMapping: GamepadMapping;
    /** False for a pad with no analog sticks (e.g. 8BitDo Micro) - hides the stick-sensitivity
     *  field, which is meaningless when the device has no axes to threshold. */
    hasSticks?: boolean;
  }>(),
  { hasSticks: true },
);

const { t } = useI18n();
const controllerMapping = useControllerMappingStore();

const PLUGIN_ID = props.pluginId;
const DEFAULT_MAPPING = props.defaultMapping;

// Every mapped input shares the same GamepadDirectionBinding shape (button, axis, or unbound) -
// a stickless pad's d-pad reporting as a joystick axis (confirmed on the 8BitDo Micro via a
// third-party gamepad tester), and some pads reporting analog triggers as axes too, are both
// reasons confirm/cancel need the same flexibility d-pad directions do, not a plain button index.
const ACTIONS: Array<
  keyof Pick<
    GamepadMapping,
    "dpadUp" | "dpadDown" | "dpadLeft" | "dpadRight" | "buttonConfirm" | "buttonCancel"
  >
> = ["dpadUp", "dpadDown", "dpadLeft", "dpadRight", "buttonConfirm", "buttonCancel"];

const open = ref(false);
const mapping = ref<GamepadMapping>({ ...DEFAULT_MAPPING });
const listeningFor = ref<(typeof ACTIONS)[number] | null>(null);
// Live-pressed state per physical button index, driving the "what am I pressing" diagram -
// reactive() over a plain object (not a Map) so :class bindings in the template stay simple.
const pressed = reactive<Record<number, boolean>>({});
// Live axis values (index -> -1..1), shown as a readout so a user can see which axis moves when
// their d-pad/stick is actually axis-driven rather than button-driven.
const axisValues = reactive<Record<number, number>>({});
// Per axis+direction edge-detection state, local to the capture loop only (not reactive - it
// never needs to redraw anything, just remembers "was this axis already crossed last frame").
const axisWasCrossed: Record<string, boolean> = {};
let frameHandle: number | undefined;

function directionBindingLabel(binding: GamepadDirectionBinding): string {
  if (binding?.kind === "button") return gamepadButtonLabel(binding.index);
  if (binding?.kind === "axis") {
    return `${t("gamepadRemap.axis")} ${binding.axis} ${binding.sign > 0 ? "+" : "-"}`;
  }
  return t("gamepadRemap.unmapped");
}

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
// actively remapping an input, captures whichever the real hardware reports first - a newly-
// pressed button always wins if one fires, otherwise a newly-crossed axis is captured instead.
// One gamepad read per frame, not competing loops.
function pollGamepad() {
  const pad = navigator.getGamepads()[0];
  if (pad) {
    let newlyPressedButton = -1;
    pad.buttons.forEach((b, index) => {
      const isPressed = b.pressed || b.value > 0.5;
      if (isPressed && !pressed[index] && newlyPressedButton === -1) newlyPressedButton = index;
      pressed[index] = isPressed;
    });

    const threshold = mapping.value.axisThreshold ?? 0.5;
    let newlyCrossedAxis: { axis: number; sign: 1 | -1 } | null = null;
    pad.axes.forEach((value, axisIndex) => {
      axisValues[axisIndex] = value;
      for (const sign of [1, -1] as const) {
        const key = `${axisIndex}:${sign}`;
        const isCrossed = sign === 1 ? value > threshold : value < -threshold;
        if (isCrossed && !axisWasCrossed[key] && !newlyCrossedAxis) {
          newlyCrossedAxis = { axis: axisIndex, sign };
        }
        axisWasCrossed[key] = isCrossed;
      }
    });

    const target = listeningFor.value;
    if (target && newlyPressedButton !== -1) {
      mapping.value[target] = { kind: "button", index: newlyPressedButton };
      listeningFor.value = null;
      void persist();
    } else if (target && newlyCrossedAxis !== null) {
      const axis: { axis: number; sign: 1 | -1 } = newlyCrossedAxis;
      mapping.value[target] = { kind: "axis", axis: axis.axis, sign: axis.sign };
      listeningFor.value = null;
      void persist();
    }
  }
  frameHandle = requestAnimationFrame(pollGamepad);
}

function startListening(action: (typeof ACTIONS)[number]) {
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

// Stick-click buttons (indices 10/11) don't exist on a stickless pad - omit them from the
// diagram entirely rather than showing two boxes that can never light up.
const layoutButtons = computed(() =>
  props.hasSticks
    ? STANDARD_GAMEPAD_LAYOUT_BUTTONS
    : STANDARD_GAMEPAD_LAYOUT_BUTTONS.filter((b) => b.index !== 10 && b.index !== 11),
);

// Silhouette placement, positioned as % of the SVG body's own 400x220 viewBox (so hitzones
// track the shape at any render size) - an approximate Xbox-style asymmetric layout (left
// stick above the d-pad, face buttons above the right stick), not pixel-accurate to any real
// controller. `shape` picks the CSS treatment below: round buttons for face/stick clusters,
// wide pills for the shoulder/trigger row, small pills for back/home/start.
const PAD_POSITIONS: Record<number, { x: number; y: number; shape: "round" | "pill" | "stick" }> =
  {
    // Shoulders/triggers - top edge.
    6: { x: 15, y: 7, shape: "pill" }, // LT
    4: { x: 15, y: 18, shape: "pill" }, // LB
    7: { x: 85, y: 7, shape: "pill" }, // RT
    5: { x: 85, y: 18, shape: "pill" }, // RB
    // Back/Home/Start - center.
    8: { x: 42, y: 26, shape: "round" }, // Back
    16: { x: 50, y: 21, shape: "round" }, // Home
    9: { x: 58, y: 26, shape: "round" }, // Start
    // Left stick, d-pad below it.
    10: { x: 29, y: 34, shape: "stick" }, // LS
    12: { x: 29, y: 52, shape: "round" }, // D-Up
    14: { x: 24, y: 59, shape: "round" }, // D-Left
    15: { x: 34, y: 59, shape: "round" }, // D-Right
    13: { x: 29, y: 66, shape: "round" }, // D-Down
    // Face buttons diamond, right stick below it.
    3: { x: 71, y: 34, shape: "round" }, // Y
    2: { x: 66, y: 43, shape: "round" }, // X
    1: { x: 76, y: 43, shape: "round" }, // B
    0: { x: 71, y: 52, shape: "round" }, // A
    11: { x: 71, y: 68, shape: "stick" }, // RS
  };

onBeforeUnmount(stopPolling);
</script>

<template>
  <button type="button" class="settings-trigger" @click="onOpen">
    {{ t("gamepadRemap.settingsTrigger") }}
  </button>
  <BaseModal :open="open" :title="t('gamepadRemap.title')" max-width="460px" @close="onClose">
    <template #body>
      <div class="pad-silhouette">
        <svg class="pad-shape" viewBox="0 0 400 220" preserveAspectRatio="none" aria-hidden="true">
          <!-- A generic top-down gamepad silhouette: a wide, gently-rounded trapezoid body
               (holding the shoulders/triggers along its flat top edge) flaring at the bottom
               into two large rounded grip lobes, with a shallow scalloped waist between them
               where a real pad narrows toward the d-pad/face-button cluster. Not modeled on any
               specific real controller - same reasoning as this codebase avoiding brand-specific
               shapes/logos elsewhere. -->
          <path
            d="M100,45
               C100,22 122,17 145,17
               L255,17
               C278,17 300,22 300,45
               L300,78
               C300,100 322,99 344,112
               C388,136 392,192 353,206
               C320,220 298,193 275,165
               C258,144 230,133 200,133
               C170,133 142,144 125,165
               C102,193 80,220 47,206
               C8,192 12,136 56,112
               C78,99 100,100 100,78
               Z"
          />
        </svg>
        <div
          v-for="btn in layoutButtons"
          :key="btn.index"
          class="pad-btn"
          :class="[`pad-btn-${PAD_POSITIONS[btn.index]?.shape ?? 'round'}`, { pressed: pressed[btn.index] }]"
          :style="{ left: `${PAD_POSITIONS[btn.index]?.x ?? 50}%`, top: `${PAD_POSITIONS[btn.index]?.y ?? 50}%` }"
        >
          {{ btn.label }}
        </div>
      </div>

      <div class="axis-readout" v-if="Object.keys(axisValues).length > 0">
        <span v-for="(value, axis) in axisValues" :key="axis">
          {{ t("gamepadRemap.axis") }} {{ axis }}: {{ value.toFixed(2) }}
        </span>
      </div>

      <div class="remap-fields">
        <div class="remap-row" v-for="action in ACTIONS" :key="action">
          <span class="action-label">{{ t(`gamepadRemap.actions.${action}`) }}</span>
          <span class="button-index">{{ directionBindingLabel(mapping[action]) }}</span>
          <button type="button" class="compact-button" @click="startListening(action)">
            {{
              listeningFor === action ? t("gamepadRemap.listening") : t("gamepadRemap.listen")
            }}
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

/* A gamepad silhouette (SVG body shape) with button hitzones positioned by percentage over it -
   not pixel-accurate to any specific real controller (deliberately generic, same reasoning as
   avoiding a brand-specific shape/logo elsewhere in this codebase), but reads as an actual pad
   at a glance instead of a plain grid of boxes. `PAD_POSITIONS` in the script drives both the
   shape's own viewBox coordinates and these percentage placements, so the two stay in sync. */
.pad-silhouette {
  position: relative;
  width: 100%;
  aspect-ratio: 400 / 220;
  margin-bottom: var(--space-3);
  font-size: 0.6rem;
}

.pad-shape {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  fill: var(--color-surface0);
  stroke: var(--color-border, currentColor);
  stroke-width: 2;
  stroke-opacity: 0.4;
}

.pad-btn {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border, currentColor);
  background: var(--color-surface1);
  opacity: 0.75;
  transition: background-color 0.05s, opacity 0.05s, transform 0.05s;
  line-height: 1;
}

.pad-btn.pressed {
  opacity: 1;
  background: var(--color-accent);
  color: var(--color-on-accent);
  transform: translate(-50%, -50%) scale(1.08);
}

/* Face/d-pad/back-home-start buttons - small round pads. */
.pad-btn-round {
  width: 9%;
  aspect-ratio: 1;
  border-radius: 50%;
}

/* Shoulders/triggers - wide flat pills along the top edge. */
.pad-btn-pill {
  width: 16%;
  aspect-ratio: 3.2;
  border-radius: var(--radius-lg);
}

/* Analog stick clicks - the largest circles, with an inner dot suggesting a stick's own cap. */
.pad-btn-stick {
  width: 13%;
  aspect-ratio: 1;
  border-radius: 50%;
  box-shadow: inset 0 0 0 3px var(--color-surface0);
}

.axis-readout {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  font-size: 0.75rem;
  opacity: 0.7;
  margin-bottom: var(--space-2);
}

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
