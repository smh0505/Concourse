<script setup lang="ts">
import { useThemeStore } from "../../stores/theme";

const theme = useThemeStore();
</script>

<template>
  <div class="theme-settings">
    <h2>Theme</h2>
    <p v-if="theme.manifests.length === 0" class="empty">No themes installed.</p>
    <ul v-else class="theme-list">
      <li class="theme-row">
        <label>
          <input
            type="radio"
            name="theme"
            :checked="theme.activeThemeId === null"
            @change="theme.setActiveTheme(null)"
          />
          Default
        </label>
      </li>
      <li class="theme-row" v-for="manifest in theme.manifests" :key="manifest.id">
        <label>
          <input
            type="radio"
            name="theme"
            :checked="theme.activeThemeId === manifest.id"
            @change="theme.setActiveTheme(manifest.id)"
          />
          {{ manifest.name }}
          <span class="version">v{{ manifest.version }}</span>
        </label>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.theme-settings {
  margin-bottom: 1.5rem;
}

.theme-settings h2 {
  font-size: 1rem;
  margin-bottom: 0.5rem;
}

.empty {
  opacity: 0.7;
  font-size: 0.85rem;
}

.theme-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.theme-row label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.version {
  opacity: 0.6;
  font-size: 0.75rem;
}
</style>
