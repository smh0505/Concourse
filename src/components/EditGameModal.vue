<script setup lang="ts">
import { ref, watch } from "vue";
import type { Game, GameEditFields } from "../db";

const props = defineProps<{ game: Game | null }>();
const emit = defineEmits<{ save: [fields: GameEditFields]; cancel: [] }>();

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

watch(
  () => props.game,
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

function onSave() {
  if (!form.value.title.trim() || !form.value.executable_path.trim()) {
    error.value = "Title and executable path are required.";
    return;
  }
  emit("save", {
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
  <div v-if="game" class="modal-backdrop" @click.self="emit('cancel')">
    <form class="modal" @submit.prevent="onSave">
      <h2>Edit {{ game.title }}</h2>
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
      <p v-if="error" class="error">{{ error }}</p>
      <div class="modal-actions">
        <button type="button" @click="emit('cancel')">Cancel</button>
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
