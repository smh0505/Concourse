<script setup lang="ts">
import { onMounted, ref } from "vue";
import { usePluginStore } from "../../stores/plugins";
import { useThemeStore } from "../../stores/theme";
import { useMetadataProviderStore } from "../../stores/metadataProviders";
import { useControllerMappingStore } from "../../stores/controllerMapping";
import { useWrapperPluginStore } from "../../stores/wrapperPlugins";
import { usePluginInstallStore } from "../../stores/pluginInstall";
import { loadAllPlugins } from "../../plugins/loader";
import AddPlugin from "./modalForms/AddPlugin.vue";
import ConfirmInstall from "./modalForms/ConfirmInstall.vue";
import type {
  SourcePlugin,
  ThemePlugin,
  MetadataProviderPlugin,
  ControllerMappingPlugin,
  WrapperPlugin,
} from "../../plugins/types";

type Tab = "source" | "theme" | "metadata" | "controller" | "wrapper";

const plugins = usePluginStore();
const theme = useThemeStore();
const metadataProviders = useMetadataProviderStore();
const controllerMapping = useControllerMappingStore();
const wrapperPlugins = useWrapperPluginStore();
const pluginInstall = usePluginInstallStore();

const activeTab = ref<Tab>("source");
const showAddPluginModal = ref(false);

const allSourcePlugins = ref<Map<string, SourcePlugin>>(new Map());
const allThemePlugins = ref<Map<string, ThemePlugin>>(new Map());
const allMetadataPlugins = ref<Map<string, MetadataProviderPlugin>>(new Map());
const allControllerPlugins = ref<Map<string, ControllerMappingPlugin>>(new Map());
const allWrapperPlugins = ref<Map<string, WrapperPlugin>>(new Map());

onMounted(async () => {
  const [sourcePlugins, themePlugins, metadataPlugins, controllerPlugins, wrapperPluginsMap] =
    await Promise.all([
      loadAllPlugins<SourcePlugin>("source"),
      loadAllPlugins<ThemePlugin>("theme"),
      loadAllPlugins<MetadataProviderPlugin>("metadata"),
      loadAllPlugins<ControllerMappingPlugin>("controller"),
      loadAllPlugins<WrapperPlugin>("wrapper"),
    ]);
  allSourcePlugins.value = sourcePlugins;
  allThemePlugins.value = themePlugins;
  allMetadataPlugins.value = metadataPlugins;
  allControllerPlugins.value = controllerPlugins;
  allWrapperPlugins.value = wrapperPluginsMap;
});
</script>

<template>
  <div class="plugin-settings">
    <div class="plugin-settings-header">
      <h2>Plugins</h2>
      <button type="button" class="add-plugin-button" @click="showAddPluginModal = true">
        Add Plugin
      </button>
    </div>
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
      <button :class="{ active: activeTab === 'controller' }" @click="activeTab = 'controller'">
        Controller
      </button>
      <button :class="{ active: activeTab === 'wrapper' }" @click="activeTab = 'wrapper'">
        Wrapper
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
    </div>

    <div v-else-if="activeTab === 'theme'" class="tab-panel">
      <ul class="plugin-list">
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
          <button
            v-if="manifest.runtime === 'data'"
            type="button"
            class="uninstall-theme"
            @click="theme.uninstallDataTheme(manifest.id)"
          >
            Remove
          </button>
          <component
            :is="allThemePlugins.get(manifest.id)?.settingsComponent"
            v-if="allThemePlugins.get(manifest.id)?.settingsComponent"
          />
        </li>
      </ul>
    </div>

    <div v-else-if="activeTab === 'metadata'" class="tab-panel">
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

    <div v-else-if="activeTab === 'controller'" class="tab-panel">
      <p v-if="controllerMapping.manifests.length === 0" class="empty">No mappings installed.</p>
      <ul v-else class="plugin-list">
        <li class="plugin-row" v-for="manifest in controllerMapping.manifests" :key="manifest.id">
          <label>
            <input
              type="radio"
              name="controller-mapping"
              :checked="controllerMapping.activeMappingId === manifest.id"
              @change="controllerMapping.setActiveMapping(manifest.id)"
            />
            {{ manifest.name }}
            <span class="version">v{{ manifest.version }}</span>
          </label>
          <component
            :is="allControllerPlugins.get(manifest.id)?.settingsComponent"
            v-if="allControllerPlugins.get(manifest.id)?.settingsComponent"
          />
        </li>
      </ul>
    </div>

    <div v-else class="tab-panel">
      <p v-if="wrapperPlugins.manifests.length === 0" class="empty">No wrapper plugins installed.</p>
      <ul v-else class="plugin-list">
        <li class="plugin-row" v-for="manifest in wrapperPlugins.manifests" :key="manifest.id">
          <label>
            <input
              type="checkbox"
              :checked="wrapperPlugins.enabledIds.has(manifest.id)"
              @change="wrapperPlugins.toggleWrapper(manifest.id)"
            />
            {{ manifest.name }}
            <span class="version">v{{ manifest.version }}</span>
          </label>
          <component
            :is="allWrapperPlugins.get(manifest.id)?.settingsComponent"
            v-if="allWrapperPlugins.get(manifest.id)?.settingsComponent"
          />
        </li>
      </ul>
    </div>

    <AddPlugin
      :open="showAddPluginModal"
      title="Add Plugin"
      label="Plugin manifest URL"
      placeholder="https://.../plugin.json"
      :installing="pluginInstall.fetchingPreview"
      :on-install="pluginInstall.previewInstall"
      @close="showAddPluginModal = false"
    />
    <ConfirmInstall
      :open="pluginInstall.pendingManifest !== null"
      :manifest="pluginInstall.pendingManifest"
      :installing="pluginInstall.installing"
      :on-confirm="pluginInstall.confirmInstall"
      @close="pluginInstall.cancelInstall"
    />
  </div>
</template>

<style scoped>
.plugin-settings {
  margin-bottom: 1.5rem;
}

.plugin-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.plugin-settings-header h2 {
  font-size: 1rem;
  margin-bottom: 0;
}

.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.tabs button.active {
  background: var(--color-accent);
  color: var(--color-on-accent);
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

.plugin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

.plugin-row label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.uninstall-theme {
  font-size: 0.75rem;
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

.add-plugin-button {
  font-size: 0.85rem;
}
</style>
