<script setup lang="ts">
import { IconLayoutGrid, IconList } from "@tabler/icons-vue";
import { useLibraryStore } from "../../stores/library";

const library = useLibraryStore();

function toggleViewMode() {
  library.setViewMode(library.viewMode === "grid" ? "list" : "grid");
}
</script>

<template>
  <div class="filters">
    <div class="search-row">
      <input v-model="library.search" class="search" placeholder="Search by title..." />
      <button
        class="view-toggle-button"
        :title="library.viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'"
        @click="toggleViewMode"
      >
        <IconList v-if="library.viewMode === 'grid'" :size="18" :stroke-width="1.75" />
        <IconLayoutGrid v-else :size="18" :stroke-width="1.75" />
      </button>
    </div>
    <div class="tags" v-if="library.allTags.length">
      <span
        class="tag-pill filter-tag"
        :class="{ 'accent-active': library.activeTagFilter === tag }"
        v-for="tag in library.allTags"
        :key="tag"
        @click="library.toggleTagFilter(tag)"
      >
        {{ tag }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: 1.5rem;
  /* Pinned to the top of App.vue's scrolling `.content` - stays visible while GameGrid/GameList
     scroll underneath it. padding-top (not `.content`'s own top padding, which is now 0) keeps
     the gap above this identical whether at rest or stuck; the solid background stops scrolled
     game rows from showing through underneath once it's pinned. */
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-base);
  padding-top: var(--space-5);
  border-bottom: var(--button-border-width) solid var(--color-surface0);
}

.search-row {
  display: flex;
  gap: 0.4rem;
}

.search {
  flex: 1;
}

/* .view-toggle-button (shared, styles.css) supplies this rule's entire look. */

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
