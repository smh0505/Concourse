<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useAppSettingsStore } from "@/stores/appSettings";
import { messages } from "@/i18n";

const { t } = useI18n();
const appSettings = useAppSettingsStore();
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
</style>
