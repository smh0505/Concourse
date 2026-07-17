<script setup lang="ts">
import { useLibraryStore } from "../../stores/library";

const library = useLibraryStore();
</script>

<template>
  <div class="filters">
    <input v-model="library.search" class="search" placeholder="Search by title..." />
    <div class="tags" v-if="library.allTags.length">
      <span
        class="tag filter-tag"
        :class="{ active: library.activeTagFilter === tag }"
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
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.search {
  width: 100%;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.tag {
  font-size: 0.7rem;
  background: var(--color-surface0);
  border-radius: 3px;
  padding: 0.1rem 0.4rem;
}

.filter-tag {
  cursor: pointer;
}

.filter-tag.active {
  background: var(--color-accent);
  color: var(--color-base);
}
</style>
