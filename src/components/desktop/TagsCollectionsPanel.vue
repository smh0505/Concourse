<script setup lang="ts">
import { onMounted, ref } from "vue";
import { IconCheck, IconPencil, IconTrash, IconX } from "@tabler/icons-vue";
import { useLibraryStore } from "../../stores/library";

const library = useLibraryStore();

const tagCounts = ref<Record<string, number>>({});
const collectionCounts = ref<Record<string, number>>({});
const newTagName = ref("");
const newCollectionName = ref("");
const editingKind = ref<"tag" | "collection" | null>(null);
const editingName = ref("");
const editingValue = ref("");

async function refreshCounts() {
  tagCounts.value = await library.getTagUsageCounts();
  collectionCounts.value = await library.getCollectionUsageCounts();
}

onMounted(refreshCounts);

async function onCreateTag() {
  const name = newTagName.value.trim();
  if (!name) return;
  await library.createTag(name);
  newTagName.value = "";
  await refreshCounts();
}

async function onCreateCollection() {
  const name = newCollectionName.value.trim();
  if (!name) return;
  await library.createCollection(name);
  newCollectionName.value = "";
  await refreshCounts();
}

function startEdit(kind: "tag" | "collection", name: string) {
  editingKind.value = kind;
  editingName.value = name;
  editingValue.value = name;
}

function cancelEdit() {
  editingKind.value = null;
  editingName.value = "";
  editingValue.value = "";
}

async function confirmEdit() {
  const newName = editingValue.value.trim();
  if (newName && newName !== editingName.value) {
    if (editingKind.value === "tag") await library.renameTag(editingName.value, newName);
    else if (editingKind.value === "collection") {
      await library.renameCollection(editingName.value, newName);
    }
    await refreshCounts();
  }
  cancelEdit();
}

async function onDeleteTag(name: string) {
  await library.deleteTag(name);
  await refreshCounts();
}

async function onDeleteCollection(name: string) {
  await library.deleteCollection(name);
  await refreshCounts();
}
</script>

<template>
  <div class="tags-collections-panel">
    <h2>Tags &amp; Collections</h2>
    <small>
      Tags are free-form labels ("Co-op", "Backlog"); collections group a series/franchise
      ("Final Fantasy") - a separate concept, not another kind of tag.
    </small>

    <section class="section">
      <h3>Tags</h3>
      <form class="add-form" @submit.prevent="onCreateTag">
        <input v-model="newTagName" placeholder="New tag name" />
        <button type="submit">Add Tag</button>
      </form>
      <ul v-if="library.allTags.length" class="item-list">
        <li v-for="name in library.allTags" :key="name" class="item-row">
          <template v-if="editingKind === 'tag' && editingName === name">
            <input v-model="editingValue" class="edit-input" @keyup.enter="confirmEdit" @keyup.esc="cancelEdit" />
            <div class="row-controls">
              <button class="icon-button" title="Save" @click="confirmEdit">
                <IconCheck :size="15" :stroke-width="1.75" />
              </button>
              <button class="icon-button" title="Cancel" @click="cancelEdit">
                <IconX :size="15" :stroke-width="1.75" />
              </button>
            </div>
          </template>
          <template v-else>
            <span class="item-name">{{ name }}</span>
            <span class="item-count">{{ tagCounts[name] ?? 0 }} games</span>
            <div class="row-controls">
              <button class="icon-button" title="Rename" @click="startEdit('tag', name)">
                <IconPencil :size="15" :stroke-width="1.75" />
              </button>
              <button class="icon-button" title="Delete" @click="onDeleteTag(name)">
                <IconTrash :size="15" :stroke-width="1.75" />
              </button>
            </div>
          </template>
        </li>
      </ul>
      <p v-else class="empty">No tags yet.</p>
    </section>

    <section class="section">
      <h3>Collections</h3>
      <form class="add-form" @submit.prevent="onCreateCollection">
        <input v-model="newCollectionName" placeholder="New collection name" />
        <button type="submit">Add Collection</button>
      </form>
      <ul v-if="library.allCollections.length" class="item-list">
        <li v-for="name in library.allCollections" :key="name" class="item-row">
          <template v-if="editingKind === 'collection' && editingName === name">
            <input v-model="editingValue" class="edit-input" @keyup.enter="confirmEdit" @keyup.esc="cancelEdit" />
            <div class="row-controls">
              <button class="icon-button" title="Save" @click="confirmEdit">
                <IconCheck :size="15" :stroke-width="1.75" />
              </button>
              <button class="icon-button" title="Cancel" @click="cancelEdit">
                <IconX :size="15" :stroke-width="1.75" />
              </button>
            </div>
          </template>
          <template v-else>
            <span class="item-name">{{ name }}</span>
            <span class="item-count">{{ collectionCounts[name] ?? 0 }} games</span>
            <div class="row-controls">
              <button class="icon-button" title="Rename" @click="startEdit('collection', name)">
                <IconPencil :size="15" :stroke-width="1.75" />
              </button>
              <button class="icon-button" title="Delete" @click="onDeleteCollection(name)">
                <IconTrash :size="15" :stroke-width="1.75" />
              </button>
            </div>
          </template>
        </li>
      </ul>
      <p v-else class="empty">No collections yet.</p>
    </section>
  </div>
</template>

<style scoped>
.tags-collections-panel {
  margin-bottom: var(--space-5);
}

.tags-collections-panel small {
  display: block;
  margin-top: 0.25rem;
}

.section {
  margin-top: var(--space-5);
}

.section h3 {
  font-size: 0.9rem;
  margin: 0 0 var(--space-3);
}

.add-form {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
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

.item-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: var(--button-border-width) solid var(--color-surface1);
  border-radius: var(--radius-lg);
  background: var(--color-mantle);
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
