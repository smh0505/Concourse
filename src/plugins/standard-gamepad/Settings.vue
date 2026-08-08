<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";

import { useControllerMappingStore } from "@/stores/controllerMapping";
import type { GamepadMapping } from "@/plugins/types";
import BaseModal from "@/components/desktop/common/BaseModal.vue";
import defaultPlugin from "./index";

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
let frameHandle: number | undefined;

async function loadMapping() {
  const override = await controllerMapping.getMappingOverride(PLUGIN_ID);
  mapping.value = { ...DEFAULT_MAPPING, ...override };
}

async function persist() {
  await controllerMapping.setMappingOverride(PLUGIN_ID, { ...mapping.value });
}

function stopListening() {
  listeningFor.value = null;
  if (frameHandle !== undefined) cancelAnimationFrame(frameHandle);
  frameHandle = undefined;
}

function pollForButtonPress() {
  const pad = navigator.getGamepads()[0];
  if (pad) {
    const pressedIndex = pad.buttons.findIndex((b) => b.pressed || b.value > 0.5);
    if (pressedIndex !== -1 && listeningFor.value) {
      mapping.value[listeningFor.value] = pressedIndex;
      stopListening();
      void persist();
      return;
    }
  }
  frameHandle = requestAnimationFrame(pollForButtonPress);
}

function startListening(action: (typeof BUTTON_ACTIONS)[number]) {
  stopListening();
  listeningFor.value = action;
  frameHandle = requestAnimationFrame(pollForButtonPress);
}

async function onThresholdOrRepeatChange() {
  await persist();
}

async function onReset() {
  stopListening();
  await controllerMapping.resetMappingOverride(PLUGIN_ID);
  mapping.value = { ...DEFAULT_MAPPING };
}

function onOpen() {
  open.value = true;
  void loadMapping();
}

function onClose() {
  stopListening();
  open.value = false;
}

onBeforeUnmount(stopListening);
</script>

<template>
  <button type="button" class="settings-trigger" @click="onOpen">
    {{ t("gamepadRemap.settingsTrigger") }}
  </button>
  <BaseModal :open="open" :title="t('gamepadRemap.title')" max-width="380px" @close="onClose">
    <template #body>
      <div class="remap-fields">
        <div class="remap-row" v-for="action in BUTTON_ACTIONS" :key="action">
          <span class="action-label">{{ t(`gamepadRemap.actions.${action}`) }}</span>
          <span class="button-index">{{ mapping[action] }}</span>
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
  min-width: 1.5rem;
  text-align: center;
}

.remap-row input {
  width: 4.5rem;
  margin-left: auto;
}
</style>
