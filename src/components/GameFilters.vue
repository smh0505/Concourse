<script setup lang="ts">
const search = defineModel<string>("search", { default: "" });

defineProps<{
  allTags: string[];
  activeTagFilter: string | null;
}>();

const emit = defineEmits<{ toggleTag: [tag: string] }>();
</script>

<template>
  <div class="filters">
    <input v-model="search" class="search" placeholder="Search by title..." />
    <div class="tags" v-if="allTags.length">
      <span
        class="tag filter-tag"
        :class="{ active: activeTagFilter === tag }"
        v-for="tag in allTags"
        :key="tag"
        @click="emit('toggleTag', tag)"
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
  background: #6663;
  border-radius: 3px;
  padding: 0.1rem 0.4rem;
}

.filter-tag {
  cursor: pointer;
}

.filter-tag.active {
  background: #396cd8;
  color: #fff;
}
</style>
