<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { computed, onMounted, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { IconChevronDown } from "@tabler/icons-vue";

import { usePluginStore } from "@/stores/plugins";
import { DropdownMenu } from "@/components/desktop/common";
import { useThemeStore } from "@/stores/theme";
import { useMetadataProviderStore } from "@/stores/metadataProviders";
import { useControllerMappingStore } from "@/stores/controllerMapping";
import { useWrapperPluginStore } from "@/stores/wrapperPlugins";
import { usePresenceStore } from "@/stores/presence";
import { usePluginInstallStore } from "@/stores/pluginInstall";
import { usePluginUpdatesStore } from "@/stores/pluginUpdates";
import { loadAllPlugins } from "@/plugins/loader";
import AddPlugin from "@/components/desktop/modalForms/AddPlugin.vue";
import ConfirmInstall from "@/components/desktop/modalForms/ConfirmInstall.vue";
import type {
  SourcePlugin,
  ThemePlugin,
  MetadataProviderPlugin,
  ControllerMappingPlugin,
  WrapperPlugin,
  PresencePlugin,
} from "@/plugins/types";
import { RUN_PROGRAMS_CAPABILITY, type PluginManifest } from "@/plugins/manifest";

type Tab = "source" | "theme" | "metadata" | "controller" | "wrapper" | "presence";

const { t } = useI18n();
const plugins = usePluginStore();
const theme = useThemeStore();
const metadataProviders = useMetadataProviderStore();
const controllerMapping = useControllerMappingStore();
const wrapperPlugins = useWrapperPluginStore();
const presence = usePresenceStore();
const pluginInstall = usePluginInstallStore();
const pluginUpdates = usePluginUpdatesStore();

const activeTab = ref<Tab>("source");
const showAddPluginModal = ref(false);

// Below 640px of the panel's own available width (a `@container` query, not `@media` - the
// window itself is normally already wider than that; what actually narrows this panel is the
// sidebar being expanded, not the OS window shrinking) the six tab buttons stop fitting on one
// line, so a DropdownMenu (same trigger/panel shape as AppSettings.vue's language picker) takes
// over instead. Both markups always render; CSS alone decides which is visible, so there's no
// layout thrash re-measuring on every sidebar toggle.
const tabMenuOpen = ref(false);
const tabs = computed<{ id: Tab; label: string }[]>(() => [
  { id: "source", label: t("pluginSettings.tabs.source") },
  { id: "theme", label: t("pluginSettings.tabs.theme") },
  { id: "metadata", label: t("pluginSettings.tabs.metadata") },
  { id: "controller", label: t("pluginSettings.tabs.controller") },
  { id: "wrapper", label: t("pluginSettings.tabs.wrapper") },
  { id: "presence", label: t("pluginSettings.tabs.presence") },
]);
const activeTabLabel = computed(() => tabs.value.find((tab) => tab.id === activeTab.value)?.label);

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
const allPresencePlugins = shallowRef<Map<string, PresencePlugin>>(new Map());

/** Enabled plugins first, in their priority order, followed by installed-but-disabled ones -
 *  lets the reorder buttons act on a stable, priority-first list instead of jumping around
 *  whatever order getAvailablePluginManifests happened to discover them in. */
function orderByPriority(manifests: PluginManifest[], enabledIds: string[]): PluginManifest[] {
  const byId = new Map(manifests.map((m) => [m.id, m]));
  const enabled = enabledIds.map((id) => byId.get(id)).filter((m): m is PluginManifest => !!m);
  const rest = manifests.filter((m) => !enabledIds.includes(m.id));
  return [...enabled, ...rest];
}

/** Build-time TS plugins (absent/"ts" runtime) ship bundled with the app itself and are never
 *  independently versioned in practice - their `version` field has stayed frozen at whatever it
 *  started at since nothing ever updates them out-of-band the way an installed WASM/data plugin
 *  does. Showing a real-looking "v1.0.0" that can never change is misleading; label these
 *  "Built-in" instead of a version number. */
function versionLabel(manifest: PluginManifest): string {
  if (!manifest.runtime || manifest.runtime === "ts") return t("pluginSettings.builtIn");
  return `v${manifest.version}`;
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
  const [sourcePlugins, themePlugins, metadataPlugins, controllerPlugins, wrapperPluginsMap, presencePlugins] =
    await Promise.all([
      loadAllPlugins<SourcePlugin>("source"),
      loadAllPlugins<ThemePlugin>("theme"),
      loadAllPlugins<MetadataProviderPlugin>("metadata"),
      loadAllPlugins<ControllerMappingPlugin>("controller"),
      loadAllPlugins<WrapperPlugin>("wrapper"),
      loadAllPlugins<PresencePlugin>("presence"),
    ]);
  allSourcePlugins.value = sourcePlugins;
  allThemePlugins.value = themePlugins;
  allMetadataPlugins.value = metadataPlugins;
  allControllerPlugins.value = controllerPlugins;
  allWrapperPlugins.value = wrapperPluginsMap;
  allPresencePlugins.value = presencePlugins;
  await loadGrantedCapabilities([...plugins.manifests, ...wrapperPlugins.manifests]);
  // A fourth check point beyond the three canonical ones (app start/focus live in App.vue,
  // install-plugin modal open lives in AddPlugin.vue) - opening the Settings view itself is a
  // real, distinct moment worth checking too, not just a stand-in for those three. checkOne
  // no-ops for any manifest never installed through the runtime pipeline (a build-time TS
  // controller plugin like standard-gamepad, say), so passing every kind's manifests here is
  // harmless regardless of which ones are actually data-installed.
  pluginUpdates.checkAll([
    ...plugins.manifests,
    ...theme.manifests,
    ...metadataProviders.manifests,
    ...controllerMapping.manifests,
    ...wrapperPlugins.manifests,
  ]);
});
</script>

<template>
  <div class="plugin-settings">
    <div class="plugin-settings-header">
      <h3>{{ t("pluginSettings.heading") }}</h3>
      <button type="button" @click="showAddPluginModal = true">
        {{ t("pluginSettings.addPlugin") }}
      </button>
    </div>
    <div class="tabs-container">
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="{ 'accent-active': activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
      <DropdownMenu
        v-model:open="tabMenuOpen"
        wrap-class="tabs-dropdown-wrap"
        panel-class="tabs-dropdown-panel"
      >
        <template #trigger>
          <button
            type="button"
            class="compact-button tabs-dropdown-trigger"
            @click="tabMenuOpen = !tabMenuOpen"
          >
            {{ activeTabLabel }}
            <IconChevronDown :size="14" :stroke-width="1.75" />
          </button>
        </template>
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="tabs-dropdown-item"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id; tabMenuOpen = false"
        >
          {{ tab.label }}
        </button>
      </DropdownMenu>
    </div>

    <div v-if="activeTab === 'source'" class="tab-panel">
      <p v-if="plugins.manifests.length === 0" class="empty">{{ t("pluginSettings.noSourcePlugins") }}</p>
      <small v-else>
        {{ t("pluginSettings.scanOrderHint") }}
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
            <span class="version">{{ versionLabel(manifest) }}</span>
            <button
              v-if="pluginUpdates.isUpdateAvailable(manifest.id)"
              type="button"
              class="update-badge compact-button"
              @click="pluginUpdates.applyUpdate(manifest)"
            >
              {{ t("pluginSettings.updateTo", { version: pluginUpdates.results[manifest.id]?.latestVersion }) }}
            </button>
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
            {{ t("pluginSettings.permissionNeeded") }}
            <button type="button" class="compact-button" @click="grantRunPrograms(manifest.id)">{{ t("pluginSettings.grant") }}</button>
          </p>
        </li>
      </ul>
      <button
        v-if="plugins.manifests.length > 0"
        class="scan-button"
        :disabled="plugins.scanning || plugins.loadedPlugins.length === 0"
        @click="plugins.scanAll"
      >
        {{ plugins.scanning ? t("pluginSettings.scanning") : t("pluginSettings.scanNow") }}
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
            <span class="version">{{ versionLabel(manifest) }}</span>
            <button
              v-if="pluginUpdates.isUpdateAvailable(manifest.id)"
              type="button"
              class="update-badge compact-button"
              @click="pluginUpdates.applyUpdate(manifest)"
            >
              {{ t("pluginSettings.updateTo", { version: pluginUpdates.results[manifest.id]?.latestVersion }) }}
            </button>
          </label>
          <button
            v-if="manifest.runtime === 'data'"
            type="button"
            class="uninstall-plugin"
            @click="theme.uninstallDataTheme(manifest.id)"
          >
            {{ t("pluginSettings.removeTheme") }}
          </button>
          <component
            :is="allThemePlugins.get(manifest.id)?.settingsComponent"
            v-if="allThemePlugins.get(manifest.id)?.settingsComponent"
          />
        </li>
      </ul>
    </div>

    <div v-else-if="activeTab === 'metadata'" class="tab-panel">
      <p v-if="metadataProviders.manifests.length === 0" class="empty">{{ t("pluginSettings.noMetadataProviders") }}</p>
      <small v-else>
        {{ t("pluginSettings.fetchOrderHint") }}
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
            <span class="version">{{ versionLabel(manifest) }}</span>
            <button
              v-if="pluginUpdates.isUpdateAvailable(manifest.id)"
              type="button"
              class="update-badge compact-button"
              @click="pluginUpdates.applyUpdate(manifest)"
            >
              {{ t("pluginSettings.updateTo", { version: pluginUpdates.results[manifest.id]?.latestVersion }) }}
            </button>
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
      <p v-if="controllerMapping.manifests.length === 0" class="empty">{{ t("pluginSettings.noControllerMappings") }}</p>
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
            <span class="version">{{ versionLabel(manifest) }}</span>
            <button
              v-if="pluginUpdates.isUpdateAvailable(manifest.id)"
              type="button"
              class="update-badge compact-button"
              @click="pluginUpdates.applyUpdate(manifest)"
            >
              {{ t("pluginSettings.updateTo", { version: pluginUpdates.results[manifest.id]?.latestVersion }) }}
            </button>
          </label>
          <button
            v-if="manifest.runtime === 'data'"
            type="button"
            class="uninstall-plugin"
            @click="controllerMapping.uninstallDataMapping(manifest.id)"
          >
            {{ t("pluginSettings.removeControllerMapping") }}
          </button>
          <component
            :is="allControllerPlugins.get(manifest.id)?.settingsComponent"
            v-if="allControllerPlugins.get(manifest.id)?.settingsComponent"
          />
        </li>
      </ul>
    </div>

    <div v-else-if="activeTab === 'wrapper'" class="tab-panel">
      <p v-if="wrapperPlugins.manifests.length === 0" class="empty">{{ t("pluginSettings.noWrapperPlugins") }}</p>
      <ul v-else class="plugin-list">
        <li class="plugin-row" v-for="manifest in wrapperPlugins.manifests" :key="manifest.id">
          <label>
            <input
              type="checkbox"
              :checked="wrapperPlugins.enabledIds.has(manifest.id)"
              @change="wrapperPlugins.toggleWrapper(manifest.id)"
            />
            {{ manifest.name }}
            <span class="version">{{ versionLabel(manifest) }}</span>
            <button
              v-if="pluginUpdates.isUpdateAvailable(manifest.id)"
              type="button"
              class="update-badge compact-button"
              @click="pluginUpdates.applyUpdate(manifest)"
            >
              {{ t("pluginSettings.updateTo", { version: pluginUpdates.results[manifest.id]?.latestVersion }) }}
            </button>
          </label>
          <component
            :is="allWrapperPlugins.get(manifest.id)?.settingsComponent"
            v-if="allWrapperPlugins.get(manifest.id)?.settingsComponent"
          />
          <p v-if="needsRunProgramsGrant(manifest)" class="permission-needed">
            {{ t("pluginSettings.permissionNeeded") }}
            <button type="button" class="compact-button" @click="grantRunPrograms(manifest.id)">{{ t("pluginSettings.grant") }}</button>
          </p>
        </li>
      </ul>
    </div>

    <div v-else class="tab-panel">
      <p v-if="presence.manifests.length === 0" class="empty">{{ t("pluginSettings.noPresencePlugins") }}</p>
      <ul v-else class="plugin-list">
        <li class="plugin-row" v-for="manifest in presence.manifests" :key="manifest.id">
          <label>
            <input
              type="checkbox"
              :checked="presence.enabledIds.has(manifest.id)"
              @change="presence.toggle(manifest.id)"
            />
            {{ manifest.name }}
            <span class="version">{{ versionLabel(manifest) }}</span>
            <button
              v-if="pluginUpdates.isUpdateAvailable(manifest.id)"
              type="button"
              class="update-badge compact-button"
              @click="pluginUpdates.applyUpdate(manifest)"
            >
              {{ t("pluginSettings.updateTo", { version: pluginUpdates.results[manifest.id]?.latestVersion }) }}
            </button>
          </label>
          <component
            :is="allPresencePlugins.get(manifest.id)?.settingsComponent"
            v-if="allPresencePlugins.get(manifest.id)?.settingsComponent"
          />
        </li>
      </ul>
    </div>

    <AddPlugin
      :open="showAddPluginModal"
      :title="t('pluginSettings.addPlugin')"
      :label="t('pluginSettings.manifestUrlLabel')"
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
  margin-top: var(--space-5);
}

.plugin-settings-header {
  display: flex;
  /* baseline (not center) - centers the flex box, not the text itself, so a leftover browser-
     default h3 margin/line-height mismatch against the button's own font-size still reads as
     visually offset even with align-items:center. baseline lines up the actual text. */
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: 0.5rem;
}

.plugin-settings-header h3 {
  font-size: 0.95rem;
  margin: 0;
}

/* Container query, not a media query - the OS window is normally already wider than 640px;
   what actually narrows this panel is the sidebar being expanded (NavSidebar.vue), not the
   window shrinking, so this needs to react to the panel's own available width. */
.tabs-container {
  container-type: inline-size;
  margin-bottom: 0.75rem;
}

.tabs {
  display: flex;
  gap: var(--space-2);
}

.tabs-dropdown-wrap {
  display: none;
}

@container (max-width: 640px) {
  .tabs {
    display: none;
  }

  .tabs-dropdown-wrap {
    display: block;
  }
}

.tabs-dropdown-trigger {
  width: 100%;
  justify-content: space-between;
}

.tabs-dropdown-wrap :deep(.tabs-dropdown-panel) {
  right: 0;
  left: 0;
}

.tabs-dropdown-item {
  display: block;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-size: 0.85rem;
  text-align: left;
  border: none;
  background: none;
  cursor: pointer;
  color: inherit;
}

.tabs-dropdown-item:hover {
  background: var(--color-surface0);
}

.tabs-dropdown-item.active {
  background: color-mix(in srgb, currentColor 12%, transparent);
}

/* .accent-active (shared, styles.css) supplies this rule's entire look. */

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

.uninstall-plugin {
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

/* .compact-button (shared, styles.css) supplies this rule's entire look. */

.version {
  opacity: 0.6;
  font-size: 0.75rem;
}

/* .compact-button (shared, styles.css) supplies the font-size/padding; this layers the
   accent styling on top so it reads as a call to action, not just another neutral button. */
.update-badge {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-on-accent);
  font-weight: 600;
}

.scan-button {
  margin-top: 0.5rem;
}
</style>
