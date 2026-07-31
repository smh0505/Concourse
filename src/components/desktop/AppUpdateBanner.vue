<script setup lang="ts">
import { useAppUpdateStore } from "../../stores/appUpdate";

const appUpdate = useAppUpdateStore();
</script>

<template>
  <div v-if="appUpdate.available" class="update-banner">
    <span>
      Concourse {{ appUpdate.available.version }} is available (you're on
      {{ appUpdate.available.currentVersion }}).
    </span>
    <div class="update-banner-actions">
      <button type="button" :disabled="appUpdate.installing" @click="appUpdate.installUpdate()">
        {{ appUpdate.installing ? "Installing..." : "Update Now" }}
      </button>
      <button type="button" :disabled="appUpdate.installing" @click="appUpdate.dismiss()">
        Later
      </button>
    </div>
  </div>
</template>

<style scoped>
.update-banner {
  position: fixed;
  bottom: var(--space-4);
  right: var(--space-4);
  z-index: 200;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-mantle);
  border: var(--button-border-width) solid var(--color-accent);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  font-size: 0.85rem;
  max-width: 360px;
}

.update-banner-actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}
</style>
