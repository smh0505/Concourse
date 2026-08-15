<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";

// No layout/visual opinions of its own - the root <form> picks up whatever class the caller
// passes via normal attrs fallthrough (ProfileSwitcher.vue passes "profile-card creating",
// ProfilesPanel.vue passes "add-form"), so each surface's existing scoped styling keeps
// applying unchanged. This component only owns the shared field state/validation, not how it
// looks in either place.
const { t } = useI18n();

// Only the field sizing/alignment differs between the two callers (ProfileSwitcher's compact
// vertical card vs. ProfilesPanel's horizontal settings row) - everything else (the outer
// card/row shape, button styling) stays each caller's own concern via the class it passes
// through attrs fallthrough onto this component's root <form>.
withDefaults(defineProps<{ layout?: "vertical" | "horizontal" }>(), { layout: "horizontal" });

const name = ref("");
const pin = ref("");
const pinConfirm = ref("");
const error = ref("");

const emit = defineEmits<{
  /** `pin` is "" when none was entered - the caller decides whether to call setPin at all. */
  submit: [name: string, pin: string];
}>();

function reset() {
  name.value = "";
  pin.value = "";
  pinConfirm.value = "";
  error.value = "";
}

function onSubmit() {
  const trimmed = name.value.trim();
  if (!trimmed) return;
  if (pin.value !== pinConfirm.value) {
    error.value = t("profiles.pinMismatch");
    return;
  }
  error.value = "";
  emit("submit", trimmed, pin.value);
}

/** Exposed so the caller can reset fields after a successful create, or show a save-time error
 *  (e.g. profiles.createProfile itself throwing) inline without this component needing to know
 *  anything about where that error came from. */
defineExpose({ reset, setError: (message: string) => (error.value = message) });
</script>

<template>
  <form :class="layout" @submit.prevent="onSubmit">
    <input v-model="name" autofocus :placeholder="t('profiles.newProfileName')" />
    <input v-model="pin" type="password" inputmode="numeric" :placeholder="t('profiles.optionalPin')" />
    <input
      v-if="pin"
      v-model="pinConfirm"
      type="password"
      inputmode="numeric"
      :placeholder="t('profiles.confirmPin')"
    />
    <p v-if="error" class="error-text">{{ error }}</p>
    <slot />
  </form>
</template>

<style scoped>
form.vertical input {
  width: 100%;
  text-align: center;
}

form.horizontal input {
  max-width: 8rem;
}
</style>
