<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { IconAdjustmentsHorizontal, IconLayoutGrid, IconList } from "@tabler/icons-vue";

import { useLibraryStore, type SortOption } from "@/stores/library";
import { useTagsStore } from "@/stores/tags";
import { useCollectionsStore } from "@/stores/collections";

const { t } = useI18n();
const library = useLibraryStore();
const tags = useTagsStore();
const collections = useCollectionsStore();

// Collapsed by default - houses sort (and, eventually, further filters like playtime range/
// install status) without permanently taking up space in the pinned bar for every user who
// never touches it.
const panelOpen = ref(false);

const SORT_OPTIONS: SortOption[] = ["title", "recentlyPlayed", "mostPlayed", "recentlyAdded"];

function toggleViewMode() {
  library.setViewMode(library.viewMode === "grid" ? "list" : "grid");
}

function onSortChange(event: Event) {
  library.setSortOption((event.target as HTMLSelectElement).value as SortOption);
}
</script>

<template>
  <!-- `data-scroll-header` is a dedicated hook for useBalloonAnchor.ts to measure this pinned
       bar's real height (not tied to the `.filters` styling class name, which could change
       independently) - GameCard.vue's balloon needs to know where the visible area actually
       starts, since it can be scrolled to sit right behind this bar. -->
  <div class="filters" data-scroll-header>
    <div class="search-row">
      <input v-model="library.search" class="search" :placeholder="t('filters.searchPlaceholder')" />
      <button
        class="view-toggle-button"
        :class="{ 'accent-active': panelOpen }"
        :title="t('filters.toggleSortFilter')"
        @click="panelOpen = !panelOpen"
      >
        <IconAdjustmentsHorizontal :size="18" :stroke-width="1.75" />
      </button>
      <button
        class="view-toggle-button"
        :title="library.viewMode === 'grid' ? t('filters.switchToListView') : t('filters.switchToGridView')"
        @click="toggleViewMode"
      >
        <IconList v-if="library.viewMode === 'grid'" :size="18" :stroke-width="1.75" />
        <IconLayoutGrid v-else :size="18" :stroke-width="1.75" />
      </button>
    </div>
    <div class="sort-panel" v-if="panelOpen">
      <label class="sort-row">
        {{ t("filters.sortLabel") }}
        <select :value="library.sortOption" @change="onSortChange">
          <option v-for="option in SORT_OPTIONS" :key="option" :value="option">
            {{ t(`filters.sortOptions.${option}`) }}
          </option>
        </select>
      </label>
    </div>
    <div class="tags" v-if="tags.allTags.length">
      <span
        class="tag-pill filter-tag"
        :class="{ 'accent-active': tags.activeFilter === tag }"
        v-for="tag in tags.allTags"
        :key="tag"
        @click="tags.toggleFilter(tag)"
      >
        {{ tag }}
      </span>
    </div>
    <div class="tags" v-if="collections.allCollections.length">
      <span
        class="tag-pill filter-tag"
        :class="{ 'accent-active': collections.activeFilter === name }"
        v-for="name in collections.allCollections"
        :key="name"
        @click="collections.toggleFilter(name)"
      >
        {{ name }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: var(--space-2);
  margin-bottom: 1.5rem;
  /* Pinned to the top of App.vue's scrolling `.content` - stays visible while GameGrid/GameList
     scroll underneath it. padding-top (not `.content`'s own top padding, which is now 0) keeps
     the gap above this identical whether at rest or stuck; background-attachment: fixed is what
     stops scrolled game rows from reading clearly underneath it once pinned (see the shared
     .sticky-header rule for why this, not a plain box-relative background, is needed). z-index
     has to clear not just GameCard.vue's own `.card:hover { z-index: 2 }` but also its
     Teleported-to-<body> balloon (`z-index: 100`) - both need to render *under* this pinned
     bar, not over it, when a top-row card's hover/balloon would otherwise overlap it. */
  position: sticky;
  top: 0;
  z-index: 150;
  background: var(--background-sticky);
  background-attachment: fixed;
  /* Matches GameGrid.vue's `.grid`/GameList.vue's `.list` own horizontal padding, so this
     spans .content's full width (needed so the search input isn't visibly narrower than the
     grid) while still lining up visually with the grid/list content below it. Bottom padding
     is purely visual breathing room inside the pinned bar's own background, separate from
     `margin-bottom` below (the gap between the bar and the grid/list content). */
  padding: var(--space-5) var(--space-6) var(--space-3);
}

.search-row {
  display: flex;
  gap: 0.4rem;
}

.search {
  flex: 1;
  /* Browser default min-width for an <input> in a flex row is `auto` (its own intrinsic
     content-based size), which can stop flex:1 from actually filling the remaining row width. */
  min-width: 0;
}

/* .view-toggle-button (shared, styles.css) supplies this rule's entire look. */

.sort-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sort-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.85rem;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

/* .tag-pill (shared, styles.css) supplies the pill's base look. */

.filter-tag {
  cursor: pointer;
}

/* .accent-active (shared, styles.css) supplies this rule's entire look. */
</style>
