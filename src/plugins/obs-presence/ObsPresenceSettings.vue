<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { invoke } from "@tauri-apps/api/core";

import { settings as settingsRepo } from "@/db";
import BaseModal from "@/components/desktop/common/BaseModal.vue";
import { OBS_PRESENCE_DEFAULT_PORT, OBS_PRESENCE_PORT_SETTING } from "./index";

const { t } = useI18n();

const modalOpen = ref(false);
const appliedPort = ref(OBS_PRESENCE_DEFAULT_PORT);
const portInput = ref(String(OBS_PRESENCE_DEFAULT_PORT));

type Status = "idle" | "busy" | "success" | "error";
const applyStatus = ref<Status>("idle");
const applyMessage = ref("");
const testStatus = ref<Status>("idle");
const testMessage = ref("");

const overlayUrl = computed(() => `http://localhost:${appliedPort.value}/`);
const statusUrl = computed(() => `http://localhost:${appliedPort.value}/status`);

async function openModal() {
  const stored = await settingsRepo.get(OBS_PRESENCE_PORT_SETTING);
  const storedPort = stored ? Number(stored) : OBS_PRESENCE_DEFAULT_PORT;
  appliedPort.value = Number.isInteger(storedPort) && storedPort > 0 ? storedPort : OBS_PRESENCE_DEFAULT_PORT;
  portInput.value = String(appliedPort.value);
  applyStatus.value = "idle";
  testStatus.value = "idle";
  modalOpen.value = true;
}

async function applyPort() {
  const port = Number(portInput.value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    applyStatus.value = "error";
    applyMessage.value = t("obsPresence.invalidPort");
    return;
  }
  // Rebinding to the port already applied would bind the same port twice before releasing the
  // old listener (set_obs_presence_port always binds new-then-drops-old, so a bad port can't
  // take down a working overlay) - a guaranteed self-collision, not a real failure.
  if (port === appliedPort.value) {
    applyStatus.value = "success";
    applyMessage.value = t("obsPresence.alreadyApplied", { port });
    return;
  }

  applyStatus.value = "busy";
  testStatus.value = "idle";
  try {
    await invoke("set_obs_presence_port", { port });
    await settingsRepo.set(OBS_PRESENCE_PORT_SETTING, String(port));
    appliedPort.value = port;
    applyStatus.value = "success";
    applyMessage.value = t("obsPresence.applySuccess", { port });
  } catch (e) {
    applyStatus.value = "error";
    applyMessage.value = String(e);
  }
}

/** Tests whatever port is currently typed - deliberately independent of `appliedPort`, so a
 *  failed/not-yet-applied Apply doesn't leave a stale success message next to a different port
 *  number in the field. */
async function testConnection() {
  const port = Number(portInput.value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    testStatus.value = "error";
    testMessage.value = t("obsPresence.invalidPort");
    return;
  }

  testStatus.value = "busy";
  try {
    await invoke("test_obs_presence_port", { port });
    testStatus.value = "success";
    testMessage.value = t("obsPresence.testSuccess", { port });
  } catch (e) {
    testStatus.value = "error";
    testMessage.value = String(e);
  }
}
</script>

<template>
  <button type="button" class="obs-presence-configure" @click="openModal">
    {{ t("obsPresence.configure") }}
  </button>

  <BaseModal :open="modalOpen" :title="t('obsPresence.modalTitle')" @close="modalOpen = false">
    <template #body>
      <label class="obs-presence-field">
        {{ t("obsPresence.portLabel") }}
        <input v-model="portInput" type="number" min="1" max="65535" />
      </label>
      <div class="obs-presence-actions">
        <button type="button" @click="applyPort">{{ t("obsPresence.apply") }}</button>
        <button type="button" @click="testConnection">{{ t("obsPresence.test") }}</button>
      </div>
      <p v-if="applyStatus !== 'idle'" class="obs-presence-status" :class="applyStatus">
        {{ applyMessage }}
      </p>
      <p v-if="testStatus !== 'idle'" class="obs-presence-status" :class="testStatus">
        {{ testMessage }}
      </p>

      <p class="obs-presence-hint">
        {{ t("obsPresence.hint") }}
        <code>{{ overlayUrl }}</code>
      </p>
      <p class="obs-presence-hint">
        {{ t("obsPresence.statusHint") }}
        <code>{{ statusUrl }}</code>
      </p>
    </template>
    <template #footer>
      <button type="button" @click="modalOpen = false">{{ t("obsPresence.close") }}</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.obs-presence-configure {
  font-size: 0.8rem;
}

.obs-presence-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: 0.85rem;
}

.obs-presence-actions {
  display: flex;
  gap: var(--space-2);
}

.obs-presence-status {
  font-size: 0.8rem;
  margin: 0;
}

.obs-presence-status.success {
  color: var(--color-accent);
}

.obs-presence-status.error {
  color: var(--color-danger);
}

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
