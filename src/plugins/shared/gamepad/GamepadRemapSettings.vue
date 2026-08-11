<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { IconArrowDown, IconArrowLeft, IconArrowRight, IconArrowUp } from "@tabler/icons-vue";

import { useControllerMappingStore } from "@/stores/controllerMapping";
import type { GamepadDirectionBinding, GamepadMapping } from "@/plugins/types";
import BaseModal from "@/components/desktop/common/BaseModal.vue";
import { gamepadButtonLabel, STANDARD_GAMEPAD_LAYOUT_INDICES } from "./buttonNames";

// The live diagram shows an arrow icon instead of "D-Up"/"D-Down"/"D-Left"/"D-Right" text for
// these four - `directionBindingLabel` below still uses the plain text form (via
// gamepadButtonLabel) for the remap-fields list, only the on-shape label swaps to an icon.
const DPAD_ARROW_ICONS: Record<number, typeof IconArrowUp> = {
  12: IconArrowUp,
  13: IconArrowDown,
  14: IconArrowLeft,
  15: IconArrowRight,
};

type StickDirection = "up" | "down" | "left" | "right";
const STICK_LIGHT_ICONS: Record<StickDirection, typeof IconArrowUp> = {
  up: IconArrowUp,
  down: IconArrowDown,
  left: IconArrowLeft,
  right: IconArrowRight,
};
const STICK_DIRECTIONS: StickDirection[] = ["up", "down", "left", "right"];
// Per the Gamepad API's "standard" mapping, axes 0/1 are the left stick's x/y and 2/3 are the
// right stick's - same layout this plugin's default mapping already assumes for buttons.
const STICK_AXES: Record<"left" | "right", { x: number; y: number }> = {
  left: { x: 0, y: 1 },
  right: { x: 2, y: 3 },
};
// How far from the stick's own hitzone (in the same % units as PAD_POSITIONS) each direction
// light sits.
const STICK_LIGHT_OFFSET = 9;

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
// Collapsed by default - the raw per-axis readout is a debugging aid (which axis number moves),
// not something most users need open by default.
const showAxisDetails = ref(false);

// Drives the stick-direction "lights" - whether the given stick is currently tilted past the
// threshold in that direction, straight from the same live axisValues the readout above shows.
function stickDirectionActive(stick: "left" | "right", direction: StickDirection): boolean {
  const threshold = mapping.value.axisThreshold ?? 0.5;
  const axes = STICK_AXES[stick];
  const xValue = axisValues[axes.x] ?? 0;
  const yValue = axisValues[axes.y] ?? 0;
  if (direction === "left") return xValue < -threshold;
  if (direction === "right") return xValue > threshold;
  if (direction === "up") return yValue < -threshold;
  return yValue > threshold;
}

// Positions a stick's direction light a fixed offset from that stick's own hitzone (10 = LS,
// 11 = RS in PAD_POSITIONS below).
function stickLightStyle(stickButtonIndex: number, direction: StickDirection) {
  const pos = PAD_POSITIONS[stickButtonIndex];
  if (!pos) return {};
  const dx = direction === "left" ? -STICK_LIGHT_OFFSET : direction === "right" ? STICK_LIGHT_OFFSET : 0;
  const dy = direction === "up" ? -STICK_LIGHT_OFFSET : direction === "down" ? STICK_LIGHT_OFFSET : 0;
  return { left: `${pos.x + dx}%`, top: `${pos.y + dy}%` };
}

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
const layoutIndices = computed(() =>
  props.hasSticks
    ? STANDARD_GAMEPAD_LAYOUT_INDICES
    : STANDARD_GAMEPAD_LAYOUT_INDICES.filter((index) => index !== 10 && index !== 11),
);

// Silhouette placement, positioned as % of the SVG body's own viewBox (so hitzones track the
// shape at any render size) - an approximate Xbox-style asymmetric layout (left stick above the
// d-pad, face buttons above the right stick), not pixel-accurate to any real controller. `shape`
// picks the CSS treatment below: round buttons for face/stick clusters, wide pills for the
// shoulder/trigger row. The viewBox itself is cropped to the Tabler silhouette's real bounding
// box (see the SVG's own viewBox attribute below), so Y here spans the shape's own extent
// directly (0% = flat top edge, 100% = bottom of the grips) rather than an inset subrange.
const PAD_POSITIONS: Record<number, { x: number; y: number; shape: "round" | "pill" | "stick" }> =
  {
    // Shoulders/triggers - top edge.
    6: { x: 15, y: 8, shape: "pill" }, // LT
    4: { x: 15, y: 20, shape: "pill" }, // LB
    7: { x: 85, y: 8, shape: "pill" }, // RT
    5: { x: 85, y: 20, shape: "pill" }, // RB
    // Back/Home/Start - midway between the shoulder pairs' own y (8 and 20).
    8: { x: 42, y: 14, shape: "round" }, // Back
    16: { x: 50, y: 14, shape: "round" }, // Home
    9: { x: 58, y: 14, shape: "round" }, // Start
    // Left stick; the face-button diamond (below) is recentered on this same y.
    10: { x: 29, y: 38, shape: "stick" }, // LS
    // D-pad; recentered on the right stick's y (below), same 17-unit Up-Down span as before.
    12: { x: 29, y: 58, shape: "round" }, // D-Up
    14: { x: 22, y: 66, shape: "round" }, // D-Left
    15: { x: 36, y: 66, shape: "round" }, // D-Right
    13: { x: 29, y: 75, shape: "round" }, // D-Down
    // Face buttons diamond, vertically centered on LS's y (38); Y-to-A span narrowed to match
    // the d-pad's own Up-to-Down span (17) instead of the wider 22 it had before.
    3: { x: 71, y: 30, shape: "round" }, // Y
    2: { x: 64, y: 38, shape: "round" }, // X
    1: { x: 78, y: 38, shape: "round" }, // B
    0: { x: 71, y: 47, shape: "round" }, // A
    // Right stick, at y=66 (the d-pad above is recentered on this same y).
    11: { x: 71, y: 66, shape: "stick" }, // RS
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
        <svg class="pad-shape" viewBox="0 3 24 18" preserveAspectRatio="none" aria-hidden="true">
          <!-- The outer body outline from @tabler/icons-vue's "device-gamepad-2" filled icon
               (MIT, already a dependency of this project - see other components' own
               `simple-icons`/`@tabler/icons-vue` platform-icon usage), with its decorative
               inner d-pad/button glyph subpaths dropped - this component draws its own
               separate hitzones over the shape. Flat top edge, rounded shoulder corners,
               flares into two rounded bottom grips with a center notch: a real,
               professionally-drawn generic gamepad silhouette rather than a hand-traced one. -->
          <path
            d="M15.5 4a6 6 0 0 1 5.945 5.187l1.532 7.883a3.3 3.3 0 0 1 -5.632 2.903l-3.776 -3.974l-3.14 .001l-3.719 3.916a3.3 3.3 0 0 1 -5.629 -2.92l1.634 -8.173a6 6 0 0 1 5.885 -4.823z"
          />
        </svg>
        <div
          v-for="index in layoutIndices"
          :key="index"
          class="pad-btn"
          :class="[`pad-btn-${PAD_POSITIONS[index]?.shape ?? 'round'}`, { pressed: pressed[index] }]"
          :style="{ left: `${PAD_POSITIONS[index]?.x ?? 50}%`, top: `${PAD_POSITIONS[index]?.y ?? 50}%` }"
        >
          <component :is="DPAD_ARROW_ICONS[index]" v-if="DPAD_ARROW_ICONS[index]" :size="12" />
          <template v-else>{{ gamepadButtonLabel(index) }}</template>
        </div>
        <template v-if="hasSticks">
          <div
            v-for="direction in STICK_DIRECTIONS"
            :key="`ls-${direction}`"
            class="stick-light"
            :class="{ active: stickDirectionActive('left', direction) }"
            :style="stickLightStyle(10, direction)"
          >
            <component :is="STICK_LIGHT_ICONS[direction]" :size="10" />
          </div>
          <div
            v-for="direction in STICK_DIRECTIONS"
            :key="`rs-${direction}`"
            class="stick-light"
            :class="{ active: stickDirectionActive('right', direction) }"
            :style="stickLightStyle(11, direction)"
          >
            <component :is="STICK_LIGHT_ICONS[direction]" :size="10" />
          </div>
        </template>
      </div>

      <div class="axis-readout" v-if="Object.keys(axisValues).length > 0">
        <button type="button" class="compact-button" @click="showAxisDetails = !showAxisDetails">
          {{ showAxisDetails ? t("gamepadRemap.seeLessAxes") : t("gamepadRemap.seeMoreAxes") }}
        </button>
        <div class="axis-readout-list" v-if="showAxisDetails">
          <span v-for="(value, axis) in axisValues" :key="axis">
            {{ t("gamepadRemap.axis") }} {{ axis }}: {{ value.toFixed(2) }}
          </span>
        </div>
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
  /* Matches the SVG's own viewBox (0 3 24 18) - cropped to the silhouette's real bounding box
     (see the viewBox comment above) rather than the icon's native 24x24 square canvas, so
     there's no empty top/bottom margin around the shape. Padded a bit past the shape's exact
     y4-~20.3 extent (rather than cropping tight to it) since the bottom-corner arcs bulge
     slightly past their nominal endpoints - a tight crop clipped the grips' bottom edge. */
  aspect-ratio: 24 / 18;
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
  stroke-width: 0.4;
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

/* Small direction indicators ringing each stick - dim by default, light up when that stick is
   tilted past the threshold in that direction (see stickDirectionActive in the script). Placed
   independently of .pad-btn since they're not remappable hitzones themselves, just a live tilt
   readout. */
.stick-light {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.25;
  color: var(--color-text);
  transition: opacity 0.05s, color 0.05s;
  pointer-events: none;
}

.stick-light.active {
  opacity: 1;
  color: var(--color-accent);
}

.axis-readout {
  margin-bottom: var(--space-2);
}

.axis-readout-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  font-size: 0.75rem;
  opacity: 0.7;
  margin-top: var(--space-1);
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
