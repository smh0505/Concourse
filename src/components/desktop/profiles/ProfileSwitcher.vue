<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { IconLock } from "@tabler/icons-vue";

import { useProfilesStore } from "@/stores/profiles";
import ProfileCreateForm from "./ProfileCreateForm.vue";
import RecoveryCodeDisplay from "./RecoveryCodeDisplay.vue";
import type { Profile } from "@/db";

const { t } = useI18n();
const profiles = useProfilesStore();

const creating = ref(false);
const createFormRef = ref<InstanceType<typeof ProfileCreateForm> | null>(null);

// A locked profile's card transforms in place into a PIN-entry form - same "click reveals an
// inline form on the card itself" pattern as the "+ New Profile" card above, rather than a
// separate modal popup (per user request, matching the two flows' UX).
const unlockingId = ref<number | null>(null);
const pinValue = ref("");
const pinError = ref("");
const pinInputEl = ref<HTMLInputElement | null>(null);

async function select(id: number) {
  await profiles.switchTo(id);
}

/** PIN-less profiles switch immediately on click; a PIN-protected one reveals the inline
 *  unlock form instead - `select` itself stays the one place that actually flips
 *  activeProfileId, whether it's reached directly or after a successful confirmUnlock below. */
async function onCardClick(profile: Profile) {
  // Only one inline form active at a time - clicking an existing profile while the "+ New
  // Profile" card is open should close it, not leave both showing at once.
  creating.value = false;
  if (!profile.pin_hash) {
    await select(profile.id);
    return;
  }
  unlockingId.value = profile.id;
  pinValue.value = "";
  pinError.value = "";
  await nextTick();
  pinInputEl.value?.focus();
}

function cancelUnlock() {
  unlockingId.value = null;
  pinValue.value = "";
  pinError.value = "";
  cancelRecovery();
}

async function confirmUnlock() {
  if (unlockingId.value === null) return;
  const ok = await profiles.verifyPin(unlockingId.value, pinValue.value);
  if (!ok) {
    pinError.value = t("profiles.wrongPin");
    pinValue.value = "";
    pinInputEl.value?.focus();
    return;
  }
  const id = unlockingId.value;
  unlockingId.value = null;
  await select(id);
}

// Milestone 30 follow-up - "Forgot PIN?" only ever shows for a profile that actually has a
// recovery code (in practice, only ever Admin - see profiles.ts's own comment on why recovery
// codes are id-1-only). One combined form (code + new PIN + confirmation) rather than the
// single-field-reuse pattern the rest of this file uses elsewhere - a rare-path recovery flow
// doesn't need that same minimal-footprint polish, and three distinct fields read more clearly
// for something this unusual.
const recoveringId = computed(() =>
  unlockingId.value !== null && profiles.profiles.find((p) => p.id === unlockingId.value)?.recovery_code_hash
    ? unlockingId.value
    : null,
);
const recovering = ref(false);
const recoveryCodeInput = ref("");
const newPinInput = ref("");
const newPinConfirmInput = ref("");
const recoveryError = ref("");
// Set once recovery succeeds - the card then shows RecoveryCodeDisplay (the freshly regenerated
// code) instead of the recovery form, same "must confirm you saved it" gate SetupAdminPin.vue
// uses for the very first code.
const newRecoveryCode = ref<string | null>(null);

function startRecovery() {
  recovering.value = true;
  recoveryCodeInput.value = "";
  newPinInput.value = "";
  newPinConfirmInput.value = "";
  recoveryError.value = "";
}

function cancelRecovery() {
  recovering.value = false;
  recoveryCodeInput.value = "";
  newPinInput.value = "";
  newPinConfirmInput.value = "";
  recoveryError.value = "";
  newRecoveryCode.value = null;
}

async function confirmRecovery() {
  if (unlockingId.value === null) return;
  if (!newPinInput.value) {
    recoveryError.value = t("profiles.pinRequired");
    return;
  }
  if (newPinInput.value !== newPinConfirmInput.value) {
    recoveryError.value = t("profiles.pinMismatch");
    return;
  }
  const newCode = await profiles.recoverWithNewPin(unlockingId.value, recoveryCodeInput.value, newPinInput.value);
  if (!newCode) {
    recoveryError.value = t("profiles.wrongRecoveryCode");
    return;
  }
  recovering.value = false;
  newRecoveryCode.value = newCode;
}

async function onRecoveryContinue() {
  if (unlockingId.value === null) return;
  const id = unlockingId.value;
  unlockingId.value = null;
  newRecoveryCode.value = null;
  await select(id);
}

async function onCreateSubmit(name: string, pin: string) {
  try {
    // No ToastContainer available yet here - App.vue only mounts it once a profile is active
    // (see App.vue's v-else), so any failure needs its own visible surface, not a silent
    // console-only swallow - setError below, not a toast.
    const id = await profiles.createProfile(name);
    if (pin) await profiles.setPin(id, pin);
    createFormRef.value?.reset();
    creating.value = false;
    await select(id);
  } catch (e) {
    console.error("Failed to create profile:", e);
    createFormRef.value?.setError(String(e));
  }
}
</script>

<template>
  <div class="switcher">
    <div class="panel">
      <div class="header">
        <h1>{{ t("profiles.switcherTitle") }}</h1>
        <small v-if="creating || unlockingId !== null" class="form-hint">{{ t("profiles.enterEscHint") }}</small>
      </div>
      <div class="grid">
        <template v-for="profile in profiles.profiles" :key="profile.id">
          <div v-if="unlockingId === profile.id && newRecoveryCode" class="profile-card creating recovery-card">
            <RecoveryCodeDisplay :code="newRecoveryCode" @continue="onRecoveryContinue" />
          </div>
          <form
            v-else-if="unlockingId === profile.id && recovering"
            class="profile-card creating recovery-card"
            @submit.prevent="confirmRecovery"
          >
            <div class="profile-avatar">
              {{ profile.name.charAt(0).toUpperCase() }}
              <IconLock :size="14" :stroke-width="2" class="profile-avatar-lock" />
            </div>
            <input
              v-model="recoveryCodeInput"
              autofocus
              :placeholder="t('profiles.enterRecoveryCode')"
              @keyup.esc="cancelUnlock"
            />
            <input
              v-model="newPinInput"
              type="password"
              pattern="[a-zA-Z0-9]*"
              :title="t('profiles.pinPatternHint')"
              :placeholder="t('profiles.newPin')"
              @keyup.esc="cancelUnlock"
            />
            <input
              v-model="newPinConfirmInput"
              type="password"
              pattern="[a-zA-Z0-9]*"
              :title="t('profiles.pinPatternHint')"
              :placeholder="t('profiles.confirmPin')"
              @keyup.esc="cancelUnlock"
            />
            <p v-if="recoveryError" class="error-text">{{ recoveryError }}</p>
            <button type="submit">{{ t("common.continue") }}</button>
            <button type="button" class="link-button" @click="cancelRecovery">
              {{ t("common.cancel") }}
            </button>
          </form>
          <form
            v-else-if="unlockingId === profile.id"
            class="profile-card creating"
            @submit.prevent="confirmUnlock"
          >
            <div class="profile-avatar">
              {{ profile.name.charAt(0).toUpperCase() }}
              <IconLock :size="14" :stroke-width="2" class="profile-avatar-lock" />
            </div>
            <input
              :ref="(el) => (pinInputEl = el as HTMLInputElement | null)"
              v-model="pinValue"
              type="password"
              pattern="[a-zA-Z0-9]*"
              :title="t('profiles.pinPatternHint')"
              :placeholder="t('profiles.enterPin')"
              @keyup.esc="cancelUnlock"
            />
            <p v-if="pinError" class="error-text">{{ pinError }}</p>
            <button v-if="recoveringId === profile.id" type="button" class="link-button" @click="startRecovery">
              {{ t("profiles.forgotPin") }}
            </button>
          </form>
          <button v-else type="button" class="profile-card" @click="onCardClick(profile)">
            <div class="profile-avatar">
              {{ profile.name.charAt(0).toUpperCase() }}
              <IconLock v-if="profile.pin_hash" :size="14" :stroke-width="2" class="profile-avatar-lock" />
            </div>
            <span class="name">{{ profile.name }}</span>
          </button>
        </template>

        <ProfileCreateForm
          v-if="creating"
          ref="createFormRef"
          class="profile-card creating"
          layout="vertical"
          @submit="onCreateSubmit"
          @keyup.esc="creating = false"
        />
        <button
          v-else
          type="button"
          class="profile-card add-card"
          @click="cancelUnlock(); creating = true"
        >
          <div class="profile-avatar profile-avatar-add">+</div>
          <span class="name">{{ t("profiles.newProfile") }}</span>
        </button>
      </div>
    </div>
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

.header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
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

/* Only the hand-rolled unlock <form> below needs this - ProfileCreateForm.vue styles its own
   inputs internally (its layout="vertical" prop), invisible to this scoped selector. */
.creating input {
  width: 100%;
  text-align: center;
}

.link-button {
  background: none;
  border: none;
  color: var(--color-accent);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0;
}

.link-button:hover {
  text-decoration: underline;
}

/* The recovery form/display card needs more room than the plain unlock form - 3 inputs plus
   RecoveryCodeDisplay's own content, both wider than a single-field unlock. */
.recovery-card {
  width: 16rem;
}
</style>
