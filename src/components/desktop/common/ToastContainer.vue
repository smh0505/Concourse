<script setup lang="ts">
import { useToastStore } from "@/stores/toasts";

const toasts = useToastStore();
</script>

<template>
  <div class="toast-container">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts.toasts"
        :key="toast.id"
        class="toast"
        :class="`toast-${toast.type}`"
        @click="!toast.actions && toasts.dismiss(toast.id)"
      >
        <span>{{ toast.message }}</span>
        <div v-if="toast.actions?.length" class="toast-actions">
          <button
            v-for="action in toast.actions"
            :key="action.label"
            type="button"
            class="compact-button"
            @click.stop="action.onClick()"
          >
            {{ action.label }}
          </button>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  z-index: 200;
  max-width: 320px;
}

.toast {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 0.6rem 0.9rem;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  font-size: 0.85rem;
  color: var(--color-on-accent);
  cursor: pointer;
}

.toast-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  /* Buttons need their own normal (non-pointer-inherited-as-dismiss) cursor/click handling -
     .stop on each button's own click (see template) keeps clicking an action from also
     dismissing the toast via the parent div's click handler. */
  cursor: default;
}

.toast-error {
  background: var(--color-danger);
}

.toast-success {
  background: var(--color-accent);
}

.toast-info {
  background: var(--color-surface1);
  /* --color-button-text (not --color-text) - same reasoning as buttons: a theme with a
     saturated/dark --color-surface1 (e.g. Brick Block) needs its own override here too, same
     as it already needs for buttons sitting on that same surface color. --color-text alone
     assumes a light neutral background, which --color-surface1 isn't guaranteed to be. */
  color: var(--color-button-text);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
