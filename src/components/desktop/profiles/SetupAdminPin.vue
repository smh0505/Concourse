<script setup lang="ts">
import { nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";

import { useProfilesStore } from "@/stores/profiles";
import RecoveryCodeDisplay from "./RecoveryCodeDisplay.vue";

const { t } = useI18n();
const profiles = useProfilesStore();

// Milestone 30 follow-up - Admin's PIN is now mandatory (App.vue's own gate renders this in
// place of ProfileSwitcher whenever profile 1 has no pin_hash yet), since Admin can now un-hide
// games/approve/share across profiles - leaving that door unlocked by default is a real gap,
// not just a nicety. Two-stage entry mirrors ProfileCreateForm.vue's own optional-PIN field,
// just mandatory here (an empty submit is a validation error, not "skip").
const stage = ref<"pin" | "recovery">("pin");
const pinInput = ref("");
const pendingPin = ref("");
const confirming = ref(false);
const error = ref("");
const pinInputEl = ref<HTMLInputElement | null>(null);
const recoveryCode = ref("");

async function onSubmit() {
  if (!pinInputEl.value?.checkValidity()) {
    pinInputEl.value?.reportValidity();
    return;
  }
  if (!pinInput.value) {
    error.value = t("profiles.pinRequired");
    return;
  }

  if (!confirming.value) {
    pendingPin.value = pinInput.value;
    pinInput.value = "";
    confirming.value = true;
    error.value = "";
    await nextTick();
    pinInputEl.value?.focus();
    return;
  }

  if (pinInput.value !== pendingPin.value) {
    confirming.value = false;
    pendingPin.value = "";
    pinInput.value = "";
    error.value = t("profiles.pinMismatch");
    return;
  }

  // setPin(1, ...) always returns the raw recovery code for the Admin profile - see
  // profiles.ts's own comment on why it's id-1-only.
  recoveryCode.value = (await profiles.setPin(1, pendingPin.value)) ?? "";
  stage.value = "recovery";
}

async function onContinue() {
  await profiles.switchTo(1);
}
</script>

<template>
  <div class="setup-page">
    <div class="panel">
      <h1>{{ t("profiles.setupAdminPinTitle") }}</h1>
      <p class="setup-hint">{{ t("profiles.setupAdminPinHint") }}</p>

      <form v-if="stage === 'pin'" @submit.prevent="onSubmit">
        <input
          ref="pinInputEl"
          v-model="pinInput"
          type="password"
          pattern="[a-zA-Z0-9]*"
          autofocus
          :title="t('profiles.pinPatternHint')"
          :placeholder="confirming ? t('profiles.confirmPin') : t('profiles.newPin')"
        />
        <p v-if="error" class="error-text">{{ error }}</p>
        <button type="submit">{{ t("common.continue") }}</button>
      </form>

      <RecoveryCodeDisplay v-else :code="recoveryCode" @continue="onContinue" />
    </div>
  </div>
</template>

<style scoped>
.setup-page {
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
  gap: var(--space-4);
  max-width: 26rem;
  text-align: center;
}

h1 {
  margin: 0;
  font-size: 1.3rem;
}

.setup-hint {
  margin: 0;
  opacity: 0.8;
}

form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
}

form input {
  width: 100%;
  text-align: center;
}
</style>
