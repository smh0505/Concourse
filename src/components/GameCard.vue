<script setup lang="ts">
import { ref } from "vue";
import type { Game } from "../db";

defineProps<{
  game: Game;
  tags: string[];
  fetchingCover: boolean;
  fetchingMetadata: boolean;
}>();

const emit = defineEmits<{
  launch: [];
  fetchCover: [];
  fetchMetadata: [];
  edit: [];
  delete: [];
  removeTag: [tag: string];
  addTag: [name: string];
}>();

const newTag = ref("");

function onAddTag() {
  const name = newTag.value.trim();
  if (!name) return;
  emit("addTag", name);
  newTag.value = "";
}
</script>

<template>
  <div class="card">
    <img v-if="game.cover_art_url" class="cover" :src="game.cover_art_url" :alt="game.title" />
    <div v-else class="cover-placeholder">{{ game.title.charAt(0).toUpperCase() }}</div>
    <div class="card-title">{{ game.title }}</div>
    <p v-if="game.description" class="description">{{ game.description }}</p>
    <p v-if="game.release_date" class="release-date">{{ game.release_date }}</p>
    <p class="playtime">{{ Math.round(game.total_playtime / 60) }} min played</p>
    <div class="tags" v-if="tags.length">
      <span class="tag" v-for="tag in tags" :key="tag">
        {{ tag }}
        <button class="tag-remove" @click="emit('removeTag', tag)">&times;</button>
      </span>
    </div>
    <form class="add-tag-form" @submit.prevent="onAddTag">
      <input v-model="newTag" placeholder="Add tag" />
      <button type="submit">+</button>
    </form>
    <button class="play" @click="emit('launch')">Play</button>
    <button class="fetch-cover" :disabled="fetchingCover" @click="emit('fetchCover')">
      {{ fetchingCover ? "Fetching..." : "Fetch Cover Art" }}
    </button>
    <button class="fetch-metadata" :disabled="fetchingMetadata" @click="emit('fetchMetadata')">
      {{ fetchingMetadata ? "Fetching..." : "Fetch Metadata" }}
    </button>
    <button class="edit" @click="emit('edit')">Edit</button>
    <button class="remove" @click="emit('delete')">Remove</button>
  </div>
</template>

<style scoped>
.card {
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.cover,
.cover-placeholder {
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 4px;
}

.cover {
  object-fit: cover;
}

.cover-placeholder {
  background: #444;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
}

.card-title {
  font-weight: 600;
  text-align: center;
}

.description {
  font-size: 0.75rem;
  opacity: 0.8;
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.release-date,
.playtime {
  font-size: 0.75rem;
  opacity: 0.6;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  justify-content: center;
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
  width: 100%;
}

.add-tag-form input {
  flex: 1;
  font-size: 0.75rem;
}

.add-tag-form button {
  font-size: 0.75rem;
}

.fetch-cover,
.fetch-metadata,
.edit,
.remove {
  font-size: 0.8rem;
}
</style>
