<script setup lang="ts">
import { computed } from "vue";
import { useLibraryStore } from "../../stores/library";
import type { Game } from "../../db";

const props = defineProps<{ game: Game }>();

const library = useLibraryStore();

const fetchingCover = computed(() => library.fetchingCoverFor === props.game.id);
const fetchingMetadata = computed(() => library.fetchingMetadataFor === props.game.id);
</script>

<template>
  <div class="row">
    <img v-if="game.cover_art_url" class="thumb" :src="game.cover_art_url" :alt="game.title" />
    <div v-else class="thumb-placeholder">{{ game.title.charAt(0).toUpperCase() }}</div>

    <div class="info">
      <div class="title">{{ game.title }}</div>
      <p v-if="game.description" class="description">{{ game.description }}</p>
      <div class="meta">
        <span v-if="game.release_date">{{ game.release_date }}</span>
        <span>{{ Math.round(game.total_playtime / 60) }} min played</span>
      </div>
    </div>

    <div class="actions">
      <button class="play" @click="library.launchGame(game)">Play</button>
      <button class="fetch-cover" :disabled="fetchingCover" @click="library.fetchCoverArt(game)">
        {{ fetchingCover ? "..." : "Cover" }}
      </button>
      <button
        class="fetch-metadata"
        :disabled="fetchingMetadata"
        @click="library.fetchMetadata(game)"
      >
        {{ fetchingMetadata ? "..." : "Info" }}
      </button>
      <button class="edit" @click="library.openEdit(game)">Edit</button>
      <button class="remove" @click="library.deleteGame(game.id)">Remove</button>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid var(--color-surface1);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
}

.thumb,
.thumb-placeholder {
  width: 48px;
  height: 64px;
  flex-shrink: 0;
  border-radius: 4px;
  object-fit: cover;
}

.thumb-placeholder {
  background: var(--color-surface0);
  color: var(--color-text);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.title {
  font-weight: 600;
}

.description {
  font-size: 0.75rem;
  opacity: 0.8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.7rem;
  opacity: 0.6;
}

.actions {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
  font-size: 0.8rem;
}
</style>
