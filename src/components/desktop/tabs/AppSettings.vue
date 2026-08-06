<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { IconChevronDown } from "@tabler/icons-vue";

import { useAppSettingsStore } from "@/stores/appSettings";
import { useTranslationStore } from "@/stores/translation";
import { DropdownMenu } from "@/components/desktop/common";
import { messages } from "@/i18n";

const { t } = useI18n();
const appSettings = useAppSettingsStore();
const translation = useTranslationStore();
const localeOptions = Object.keys(messages) as (keyof typeof messages)[];
const localeNames: Record<string, string> = {
  en: "English",
  ko: "한국어",
  ja: "日本語",
  "zh-Hans": "简体中文",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  "pt-BR": "Português (Brasil)",
  ru: "Русский",
  it: "Italiano",
};

function formatBytes(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

const downloadPercent = computed(() => {
  const progress = translation.downloadProgress;
  if (!progress || progress.total === 0) return 0;
  return Math.round((progress.downloaded / progress.total) * 100);
});

const selectedModel = computed(() =>
  translation.models.find((m) => m.id === translation.selectedModelId) ?? null,
);

const modelMenuOpen = ref(false);

function selectModel(modelId: string) {
  translation.setSelectedModel(modelId);
  modelMenuOpen.value = false;
}
</script>

<template>
  <div class="app-settings settings-panel">
    <label class="checkbox-label">
      <input
        type="checkbox"
        :checked="appSettings.autoLaunchBigPicture"
        @change="
          appSettings.setAutoLaunchBigPicture(($event.target as HTMLInputElement).checked)
        "
      />
      {{ t("settings.autoLaunchBigPicture") }}
    </label>

    <label class="language-label">
      {{ t("settings.language") }}
      <select
        :value="appSettings.locale"
        @change="appSettings.setLocale(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="code in localeOptions" :key="code" :value="code">
          {{ localeNames[code] ?? code }}
        </option>
      </select>
    </label>

    <div class="translation-section">
      <h3>{{ t("settings.translation") }}</h3>
      <small>{{ t("settings.translationHint") }}</small>

      <div class="model-row">
        <span class="model-name">{{ t("settings.translationEngine") }}</span>
        <button
          v-if="translation.engineDownloaded"
          type="button"
          class="compact-button"
          @click="translation.removeEngine()"
        >
          {{ t("settings.remove") }}
        </button>
        <button v-else-if="translation.downloadingEngine" type="button" class="compact-button" disabled>
          {{ t("settings.downloadingEngine") }}
        </button>
        <button
          v-else
          type="button"
          class="compact-button"
          @click="translation.downloadEngine()"
        >
          {{ t("settings.download") }}
        </button>
      </div>

      <div class="model-row model-row-spaced">
        <DropdownMenu
          v-model:open="modelMenuOpen"
          wrap-class="model-menu-wrap"
          panel-class="model-menu-panel"
        >
          <template #trigger>
            <button
              type="button"
              class="compact-button model-menu-trigger"
              @click="modelMenuOpen = !modelMenuOpen"
            >
              <span class="model-menu-trigger-info">
                <span class="model-name">{{ selectedModel?.name }}</span>
                <span class="model-subtitle">{{ selectedModel?.subtitle }}</span>
              </span>
              <IconChevronDown :size="14" :stroke-width="1.75" />
            </button>
          </template>
          <button
            v-for="model in translation.models"
            :key="model.id"
            type="button"
            class="model-menu-item"
            :class="{ active: model.id === translation.selectedModelId }"
            @click="selectModel(model.id)"
          >
            <span class="model-menu-item-info">
              <span class="model-name">{{ model.name }}</span>
              <span class="model-subtitle">{{ model.subtitle }}</span>
            </span>
            <span class="model-size">{{ formatBytes(model.size_bytes) }}</span>
          </button>
        </DropdownMenu>
        <button
          v-if="selectedModel && translation.isDownloaded(selectedModel.id)"
          type="button"
          class="compact-button"
          @click="translation.removeModel(selectedModel.id)"
        >
          {{ t("settings.remove") }}
        </button>
        <button
          v-else-if="selectedModel && translation.downloadingId === selectedModel.id"
          type="button"
          class="compact-button"
          disabled
        >
          {{ t("settings.downloading", { percent: downloadPercent }) }}
        </button>
        <button
          v-else
          type="button"
          class="compact-button"
          :disabled="!selectedModel || translation.downloadingId !== null"
          @click="selectedModel && translation.downloadModel(selectedModel.id)"
        >
          {{ t("settings.download") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.checkbox-label,
.language-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.9rem;
}

.language-label {
  margin-top: var(--space-3);
}

.translation-section {
  margin-top: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.translation-section h3 {
  font-size: 0.95rem;
  margin: 0;
}

.model-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.85rem;
}

.model-row-spaced {
  margin-top: var(--space-2);
}

.model-name {
  flex: 1;
}

.model-subtitle {
  opacity: 0.7;
  font-size: 0.75rem;
}

.model-size {
  opacity: 0.7;
  font-size: 0.75rem;
}

/* Shell (trigger/panel/backdrop positioning and chrome) comes from DropdownMenu.vue, shared
   with GameDetail.vue's translate menu - title/subtitle stacked on two left-aligned lines
   instead of a native <select>'s single-line "Name — subtitle" text, which a <select> can't
   style per-line anyway. */
.model-menu-wrap {
  flex: 1;
  min-width: 0;
}

.model-menu-trigger {
  width: 100%;
  justify-content: space-between;
}

.model-menu-trigger-info,
.model-menu-item-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  min-width: 0;
}

/* :deep() is required here, not a plain scoped selector - the panel div lives inside
   DropdownMenu.vue's own template (not its root, which is the only element Vue's scoped-CSS
   child exception reaches), so it never carries this component's own scope attribute. Stretches
   the panel to the trigger's full width - DropdownMenu's own panel only sets left:0. */
.model-menu-wrap :deep(.model-menu-panel) {
  right: 0;
}

.model-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: 0.85rem;
  border: none;
  background: none;
  cursor: pointer;
  color: inherit;
}

.model-menu-item:hover {
  background: var(--color-surface0);
}

/* Derived from currentColor (the text's own color), not a fixed --color-surfaceX token - some
   themes set --color-surface1 dark/saturated independent of --color-text (tuned against
   --color-base/--color-surface0's lightness instead), which could make selected-item text
   unreadable against it. Tinting toward currentColor at low opacity guarantees a visible but
   readable highlight regardless of what a given theme sets its surface tokens to. */
.model-menu-item.active {
  background: color-mix(in srgb, currentColor 12%, transparent);
}
</style>
