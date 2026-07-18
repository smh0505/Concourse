<script setup lang="ts">
import { usePluginStore } from "../../stores/plugins";

const plugins = usePluginStore();
</script>

<template>
  <div class="plugin-settings">
    <h2>Plugins</h2>
    <p v-if="plugins.manifests.length === 0" class="empty">No plugins installed.</p>
    <ul v-else class="plugin-list">
      <li class="plugin-row" v-for="manifest in plugins.manifests" :key="manifest.id">
        <label>
          <input
            type="checkbox"
            :checked="plugins.enabledIds.has(manifest.id)"
            @change="plugins.togglePlugin(manifest.id)"
          />
          {{ manifest.name }}
          <span class="version">v{{ manifest.version }}</span>
        </label>
      </li>
    </ul>
    <button
      v-if="plugins.manifests.length > 0"
      class="scan-button"
      :disabled="plugins.scanning || plugins.loadedPlugins.length === 0"
      @click="plugins.scanAll"
    >
      {{ plugins.scanning ? "Scanning..." : "Scan Now" }}
    </button>
    <p v-if="plugins.lastScanSummary" class="scan-summary">{{ plugins.lastScanSummary }}</p>
  </div>
</template>

<style scoped>
.plugin-settings {
  margin-bottom: 1.5rem;
}

.plugin-settings h2 {
  font-size: 1rem;
  margin-bottom: 0.5rem;
}

.empty {
  opacity: 0.7;
  font-size: 0.85rem;
}

.plugin-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.plugin-row label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.version {
  opacity: 0.6;
  font-size: 0.75rem;
}

.scan-button {
  margin-top: 0.5rem;
  font-size: 0.85rem;
}

.scan-summary {
  margin-top: 0.4rem;
  font-size: 0.8rem;
  opacity: 0.8;
}
</style>
