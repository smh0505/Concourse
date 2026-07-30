<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { computed, onMounted, ref, shallowRef } from "vue";
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
import { RUN_PROGRAMS_CAPABILITY, type PluginManifest } from "../../plugins/manifest";

type Tab = "source" | "theme" | "metadata" | "controller" | "wrapper";

const plugins = usePluginStore();
const theme = useThemeStore();
const metadataProviders = useMetadataProviderStore();
const controllerMapping = useControllerMappingStore();
const wrapperPlugins = useWrapperPluginStore();
const pluginInstall = usePluginInstallStore();

const activeTab = ref<Tab>("source");
const showAddPluginModal = ref(false);

// shallowRef, not ref - these hold loaded plugin instances (including settingsComponent, a
// live Vue component definition) that only ever get swapped wholesale in onMounted below, never
// mutated field-by-field. A deep ref() would proxy each plugin object and its component through
// Vue's reactivity, which is what triggers "Vue received a Component that was made a reactive
// object" when passed to <component :is="...">.
const allSourcePlugins = shallowRef<Map<string, SourcePlugin>>(new Map());
const allThemePlugins = shallowRef<Map<string, ThemePlugin>>(new Map());
const allMetadataPlugins = shallowRef<Map<string, MetadataProviderPlugin>>(new Map());
const allControllerPlugins = shallowRef<Map<string, ControllerMappingPlugin>>(new Map());
const allWrapperPlugins = shallowRef<Map<string, WrapperPlugin>>(new Map());

/** Enabled plugins first, in their priority order, followed by installed-but-disabled ones -
 *  lets the reorder buttons act on a stable, priority-first list instead of jumping around
 *  whatever order getAvailablePluginManifests happened to discover them in. */
function orderByPriority(manifests: PluginManifest[], enabledIds: string[]): PluginManifest[] {
  const byId = new Map(manifests.map((m) => [m.id, m]));
  const enabled = enabledIds.map((id) => byId.get(id)).filter((m): m is PluginManifest => !!m);
  const rest = manifests.filter((m) => !enabledIds.includes(m.id));
  return [...enabled, ...rest];
}

const orderedSourceManifests = computed(() =>
  orderByPriority(plugins.manifests, plugins.enabledIds),
);
const orderedMetadataManifests = computed(() =>
  orderByPriority(metadataProviders.manifests, metadataProviders.enabledIds),
);

// Milestone 13 capability gating - tracks which already-installed plugins have a recorded
// grant for "run-programs", independent of how they got installed (install-by-URL's
// ConfirmInstall checkbox, or a plugin dropped in manually like Steam/GOG/Epic/LR/LE). A
// plugin declaring the capability but missing here gets a "Permission needed" row with a
// Grant button - no silent grandfathering, every plugin needs a real recorded grant.
const grantedRunPrograms = ref<Set<string>>(new Set());

function needsRunProgramsGrant(manifest: PluginManifest): boolean {
  return !!manifest.capabilities?.includes(RUN_PROGRAMS_CAPABILITY) && !grantedRunPrograms.value.has(manifest.id);
}

async function grantRunPrograms(pluginId: string) {
  await invoke("grant_plugin_capability", { pluginId, capability: RUN_PROGRAMS_CAPABILITY });
  grantedRunPrograms.value = new Set(grantedRunPrograms.value).add(pluginId);
}

async function loadGrantedCapabilities(manifests: PluginManifest[]) {
  const needsCheck = manifests.filter((m) => m.capabilities?.includes(RUN_PROGRAMS_CAPABILITY));
  const results = await Promise.all(
    needsCheck.map((m) =>
      invoke<boolean>("is_plugin_capability_granted", {
        pluginId: m.id,
        capability: RUN_PROGRAMS_CAPABILITY,
      }).then((granted) => [m.id, granted] as const),
    ),
  );
  const granted = new Set(grantedRunPrograms.value);
  for (const [id, isGranted] of results) if (isGranted) granted.add(id);
  grantedRunPrograms.value = granted;
}

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
  await loadGrantedCapabilities([...plugins.manifests, ...wrapperPlugins.manifests]);
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
      <small v-else>
        Scan order matters: on a same-titled game found by more than one source, the later
        source's launch path/platform wins. Reorder with the arrows below.
      </small>
      <ul v-if="plugins.manifests.length > 0" class="plugin-list">
        <li class="plugin-row" v-for="manifest in orderedSourceManifests" :key="manifest.id">
          <label>
            <input
              type="checkbox"
              :checked="plugins.enabledIds.includes(manifest.id)"
              @change="plugins.togglePlugin(manifest.id)"
            />
            {{ manifest.name }}
            <span class="version">v{{ manifest.version }}</span>
          </label>
          <span class="row-controls">
            <span v-if="plugins.enabledIds.includes(manifest.id)" class="reorder-buttons">
              <button
                type="button"
                :disabled="plugins.enabledIds.indexOf(manifest.id) === 0"
                @click="plugins.movePlugin(manifest.id, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                :disabled="
                  plugins.enabledIds.indexOf(manifest.id) === plugins.enabledIds.length - 1
                "
                @click="plugins.movePlugin(manifest.id, 1)"
              >
                ↓
              </button>
            </span>
            <component
              :is="allSourcePlugins.get(manifest.id)?.settingsComponent"
              v-if="allSourcePlugins.get(manifest.id)?.settingsComponent"
            />
          </span>
          <p v-if="needsRunProgramsGrant(manifest)" class="permission-needed">
            Permission needed: this plugin runs other programs on your system.
            <button type="button" @click="grantRunPrograms(manifest.id)">Grant</button>
          </p>
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
      <small v-else>
        Fetch order matters: for each field (description, release date, cover/background art),
        the first enabled provider that has an answer wins. Reorder with the arrows below.
      </small>
      <ul v-if="metadataProviders.manifests.length > 0" class="plugin-list">
        <li class="plugin-row" v-for="manifest in orderedMetadataManifests" :key="manifest.id">
          <label>
            <input
              type="checkbox"
              :checked="metadataProviders.enabledIds.includes(manifest.id)"
              @change="metadataProviders.toggleProvider(manifest.id)"
            />
            {{ manifest.name }}
            <span class="version">v{{ manifest.version }}</span>
          </label>
          <span class="row-controls">
            <span v-if="metadataProviders.enabledIds.includes(manifest.id)" class="reorder-buttons">
              <button
                type="button"
                :disabled="metadataProviders.enabledIds.indexOf(manifest.id) === 0"
                @click="metadataProviders.moveProvider(manifest.id, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                :disabled="
                  metadataProviders.enabledIds.indexOf(manifest.id) ===
                  metadataProviders.enabledIds.length - 1
                "
                @click="metadataProviders.moveProvider(manifest.id, 1)"
              >
                ↓
              </button>
            </span>
            <component
              :is="allMetadataPlugins.get(manifest.id)?.settingsComponent"
              v-if="allMetadataPlugins.get(manifest.id)?.settingsComponent"
            />
          </span>
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
          <p v-if="needsRunProgramsGrant(manifest)" class="permission-needed">
            Permission needed: this plugin runs other programs on your system.
            <button type="button" @click="grantRunPrograms(manifest.id)">Grant</button>
          </p>
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
  gap: var(--space-2);
  margin-bottom: 0.5rem;
}

.plugin-settings-header h2 {
  font-size: 1rem;
  margin-bottom: 0;
}

.tabs {
  display: flex;
  gap: var(--space-2);
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

/* small (shared, styles.css) supplies the base look; .tab-panel isn't flex, so this also
   needs an explicit display: block - a lone inline element wouldn't otherwise fill the
   container width the way the original <p> did by default. */
small {
  display: block;
  margin: 0 0 0.5rem;
}

.row-controls {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
}

.reorder-buttons {
  display: flex;
  gap: 0.25rem;
}

.reorder-buttons button {
  font-size: 0.75rem;
  padding: 0.1rem 0.4rem;
  line-height: 1.2;
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
  gap: var(--space-2);
  font-size: 0.9rem;
}

.uninstall-theme {
  font-size: 0.75rem;
}

.plugin-row :deep(.settings-form) {
  margin-top: 0.35rem;
  margin-left: 1.5rem;
}

.permission-needed {
  flex-basis: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.8rem;
  margin: 0.35rem 0 0;
  padding: 0.4rem 0.6rem;
  border: var(--button-border-width) solid var(--color-danger);
  border-radius: var(--radius-sm);
}

.permission-needed button {
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
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
