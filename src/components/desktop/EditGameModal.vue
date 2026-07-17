<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useLibraryStore } from "../../stores/library";
import type { GameEditFields } from "../../db";

const library = useLibraryStore();

const form = ref<GameEditFields>({
  title: "",
  executable_path: "",
  platform: "",
  cover_art_url: "",
  background_art_url: "",
  description: "",
  release_date: "",
});
const error = ref("");
const newTag = ref("");

const tags = computed(() =>
  library.editingGame ? library.gameTags[library.editingGame.id] ?? [] : [],
);

async function onAddTag() {
  const name = newTag.value.trim();
  if (!name || !library.editingGame) return;
  await library.addTag(library.editingGame, name);
  newTag.value = "";
}

watch(
  () => library.editingGame,
  (game) => {
    if (!game) return;
    error.value = "";
    form.value = {
      title: game.title,
      executable_path: game.executable_path,
      platform: game.platform ?? "",
      cover_art_url: game.cover_art_url ?? "",
      background_art_url: game.background_art_url ?? "",
      description: game.description ?? "",
      release_date: game.release_date ?? "",
    };
  },
  { immediate: true },
);

async function onSave() {
  if (!form.value.title.trim() || !form.value.executable_path.trim()) {
    error.value = "Title and executable path are required.";
    return;
  }
  await library.saveEdit({
    title: form.value.title.trim(),
    executable_path: form.value.executable_path.trim(),
    platform: form.value.platform?.trim() || null,
    cover_art_url: form.value.cover_art_url?.trim() || null,
    background_art_url: form.value.background_art_url?.trim() || null,
    description: form.value.description?.trim() || null,
    release_date: form.value.release_date?.trim() || null,
  });
}
</script>

<template>
  <div v-if="library.editingGame" class="modal-backdrop" @click.self="library.cancelEdit">
    <form class="modal" @submit.prevent="onSave">
      <h2>Edit {{ library.editingGame.title }}</h2>
      <label>
        Title
        <input v-model="form.title" />
      </label>
      <label>
        Executable path
        <input v-model="form.executable_path" />
      </label>
      <label>
        Platform
        <input v-model="form.platform" />
      </label>
      <label>
        Cover art URL
        <input v-model="form.cover_art_url" />
      </label>
      <label>
        Background art URL
        <input v-model="form.background_art_url" />
      </label>
      <label>
        Release date
        <input v-model="form.release_date" placeholder="YYYY-MM-DD" />
      </label>
      <label>
        Description
        <textarea v-model="form.description" rows="4"></textarea>
      </label>
      <div class="tags-section">
        <span>Tags</span>
        <div class="tags" v-if="tags.length">
          <span class="tag" v-for="tag in tags" :key="tag">
            {{ tag }}
            <button class="tag-remove" @click="library.removeTag(library.editingGame!, tag)">&times;</button>
          </span>
        </div>
        <form class="add-tag-form" @submit.prevent="onAddTag">
          <input v-model="newTag" placeholder="Add tag" />
          <button type="submit">+</button>
        </form>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="modal-actions">
        <button type="button" @click="library.cancelEdit">Cancel</button>
        <button type="submit">Save</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.modal {
  background: #f6f6f6;
  color: #0f0f0f;
  border-radius: 8px;
  padding: 1.5rem;
  width: 90%;
  max-width: 420px;
  max-height: 85vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.modal label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  text-align: left;
}

.modal input,
.modal textarea {
  font-family: inherit;
}

.tags-section {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  text-align: left;
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
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.tag-remove {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.8rem;
  line-height: 1;
  padding: 0;
  color: inherit;
}

.add-tag-form {
  display: flex;
  gap: 0.25rem;
}

.add-tag-form input {
  flex: 1;
  font-size: 0.85rem;
}

.error {
  color: #d33;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

@media (prefers-color-scheme: dark) {
  .modal {
    background: #2f2f2f;
    color: #f6f6f6;
  }
}
</style>
