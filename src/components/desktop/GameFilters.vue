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
