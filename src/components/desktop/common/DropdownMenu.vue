<script setup lang="ts">
import { ref } from "vue";

/** Shared trigger-button + absolute-panel + backdrop-to-close shell, extracted after the same
 *  3-piece shape got hand-built twice (GameDetail.vue's translate menu, AppSettings.vue's model
 *  picker). Only the shell is shared - panel *content* (flat item list vs. a paged multi-group
 *  carousel with wheel/arrow-key navigation) stays with each caller, since those two are
 *  different interaction patterns, not the same component with different styling. `wheel`/
 *  `keydown` are re-emitted from the panel element itself (not relied on via attrs fallthrough)
 *  so a caller like GameDetail.vue can page through groups while the menu is open; callers that
 *  don't need that (AppSettings.vue) just don't listen for them. `focusPanel()` is exposed for
 *  the same reason - GameDetail.vue focuses the panel right after opening so arrow keys land on
 *  it without a global window listener. */
defineProps<{
  open: boolean;
  wrapClass?: string;
  panelClass?: string;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  wheel: [event: WheelEvent];
  keydown: [event: KeyboardEvent];
}>();

const panelEl = ref<HTMLElement | null>(null);

function close() {
  emit("update:open", false);
}

function focusPanel() {
  panelEl.value?.focus();
}

defineExpose({ focusPanel });
</script>

<template>
  <div class="dropdown-menu-wrap" :class="wrapClass">
    <slot name="trigger" :open="open" :close="close" />
    <div v-if="open" class="dropdown-menu-backdrop" @click="close" />
    <div
      v-if="open"
      ref="panelEl"
      class="dropdown-menu-panel"
      :class="panelClass"
      tabindex="-1"
      @wheel="emit('wheel', $event)"
      @keydown="emit('keydown', $event)"
    >
      <slot :close="close" />
    </div>
  </div>
</template>

<style scoped>
.dropdown-menu-wrap {
  position: relative;
}

/* Full-viewport, invisible - exists only to catch a click outside the panel and close it,
   avoiding a window-level event listener/lifecycle hook for a single dropdown. Sits below the
   panel itself (lower z-index) so item clicks reach their own buttons first. */
.dropdown-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9;
}

.dropdown-menu-panel {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 0.25rem;
  z-index: 10;
  display: flex;
  flex-direction: column;
  background: var(--color-base);
  border: var(--button-border-width) solid var(--color-surface1);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  /* Receives focus on open (focusPanel()) for callers that need arrow-key navigation - custom
     styling here instead of the default outline, matching every other menu-style control. */
  outline: none;
}
</style>
