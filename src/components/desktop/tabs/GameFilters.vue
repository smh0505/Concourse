<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  IconAdjustmentsHorizontal,
  IconChartBar,
  IconClock,
  IconClockPlus,
  IconFolderPlus,
  IconLayoutGrid,
  IconList,
  IconSortAscendingLetters,
  IconSquareCheck,
  IconTag,
  IconTrash,
  IconX,
} from "@tabler/icons-vue";

import { useLibraryStore, type SortOption } from "@/stores/library";
import { useLibrarySelectionStore } from "@/stores/librarySelection";
import { useTagsStore } from "@/stores/tags";
import { useCollectionsStore } from "@/stores/collections";
import DropdownMenu from "@/components/desktop/common/DropdownMenu.vue";
import BaseModal from "@/components/desktop/common/BaseModal.vue";

const { t } = useI18n();
const library = useLibraryStore();
const selection = useLibrarySelectionStore();
const tags = useTagsStore();
const collections = useCollectionsStore();

const sortMenuOpen = ref(false);
const addTagMenuOpen = ref(false);
const addCollectionMenuOpen = ref(false);

// Games backing the current selection - looked up from the full library, not filteredGames,
// so a selection stays intact (and batch actions still target the right games) even if the
// search/filter/sort state changes after selecting.
const selectedGames = computed(() =>
  library.games.filter((game) => selection.isSelected(game.id)),
);

function selectAll() {
  selection.selectAll(library.filteredGames.map((game) => game.id));
}

function addTagToSelection(name: string) {
  tags.addToGames(selectedGames.value, [name]);
  addTagMenuOpen.value = false;
}

function addCollectionToSelection(name: string) {
  collections.addToGames(selectedGames.value, [name]);
  addCollectionMenuOpen.value = false;
}

async function removeSelectionFromLibrary() {
  await library.deleteGames([...selection.selectedIds]);
  selection.exit();
}

const PILL_ROW_LIMIT = 8;

/** Capped preview per pill row (platform/tags/collections) - a row past PILL_ROW_LIMIT shows a
 *  "+N more" pill that opens pillModalOpen (below) instead of expanding in place, since the
 *  modal already lists every pill uncapped. Plain function (not a class - project convention)
 *  called once per row, wrapped in `reactive()` so its computed properties auto-unwrap in the
 *  template (`row.visible` instead of `row.visible.value`). */
function usePillRow(items: () => string[]) {
  const list = computed(items);
  const visible = computed(() => list.value.slice(0, PILL_ROW_LIMIT));
  const hiddenCount = computed(() => Math.max(0, list.value.length - PILL_ROW_LIMIT));
  return reactive({ visible, hiddenCount });
}

const platformRow = usePillRow(() => library.allPlatforms);
const tagRow = usePillRow(() => tags.allTags);
const collectionRow = usePillRow(() => collections.allCollections);

const pillModalOpen = ref(false);

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
            :class="{ active: library.sortOption === option }"
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
      <button
        type="button"
        class="view-toggle-button"
        :class="{ 'accent-active': selection.active }"
        :title="t('filters.toggleSelectionMode')"
        @click="selection.active ? selection.exit() : selection.enter()"
      >
        <IconSquareCheck :size="18" :stroke-width="1.75" />
      </button>
    </div>
    <Transition name="selection-bar">
    <div class="selection-bar-wrap" v-if="selection.active">
    <div class="selection-bar">
      <span class="selection-count">{{ t("filters.selectionCount", { count: selection.count }) }}</span>
      <button type="button" class="link-button" @click="selectAll">{{ t("filters.selectAll") }}</button>
      <button type="button" class="link-button" @click="selection.clear()">{{ t("filters.clearSelection") }}</button>
      <div class="selection-actions">
        <DropdownMenu v-model:open="addTagMenuOpen" wrap-class="batch-menu-wrap" panel-class="batch-menu-panel">
          <template #trigger="{ open: menuOpen }">
            <button
              type="button"
              class="view-toggle-button"
              :class="{ 'accent-active': menuOpen }"
              :disabled="!selection.count"
              :title="t('filters.addTag')"
              @click="addTagMenuOpen = !menuOpen"
            >
              <IconTag :size="18" :stroke-width="1.75" />
            </button>
          </template>
          <div class="batch-options">
            <button
              v-for="tag in tags.allTags"
              :key="tag"
              type="button"
              class="batch-option"
              @click="addTagToSelection(tag)"
            >
              {{ tag }}
            </button>
            <p v-if="!tags.allTags.length" class="batch-empty">{{ t("filters.noTagsYet") }}</p>
          </div>
        </DropdownMenu>
        <DropdownMenu v-model:open="addCollectionMenuOpen" wrap-class="batch-menu-wrap" panel-class="batch-menu-panel">
          <template #trigger="{ open: menuOpen }">
            <button
              type="button"
              class="view-toggle-button"
              :class="{ 'accent-active': menuOpen }"
              :disabled="!selection.count"
              :title="t('filters.addToCollection')"
              @click="addCollectionMenuOpen = !menuOpen"
            >
              <IconFolderPlus :size="18" :stroke-width="1.75" />
            </button>
          </template>
          <div class="batch-options">
            <button
              v-for="name in collections.allCollections"
              :key="name"
              type="button"
              class="batch-option"
              @click="addCollectionToSelection(name)"
            >
              {{ name }}
            </button>
            <p v-if="!collections.allCollections.length" class="batch-empty">{{ t("filters.noCollectionsYet") }}</p>
          </div>
        </DropdownMenu>
        <button
          type="button"
          class="view-toggle-button remove-selection"
          :disabled="!selection.count"
          :title="t('filters.removeFromLibrary')"
          @click="removeSelectionFromLibrary"
        >
          <IconTrash :size="18" :stroke-width="1.75" />
        </button>
        <button type="button" class="view-toggle-button" :title="t('filters.exitSelectionMode')" @click="selection.exit()">
          <IconX :size="18" :stroke-width="1.75" />
        </button>
      </div>
    </div>
    </div>
    </Transition>
    <div class="tags" v-if="library.allPlatforms.length">
      <span
        class="tag-pill filter-tag"
        :class="{ 'accent-active': library.activePlatformFilter === platform }"
        v-for="platform in platformRow.visible"
        :key="platform"
        @click="library.setSearchToken('platform', library.activePlatformFilter === platform ? null : platform)"
      >
        {{ platform }}
      </span>
      <span v-if="platformRow.hiddenCount" class="tag-pill more-pill" @click="pillModalOpen = true">
        {{ t("filters.showMore", { count: platformRow.hiddenCount }) }}
      </span>
    </div>
    <div class="tags" v-if="tags.allTags.length">
      <span
        class="tag-pill filter-tag"
        :class="{ 'accent-active': tags.activeFilter === tag }"
        v-for="tag in tagRow.visible"
        :key="tag"
        @click="library.setSearchToken('tag', tags.activeFilter === tag ? null : tag)"
      >
        {{ tag }}
      </span>
      <span v-if="tagRow.hiddenCount" class="tag-pill more-pill" @click="pillModalOpen = true">
        {{ t("filters.showMore", { count: tagRow.hiddenCount }) }}
      </span>
    </div>
    <div class="tags" v-if="collections.allCollections.length">
      <span
        class="tag-pill filter-tag"
        :class="{ 'accent-active': collections.activeFilter === name }"
        v-for="name in collectionRow.visible"
        :key="name"
        @click="library.setSearchToken('collection', collections.activeFilter === name ? null : name)"
      >
        {{ name }}
      </span>
      <span v-if="collectionRow.hiddenCount" class="tag-pill more-pill" @click="pillModalOpen = true">
        {{ t("filters.showMore", { count: collectionRow.hiddenCount }) }}
      </span>
    </div>

    <BaseModal :open="pillModalOpen" :title="t('filters.browseFilters')" @close="pillModalOpen = false">
      <template #body>
        <div class="modal-pill-section" v-if="library.allPlatforms.length">
          <h3>{{ t("filters.platformsHeading") }}</h3>
          <div class="tags">
            <span
              class="tag-pill filter-tag"
              :class="{ 'accent-active': library.activePlatformFilter === platform }"
              v-for="platform in library.allPlatforms"
              :key="platform"
              @click="library.setSearchToken('platform', library.activePlatformFilter === platform ? null : platform)"
            >
              {{ platform }}
            </span>
          </div>
        </div>
        <div class="modal-pill-section" v-if="tags.allTags.length">
          <h3>{{ t("filters.tagsHeading") }}</h3>
          <div class="tags">
            <span
              class="tag-pill filter-tag"
              :class="{ 'accent-active': tags.activeFilter === tag }"
              v-for="tag in tags.allTags"
              :key="tag"
              @click="library.setSearchToken('tag', tags.activeFilter === tag ? null : tag)"
            >
              {{ tag }}
            </span>
          </div>
        </div>
        <div class="modal-pill-section" v-if="collections.allCollections.length">
          <h3>{{ t("filters.collectionsHeading") }}</h3>
          <div class="tags">
            <span
              class="tag-pill filter-tag"
              :class="{ 'accent-active': collections.activeFilter === name }"
              v-for="name in collections.allCollections"
              :key="name"
              @click="library.setSearchToken('collection', collections.activeFilter === name ? null : name)"
            >
              {{ name }}
            </span>
          </div>
        </div>
      </template>
      <template #footer>
        <button type="button" @click="pillModalOpen = false">{{ t("common.close") }}</button>
      </template>
    </BaseModal>
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

/* Own local .active highlight instead of the shared .accent-active utility - same
   color-mix(currentColor) approach AppSettings.vue's .model-menu-item.active/
   .language-menu-item.active already use for their own dropdown items, so every custom
   dropdown's selected-item look is consistent with each other rather than borrowing the
   --color-accent-based indicator used for tab/nav-style "active" state elsewhere. */
.sort-option.active {
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.sort-option-label {
  font-size: 0.65rem;
  opacity: 0.8;
}

/* .accent-active (shared, styles.css) supplies the selected option's own highlight. */

/* max-height (not grid-template-rows) drives the height animation - fr-unit grid-row
   transitions interpolate visibly janky in Chromium (recomputes intrinsic content size against
   the shrinking track every frame), even with matched durations/easing. max-height animates a
   plain length instead, same proven-smooth trick GameListRow.vue's own .details expand/collapse
   already uses. The 3rem cap only needs to clear the bar's own real content height (~2.5rem
   with its padding) - it's a ceiling to transition toward, not a real constraint once expanded. */
.selection-bar-wrap {
  overflow: hidden;
}

.selection-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
}

.selection-bar-enter-active,
.selection-bar-leave-active {
  transition:
    max-height 0.2s ease-in-out,
    opacity 0.2s ease-in-out;
}

.selection-bar-enter-from,
.selection-bar-leave-to {
  max-height: 0;
  opacity: 0;
}

.selection-bar-enter-to,
.selection-bar-leave-from {
  max-height: 3rem;
  opacity: 1;
}

.selection-count {
  font-size: 0.85rem;
  font-weight: 600;
}

.link-button {
  background: none;
  border: none;
  padding: 0;
  color: var(--color-accent);
  cursor: pointer;
  font-size: 0.8rem;
}

.link-button:hover {
  text-decoration: underline;
}

.selection-actions {
  display: flex;
  gap: 0.4rem;
  margin-left: auto;
}

.remove-selection:not(:disabled):hover {
  color: var(--color-danger, #e05555);
}

/* Same left/right-alignment override as .sort-menu-wrap/.sort-menu-panel above. */
.batch-menu-wrap {
  position: relative;
  display: flex;
}

.batch-menu-wrap :deep(.batch-menu-panel) {
  left: auto;
  right: 0;
}

.batch-options {
  display: flex;
  flex-direction: column;
  min-width: 10rem;
  max-height: 16rem;
  overflow-y: auto;
  padding: var(--space-2);
}

.batch-option {
  text-align: left;
  padding: var(--space-2);
  border: none;
  background: none;
  border-radius: var(--radius-sm);
  color: inherit;
  cursor: pointer;
}

.batch-option:hover {
  background: var(--color-surface0);
}

.batch-empty {
  padding: var(--space-2);
  font-size: 0.8rem;
  opacity: 0.7;
  margin: 0;
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

/* Deliberately distinct from .filter-tag - this pill opens the browse-all modal, not a filter,
   so it shouldn't read as another selectable value in the same row. */
.more-pill {
  cursor: pointer;
  background: none;
  border: 1px dashed var(--color-surface2);
  color: var(--color-text);
  opacity: 0.75;
}

.more-pill:hover {
  opacity: 1;
}

.modal-pill-section h3 {
  margin: 0 0 var(--space-2);
  font-size: 0.85rem;
  opacity: 0.8;
}

.modal-pill-section + .modal-pill-section {
  margin-top: var(--space-3);
}
</style>
