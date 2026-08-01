<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconLayoutGrid, IconSlideshow } from "@tabler/icons-vue";
import { useLibraryStore } from "./stores/library";
import { usePluginStore } from "./stores/plugins";
import { useThemeStore } from "./stores/theme";
import { useMetadataProviderStore } from "./stores/metadataProviders";
import { useControllerMappingStore } from "./stores/controllerMapping";
import { useAppSettingsStore } from "./stores/appSettings";
import { useWrapperPluginStore } from "./stores/wrapperPlugins";
import { useAppUpdateStore } from "./stores/appUpdate";
import { usePluginUpdatesStore } from "./stores/pluginUpdates";
import { useGamepadStatus } from "./composables/useGamepadStatus";
import TitleBar from "./components/desktop/TitleBar.vue";
import NavSidebar, { type AppView } from "./components/desktop/NavSidebar.vue";
import AppSettings from "./components/desktop/AppSettings.vue";
import UiTest from "./components/desktop/UiTest.vue";
import AddGame from "./components/desktop/modalForms/AddGame.vue";
import CandidatePicker from "./components/desktop/modalForms/CandidatePicker.vue";
import ToastContainer from "./components/desktop/ToastContainer.vue";
import GameFilters from "./components/desktop/GameFilters.vue";
import GameGrid from "./components/desktop/GameGrid.vue";
import GameList from "./components/desktop/GameList.vue";
import EditGame from "./components/desktop/modalForms/EditGame.vue";
import PluginSettings from "./components/desktop/PluginSettings.vue";
import BigPictureGrid from "./components/bigpicture/BigPictureGrid.vue";
import BigPictureSlideshow from "./components/bigpicture/BigPictureSlideshow.vue";

const library = useLibraryStore();
const plugins = usePluginStore();
const theme = useThemeStore();
const metadataProviders = useMetadataProviderStore();
const controllerMapping = useControllerMappingStore();
const appSettings = useAppSettingsStore();
const wrapperPlugins = useWrapperPluginStore();
const appUpdate = useAppUpdateStore();
const pluginUpdates = usePluginUpdatesStore();
const bigPicture = ref(false);
const bigPictureViewMode = ref<"grid" | "slideshow">("grid");
const activeView = ref<AppView>("library");
const sidebarCollapsed = ref(false);
const showAddGameModal = ref(false);
const { connected: gamepadConnected, gamepadName } = useGamepadStatus();

watch(bigPicture, (enabled) => {
  getCurrentWindow()
    .setFullscreen(enabled)
    .catch((e) => console.error("Failed to toggle fullscreen:", e));

  // Big Picture is a fixed overlay on top of the desktop page; lock scroll so mouse-wheel
  // input doesn't scroll the hidden desktop content behind it.
  document.documentElement.style.overflow = enabled ? "hidden" : "";
});

let unlistenFocus: (() => void) | undefined;

/** All five domain stores' manifests, gathered in one place for `pluginUpdates.checkAll` -
 *  it already no-ops per-manifest for anything that was never installed through the runtime
 *  pipeline (build-time TS plugins, controller mappings), so passing every kind here is
 *  harmless rather than needing each call site to know which kinds are actually checkable. */
function checkAllPluginUpdates() {
  pluginUpdates.checkAll([
    ...plugins.manifests,
    ...theme.manifests,
    ...metadataProviders.manifests,
    ...controllerMapping.manifests,
    ...wrapperPlugins.manifests,
  ]);
}

onMounted(async () => {
  await library.init();
  await plugins.init();
  await theme.init();
  await metadataProviders.init();
  await controllerMapping.init();
  await appSettings.init();
  await wrapperPlugins.init();
  if (appSettings.autoLaunchBigPicture) bigPicture.value = true;

  // Two of the three update-check moments (app start, app focus) - the third (install-plugin
  // modal open) lives in AddPlugin.vue. Not awaited - a failed/slow update check shouldn't
  // delay the rest of startup.
  appUpdate.checkForUpdate();
  checkAllPluginUpdates();
  unlistenFocus = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (focused) {
      appUpdate.checkForUpdate();
      checkAllPluginUpdates();
    }
  });
});
onUnmounted(() => {
  library.dispose();
  unlistenFocus?.();
});
</script>

<template>
  <div v-if="!bigPicture" class="app-window">
    <TitleBar
      :sidebar-collapsed="sidebarCollapsed"
      @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
      @big-picture="bigPicture = true"
    />
    <div class="app-shell">
      <Transition name="sidebar">
        <NavSidebar
          v-if="!sidebarCollapsed"
          :active-view="activeView"
          :gamepad-connected="gamepadConnected"
          :gamepad-name="gamepadName"
          @update:active-view="activeView = $event"
          @add-game="showAddGameModal = true"
        />
      </Transition>
      <main
        class="content"
        :class="{ 'scroll-locked': activeView === 'library' && plugins.scanning }"
      >
        <template v-if="activeView === 'library'">
          <GameFilters />
          <GameGrid v-if="library.viewMode === 'grid'" />
          <GameList v-else />
        </template>

        <template v-else-if="activeView === 'settings'">
          <div class="settings-panel">
            <AppSettings />
            <PluginSettings />
          </div>
        </template>

        <template v-else>
          <div class="settings-panel">
            <UiTest />
          </div>
        </template>
      </main>
      <AddGame :open="showAddGameModal" @close="showAddGameModal = false" />
      <EditGame />
    </div>
  </div>

  <div v-if="bigPicture">
    <div class="big-picture-controls">
      <button
        class="view-toggle-button"
        :title="bigPictureViewMode === 'grid' ? 'Switch to slideshow view' : 'Switch to grid view'"
        @click="bigPictureViewMode = bigPictureViewMode === 'grid' ? 'slideshow' : 'grid'"
      >
        <IconSlideshow v-if="bigPictureViewMode === 'grid'" :size="18" :stroke-width="1.75" />
        <IconLayoutGrid v-else :size="18" :stroke-width="1.75" />
      </button>
      <button class="exit-big-picture" @click="bigPicture = false">Exit</button>
    </div>
    <BigPictureGrid v-if="bigPictureViewMode === 'grid'" @close="bigPicture = false" />
    <BigPictureSlideshow v-else @close="bigPicture = false" />
  </div>

  <ToastContainer />
  <CandidatePicker
    :open="metadataProviders.pendingCandidateSections !== null"
    :sections="metadataProviders.pendingCandidateSections ?? []"
    :on-submit="metadataProviders.submitCandidateSelections"
  />
</template>

<style scoped>
.app-window {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.content {
  flex: 1;
  overflow-y: auto;
  /* Still a safety net against any future horizontal overflow, though the actual buffer for
     GameCard's hover scale-bleed now lives in GameGrid.vue's own `.grid` padding below, not
     here - `.content` has no horizontal padding of its own anymore. */
  overflow-x: hidden;
  /* No horizontal padding here - GameFilters.vue's `.filters` needs to span this container's
     full width, so left/right inset lives on GameGrid.vue's `.grid`/GameList.vue's `.list`
     instead (and `.settings-panel` below, for the other view). Bottom stays here since both
     views want the same scroll-end breathing room regardless of which child owns left/right. */
  padding: 0 0 var(--space-5);
}

/* While a source plugin scan is running, GameGrid/GameList hide already-loaded games behind
   skeleton placeholders only - locking scroll here too so there's nothing scrollable to reveal
   underneath mid-scan (a long library would otherwise let you scroll past the visible
   skeletons into empty space). */
.content.scroll-locked {
  overflow: hidden;
}

/* Only the settings view needs this - the library view's own top gap comes from
   GameFilters.vue's sticky `.filters` (padding-top baked in there instead). */
.settings-panel {
  padding: var(--space-5) var(--space-6) 0;
}

.big-picture-controls {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 21;
  display: flex;
  gap: var(--space-2);
}

/* .view-toggle-button (shared, styles.css) supplies this rule's entire look. */
</style>
