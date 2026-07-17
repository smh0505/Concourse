<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useLibraryStore } from "./stores/library";
import { usePluginStore } from "./stores/plugins";
import { useThemeStore } from "./stores/theme";
import { useGamepadStatus } from "./composables/useGamepadStatus";
import ApiKeySettings from "./components/desktop/ApiKeySettings.vue";
import AddGameForm from "./components/desktop/AddGameForm.vue";
import ErrorBanner from "./components/desktop/ErrorBanner.vue";
import GameFilters from "./components/desktop/GameFilters.vue";
import GameGrid from "./components/desktop/GameGrid.vue";
import EditGameModal from "./components/desktop/EditGameModal.vue";
import PluginSettings from "./components/desktop/PluginSettings.vue";
import ThemeSettings from "./components/desktop/ThemeSettings.vue";
import BigPictureGrid from "./components/bigpicture/BigPictureGrid.vue";

const library = useLibraryStore();
const plugins = usePluginStore();
const theme = useThemeStore();
const bigPicture = ref(false);
const { connected: gamepadConnected, gamepadName } = useGamepadStatus();

watch(bigPicture, (enabled) => {
  getCurrentWindow()
    .setFullscreen(enabled)
    .catch((e) => console.error("Failed to toggle fullscreen:", e));
});

onMounted(async () => {
  await library.init();
  await plugins.init();
  await theme.init();
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
    <ApiKeySettings />
    <PluginSettings />
    <ThemeSettings />
    <AddGameForm />
    <ErrorBanner />
    <GameFilters />
    <GameGrid />
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
