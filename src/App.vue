<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useLibraryStore } from "./stores/library";
import { usePluginStore } from "./stores/plugins";
import { useGamepadStatus } from "./composables/useGamepadStatus";
import ApiKeySettings from "./components/desktop/ApiKeySettings.vue";
import AddGameForm from "./components/desktop/AddGameForm.vue";
import ErrorBanner from "./components/desktop/ErrorBanner.vue";
import GameFilters from "./components/desktop/GameFilters.vue";
import GameGrid from "./components/desktop/GameGrid.vue";
import EditGameModal from "./components/desktop/EditGameModal.vue";
import PluginSettings from "./components/desktop/PluginSettings.vue";
import BigPictureGrid from "./components/bigpicture/BigPictureGrid.vue";

const library = useLibraryStore();
const plugins = usePluginStore();
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
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  color: #0f0f0f;
  background-color: #f6f6f6;
}

@media (prefers-color-scheme: dark) {
  :root {
    color: #f6f6f6;
    background-color: #2f2f2f;
  }
}
</style>
