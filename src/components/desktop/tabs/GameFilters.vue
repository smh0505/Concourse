<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  IconAdjustmentsHorizontal,
  IconChartBar,
  IconClock,
  IconClockPlus,
  IconLayoutGrid,
  IconList,
  IconSortAscendingLetters,
} from "@tabler/icons-vue";

import { useLibraryStore, type SortOption } from "@/stores/library";
import { useTagsStore } from "@/stores/tags";
import { useCollectionsStore } from "@/stores/collections";
import DropdownMenu from "@/components/desktop/common/DropdownMenu.vue";

const { t } = useI18n();
const library = useLibraryStore();
const tags = useTagsStore();
const collections = useCollectionsStore();

const sortMenuOpen = ref(false);

const SORT_OPTION_ICONS: Record<SortOption, typeof IconClock> = {
  title: IconSortAscendingLetters,
  recentlyPlayed: IconClock,
  mostPlayed: IconChartBar,
  recentlyAdded: IconClockPlus,
};
const SORT_OPTIONS: SortOption[] = ["title", "recentlyPlayed", "mostPlayed", "recentlyAdded"];

function toggleViewMode() {
  library.setViewMode(library.viewMode === "grid" ? "list" : "grid");
}

function selectSortOption(option: SortOption) {
  library.setSortOption(option);
  sortMenuOpen.value = false;
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
      <DropdownMenu v-model:open="sortMenuOpen" wrap-class="sort-menu-wrap" panel-class="sort-menu-panel">
        <template #trigger="{ open: menuOpen }">
          <button
            type="button"
            class="view-toggle-button"
            :class="{ 'accent-active': menuOpen }"
            :title="t('filters.toggleSortFilter')"
            @click="sortMenuOpen = !menuOpen"
          >
            <IconAdjustmentsHorizontal :size="18" :stroke-width="1.75" />
          </button>
        </template>
        <div class="sort-options">
          <button
            v-for="option in SORT_OPTIONS"
            :key="option"
            type="button"
            class="sort-option"
            :class="{ 'accent-active': library.sortOption === option }"
            @click="selectSortOption(option)"
          >
            <component :is="SORT_OPTION_ICONS[option]" :size="20" :stroke-width="1.75" />
            <span class="sort-option-label">{{ t(`filters.sortOptions.${option}`) }}</span>
          </button>
        </div>
      </DropdownMenu>
      <button
        class="view-toggle-button"
        :title="library.viewMode === 'grid' ? t('filters.switchToListView') : t('filters.switchToGridView')"
        @click="toggleViewMode"
      >
        <IconList v-if="library.viewMode === 'grid'" :size="18" :stroke-width="1.75" />
        <IconLayoutGrid v-else :size="18" :stroke-width="1.75" />
      </button>
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

/* display:flex with the *default* align-items:stretch (not center - center only aligns the
   button at its own short intrinsic height, it doesn't grow it) so the trigger button stretches
   to .search-row's full flex height, same as .view-toggle-button itself does as a direct flex
   child - without this, DropdownMenu's plain wrapper div left the button shorter than its
   view-mode sibling. */
.sort-menu-wrap {
  position: relative;
  display: flex;
}

/* Right-aligned to the trigger instead of DropdownMenu's own default left:0 - the trigger sits
   next to the search input, not at the bar's own left edge, so a left-aligned panel would drift
   past the visible content area. Same override pattern GamepadRemapSettings.vue's axis popup
   uses. */
.sort-menu-wrap :deep(.sort-menu-panel) {
  left: auto;
  right: 0;
}

.sort-options {
  display: flex;
  flex-direction: row;
  gap: var(--space-1);
  padding: var(--space-2);
}

/* Icon on top, translated label caption underneath - a small square button per option rather
   than a native <select>, consistent with this app's other custom dropdowns. */
.sort-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2);
  border: none;
  background: none;
  border-radius: var(--radius-sm);
  color: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.sort-option:hover {
  background: var(--color-surface0);
}

/* Compound selector, not relying on .accent-active alone - .sort-option's own `background:
   none`/`color: inherit` above tie with .accent-active's specificity (both one class), so
   whichever landed later in the actual bundled stylesheet could silently win and cancel the
   highlight. This selector's higher specificity wins unconditionally regardless of source
   order. */
.sort-option.accent-active {
  background: var(--accent-active-background, var(--color-accent));
  color: var(--accent-active-color, var(--color-on-accent));
}

.sort-option-label {
  font-size: 0.65rem;
  opacity: 0.8;
}

/* .accent-active (shared, styles.css) supplies the selected option's own highlight. */

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
