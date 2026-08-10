<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconLayoutGrid, IconSlideshow } from "@tabler/icons-vue";

import { useGamepadStatus } from "./composables/useGamepadStatus";
import {
  useLibraryStore,
  usePluginStore,
  useThemeStore,
  useMetadataProviderStore,
  useControllerMappingStore,
  useAppSettingsStore,
  useWrapperPluginStore,
  useAppUpdateStore,
  usePluginUpdatesStore,
  useTranslationStore,
} from "./stores";
import { TitleBar, NavSidebar, type AppView } from "./components/desktop/shell";
import {
  AppSettings,
  StatsPanel,
  TagsPanel,
  CollectionsPanel,
  GameFilters,
  GameGrid,
  GameList,
  PluginSettings,
} from "./components/desktop/tabs";
import { AddGame, CandidatePicker } from "./components/desktop/modalForms";
import { ToastContainer } from "./components/desktop/common";
import { GameDetail } from "./components/desktop/game";
import { BigPictureGrid, BigPictureSlideshow } from "./components/bigpicture";

const { t } = useI18n();
const library = useLibraryStore();
const plugins = usePluginStore();
const theme = useThemeStore();
const metadataProviders = useMetadataProviderStore();
const controllerMapping = useControllerMappingStore();
const appSettings = useAppSettingsStore();
const wrapperPlugins = useWrapperPluginStore();
const appUpdate = useAppUpdateStore();
const pluginUpdates = usePluginUpdatesStore();
const translation = useTranslationStore();
const bigPicture = ref(false);
const bigPictureViewMode = ref<"grid" | "slideshow">("grid");
const activeView = ref<AppView>("library");
const sidebarCollapsed = ref(false);
const showAddGameModal = ref(false);
const { connected: gamepadConnected, gamepadName } = useGamepadStatus();
// Dynamic import gated by a literal `import.meta.env.DEV` check, not a plain v-if in the
// template - Vue's compiled render function reads state through a proxy, so a v-if there
// can't be proven statically false and won't drop UiTest.vue's code from a production
// bundle. This ternary is inlinable by Vite's build-time DEV replacement, so the whole
// `import()` (and its chunk) is eliminated entirely in prod, not just hidden at runtime.
const UiTest = import.meta.env.DEV
  ? defineAsyncComponent(() => import("./components/desktop/tabs/UiTest.vue"))
  : undefined;

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
  await translation.init();
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
  translation.dispose();
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
        :class="{
          'scroll-locked': activeView === 'library' && plugins.scanning,
          'no-bottom-inset': activeView === 'library' && library.viewingGame,
        }"
      >
        <template v-if="activeView === 'library'">
          <Transition name="detail" mode="out-in">
            <GameDetail v-if="library.viewingGame" key="detail" />
            <div v-else key="browse" class="library-browse">
              <GameFilters />
              <GameGrid v-if="library.viewMode === 'grid'" />
              <GameList v-else />
            </div>
          </Transition>
        </template>

        <template v-else-if="activeView === 'stats'">
          <StatsPanel />
        </template>

        <template v-else-if="activeView === 'tags'">
          <TagsPanel />
        </template>

        <template v-else-if="activeView === 'collections'">
          <CollectionsPanel />
        </template>

        <template v-else-if="activeView === 'settings'">
          <AppSettings />
          <PluginSettings />
        </template>

        <template v-else-if="activeView === 'uiTest'">
          <component :is="UiTest" v-if="UiTest" />
        </template>
      </main>
      <AddGame :open="showAddGameModal" @close="showAddGameModal = false" />
    </div>
  </div>

  <div v-if="bigPicture">
    <div class="big-picture-controls">
      <button
        class="view-toggle-button"
        :title="bigPictureViewMode === 'grid' ? t('app.switchToSlideshow') : t('app.switchToGrid')"
        @click="bigPictureViewMode = bigPictureViewMode === 'grid' ? 'slideshow' : 'grid'"
      >
        <IconSlideshow v-if="bigPictureViewMode === 'grid'" :size="18" :stroke-width="1.75" />
        <IconLayoutGrid v-else :size="18" :stroke-width="1.75" />
      </button>
      <button class="exit-big-picture" @click="bigPicture = false">{{ t("app.exit") }}</button>
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
  /* Opt-in hook for a theme wanting a patterned/gradient content background (e.g. diagonal
     stripes) instead of `body`'s own flat `--color-base` - transparent by default so every
     existing theme (which only ever sets `--color-base`, never this) renders identically to
     before this hook existed, letting `body`'s solid color show through untouched. */
  background: var(--content-background, transparent);
}

/* While a source plugin scan is running, GameGrid/GameList hide already-loaded games behind
   skeleton placeholders only - locking scroll here too so there's nothing scrollable to reveal
   underneath mid-scan (a long library would otherwise let you scroll past the visible
   skeletons into empty space). */
.content.scroll-locked {
  overflow: hidden;
}

/* GameDetail.vue's own sticky `.action-bar` needs to reach `.content`'s true bottom edge -
   this padding sits inside `.content`'s own scrollport, so a sticky descendant can only ever
   reach its inner edge, leaving a dead gap below the bar otherwise. `.action-bar`'s own
   padding supplies the visual gap back once this is zeroed, so it's still present, just
   living on the element that's actually sticky. */
.content.no-bottom-inset {
  padding-bottom: 0;
}

/* Passthrough wrapper so GameFilters/GameGrid/GameList group under one root node for the
   <Transition> above - no layout of its own. */
.library-browse {
  display: contents;
}

/* Cross-fade between GameDetail and the browse view - out-in waits for the old view to fade
   out before the new one fades in, so they never both occupy .content's scroll position at once. */
.detail-enter-active,
.detail-leave-active {
  transition: opacity 0.15s ease;
}

.detail-enter-from,
.detail-leave-to {
  opacity: 0;
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
