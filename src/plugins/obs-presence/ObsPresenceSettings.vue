<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { invoke } from "@tauri-apps/api/core";
import { IconCheck, IconChevronDown, IconPlugConnected } from "@tabler/icons-vue";

import { settings as settingsRepo } from "@/db";
import BaseModal from "@/components/desktop/common/BaseModal.vue";
import { DropdownMenu } from "@/components/desktop/common";
import {
  OBS_PRESENCE_ALERT_SECONDS_SETTING,
  OBS_PRESENCE_CORNER_SETTING,
  OBS_PRESENCE_DEFAULT_ALERT_SECONDS,
  OBS_PRESENCE_DEFAULT_CORNER,
  OBS_PRESENCE_DEFAULT_MODE,
  OBS_PRESENCE_DEFAULT_PORT,
  OBS_PRESENCE_DEFAULT_TEMPLATE,
  OBS_PRESENCE_MODE_SETTING,
  OBS_PRESENCE_PORT_SETTING,
  OBS_PRESENCE_TEMPLATE_SETTING,
  OBS_WS_DEFAULT_HOST,
  OBS_WS_DEFAULT_PORT,
  OBS_WS_ENABLED_SETTING,
  OBS_WS_END_SCENE_SETTING,
  OBS_WS_HOST_SETTING,
  OBS_WS_PASSWORD_SETTING,
  OBS_WS_PORT_SETTING,
  OBS_WS_START_SCENE_SETTING,
} from "./index";

const { t } = useI18n();

const modalOpen = ref(false);
const appliedPort = ref(OBS_PRESENCE_DEFAULT_PORT);
const portInput = ref(String(OBS_PRESENCE_DEFAULT_PORT));

const template = ref(OBS_PRESENCE_DEFAULT_TEMPLATE);
const mode = ref(OBS_PRESENCE_DEFAULT_MODE);
const alertSeconds = ref(OBS_PRESENCE_DEFAULT_ALERT_SECONDS);
const corner = ref(OBS_PRESENCE_DEFAULT_CORNER);
const styleStatus = ref<"idle" | "error">("idle");
const styleMessage = ref("");
const templateMenuOpen = ref(false);
const modeMenuOpen = ref(false);
const cornerMenuOpen = ref(false);

const templateLabel = computed(() =>
  template.value === "minimal" ? t("obsPresence.templateMinimal") : t("obsPresence.templateFull"),
);
const modeLabel = computed(() =>
  mode.value === "alert" ? t("obsPresence.modeAlert") : t("obsPresence.modePersistent"),
);
const cornerLabels: Record<string, string> = {
  "top-left": "cornerTopLeft",
  "top-right": "cornerTopRight",
  "bottom-left": "cornerBottomLeft",
  "bottom-right": "cornerBottomRight",
};
const cornerLabel = computed(() => t(`obsPresence.${cornerLabels[corner.value]}`));

function selectTemplate(value: string) {
  template.value = value;
  templateMenuOpen.value = false;
  applyStyle();
}

function selectMode(value: string) {
  mode.value = value;
  modeMenuOpen.value = false;
  applyStyle();
}

function selectCorner(value: string) {
  corner.value = value;
  cornerMenuOpen.value = false;
  applyStyle();
}

const wsEnabled = ref(false);
const wsHost = ref(OBS_WS_DEFAULT_HOST);
const wsPort = ref(String(OBS_WS_DEFAULT_PORT));
const wsPassword = ref("");
const wsStartScene = ref("");
const wsEndScene = ref("");
const wsScenes = ref<string[]>([]);
const wsFetchStatus = ref<"idle" | "busy" | "success" | "error">("idle");
const wsFetchMessage = ref("");
const wsFetchRaw = ref("");

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

/** Turns a rejected `invoke()` error into a localized "why" sentence plus the raw OS/HTTP text
 *  as a separate detail line. */
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

/** Mirrors obs_websocket.rs's `ObsWsError`. */
type ObsWsError = { kind: "ConnectFailed" | "RequestFailed"; raw: string };

function isObsWsError(e: unknown): e is ObsWsError {
  return typeof e === "object" && e !== null && "kind" in e;
}

function describeWsError(e: unknown): { message: string; raw: string } {
  if (!isObsWsError(e)) return { message: String(e), raw: "" };
  switch (e.kind) {
    case "ConnectFailed":
      return { message: t("obsPresence.wsErrorConnectFailed"), raw: e.raw };
    case "RequestFailed":
      return { message: t("obsPresence.wsErrorRequestFailed"), raw: e.raw };
  }
}

/** Instant-persist on change, same as the style section - no connect-time failure mode from
 *  just typing. */
async function saveWsSettings() {
  await Promise.all([
    settingsRepo.set(OBS_WS_ENABLED_SETTING, String(wsEnabled.value)),
    settingsRepo.set(OBS_WS_HOST_SETTING, wsHost.value || OBS_WS_DEFAULT_HOST),
    settingsRepo.set(OBS_WS_PORT_SETTING, wsPort.value || String(OBS_WS_DEFAULT_PORT)),
    settingsRepo.set(OBS_WS_PASSWORD_SETTING, wsPassword.value),
    settingsRepo.set(OBS_WS_START_SCENE_SETTING, wsStartScene.value),
    settingsRepo.set(OBS_WS_END_SCENE_SETTING, wsEndScene.value),
  ]);
}

/** Populates the scene autocomplete list; doubles as a connectivity test. */
async function fetchScenes() {
  const port = Number(wsPort.value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    wsFetchStatus.value = "error";
    wsFetchMessage.value = t("obsPresence.invalidPort");
    wsFetchRaw.value = "";
    return;
  }

  wsFetchStatus.value = "busy";
  try {
    const scenes = await invoke<string[]>("obs_ws_list_scenes", {
      host: wsHost.value || OBS_WS_DEFAULT_HOST,
      port,
      password: wsPassword.value || null,
    });
    wsScenes.value = scenes;
    wsFetchStatus.value = "success";
    wsFetchMessage.value = t("obsPresence.wsFetchSuccess", { count: scenes.length });
    wsFetchRaw.value = "";
  } catch (e) {
    wsFetchStatus.value = "error";
    const { message, raw } = describeWsError(e);
    wsFetchMessage.value = message;
    wsFetchRaw.value = raw;
  }
}

async function openModal() {
  const stored = await settingsRepo.get(OBS_PRESENCE_PORT_SETTING);
  const storedPort = stored ? Number(stored) : OBS_PRESENCE_DEFAULT_PORT;
  appliedPort.value = Number.isInteger(storedPort) && storedPort > 0 ? storedPort : OBS_PRESENCE_DEFAULT_PORT;
  portInput.value = String(appliedPort.value);
  applyStatus.value = "idle";
  testStatus.value = "idle";

  const [storedTemplate, storedMode, storedAlertSeconds, storedCorner] = await Promise.all([
    settingsRepo.get(OBS_PRESENCE_TEMPLATE_SETTING),
    settingsRepo.get(OBS_PRESENCE_MODE_SETTING),
    settingsRepo.get(OBS_PRESENCE_ALERT_SECONDS_SETTING),
    settingsRepo.get(OBS_PRESENCE_CORNER_SETTING),
  ]);
  template.value = storedTemplate ?? OBS_PRESENCE_DEFAULT_TEMPLATE;
  mode.value = storedMode ?? OBS_PRESENCE_DEFAULT_MODE;
  const parsedAlertSeconds = storedAlertSeconds ? Number(storedAlertSeconds) : NaN;
  alertSeconds.value =
    Number.isInteger(parsedAlertSeconds) && parsedAlertSeconds > 0
      ? parsedAlertSeconds
      : OBS_PRESENCE_DEFAULT_ALERT_SECONDS;
  corner.value = storedCorner ?? OBS_PRESENCE_DEFAULT_CORNER;
  styleStatus.value = "idle";

  const [storedWsEnabled, storedWsHost, storedWsPort, storedWsPassword, storedStartScene, storedEndScene] =
    await Promise.all([
      settingsRepo.get(OBS_WS_ENABLED_SETTING),
      settingsRepo.get(OBS_WS_HOST_SETTING),
      settingsRepo.get(OBS_WS_PORT_SETTING),
      settingsRepo.get(OBS_WS_PASSWORD_SETTING),
      settingsRepo.get(OBS_WS_START_SCENE_SETTING),
      settingsRepo.get(OBS_WS_END_SCENE_SETTING),
    ]);
  wsEnabled.value = storedWsEnabled === "true";
  wsHost.value = storedWsHost || OBS_WS_DEFAULT_HOST;
  wsPort.value = storedWsPort || String(OBS_WS_DEFAULT_PORT);
  wsPassword.value = storedWsPassword ?? "";
  wsStartScene.value = storedStartScene ?? "";
  wsEndScene.value = storedEndScene ?? "";
  wsScenes.value = [];
  wsFetchStatus.value = "idle";

  modalOpen.value = true;
}

/** No bind/collision failure mode for style, so this applies immediately on change. */
async function applyStyle() {
  const seconds = Math.max(1, Math.round(alertSeconds.value));
  try {
    await invoke("set_obs_overlay_style", {
      template: template.value,
      mode: mode.value,
      alertSeconds: seconds,
      corner: corner.value,
    });
    await Promise.all([
      settingsRepo.set(OBS_PRESENCE_TEMPLATE_SETTING, template.value),
      settingsRepo.set(OBS_PRESENCE_MODE_SETTING, mode.value),
      settingsRepo.set(OBS_PRESENCE_ALERT_SECONDS_SETTING, String(seconds)),
      settingsRepo.set(OBS_PRESENCE_CORNER_SETTING, corner.value),
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
  // Reapplying the same port is a guaranteed self-collision (new binds before old drops), not a
  // real failure.
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

/** Tests whatever port is typed, independent of `appliedPort`. */
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
      <div class="obs-presence-labeled-row">
        <span class="obs-presence-row-label">{{ t("obsPresence.portLabel") }}</span>
        <input v-model="portInput" type="number" min="1" max="65535" />
        <button
          type="button"
          class="obs-presence-icon-button"
          :title="t('obsPresence.apply')"
          @click="applyPort"
        >
          <IconCheck :size="16" :stroke-width="1.75" />
        </button>
        <button
          type="button"
          class="obs-presence-icon-button"
          :title="t('obsPresence.test')"
          @click="testConnection"
        >
          <IconPlugConnected :size="16" :stroke-width="1.75" />
        </button>
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
        <div class="obs-presence-labeled-row">
          <span class="obs-presence-row-label">{{ t("obsPresence.templateLabel") }}</span>
          <DropdownMenu
            v-model:open="templateMenuOpen"
            wrap-class="obs-presence-dropdown-wrap"
            panel-class="obs-presence-dropdown-panel"
          >
            <template #trigger>
              <button
                type="button"
                class="compact-button obs-presence-dropdown-trigger"
                @click="templateMenuOpen = !templateMenuOpen"
              >
                {{ templateLabel }}
                <IconChevronDown :size="14" :stroke-width="1.75" />
              </button>
            </template>
            <button
              type="button"
              class="obs-presence-dropdown-item"
              :class="{ active: template === 'full' }"
              @click="selectTemplate('full')"
            >
              {{ t("obsPresence.templateFull") }}
            </button>
            <button
              type="button"
              class="obs-presence-dropdown-item"
              :class="{ active: template === 'minimal' }"
              @click="selectTemplate('minimal')"
            >
              {{ t("obsPresence.templateMinimal") }}
            </button>
          </DropdownMenu>
        </div>
        <div class="obs-presence-labeled-row">
          <span class="obs-presence-row-label">{{ t("obsPresence.modeLabel") }}</span>
          <DropdownMenu
            v-model:open="modeMenuOpen"
            wrap-class="obs-presence-dropdown-wrap"
            panel-class="obs-presence-dropdown-panel"
          >
            <template #trigger>
              <button
                type="button"
                class="compact-button obs-presence-dropdown-trigger"
                @click="modeMenuOpen = !modeMenuOpen"
              >
                {{ modeLabel }}
                <IconChevronDown :size="14" :stroke-width="1.75" />
              </button>
            </template>
            <button
              type="button"
              class="obs-presence-dropdown-item"
              :class="{ active: mode === 'persistent' }"
              @click="selectMode('persistent')"
            >
              {{ t("obsPresence.modePersistent") }}
            </button>
            <button
              type="button"
              class="obs-presence-dropdown-item"
              :class="{ active: mode === 'alert' }"
              @click="selectMode('alert')"
            >
              {{ t("obsPresence.modeAlert") }}
            </button>
          </DropdownMenu>
        </div>
        <div class="obs-presence-labeled-row">
          <span class="obs-presence-row-label">{{ t("obsPresence.cornerLabel") }}</span>
          <DropdownMenu
            v-model:open="cornerMenuOpen"
            wrap-class="obs-presence-dropdown-wrap"
            panel-class="obs-presence-dropdown-panel"
          >
            <template #trigger>
              <button
                type="button"
                class="compact-button obs-presence-dropdown-trigger"
                @click="cornerMenuOpen = !cornerMenuOpen"
              >
                {{ cornerLabel }}
                <IconChevronDown :size="14" :stroke-width="1.75" />
              </button>
            </template>
            <button
              v-for="(labelKey, value) in cornerLabels"
              :key="value"
              type="button"
              class="obs-presence-dropdown-item"
              :class="{ active: corner === value }"
              @click="selectCorner(value)"
            >
              {{ t(`obsPresence.${labelKey}`) }}
            </button>
          </DropdownMenu>
        </div>
        <label v-if="mode === 'alert'" class="obs-presence-field">
          {{ t("obsPresence.alertSecondsLabel") }}
          <input v-model.number="alertSeconds" type="number" min="1" max="120" @change="applyStyle" />
        </label>
        <div v-if="styleStatus === 'error'" class="obs-presence-status error">
          <p>{{ styleMessage }}</p>
        </div>
      </div>

      <div class="obs-presence-style">
        <label class="obs-presence-checkbox">
          <input type="checkbox" v-model="wsEnabled" @change="saveWsSettings" />
          {{ t("obsPresence.wsEnabledLabel") }}
        </label>
        <template v-if="wsEnabled">
          <div class="obs-presence-labeled-row">
            <span class="obs-presence-row-label">{{ t("obsPresence.wsIpAddressLabel") }}</span>
            <input
              v-model="wsHost"
              type="text"
              :placeholder="t('obsPresence.wsHostLabel')"
              @change="saveWsSettings"
            />
            <input
              v-model="wsPort"
              type="number"
              min="1"
              max="65535"
              :placeholder="t('obsPresence.wsPortLabel')"
              @change="saveWsSettings"
            />
          </div>
          <div class="obs-presence-labeled-row">
            <span class="obs-presence-row-label">{{ t("obsPresence.wsPasswordLabel") }}</span>
            <input v-model="wsPassword" type="password" @change="saveWsSettings" />
          </div>
          <div class="obs-presence-actions">
            <button type="button" @click="fetchScenes">{{ t("obsPresence.wsFetchScenes") }}</button>
          </div>
          <div
            v-if="wsFetchStatus === 'success' || wsFetchStatus === 'error'"
            class="obs-presence-status"
            :class="wsFetchStatus"
          >
            <p>{{ wsFetchMessage }}</p>
            <p v-if="wsFetchRaw" class="obs-presence-status-raw">{{ wsFetchRaw }}</p>
          </div>
          <div class="obs-presence-row">
            <span class="obs-presence-row-label-flex">{{ t("obsPresence.wsStartSceneLabel") }}</span>
            <span class="obs-presence-row-label-flex">{{ t("obsPresence.wsEndSceneLabel") }}</span>
          </div>
          <div class="obs-presence-row">
            <input v-model="wsStartScene" type="text" list="obs-ws-scenes" @change="saveWsSettings" />
            <input v-model="wsEndScene" type="text" list="obs-ws-scenes" @change="saveWsSettings" />
          </div>
          <datalist id="obs-ws-scenes">
            <option v-for="scene in wsScenes" :key="scene" :value="scene" />
          </datalist>
        </template>
      </div>

      <div class="obs-presence-urls">
        <p class="obs-presence-hint">
          {{ t("obsPresence.hint") }}
          <code>{{ overlayUrl }}</code>
        </p>
        <p class="obs-presence-hint">
          {{ t("obsPresence.statusHint") }}
          <code>{{ statusUrl }}</code>
        </p>
      </div>
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

.obs-presence-row {
  display: flex;
  gap: var(--space-3);
}

.obs-presence-row .obs-presence-field,
.obs-presence-row > input,
.obs-presence-row-label-flex {
  flex: 1;
  min-width: 0;
}

.obs-presence-row-label-flex {
  font-size: 0.85rem;
}

.obs-presence-labeled-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.85rem;
}

.obs-presence-row-label {
  flex-shrink: 0;
  width: 5rem;
}

.obs-presence-icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: var(--button-border-width) solid var(--color-surface1);
  border-radius: var(--radius-sm);
  background: none;
  color: inherit;
  cursor: pointer;
}

.obs-presence-icon-button:hover {
  background: var(--color-surface0);
}

.obs-presence-labeled-row input {
  flex: 1;
  min-width: 0;
}

.obs-presence-dropdown-wrap {
  flex: 1;
  min-width: 0;
}

.obs-presence-dropdown-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
}

/* :deep() required - DropdownMenu.vue renders this panel inside its own template, not this
   component's root, so it never carries this component's scope attribute. Stretches the panel
   to the trigger's full width instead of DropdownMenu's own content-width default. */
.obs-presence-dropdown-wrap :deep(.obs-presence-dropdown-panel) {
  left: 0;
  right: 0;
}

.obs-presence-dropdown-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-size: 0.85rem;
  border: none;
  background: none;
  cursor: pointer;
  color: inherit;
  text-align: left;
  white-space: nowrap;
}

.obs-presence-dropdown-item:hover {
  background: var(--color-surface0);
}

.obs-presence-dropdown-item.active {
  color: var(--color-accent);
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

.obs-presence-checkbox {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.85rem;
}

.obs-presence-style {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-surface0);
}

.obs-presence-urls {
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
