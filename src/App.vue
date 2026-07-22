<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useLibraryStore } from "./stores/library";
import { usePluginStore } from "./stores/plugins";
import { useThemeStore } from "./stores/theme";
import { useMetadataProviderStore } from "./stores/metadataProviders";
import { useControllerMappingStore } from "./stores/controllerMapping";
import { useAppSettingsStore } from "./stores/appSettings";
import { useGamepadStatus } from "./composables/useGamepadStatus";
import AppSettings from "./components/desktop/AppSettings.vue";
import SteamGridDbSettings from "./components/desktop/SteamGridDbSettings.vue";
import AddGameForm from "./components/desktop/AddGameForm.vue";
import ErrorBanner from "./components/desktop/ErrorBanner.vue";
import GameFilters from "./components/desktop/GameFilters.vue";
import GameGrid from "./components/desktop/GameGrid.vue";
import GameList from "./components/desktop/GameList.vue";
import EditGameModal from "./components/desktop/EditGameModal.vue";
import PluginSettings from "./components/desktop/PluginSettings.vue";
import BigPictureGrid from "./components/bigpicture/BigPictureGrid.vue";

const library = useLibraryStore();
const plugins = usePluginStore();
const theme = useThemeStore();
const metadataProviders = useMetadataProviderStore();
const controllerMapping = useControllerMappingStore();
const appSettings = useAppSettingsStore();
const bigPicture = ref(false);
const { connected: gamepadConnected, gamepadName } = useGamepadStatus();

watch(bigPicture, (enabled) => {
  getCurrentWindow()
    .setFullscreen(enabled)
    .catch((e) => console.error("Failed to toggle fullscreen:", e));

  // Big Picture is a fixed overlay on top of the desktop page, but the desktop page
  // itself is still scrollable underneath it - lock it so mouse-wheel input while Big
  // Picture is open doesn't scroll the hidden desktop content behind it.
  document.documentElement.style.overflow = enabled ? "hidden" : "";
});

onMounted(async () => {
  await library.init();
  await plugins.init();
  await theme.init();
  await metadataProviders.init();
  await controllerMapping.init();
  await appSettings.init();
  if (appSettings.autoLaunchBigPicture) bigPicture.value = true;
});
onUnmounted(library.dispose);
</script>

<template>
  <main class="container">
    <div class="header-row">
      <h1>Game Library</h1>
      <span v-if="gamepadConnected" class="gamepad-badge" :title="gamepadName ?? ''">
        🎮 Controller connected
      </span>
      <button @click="bigPicture = true">Big Picture Mode</button>
    </div>
    <AppSettings />
    <SteamGridDbSettings />
    <PluginSettings />
    <AddGameForm />
    <ErrorBanner />
    <GameFilters />
    <div class="view-toggle">
      <button :class="{ active: library.viewMode === 'grid' }" @click="library.setViewMode('grid')">
        Grid
      </button>
      <button :class="{ active: library.viewMode === 'list' }" @click="library.setViewMode('list')">
        List
      </button>
    </div>
    <GameGrid v-if="library.viewMode === 'grid'" />
    <GameList v-else />
    <EditGameModal />
  </main>

  <div v-if="bigPicture">
    <button class="exit-big-picture" @click="bigPicture = false">Exit</button>
    <BigPictureGrid @close="bigPicture = false" />
  </div>
</template>

<style scoped>
.container {
  margin: 0 auto;
  max-width: 960px;
  padding: 2rem 1.5rem;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.gamepad-badge {
  font-size: 0.85rem;
  opacity: 0.8;
}

.view-toggle {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.view-toggle button.active {
  background: var(--color-accent);
  color: var(--color-base);
}

.exit-big-picture {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 21;
}
</style>

<style>
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

  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  color: var(--color-text);
  background-color: var(--color-base);
}
</style>
