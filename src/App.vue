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
import SteamGridDbSettings from "./components/desktop/SteamGridDbSettings.vue";
import AddGameForm from "./components/desktop/AddGameForm.vue";
import ToastContainer from "./components/desktop/ToastContainer.vue";
import GameFilters from "./components/desktop/GameFilters.vue";
import GameGrid from "./components/desktop/GameGrid.vue";
import GameList from "./components/desktop/GameList.vue";
import EditGameModal from "./components/desktop/EditGameModal.vue";
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
          <SteamGridDbSettings />
          <PluginSettings />
        </template>
      </main>
      <AddGameForm :open="showAddGameModal" @close="showAddGameModal = false" />
      <EditGameModal />
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
  padding: 1.5rem 2rem;
}

.big-picture-controls {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 21;
  display: flex;
  gap: 0.5rem;
}

.view-toggle-button {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body,
#app {
  margin: 0;
  padding: 0;
  height: 100%;
}

:root {
  /* Catppuccin Latte, as the compiled-in default (also the shipped default theme) */
  --color-base: #eff1f5;
  --color-mantle: #e6e9ef;
  --color-crust: #dce0e8;
  --color-text: #4c4f69;
  --color-subtext: #5c5f77;
  --color-surface0: #ccd0da;
  --color-surface1: #bcc0cc;
  --color-accent: #1e66f5;
  --color-accent-alt: #8839ef;
  --color-danger: #d20f39;

  /* Spacing scale */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;

  /* Border-radius scale */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;

  /* Elevation */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.12);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.18);

  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  color: var(--color-text);
  background-color: var(--color-base);
}

/* Consistent baseline for raw form controls - component-scoped styles (nav items,
   titlebar buttons, tag pills, ...) override where a distinct look is intentional. */
button,
input:not([type="checkbox"]):not([type="radio"]),
textarea,
select {
  font-family: inherit;
  font-size: 0.85rem;
  color: var(--color-text);
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.45rem 0.9rem;
  border: 1px solid var(--color-surface0);
  border-radius: var(--radius-md);
  background: var(--color-surface0);
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease,
    opacity 0.12s ease;
}

button:hover:not(:disabled) {
  background: var(--color-surface1);
}

button:active:not(:disabled) {
  transform: translateY(1px);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Primary action styling for submit buttons (Save/Add/etc.) - Cancel/secondary buttons
   stay type="button" and keep the neutral look above. */
button[type="submit"] {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-base);
}

button[type="submit"]:hover:not(:disabled) {
  filter: brightness(1.08);
}

input:not([type="checkbox"]):not([type="radio"]),
textarea,
select {
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--color-surface0);
  border-radius: var(--radius-md);
  background: var(--color-base);
}

input:not([type="checkbox"]):not([type="radio"]):focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: var(--color-accent);
}

/* Themed scrollbars for desktop mode - Big Picture hides its own entirely (console
   aesthetic) via its own scoped rules, which win over this global one on specificity. */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--color-surface1) var(--color-base);
}

::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
  background: var(--color-base);
}

::-webkit-scrollbar-thumb {
  background: var(--color-surface1);
  border-radius: var(--radius-md);
  border: 2px solid var(--color-base);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-accent);
}
</style>
