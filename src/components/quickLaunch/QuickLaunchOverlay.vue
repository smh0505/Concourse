<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { IconSearch } from "@tabler/icons-vue";

import { useLibraryStore } from "@/stores/library";
import { useAppSettingsStore } from "@/stores/appSettings";
import { useThemeStore } from "@/stores/theme";
import { displayTitle, type Game } from "@/db";
import { fuzzyFilter } from "@/utils/fuzzyMatch";

const BATCH_SIZE = 8;
// How close to the bottom (in px) the results list has to be scrolled before the next batch
// loads - loading a little before the true end avoids a visible pause right as the user hits it.
const LOAD_MORE_THRESHOLD_PX = 80;

const { t } = useI18n();
const library = useLibraryStore();
const appSettings = useAppSettingsStore();
const theme = useThemeStore();

const search = ref("");
const selectedIndex = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);
const resultsEl = ref<HTMLElement | null>(null);
// How many of `allMatches` are actually rendered - grows by BATCH_SIZE as the list scrolls
// toward its bottom, rather than rendering every match up front. Already-rendered rows never
// get removed on scroll-back-up, so "previous" batches stay exactly where they were.
const visibleCount = ref(BATCH_SIZE);

const allMatches = computed<Game[]>(() => {
  if (!search.value.trim()) return library.games;
  return fuzzyFilter(library.games, search.value.trim(), (g) => g.title).map((m) => m.item);
});

const results = computed<Game[]>(() => allMatches.value.slice(0, visibleCount.value));

function loadMoreIfNeeded() {
  const el = resultsEl.value;
  if (!el) return;
  const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - LOAD_MORE_THRESHOLD_PX;
  if (nearBottom && visibleCount.value < allMatches.value.length) {
    visibleCount.value = Math.min(visibleCount.value + BATCH_SIZE, allMatches.value.length);
  }
}

function titleFor(game: Game): string {
  return displayTitle(game, appSettings.locale);
}

async function resetAndFocus() {
  search.value = "";
  selectedIndex.value = 0;
  visibleCount.value = BATCH_SIZE;
  // library.refresh() runs first and on its own - this window's whole purpose is showing the
  // real library, so a failure in something unrelated (theming) must never leave it silently
  // stuck on an empty list. Previously theme.init() ran first and unguarded; any throw there
  // (or in appSettings.init(), see onMounted below) skipped this call entirely every time the
  // overlay was shown, with no retry - exactly the "quick-launch shows no games" symptom.
  await library.refresh();
  try {
    // Re-applied on every show (not just once on mount) - the overlay window is created once
    // and reused (hidden/shown, never destroyed), so a theme changed in Settings while it was
    // hidden needs to be picked up the next time it's shown, not just at first launch.
    await theme.init();
  } catch (e) {
    console.error("quick-launch: theme init failed, continuing without it", e);
  }
  await nextTick();
  inputEl.value?.focus();
  // The first batch might not actually overflow the results container (a short list, or a
  // tall window) - without this, there'd be no scrollbar to trigger loadMoreIfNeeded via the
  // @scroll handler at all, silently stranding the rest of the matches unreachable.
  loadMoreIfNeeded();
}

async function launchSelected() {
  const game = results.value[selectedIndex.value];
  if (!game) return;
  await library.launchGame(game);
  await invoke("hide_quick_launch");
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    // Reaching the last rendered row while more matches exist loads the next batch immediately,
    // so arrow-key navigation isn't capped at whatever's happened to scroll into view yet.
    if (selectedIndex.value >= results.value.length - 1 && visibleCount.value < allMatches.value.length) {
      visibleCount.value = Math.min(visibleCount.value + BATCH_SIZE, allMatches.value.length);
    }
    selectedIndex.value = Math.min(selectedIndex.value + 1, results.value.length - 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
  } else if (e.key === "Enter") {
    e.preventDefault();
    launchSelected();
  } else if (e.key === "Escape") {
    e.preventDefault();
    invoke("hide_quick_launch");
  }
}

let unlistenShown: UnlistenFn | undefined;

onMounted(async () => {
  try {
    await appSettings.init();
  } catch (e) {
    console.error("quick-launch: appSettings init failed, continuing without it", e);
  }
  await resetAndFocus();
  unlistenShown = await listen("quick-launch-shown", resetAndFocus);
});

onBeforeUnmount(() => unlistenShown?.());
</script>

<template>
  <div class="overlay" @keydown="onKeydown">
    <div class="search-row">
      <IconSearch :size="18" :stroke-width="1.75" />
      <input
        ref="inputEl"
        v-model="search"
        class="search-input"
        :placeholder="t('quickLaunch.searchPlaceholder')"
        @input="
          selectedIndex = 0;
          visibleCount = BATCH_SIZE;
        "
      />
    </div>
    <div ref="resultsEl" class="results" @scroll="loadMoreIfNeeded">
      <button
        v-for="(game, index) in results"
        :key="game.id"
        type="button"
        class="result"
        :class="{ selected: index === selectedIndex }"
        @mouseenter="selectedIndex = index"
        @click="launchSelected"
      >
        <img v-if="game.cover_art_url" class="cover" :src="game.cover_art_url" :alt="titleFor(game)" />
        <div v-else class="cover-placeholder">{{ game.title.charAt(0).toUpperCase() }}</div>
        <span class="title">{{ titleFor(game) }}</span>
      </button>
      <p v-if="!results.length" class="empty">{{ t("quickLaunch.noMatches") }}</p>
    </div>
  </div>
</template>

<style scoped>
/* No OS title bar here either, same as the main window - a plain rounded panel matching
   BaseModal.vue's .modal-frame look rather than a new visual language for this one window. */
.overlay {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-mantle);
  color: var(--color-text);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-surface1);
  overflow: hidden;
}

.search-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-surface0);
  opacity: 0.9;
}

.search-input {
  flex: 1;
  border: none;
  background: none;
  outline: none;
  font-size: 1rem;
  color: var(--color-text);
}

.results {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: var(--space-2);
  gap: 0.15rem;
  /* Same token/anchoring technique as the main window's sticky bars (styles.css's
     --background-sticky) - falls back to --color-mantle (matching .overlay's own base) for
     themes that don't set a pattern. background-attachment: fixed anchors it to the window's
     own viewport rather than this scrolling box, so the pattern stays put as results scroll
     instead of scrolling along with them. */
  background: var(--content-background, var(--color-mantle));
  background-attachment: fixed;
}

.result {
  display: flex;
  align-items: center;
  /* justify-content: flex-start (not the flex default of stretch/center a plain <button>'s own
     UA text-align: center could otherwise suggest) - packs .cover/.title to the left edge
     instead of centering them in the row. width: 100% so the button actually fills .results'
     column width rather than shrink-wrapping to its own content. */
  justify-content: flex-start;
  width: 100%;
  gap: var(--space-3);
  padding: var(--space-2);
  border: none;
  background: none;
  border-radius: var(--radius-sm);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.result.selected {
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.cover,
.cover-placeholder {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-sm);
  object-fit: cover;
}

.cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface0);
  font-size: 0.9rem;
}

.title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  padding: var(--space-4);
  text-align: center;
  opacity: 0.7;
  font-size: 0.85rem;
}
</style>
