<script setup lang="ts">
import { useAppSettingsStore } from "../../stores/appSettings";

const appSettings = useAppSettingsStore();
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
</style>
