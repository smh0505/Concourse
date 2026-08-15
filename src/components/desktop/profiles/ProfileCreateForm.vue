<script setup lang="ts">
import { computed, ref } from "vue";
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
// through attrs fallthrough onto this component's root <form>. The live avatar preview below
// only makes sense on the card layout, not the settings row, so it's gated on this too.
const props = withDefaults(defineProps<{ layout?: "vertical" | "horizontal" }>(), {
  layout: "horizontal",
});

const name = ref("");
// A single visible PIN field, reused for both the initial entry and the confirmation re-entry
// (same input, same position - not two fields shown together) - `pendingPin` holds what was
// typed in step one while the field is blanked and re-labeled for step two. `confirming` is
// false whenever there's nothing to confirm yet, so a submit with an empty PIN field skips the
// confirmation step entirely and creates immediately, matching pin being genuinely optional.
const pinInput = ref("");
const pendingPin = ref("");
const confirming = ref(false);
const error = ref("");

const avatarLetter = computed(() => name.value.trim().charAt(0).toUpperCase() || "?");

const emit = defineEmits<{
  /** `pin` is "" when none was entered - the caller decides whether to call setPin at all. */
  submit: [name: string, pin: string];
}>();

function reset() {
  name.value = "";
  pinInput.value = "";
  pendingPin.value = "";
  confirming.value = false;
  error.value = "";
}

function onSubmit() {
  const trimmed = name.value.trim();
  if (!trimmed) return;

  if (!confirming.value) {
    if (!pinInput.value) {
      error.value = "";
      emit("submit", trimmed, "");
      return;
    }
    // Stage one done - stash what was typed, blank the (same) field, and ask for it again
    // rather than showing a second field alongside the first.
    pendingPin.value = pinInput.value;
    pinInput.value = "";
    confirming.value = true;
    error.value = "";
    return;
  }

  if (pinInput.value !== pendingPin.value) {
    // Mismatch - back to a clean step-one field, not a half-filled step-two one, so the user
    // re-enters the PIN from scratch rather than fixing just the confirmation.
    confirming.value = false;
    pendingPin.value = "";
    pinInput.value = "";
    error.value = t("profiles.pinMismatch");
    return;
  }

  error.value = "";
  emit("submit", trimmed, pendingPin.value);
}

/** Exposed so the caller can reset fields after a successful create, or show a save-time error
 *  (e.g. profiles.createProfile itself throwing) inline without this component needing to know
 *  anything about where that error came from. */
defineExpose({ reset, setError: (message: string) => (error.value = message) });
</script>

<template>
  <form :class="props.layout" @submit.prevent="onSubmit">
    <div v-if="props.layout === 'vertical'" class="profile-avatar">{{ avatarLetter }}</div>
    <input v-model="name" autofocus :disabled="confirming" :placeholder="t('profiles.newProfileName')" />
    <input
      v-model="pinInput"
      type="password"
      inputmode="numeric"
      :placeholder="confirming ? t('profiles.confirmPin') : t('profiles.optionalPin')"
    />
    <p v-if="error" class="error-text">{{ error }}</p>
    <small v-if="props.layout === 'vertical'" class="form-hint">{{ t("profiles.enterEscHint") }}</small>
    <slot />
  </form>
</template>

<style scoped>
form.vertical {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

form.vertical input {
  width: 100%;
  text-align: center;
}

form.horizontal input {
  max-width: 8rem;
}
</style>
