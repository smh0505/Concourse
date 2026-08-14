<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { invoke } from "@tauri-apps/api/core";

import { settings as settingsRepo } from "@/db";
import BaseModal from "@/components/desktop/common/BaseModal.vue";
import {
  OBS_PRESENCE_ALERT_SECONDS_SETTING,
  OBS_PRESENCE_DEFAULT_ALERT_SECONDS,
  OBS_PRESENCE_DEFAULT_MODE,
  OBS_PRESENCE_DEFAULT_PORT,
  OBS_PRESENCE_DEFAULT_TEMPLATE,
  OBS_PRESENCE_MODE_SETTING,
  OBS_PRESENCE_PORT_SETTING,
  OBS_PRESENCE_TEMPLATE_SETTING,
} from "./index";

const { t } = useI18n();

const modalOpen = ref(false);
const appliedPort = ref(OBS_PRESENCE_DEFAULT_PORT);
const portInput = ref(String(OBS_PRESENCE_DEFAULT_PORT));

const template = ref(OBS_PRESENCE_DEFAULT_TEMPLATE);
const mode = ref(OBS_PRESENCE_DEFAULT_MODE);
const alertSeconds = ref(OBS_PRESENCE_DEFAULT_ALERT_SECONDS);
const styleStatus = ref<"idle" | "error">("idle");
const styleMessage = ref("");

type Status = "idle" | "busy" | "success" | "error";
const applyStatus = ref<Status>("idle");
const applyMessage = ref("");
const applyRaw = ref("");
const testStatus = ref<Status>("idle");
const testMessage = ref("");
const testRaw = ref("");

const overlayUrl = computed(() => `http://localhost:${appliedPort.value}/`);
const statusUrl = computed(() => `http://localhost:${appliedPort.value}/status`);

/** Mirrors obs_presence.rs's `ObsPresenceError` (`#[serde(tag = "kind")]`) - tauri's `invoke()`
 *  rejects with the deserialized error object directly, not a wrapped JS `Error`. */
type ObsPresenceError =
  | { kind: "BindFailed"; port: number; raw: string }
  | { kind: "Unreachable"; port: number; raw: string }
  | { kind: "BadStatus"; port: number; status: number; raw: string };

function isObsPresenceError(e: unknown): e is ObsPresenceError {
  return typeof e === "object" && e !== null && "kind" in e;
}

/** Turns a rejected `invoke()` error into a localized "why" sentence plus the original OS/HTTP
 *  error text as a separate raw detail - not dropped (it's what diagnosed both real cases hit
 *  this session), just no longer the *only* thing shown. */
function describeError(e: unknown): { message: string; raw: string } {
  if (!isObsPresenceError(e)) return { message: String(e), raw: "" };
  switch (e.kind) {
    case "BindFailed":
      return { message: t("obsPresence.errorBindFailed", { port: e.port }), raw: e.raw };
    case "Unreachable":
      return { message: t("obsPresence.errorUnreachable", { port: e.port }), raw: e.raw };
    case "BadStatus":
      return {
        message: t("obsPresence.errorBadStatus", { port: e.port, status: e.status }),
        raw: e.raw,
      };
  }
}

async function openModal() {
  const stored = await settingsRepo.get(OBS_PRESENCE_PORT_SETTING);
  const storedPort = stored ? Number(stored) : OBS_PRESENCE_DEFAULT_PORT;
  appliedPort.value = Number.isInteger(storedPort) && storedPort > 0 ? storedPort : OBS_PRESENCE_DEFAULT_PORT;
  portInput.value = String(appliedPort.value);
  applyStatus.value = "idle";
  testStatus.value = "idle";

  const [storedTemplate, storedMode, storedAlertSeconds] = await Promise.all([
    settingsRepo.get(OBS_PRESENCE_TEMPLATE_SETTING),
    settingsRepo.get(OBS_PRESENCE_MODE_SETTING),
    settingsRepo.get(OBS_PRESENCE_ALERT_SECONDS_SETTING),
  ]);
  template.value = storedTemplate ?? OBS_PRESENCE_DEFAULT_TEMPLATE;
  mode.value = storedMode ?? OBS_PRESENCE_DEFAULT_MODE;
  const parsedAlertSeconds = storedAlertSeconds ? Number(storedAlertSeconds) : NaN;
  alertSeconds.value =
    Number.isInteger(parsedAlertSeconds) && parsedAlertSeconds > 0
      ? parsedAlertSeconds
      : OBS_PRESENCE_DEFAULT_ALERT_SECONDS;
  styleStatus.value = "idle";

  modalOpen.value = true;
}

/** No bind/collision failure mode for style (unlike the port), so this applies immediately on
 *  any control change rather than needing an explicit Apply button. */
async function applyStyle() {
  const seconds = Math.max(1, Math.round(alertSeconds.value));
  try {
    await invoke("set_obs_overlay_style", {
      template: template.value,
      mode: mode.value,
      alertSeconds: seconds,
    });
    await Promise.all([
      settingsRepo.set(OBS_PRESENCE_TEMPLATE_SETTING, template.value),
      settingsRepo.set(OBS_PRESENCE_MODE_SETTING, mode.value),
      settingsRepo.set(OBS_PRESENCE_ALERT_SECONDS_SETTING, String(seconds)),
    ]);
    styleStatus.value = "idle";
  } catch (e) {
    styleStatus.value = "error";
    styleMessage.value = String(e);
  }
}

async function applyPort() {
  const port = Number(portInput.value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    applyStatus.value = "error";
    applyMessage.value = t("obsPresence.invalidPort");
    applyRaw.value = "";
    return;
  }
  // Rebinding to the port already applied would bind the same port twice before releasing the
  // old listener (set_obs_presence_port always binds new-then-drops-old, so a bad port can't
  // take down a working overlay) - a guaranteed self-collision, not a real failure.
  if (port === appliedPort.value) {
    applyStatus.value = "success";
    applyMessage.value = t("obsPresence.alreadyApplied", { port });
    applyRaw.value = "";
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
    applyRaw.value = "";
  } catch (e) {
    applyStatus.value = "error";
    const { message, raw } = describeError(e);
    applyMessage.value = message;
    applyRaw.value = raw;
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
    testRaw.value = "";
    return;
  }

  testStatus.value = "busy";
  try {
    await invoke("test_obs_presence_port", { port });
    testStatus.value = "success";
    testMessage.value = t("obsPresence.testSuccess", { port });
    testRaw.value = "";
  } catch (e) {
    testStatus.value = "error";
    const { message, raw } = describeError(e);
    testMessage.value = message;
    testRaw.value = raw;
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
      <div v-if="applyStatus !== 'idle'" class="obs-presence-status" :class="applyStatus">
        <p>{{ applyMessage }}</p>
        <p v-if="applyRaw" class="obs-presence-status-raw">{{ applyRaw }}</p>
      </div>
      <div v-if="testStatus !== 'idle'" class="obs-presence-status" :class="testStatus">
        <p>{{ testMessage }}</p>
        <p v-if="testRaw" class="obs-presence-status-raw">{{ testRaw }}</p>
      </div>

      <div class="obs-presence-style">
        <label class="obs-presence-field">
          {{ t("obsPresence.templateLabel") }}
          <select v-model="template" @change="applyStyle">
            <option value="full">{{ t("obsPresence.templateFull") }}</option>
            <option value="minimal">{{ t("obsPresence.templateMinimal") }}</option>
          </select>
        </label>
        <label class="obs-presence-field">
          {{ t("obsPresence.modeLabel") }}
          <select v-model="mode" @change="applyStyle">
            <option value="persistent">{{ t("obsPresence.modePersistent") }}</option>
            <option value="alert">{{ t("obsPresence.modeAlert") }}</option>
          </select>
        </label>
        <label v-if="mode === 'alert'" class="obs-presence-field">
          {{ t("obsPresence.alertSecondsLabel") }}
          <input v-model.number="alertSeconds" type="number" min="1" max="120" @change="applyStyle" />
        </label>
        <div v-if="styleStatus === 'error'" class="obs-presence-status error">
          <p>{{ styleMessage }}</p>
        </div>
      </div>

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
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.obs-presence-status p {
  font-size: 0.8rem;
  margin: 0;
}

.obs-presence-status.success p {
  color: var(--color-accent);
}

.obs-presence-status.error p {
  color: var(--color-danger);
}

.obs-presence-status-raw {
  font-family: monospace;
  font-size: 0.7rem !important;
  opacity: 0.7;
  color: var(--color-text) !important;
}

.obs-presence-style {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-surface0);
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
