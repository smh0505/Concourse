<script setup lang="ts">
import { nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { IconLock } from "@tabler/icons-vue";

import { useProfilesStore } from "@/stores/profiles";
import ProfileCreateForm from "./ProfileCreateForm.vue";
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
      <h1>{{ t("profiles.switcherTitle") }}</h1>
      <div class="grid">
        <template v-for="profile in profiles.profiles" :key="profile.id">
          <form
            v-if="unlockingId === profile.id"
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
              inputmode="numeric"
              :placeholder="t('profiles.enterPin')"
              @keyup.esc="cancelUnlock"
            />
            <p v-if="pinError" class="error-text">{{ pinError }}</p>
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
        <button v-else type="button" class="profile-card add-card" @click="creating = true">
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

</style>
