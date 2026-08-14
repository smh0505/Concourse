<script setup lang="ts">
import { useI18n } from "vue-i18n";

// Must match src-tauri/src/obs_presence.rs's PORT constant - fixed for this pass, not
// user-configurable yet (Milestone 29's own explicitly-deferred scope).
const OBS_PRESENCE_URL = "http://localhost:47474/";
const OBS_PRESENCE_STATUS_URL = "http://localhost:47474/status";

const { t } = useI18n();
</script>

<template>
  <p class="obs-presence-hint">
    {{ t("obsPresence.hint") }}
    <code>{{ OBS_PRESENCE_URL }}</code>
  </p>
  <p class="obs-presence-hint">
    {{ t("obsPresence.statusHint") }}
    <code>{{ OBS_PRESENCE_STATUS_URL }}</code>
  </p>
</template>

<style scoped>
.obs-presence-hint {
  font-size: 0.8rem;
  opacity: 0.8;
  margin: 0;
}

.obs-presence-hint code {
  font-size: 0.75rem;
  background: var(--color-surface0);
  padding: 0.1rem 0.3rem;
  border-radius: var(--radius-sm);
}
</style>
