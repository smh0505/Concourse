<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { sanitizePin } from "@/utils/pin";

// No layout/visual opinions of its own beyond arranging its own fields - the root <form> picks
// up whatever class the caller passes via normal attrs fallthrough (ProfileSwitcher.vue passes
// "profile-card creating", ProfilesPanel.vue passes "item-row list-row-shell"), so each
// surface's existing scoped styling keeps applying unchanged. This component only owns the
// shared field state/validation and the name+PIN fields' own internal arrangement, not the
// outer card/row shape.
const { t } = useI18n();

// The live avatar preview and the Enter/Esc hint only make sense on the card layout /
// button-less row layout respectively - ProfileSwitcher's vertical card shows its own shared
// hint once under the screen title instead (see ProfileSwitcher.vue), so this component's own
// hint only renders for "horizontal" (ProfilesPanel's row).
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
    <!-- @keyup.enter on each input, not just @submit.prevent on the form - browsers only
         implicitly submit a form on Enter when it has a single text-like field or an explicit
         submit button; this form has neither (two fields, no button since the confirm/cancel
         icons were dropped), so Enter would otherwise silently do nothing. -->
    <div class="fields">
      <input
        v-model="name"
        autofocus
        :disabled="confirming"
        :placeholder="t('profiles.newProfileName')"
        @keyup.enter="onSubmit"
      />
      <input
        :value="pinInput"
        type="password"
        :placeholder="confirming ? t('profiles.confirmPin') : t('profiles.optionalPin')"
        @input="pinInput = sanitizePin(($event.target as HTMLInputElement).value)"
        @keyup.enter="onSubmit"
      />
    </div>
    <p v-if="error" class="error-text">{{ error }}</p>
    <small v-if="props.layout === 'horizontal'" class="form-hint">{{ t("profiles.enterEscHint") }}</small>
  </form>
</template>

<style scoped>
form.vertical {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

form.vertical .fields {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: var(--space-3);
}

form.vertical input {
  width: 100%;
  text-align: center;
}

/* ProfilesPanel's row layout - name and PIN fields share the row equally, matching the same
   profile-row-content/row-top/name-row pattern every other row (rename, PIN-change) already
   uses, rather than the fixed-width fields this layout used to have. */
form.horizontal {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
}

form.horizontal .fields {
  display: flex;
  gap: var(--space-3);
}

form.horizontal input {
  flex: 1 1 0;
  min-width: 0;
}
</style>
