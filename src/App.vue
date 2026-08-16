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
  usePresenceStore,
  useProfilesStore,
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
} from "./components/desktop/tabs";
import { AddGame, CandidatePicker } from "./components/desktop/modalForms";
import { ToastContainer } from "./components/desktop/common";
import { GameDetail } from "./components/desktop/game";
import { BigPictureGrid, BigPictureSlideshow, BigPictureProfileSwitcher } from "./components/bigpicture";
import { ProfileSwitcher } from "./components/desktop/profiles";

const { t } = useI18n();
const profiles = useProfilesStore();
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
const presence = usePresenceStore();
const bigPicture = ref(false);
const bigPictureViewMode = ref<"grid" | "slideshow">("grid");
const activeView = ref<AppView>("library");
const sidebarCollapsed = ref(false);
const showAddGameModal = ref(false);
// Mirrors library.viewingGame's truthiness, except *removed* a beat later than it would be -
// on close, viewingGame flips to null instantly, but GameDetail (and its sticky .action-bar)
// is still visibly playing its 150ms leave-fade at that moment. Toggling .content's
// no-bottom-inset class in lockstep with viewingGame instead would snap .content's real bottom
// padding back immediately, shifting .action-bar's sticky anchor point out from under it while
// it's still on screen - the visible "jump" in its background-attachment: fixed pattern this
// was reported against. Set true immediately on open (matches viewingGame, no lag needed since
// GameDetail hasn't rendered yet at that instant); cleared only once the leave transition
// actually finishes (@after-leave below), not when viewingGame itself changes.
const detailPaddingActive = ref(false);
watch(
  () => library.viewingGame,
  (game) => {
    if (game) detailPaddingActive.value = true;
  },
);
// @after-leave fires for *either* side of the out-in swap - the browse view leaving (opening
// detail) just as much as GameDetail leaving (closing it). Only the closing case should ever
// clear the flag; on open, viewingGame is already truthy again by the time this fires (the
// watcher above already set detailPaddingActive true before the browse-view leave even began),
// so guard on that instead of assuming every after-leave means "detail just closed."
function onDetailAfterLeave() {
  if (!library.viewingGame) detailPaddingActive.value = false;
}
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

// Everything below (games, tags, collections, stats, plugin scans, theme) depends on which
// profile is active (Milestone 30) - runs only once profiles.activeProfileId is set, whether
// that happens immediately (a remembered profile from last launch) or after the user picks one
// in ProfileSwitcher below. appSettings is the one remaining global (not per-profile) setting,
// so it's initialized separately in onMounted below, before this - ProfileSwitcher itself
// should already be in the right language, not stuck on a default until after a profile's
// picked. Theme used to be initialized there too (before profiles.init()) - now that it's
// per-profile, it can't run before a profile is chosen, so the picker instead renders in
// styles.css's own :root default (Catppuccin Latte) until this runs. See theme.ts's own comment.
async function initLibraryAndPlugins() {
  await theme.init();
  await library.init();
  await plugins.init();
  await metadataProviders.init();
  await controllerMapping.init();
  await wrapperPlugins.init();
  await translation.init();
  await presence.init();

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
}

onMounted(async () => {
  await appSettings.init();
  // Real OS fullscreen engages immediately, before a profile is even picked, when the user has
  // opted into launching straight into Big Picture - the profile picker itself then renders in
  // Big Picture's own fullscreen console style (BigPictureProfileSwitcher.vue) instead of the
  // small windowed ProfileSwitcher.vue. Big Picture's palette is hardcoded independent of theme
  // (see bp-surface's own comment elsewhere), so this doesn't need to wait on theme.init() below.
  // This is the ONLY place bigPicture gets set from the setting - initLibraryAndPlugins() below
  // deliberately doesn't also check it (it used to, which was the actual bug: that copy fired
  // unconditionally every time a profile became active, including via ProfileSwitcher's own
  // desktop picker or App.vue's onSwitchProfile reload, silently dragging the user into Big
  // Picture mid-session even though neither of those is reachable from Big Picture mode in the
  // first place). Mode switches now only ever happen here (real fresh launch) or via the
  // explicit toggle buttons (TitleBar's Big Picture button, the exit button inside it).
  // consumeSkipAutoBigPictureOnce() guards a mid-session "switch profile" reload from being
  // mistaken for a genuine fresh launch - both reach here via the exact same onMounted, but a
  // switch was only ever reachable from the desktop window, not something that should suddenly
  // throw the user into Big Picture just because that startup preference happens to be on.
  const enteringBigPicture = appSettings.autoLaunchBigPicture && !profiles.consumeSkipAutoBigPictureOnce();
  if (enteringBigPicture) bigPicture.value = true;
  // adoptRemembered: false when auto-launching into Big Picture - always show its own picker
  // as a console "who's playing" boot screen, not desktop's "remember last user" convenience,
  // even if a profile was in fact remembered from last session (see profiles.ts's own comment).
  await profiles.init({ adoptRemembered: !enteringBigPicture });
  if (profiles.activeProfileId !== null) await initLibraryAndPlugins();
});

/** Same reload-based approach as ProfilesPanel.vue's own switchProfile - see that component's
 *  comment for why a full reload beats threading a lighter re-init path through every
 *  profile-scoped store. Unlike that one, this doesn't pick a new profile at all, just clears
 *  the remembered one so the reload lands back on ProfileSwitcher. */
async function onSwitchProfile() {
  profiles.skipAutoBigPictureOnce();
  await profiles.backToPicker();
  window.location.reload();
}

// Fires once, the moment a profile first becomes active (either ProfileSwitcher's initial pick,
// or - since profiles.init() already adopted a remembered profile before this component ever
// mounted its watcher - never, in the common case where onMounted's own check above already
// handled it). Re-running this on every subsequent id change would re-init plugins/theme/etc.
// needlessly on an in-session profile switch, which only actually needs a plain data refresh -
// see ProfilesPanel.vue's own switchProfile, which reloads the window instead of trying to
// thread a lighter-weight re-init path through every store.
const stopWatchingProfile = watch(
  () => profiles.activeProfileId,
  async (id) => {
    if (id !== null) {
      await initLibraryAndPlugins();
      stopWatchingProfile();
    }
  },
);
onUnmounted(() => {
  library.dispose();
  translation.dispose();
  presence.dispose();
  unlistenFocus?.();
});
</script>

<template>
  <BigPictureProfileSwitcher v-if="profiles.activeProfileId === null && bigPicture" />
  <ProfileSwitcher v-else-if="profiles.activeProfileId === null" />

  <template v-else>
  <div v-if="!bigPicture" class="app-window">
    <TitleBar
      :sidebar-collapsed="sidebarCollapsed"
      @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
      @big-picture="bigPicture = true"
      @switch-profile="onSwitchProfile"
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
          'no-bottom-inset': activeView === 'library' && detailPaddingActive,
        }"
      >
        <template v-if="activeView === 'library'">
          <Transition name="detail" mode="out-in" @after-leave="onDetailAfterLeave">
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

  <CandidatePicker
    :open="metadataProviders.pendingCandidateSections !== null"
    :sections="metadataProviders.pendingCandidateSections ?? []"
    :on-submit="metadataProviders.submitCandidateSelections"
  />
  </template>

  <!-- Always mounted, unlike CandidatePicker above - a toast can fire before a profile is even
       selected (e.g. ProfileSwitcher's own creation flow), not just from post-login library
       actions. -->
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
     before this hook existed, letting `body`'s solid color show through untouched.
     background-attachment: fixed anchors the pattern to the viewport instead of this element's
     own scrolling box - same coordinate space the sticky bars below now share, so their
     background (falling back to this same value) lines up as one continuous pattern instead of
     each redrawing its own independently-positioned copy. */
  background: var(--content-background, transparent);
  background-attachment: fixed;
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
   out before the new one fades in, so they never both occupy .content's scroll position at once.
   (The real fix for .action-bar's fixed-background "jump" on close lives in detailPaddingActive/
   onDetailAfterLeave above, not here - an earlier will-change: opacity attempt on this rule
   didn't actually address the real cause and was removed.) */
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
