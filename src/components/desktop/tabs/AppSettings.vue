<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { useAppSettingsStore } from "@/stores/appSettings";
import { useTranslationStore } from "@/stores/translation";
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
        <select
          class="model-select"
          :value="translation.selectedModelId ?? ''"
          @change="translation.setSelectedModel(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="model in translation.models" :key="model.id" :value="model.id">
            {{ model.name }} — {{ model.subtitle }} ({{ formatBytes(model.size_bytes) }})
          </option>
        </select>
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

.model-select {
  flex: 1;
  min-width: 0;
}
</style>
