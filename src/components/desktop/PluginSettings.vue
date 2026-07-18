<script setup lang="ts">
import { onMounted, ref } from "vue";
import { usePluginStore } from "../../stores/plugins";
import { useThemeStore } from "../../stores/theme";
import { useMetadataProviderStore } from "../../stores/metadataProviders";
import { loadAllPlugins } from "../../plugins/loader";
import type { SourcePlugin, ThemePlugin, MetadataProviderPlugin } from "../../plugins/types";

type Tab = "source" | "theme" | "metadata";

const plugins = usePluginStore();
const theme = useThemeStore();
const metadataProviders = useMetadataProviderStore();

const activeTab = ref<Tab>("source");

const allSourcePlugins = ref<Map<string, SourcePlugin>>(new Map());
const allThemePlugins = ref<Map<string, ThemePlugin>>(new Map());
const allMetadataPlugins = ref<Map<string, MetadataProviderPlugin>>(new Map());

onMounted(async () => {
  const [sourcePlugins, themePlugins, metadataPlugins] = await Promise.all([
    loadAllPlugins<SourcePlugin>("source"),
    loadAllPlugins<ThemePlugin>("theme"),
    loadAllPlugins<MetadataProviderPlugin>("metadata"),
  ]);
  allSourcePlugins.value = sourcePlugins;
  allThemePlugins.value = themePlugins;
  allMetadataPlugins.value = metadataPlugins;
});
</script>

<template>
  <div class="plugin-settings">
    <h2>Plugins</h2>
    <div class="tabs">
      <button :class="{ active: activeTab === 'source' }" @click="activeTab = 'source'">
        Source
      </button>
      <button :class="{ active: activeTab === 'theme' }" @click="activeTab = 'theme'">
        Theme
      </button>
      <button :class="{ active: activeTab === 'metadata' }" @click="activeTab = 'metadata'">
        Metadata Provider
      </button>
    </div>

    <div v-if="activeTab === 'source'" class="tab-panel">
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
          <component
            :is="allSourcePlugins.get(manifest.id)?.settingsComponent"
            v-if="allSourcePlugins.get(manifest.id)?.settingsComponent"
          />
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

    <div v-else-if="activeTab === 'theme'" class="tab-panel">
      <ul class="plugin-list">
        <li class="plugin-row">
          <label>
            <input
              type="radio"
              name="theme-provider"
              :checked="theme.activeThemeId === null"
              @change="theme.setActiveTheme(null)"
            />
            Default
          </label>
        </li>
        <li class="plugin-row" v-for="manifest in theme.manifests" :key="manifest.id">
          <label>
            <input
              type="radio"
              name="theme-provider"
              :checked="theme.activeThemeId === manifest.id"
              @change="theme.setActiveTheme(manifest.id)"
            />
            {{ manifest.name }}
            <span class="version">v{{ manifest.version }}</span>
          </label>
          <component
            :is="allThemePlugins.get(manifest.id)?.settingsComponent"
            v-if="allThemePlugins.get(manifest.id)?.settingsComponent"
          />
        </li>
      </ul>
    </div>

    <div v-else class="tab-panel">
      <p v-if="metadataProviders.manifests.length === 0" class="empty">No providers installed.</p>
      <ul v-else class="plugin-list">
        <li class="plugin-row" v-for="manifest in metadataProviders.manifests" :key="manifest.id">
          <label>
            <input
              type="checkbox"
              :checked="metadataProviders.enabledIds.has(manifest.id)"
              @change="metadataProviders.toggleProvider(manifest.id)"
            />
            {{ manifest.name }}
            <span class="version">v{{ manifest.version }}</span>
          </label>
          <component
            :is="allMetadataPlugins.get(manifest.id)?.settingsComponent"
            v-if="allMetadataPlugins.get(manifest.id)?.settingsComponent"
          />
        </li>
      </ul>
    </div>
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

.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.tabs button.active {
  background: var(--color-accent);
  color: var(--color-base);
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
  gap: 0.6rem;
}

.plugin-row label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.plugin-row :deep(.settings-form) {
  margin-top: 0.35rem;
  margin-left: 1.5rem;
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
