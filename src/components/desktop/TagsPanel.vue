<script setup lang="ts">
import { IconCheck, IconPencil, IconTrash, IconX } from "@tabler/icons-vue";
import { useLibraryStore } from "../../stores/library";
import { useNamedItemManager } from "../../composables/useNamedItemManager";

const library = useLibraryStore();
const manager = useNamedItemManager({
  create: library.createTag,
  rename: library.renameTag,
  delete: library.deleteTag,
  getUsageCounts: library.getTagUsageCounts,
});
</script>

<template>
  <div class="panel">
    <div class="sticky-header">
      <h2>Tags</h2>
      <small>Free-form labels for organizing your library ("Co-op", "Backlog").</small>
      <form class="add-form" @submit.prevent="manager.onCreate">
        <input v-model="manager.newName" placeholder="New tag name" />
        <button type="submit">Add Tag</button>
      </form>
    </div>

    <ul v-if="library.allTags.length" class="item-list">
      <li v-for="name in library.allTags" :key="name" class="item-row list-row-shell">
        <template v-if="manager.editingName === name">
          <input
            v-model="manager.editingValue"
            class="edit-input"
            @keyup.enter="manager.confirmEdit"
            @keyup.esc="manager.cancelEdit"
          />
          <div class="row-controls">
            <button class="icon-button" title="Save" @click="manager.confirmEdit">
              <IconCheck :size="15" :stroke-width="1.75" />
            </button>
            <button class="icon-button" title="Cancel" @click="manager.cancelEdit">
              <IconX :size="15" :stroke-width="1.75" />
            </button>
          </div>
        </template>
        <template v-else>
          <span class="item-name">{{ name }}</span>
          <span class="item-count">{{ manager.counts[name] ?? 0 }} games</span>
          <div class="row-controls">
            <button class="icon-button" title="Rename" @click="manager.startEdit(name)">
              <IconPencil :size="15" :stroke-width="1.75" />
            </button>
            <button class="icon-button" title="Delete" @click="manager.onDelete(name)">
              <IconTrash :size="15" :stroke-width="1.75" />
            </button>
          </div>
        </template>
      </li>
    </ul>
    <p v-else class="empty">No tags yet.</p>
  </div>
</template>

<style scoped>
/* .list-row-shell (shared, styles.css) supplies the item rows' flex/border/radius/padding. */
.panel {
  margin-bottom: var(--space-5);
}

/* Pinned to the top of the scroll container - same reasoning as GameFilters.vue's `.filters`,
   so the add-form stays reachable while scrolling a long tag list. */
.sticky-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--color-base);
  padding-bottom: var(--space-3);
  margin-bottom: var(--space-3);
}

.sticky-header h2 {
  margin: 0;
}

.sticky-header small {
  display: block;
  margin: 0.25rem 0 var(--space-3);
}

.add-form {
  display: flex;
  gap: var(--space-2);
}

.add-form input {
  flex: 1;
}

.item-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.item-name {
  font-weight: 600;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-count {
  font-size: 0.75rem;
  opacity: 0.7;
  flex-shrink: 0;
}

.edit-input {
  flex: 1;
  min-width: 0;
}

.row-controls {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem;
}

.empty {
  opacity: 0.7;
  font-size: 0.85rem;
}
</style>
