<script setup lang="ts">
import { useToastStore } from "../../stores/toasts";

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
        @click="toasts.dismiss(toast.id)"
      >
        {{ toast.message }}
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
  padding: 0.6rem 0.9rem;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  font-size: 0.85rem;
  color: var(--color-on-accent);
  cursor: pointer;
}

.toast-error {
  background: var(--color-danger);
}

.toast-success {
  background: var(--color-accent);
}

.toast-info {
  background: var(--color-surface1);
  color: var(--color-text);
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
