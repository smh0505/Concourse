<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { IconDeviceGamepad, IconPlus } from "@tabler/icons-vue";

const { t } = useI18n();

export type AppView = "library" | "stats" | "tags" | "collections" | "settings" | "uiTest";

// import.meta.env isn't valid syntax inside a template expression (parsed in non-module
// scope) - read once here instead, so the "UI Test" button (and its dead branch in App.vue)
// gets tree-shaken out of production builds entirely, not just hidden at runtime.
const isDev = import.meta.env.DEV;

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
      {{ t("nav.controllerConnected") }}
    </span>

    <button class="add-game-button" @click="emit('addGame')">
      <IconPlus :size="16" :stroke-width="1.75" />
      {{ t("nav.addGame") }}
    </button>

    <div class="nav-items">
      <button
        class="nav-item"
        :class="{ 'accent-active': activeView === 'library' }"
        @click="emit('update:activeView', 'library')"
      >
        {{ t("nav.library") }}
      </button>
      <button
        class="nav-item"
        :class="{ 'accent-active': activeView === 'stats' }"
        @click="emit('update:activeView', 'stats')"
      >
        {{ t("nav.stats") }}
      </button>
      <button
        class="nav-item"
        :class="{ 'accent-active': activeView === 'tags' }"
        @click="emit('update:activeView', 'tags')"
      >
        {{ t("nav.tags") }}
      </button>
      <button
        class="nav-item"
        :class="{ 'accent-active': activeView === 'collections' }"
        @click="emit('update:activeView', 'collections')"
      >
        {{ t("nav.collections") }}
      </button>
      <button
        class="nav-item"
        :class="{ 'accent-active': activeView === 'settings' }"
        @click="emit('update:activeView', 'settings')"
      >
        {{ t("nav.settings") }}
      </button>
      <button
        v-if="isDev"
        class="nav-item"
        :class="{ 'accent-active': activeView === 'uiTest' }"
        @click="emit('update:activeView', 'uiTest')"
      >
        {{ t("nav.uiTest") }}
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
  gap: var(--space-3);
  padding: 1rem 0.75rem;
  background: var(--color-mantle);
  border-right: var(--button-border-width) solid var(--color-surface0);
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
  border-top: var(--button-border-width) solid var(--color-surface0);
  padding-top: 0.75rem;
}

.nav-item {
  text-align: left;
  background: transparent;
  border: none;
  padding: 0.5rem 0.6rem;
  border-radius: var(--radius-sm);
  color: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.nav-item:hover {
  background: var(--color-surface0);
}

/* .accent-active (shared, styles.css) supplies this rule's entire look. */

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
