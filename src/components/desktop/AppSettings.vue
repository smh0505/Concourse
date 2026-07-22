<script setup lang="ts">
import { ref, watch } from "vue";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAppSettingsStore } from "../../stores/appSettings";

const LOCALE_REMULATOR_RELEASES_URL = "https://github.com/InWILL/Locale_Remulator/releases";
const LOCALE_EMULATOR_RELEASES_URL = "https://github.com/xupefei/Locale-Emulator/releases";

const appSettings = useAppSettingsStore();
const lrPathValid = ref<boolean | null>(null);
const lePathValid = ref<boolean | null>(null);

watch(
  () => appSettings.localeRemulatorPath,
  async (path) => {
    lrPathValid.value = path ? await appSettings.wrapperPathValid(path) : null;
  },
  { immediate: true },
);

watch(
  () => appSettings.localeEmulatorPath,
  async (path) => {
    lePathValid.value = path ? await appSettings.wrapperPathValid(path) : null;
  },
  { immediate: true },
);
</script>

<template>
  <div class="app-settings">
    <label class="checkbox-label">
      <input
        type="checkbox"
        :checked="appSettings.autoLaunchBigPicture"
        @change="
          appSettings.setAutoLaunchBigPicture(($event.target as HTMLInputElement).checked)
        "
      />
      Launch into Big Picture Mode on startup
    </label>
    <label class="wrapper-path">
      Locale Remulator (LRProc.exe path)
      <div class="input-with-button">
        <input
          :value="appSettings.localeRemulatorPath"
          placeholder="e.g. C:\Locale_Remulator.1.6.0\LRProc.exe"
          @change="appSettings.setLocaleRemulatorPath(($event.target as HTMLInputElement).value)"
        />
        <button type="button" @click="openUrl(LOCALE_REMULATOR_RELEASES_URL)">Download</button>
      </div>
      <span v-if="lrPathValid === true" class="status-ok">Found.</span>
      <span v-else-if="lrPathValid === false" class="status-bad">Not found at this path.</span>
    </label>
    <label class="wrapper-path">
      Locale Emulator (LEProc.exe path)
      <div class="input-with-button">
        <input
          :value="appSettings.localeEmulatorPath"
          placeholder="e.g. C:\Locale Emulator\LEProc.exe"
          @change="appSettings.setLocaleEmulatorPath(($event.target as HTMLInputElement).value)"
        />
        <button type="button" @click="openUrl(LOCALE_EMULATOR_RELEASES_URL)">Download</button>
      </div>
      <span v-if="lePathValid === true" class="status-ok">Found.</span>
      <span v-else-if="lePathValid === false" class="status-bad">Not found at this path.</span>
    </label>
  </div>
</template>

<style scoped>
.app-settings {
  margin-bottom: 1.5rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.wrapper-path {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  margin-top: 0.75rem;
  max-width: 420px;
}

.input-with-button {
  display: flex;
  gap: 0.4rem;
}

.input-with-button input {
  flex: 1;
}

.status-ok {
  color: var(--color-accent);
  font-size: 0.75rem;
}

.status-bad {
  color: var(--color-danger);
  font-size: 0.75rem;
}
</style>
