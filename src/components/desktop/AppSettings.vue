<script setup lang="ts">
import { useAppSettingsStore } from "../../stores/appSettings";

const appSettings = useAppSettingsStore();
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
      Launch into Big Picture Mode on startup
    </label>
  </div>
</template>

<style scoped>
.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.9rem;
}
</style>
