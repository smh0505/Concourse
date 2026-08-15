<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { IconCheck, IconLock, IconLockOpen, IconPencil, IconTrash, IconX } from "@tabler/icons-vue";

import { useProfilesStore } from "@/stores/profiles";

const { t } = useI18n();
const profiles = useProfilesStore();

const newName = ref("");
const editingId = ref<number | null>(null);
const editingValue = ref("");

const pinEditingId = ref<number | null>(null);
const pinValue = ref("");
const pinConfirmValue = ref("");
const pinError = ref("");

async function onCreate() {
  const name = newName.value.trim();
  if (!name) return;
  await profiles.createProfile(name);
  newName.value = "";
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

function startPinEdit(id: number) {
  pinEditingId.value = id;
  pinValue.value = "";
  pinConfirmValue.value = "";
  pinError.value = "";
}

function cancelPinEdit() {
  pinEditingId.value = null;
  pinValue.value = "";
  pinConfirmValue.value = "";
  pinError.value = "";
}

async function confirmPinEdit() {
  if (pinEditingId.value === null) return;
  if (pinValue.value !== pinConfirmValue.value) {
    pinError.value = t("profiles.pinMismatch");
    return;
  }
  if (pinValue.value) await profiles.setPin(pinEditingId.value, pinValue.value);
  cancelPinEdit();
}

async function removePin(id: number) {
  await profiles.clearPin(id);
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

    <form class="add-form" @submit.prevent="onCreate">
      <input v-model="newName" :placeholder="t('profiles.newProfileName')" />
      <button type="submit">{{ t("profiles.addProfile") }}</button>
    </form>

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
          <span class="item-name">{{ profile.name }}</span>
          <span v-if="profile.id === profiles.activeProfileId" class="item-count">
            {{ t("profiles.active") }}
          </span>
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
              v-if="profiles.profiles.length > 1"
              class="icon-button"
              :title="t('profiles.delete')"
              @click="onDelete(profile.id)"
            >
              <IconTrash :size="15" :stroke-width="1.75" />
            </button>
          </div>
        </template>
      </li>
      <li v-if="pinEditingId !== null" class="item-row list-row-shell">
        <form class="pin-edit-form" @submit.prevent="confirmPinEdit">
          <input v-model="pinValue" type="password" inputmode="numeric" :placeholder="t('profiles.newPin')" />
          <input
            v-model="pinConfirmValue"
            type="password"
            inputmode="numeric"
            :placeholder="t('profiles.confirmPin')"
          />
          <span v-if="pinError" class="error-text">{{ pinError }}</span>
          <div class="row-controls">
            <button type="submit" class="icon-button" :title="t('common.save')">
              <IconCheck :size="15" :stroke-width="1.75" />
            </button>
            <button type="button" class="icon-button" :title="t('common.cancel')" @click="cancelPinEdit">
              <IconX :size="15" :stroke-width="1.75" />
            </button>
          </div>
        </form>
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

.pin-edit-form {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
}

.pin-edit-form input {
  max-width: 8rem;
}
</style>
