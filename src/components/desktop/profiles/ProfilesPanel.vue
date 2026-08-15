<script setup lang="ts">
import { nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { IconCheck, IconLock, IconLockOpen, IconPencil, IconTrash, IconX } from "@tabler/icons-vue";

import { useProfilesStore } from "@/stores/profiles";
import { useToastStore } from "@/stores/toasts";
import ProfileCreateForm from "./ProfileCreateForm.vue";

const { t } = useI18n();
const profiles = useProfilesStore();
const toasts = useToastStore();

const createFormRef = ref<InstanceType<typeof ProfileCreateForm> | null>(null);
const editingId = ref<number | null>(null);
const editingValue = ref("");

// Same single-field, two-stage entry as ProfileCreateForm.vue's PIN field (and
// ProfileSwitcher.vue's unlock form) - the confirmation re-uses this one field, blanked and
// re-labeled, rather than showing a second field alongside it.
const pinEditingId = ref<number | null>(null);
const pinInput = ref("");
const pendingPin = ref("");
const confirmingPin = ref(false);
const pinError = ref("");
const pinInputEl = ref<HTMLInputElement | null>(null);

async function onCreateSubmit(name: string, pin: string) {
  try {
    const id = await profiles.createProfile(name);
    if (pin) await profiles.setPin(id, pin);
    createFormRef.value?.reset();
  } catch (e) {
    toasts.push(String(e), "error");
  }
}

function startEdit(id: number, name: string) {
  editingId.value = id;
  editingValue.value = name;
}

function cancelEdit() {
  editingId.value = null;
  editingValue.value = "";
}

async function confirmEdit() {
  const trimmed = editingValue.value.trim();
  if (trimmed && editingId.value !== null) await profiles.renameProfile(editingId.value, trimmed);
  cancelEdit();
}

async function onDelete(id: number) {
  await profiles.deleteProfile(id);
}

async function startPinEdit(id: number) {
  pinEditingId.value = id;
  pinInput.value = "";
  pendingPin.value = "";
  confirmingPin.value = false;
  pinError.value = "";
  await nextTick();
  pinInputEl.value?.focus();
}

function cancelPinEdit() {
  pinEditingId.value = null;
  pinInput.value = "";
  pendingPin.value = "";
  confirmingPin.value = false;
  pinError.value = "";
}

async function onPinSubmit() {
  if (pinEditingId.value === null) return;

  if (!confirmingPin.value) {
    if (!pinInput.value) {
      // Nothing typed - Enter here just closes the form rather than saving an empty PIN.
      cancelPinEdit();
      return;
    }
    // Stage one done - stash what was typed, blank the (same) field, and ask for it again
    // instead of showing a second field alongside the first.
    pendingPin.value = pinInput.value;
    pinInput.value = "";
    confirmingPin.value = true;
    pinError.value = "";
    return;
  }

  if (pinInput.value !== pendingPin.value) {
    // Mismatch - back to a clean step-one field, not a half-filled step-two one.
    confirmingPin.value = false;
    pendingPin.value = "";
    pinInput.value = "";
    pinError.value = t("profiles.pinMismatch");
    return;
  }

  try {
    await profiles.setPin(pinEditingId.value, pendingPin.value);
    cancelPinEdit();
  } catch (e) {
    pinError.value = String(e);
  }
}

async function removePin(id: number) {
  try {
    await profiles.clearPin(id);
  } catch (e) {
    toasts.push(String(e), "error");
  }
}

/** A profile switch changes which library.db rows every store reads (Milestone 30) - rather
 *  than threading a lighter-weight re-init path through every one of them (library, tags,
 *  collections, stats, plugin enablement...), a full reload just re-runs App.vue's own
 *  onMounted from scratch against the newly-active profile, the same as a normal app restart
 *  would. Simple and correct, if not the snappiest possible transition. */
async function switchProfile(id: number) {
  await profiles.switchTo(id);
  window.location.reload();
}
</script>

<template>
  <div class="profiles-section">
    <h3>{{ t("profiles.title") }}</h3>
    <small>{{ t("profiles.description") }}</small>

    <ProfileCreateForm ref="createFormRef" class="add-form" layout="horizontal" @submit="onCreateSubmit">
      <button type="submit">{{ t("profiles.addProfile") }}</button>
    </ProfileCreateForm>

    <ul class="item-list">
      <li v-for="profile in profiles.profiles" :key="profile.id" class="item-row list-row-shell">
        <template v-if="editingId === profile.id">
          <input
            v-model="editingValue"
            class="edit-input"
            @keyup.enter="confirmEdit"
            @keyup.esc="cancelEdit"
          />
          <div class="row-controls">
            <button class="icon-button" :title="t('common.save')" @click="confirmEdit">
              <IconCheck :size="15" :stroke-width="1.75" />
            </button>
            <button class="icon-button" :title="t('common.cancel')" @click="cancelEdit">
              <IconX :size="15" :stroke-width="1.75" />
            </button>
          </div>
        </template>
        <template v-else>
          <div class="name-column">
            <div class="name-row">
              <span class="item-name">{{ profile.name }}</span>
              <span v-if="profile.id === profiles.activeProfileId" class="item-count">
                {{ t("profiles.active") }}
              </span>
            </div>
            <form v-if="pinEditingId === profile.id" class="pin-inline" @submit.prevent="onPinSubmit">
              <input
                :ref="(el) => (pinInputEl = el as HTMLInputElement | null)"
                v-model="pinInput"
                type="password"
                inputmode="numeric"
                :placeholder="confirmingPin ? t('profiles.confirmPin') : t('profiles.newPin')"
                @keyup.esc="cancelPinEdit"
              />
              <span v-if="pinError" class="error-text">{{ pinError }}</span>
              <small class="form-hint">{{ t("profiles.enterEscHint") }}</small>
            </form>
          </div>
          <div class="row-controls">
            <button
              v-if="profile.id !== profiles.activeProfileId"
              class="icon-button"
              :title="t('profiles.switchTo')"
              @click="switchProfile(profile.id)"
            >
              {{ t("profiles.switchTo") }}
            </button>
            <button
              v-if="profile.id !== 1"
              class="icon-button"
              :title="t('profiles.rename')"
              @click="startEdit(profile.id, profile.name)"
            >
              <IconPencil :size="15" :stroke-width="1.75" />
            </button>
            <button
              class="icon-button"
              :title="profile.pin_hash ? t('profiles.changePin') : t('profiles.setPin')"
              @click="startPinEdit(profile.id)"
            >
              <IconLock :size="15" :stroke-width="1.75" />
            </button>
            <button
              v-if="profile.pin_hash"
              class="icon-button"
              :title="t('profiles.removePin')"
              @click="removePin(profile.id)"
            >
              <IconLockOpen :size="15" :stroke-width="1.75" />
            </button>
            <button
              v-if="profile.id !== 1 && profiles.profiles.length > 1"
              class="icon-button"
              :title="t('profiles.delete')"
              @click="onDelete(profile.id)"
            >
              <IconTrash :size="15" :stroke-width="1.75" />
            </button>
          </div>
        </template>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* Reuses AppSettings.vue's .translation-section/PluginSettings.vue's list-row/item-* tokens -
   see those for the shared shell this panel intentionally doesn't redefine. */
.profiles-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* Takes over .item-name's usual flex:1 slot in the row, so the inline PIN form below can stack
   under the name instead of sitting beside it in the same horizontal line. */
.name-column {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  flex: 1;
  min-width: 0;
}

.name-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.pin-inline {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: flex-start;
}

.pin-inline input {
  max-width: 8rem;
}
</style>
