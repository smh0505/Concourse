<script setup lang="ts">
import { IconCheck, IconPencil, IconTrash, IconX } from "@tabler/icons-vue";
import { useLibraryStore } from "../../stores/library";
import { useNamedItemManager } from "../../composables/useNamedItemManager";

const library = useLibraryStore();
const manager = useNamedItemManager({
  create: library.createCollection,
  rename: library.renameCollection,
  delete: library.deleteCollection,
  getUsageCounts: library.getCollectionUsageCounts,
});
</script>

<template>
  <div class="panel">
    <div class="sticky-header">
      <h2>Collections</h2>
      <small>
        Groups a series/franchise ("Final Fantasy") - a separate concept from tags, not
        another kind of tag.
      </small>
      <form class="add-form" @submit.prevent="manager.onCreate">
        <input v-model="manager.newName" placeholder="New collection name" />
        <button type="submit">Add Collection</button>
      </form>
    </div>

    <ul v-if="library.allCollections.length" class="item-list">
      <li v-for="name in library.allCollections" :key="name" class="item-row list-row-shell">
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
    <p v-else class="empty">No collections yet.</p>
  </div>
</template>
