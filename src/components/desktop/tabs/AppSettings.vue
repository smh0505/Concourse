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

      <div class="model-list">
        <label v-for="model in translation.models" :key="model.id" class="model-row">
          <input
            type="radio"
            name="translation-model"
            :value="model.id"
            :checked="translation.selectedModelId === model.id"
            @change="translation.setSelectedModel(model.id)"
          />
          <span class="model-name">{{ model.name }}</span>
          <span class="model-size">{{ formatBytes(model.size_bytes) }}</span>
          <button
            v-if="translation.isDownloaded(model.id)"
            type="button"
            class="compact-button"
            @click="translation.removeModel(model.id)"
          >
            {{ t("settings.remove") }}
          </button>
          <button
            v-else-if="translation.downloadingId === model.id"
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
            :disabled="translation.downloadingId !== null"
            @click="translation.downloadModel(model.id)"
          >
            {{ t("settings.download") }}
          </button>
        </label>
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

.model-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.model-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.85rem;
}

.model-name {
  flex: 1;
}

.model-size {
  opacity: 0.7;
  font-size: 0.75rem;
}
</style>
