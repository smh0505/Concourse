<script setup lang="ts">
import { nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { IconCheck, IconLock, IconX } from "@tabler/icons-vue";

import { useProfilesStore } from "@/stores/profiles";
import { BaseModal } from "@/components/desktop/common";
import type { Profile } from "@/db";

const { t } = useI18n();
const profiles = useProfilesStore();

const creating = ref(false);
const newName = ref("");
const newPin = ref("");
const newPinConfirm = ref("");
const error = ref("");

const pendingPinProfile = ref<Profile | null>(null);
const pinValue = ref("");
const pinError = ref("");
const pinInputEl = ref<HTMLInputElement | null>(null);

async function select(id: number) {
  await profiles.switchTo(id);
}

/** PIN-less profiles switch immediately on click; a PIN-protected one opens the prompt modal
 *  instead - `select` itself stays the one place that actually flips activeProfileId, whether
 *  it's reached directly or after a successful verifyPin below. */
async function onCardClick(profile: Profile) {
  if (!profile.pin_hash) {
    await select(profile.id);
    return;
  }
  pendingPinProfile.value = profile;
  pinValue.value = "";
  pinError.value = "";
  await nextTick();
  pinInputEl.value?.focus();
}

async function confirmPin() {
  if (!pendingPinProfile.value) return;
  const ok = await profiles.verifyPin(pendingPinProfile.value.id, pinValue.value);
  if (!ok) {
    pinError.value = t("profiles.wrongPin");
    pinValue.value = "";
    pinInputEl.value?.focus();
    return;
  }
  const id = pendingPinProfile.value.id;
  pendingPinProfile.value = null;
  await select(id);
}

async function confirmCreate() {
  const name = newName.value.trim();
  if (!name) return;
  error.value = "";
  if (newPin.value !== newPinConfirm.value) {
    error.value = t("profiles.pinMismatch");
    return;
  }
  try {
    // No ToastContainer available yet here - App.vue only mounts it once a profile is active
    // (see App.vue's v-else), so any failure needs its own visible surface, not a silent
    // console-only swallow.
    const id = await profiles.createProfile(name);
    if (newPin.value) await profiles.setPin(id, newPin.value);
    newName.value = "";
    newPin.value = "";
    newPinConfirm.value = "";
    creating.value = false;
    await select(id);
  } catch (e) {
    console.error("Failed to create profile:", e);
    error.value = String(e);
  }
}
</script>

<template>
  <div class="switcher">
    <div class="panel">
      <h1>{{ t("profiles.switcherTitle") }}</h1>
      <div class="grid">
        <button
          v-for="profile in profiles.profiles"
          :key="profile.id"
          type="button"
          class="profile-card"
          @click="onCardClick(profile)"
        >
          <div class="avatar">
            {{ profile.name.charAt(0).toUpperCase() }}
            <IconLock v-if="profile.pin_hash" :size="14" :stroke-width="2" class="lock-badge" />
          </div>
          <span class="name">{{ profile.name }}</span>
        </button>

        <form v-if="creating" class="profile-card creating" @submit.prevent="confirmCreate">
          <input
            v-model="newName"
            autofocus
            :placeholder="t('profiles.newProfileName')"
            @keyup.esc="creating = false"
          />
          <input v-model="newPin" type="password" inputmode="numeric" :placeholder="t('profiles.optionalPin')" />
          <input
            v-if="newPin"
            v-model="newPinConfirm"
            type="password"
            inputmode="numeric"
            :placeholder="t('profiles.confirmPin')"
          />
          <div class="creating-actions">
            <button type="submit" class="icon-button" :title="t('common.save')">
              <IconCheck :size="15" :stroke-width="1.75" />
            </button>
            <button type="button" class="icon-button" :title="t('common.cancel')" @click="creating = false">
              <IconX :size="15" :stroke-width="1.75" />
            </button>
          </div>
        </form>
        <button v-else type="button" class="profile-card add-card" @click="creating = true">
          <div class="avatar add-avatar">+</div>
          <span class="name">{{ t("profiles.newProfile") }}</span>
        </button>
      </div>
      <p v-if="error" class="error-text">{{ error }}</p>
    </div>

    <BaseModal
      :open="pendingPinProfile !== null"
      :title="pendingPinProfile?.name"
      max-width="300px"
      @close="pendingPinProfile = null"
    >
      <form class="pin-form" @submit.prevent="confirmPin">
        <input
          ref="pinInputEl"
          v-model="pinValue"
          type="password"
          inputmode="numeric"
          :placeholder="t('profiles.enterPin')"
        />
        <p v-if="pinError" class="error-text">{{ pinError }}</p>
        <button type="submit">{{ t("common.continue") }}</button>
      </form>
    </BaseModal>
  </div>
</template>

<style scoped>
.switcher {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-base);
  color: var(--color-text);
}

.panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
}

h1 {
  margin: 0;
  font-size: 1.3rem;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-5);
  justify-content: center;
  max-width: 40rem;
}

.profile-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  width: 8rem;
  padding: var(--space-3);
  border: none;
  background: none;
  border-radius: var(--radius-md);
  color: inherit;
  cursor: pointer;
}

.profile-card:hover,
.profile-card:focus-visible {
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.avatar {
  position: relative;
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface0);
  font-size: 1.8rem;
}

.lock-badge {
  position: absolute;
  right: -0.15rem;
  bottom: -0.15rem;
  padding: 0.2rem;
  border-radius: 50%;
  background: var(--color-surface1);
  color: var(--color-text);
}

.add-avatar {
  border: 2px dashed var(--color-surface1);
  background: none;
  opacity: 0.7;
}

.name {
  font-size: 0.9rem;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.creating {
  cursor: default;
}

.creating input {
  width: 100%;
  text-align: center;
}

.creating-actions {
  display: flex;
  gap: var(--space-2);
}

.pin-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.pin-form input {
  text-align: center;
  letter-spacing: 0.3em;
}
</style>
