<script setup lang="ts">
import { IconDeviceGamepad, IconPlus } from "@tabler/icons-vue";

export type AppView = "library" | "settings";

defineProps<{
  activeView: AppView;
  gamepadConnected: boolean;
  gamepadName: string | null;
}>();

const emit = defineEmits<{
  "update:activeView": [view: AppView];
  addGame: [];
}>();
</script>

<template>
  <nav class="sidebar">
    <span v-if="gamepadConnected" class="gamepad-badge" :title="gamepadName ?? ''">
      <IconDeviceGamepad :size="16" :stroke-width="1.75" />
      Controller connected
    </span>

    <button class="add-game-button" @click="emit('addGame')">
      <IconPlus :size="16" :stroke-width="1.75" />
      Add Game
    </button>

    <div class="nav-items">
      <button
        class="nav-item"
        :class="{ active: activeView === 'library' }"
        @click="emit('update:activeView', 'library')"
      >
        Library
      </button>
      <button
        class="nav-item"
        :class="{ active: activeView === 'settings' }"
        @click="emit('update:activeView', 'settings')"
      >
        Settings
      </button>
    </div>
  </nav>
</template>

<style scoped>
.sidebar {
  width: 180px;
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 0.75rem;
  background: var(--color-mantle);
  border-right: 1px solid var(--color-surface0);
}

.gamepad-badge {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  opacity: 0.8;
  padding: 0 0.25rem;
}

.add-game-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  width: 100%;
}

.nav-items {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.5rem;
  border-top: 1px solid var(--color-surface0);
  padding-top: 0.75rem;
}

.nav-item {
  text-align: left;
  background: transparent;
  border: none;
  padding: 0.5rem 0.6rem;
  border-radius: 4px;
  color: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.nav-item:hover {
  background: var(--color-surface0);
}

.nav-item.active {
  background: var(--color-accent);
  color: var(--color-base);
}

.sidebar-enter-active,
.sidebar-leave-active {
  transition:
    width 0.2s ease,
    padding 0.2s ease,
    opacity 0.2s ease;
}

.sidebar-enter-from,
.sidebar-leave-to {
  width: 0;
  padding-left: 0;
  padding-right: 0;
  opacity: 0;
}
</style>
