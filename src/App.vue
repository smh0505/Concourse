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
import { useGamepadStatus } from "./composables/useGamepadStatus";
import TitleBar from "./components/desktop/TitleBar.vue";
import NavSidebar, { type AppView } from "./components/desktop/NavSidebar.vue";
import AppSettings from "./components/desktop/AppSettings.vue";
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

onMounted(async () => {
  await library.init();
  await plugins.init();
  await theme.init();
  await metadataProviders.init();
  await controllerMapping.init();
  await appSettings.init();
  await wrapperPlugins.init();
  if (appSettings.autoLaunchBigPicture) bigPicture.value = true;
});
onUnmounted(library.dispose);
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
      <main class="content">
        <template v-if="activeView === 'library'">
          <GameFilters />
          <GameGrid v-if="library.viewMode === 'grid'" />
          <GameList v-else />
        </template>

        <template v-else>
          <AppSettings />
          <PluginSettings />
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
  padding: var(--space-5) var(--space-6);
}

.big-picture-controls {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 21;
  display: flex;
  gap: var(--space-2);
}

.view-toggle-button {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
