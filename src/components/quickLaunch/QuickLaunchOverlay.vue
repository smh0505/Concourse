<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { IconSearch } from "@tabler/icons-vue";

import { useLibraryStore } from "@/stores/library";
import { useAppSettingsStore } from "@/stores/appSettings";
import { displayTitle, type Game } from "@/db";
import { fuzzyFilter } from "@/utils/fuzzyMatch";

const RESULT_LIMIT = 8;

const { t } = useI18n();
const library = useLibraryStore();
const appSettings = useAppSettingsStore();

const search = ref("");
const selectedIndex = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);

const results = computed<Game[]>(() => {
  if (!search.value.trim()) return library.games.slice(0, RESULT_LIMIT);
  return fuzzyFilter(library.games, search.value.trim(), (g) => g.title)
    .slice(0, RESULT_LIMIT)
    .map((m) => m.item);
});

function titleFor(game: Game): string {
  return displayTitle(game, appSettings.locale);
}

async function resetAndFocus() {
  search.value = "";
  selectedIndex.value = 0;
  await library.refresh();
  await nextTick();
  inputEl.value?.focus();
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
  await appSettings.init();
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
        @input="selectedIndex = 0"
      />
    </div>
    <div class="results">
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
