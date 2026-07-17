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
  <div class="card">
    <img v-if="game.cover_art_url" class="cover" :src="game.cover_art_url" :alt="game.title" />
    <div v-else class="cover-placeholder">{{ game.title.charAt(0).toUpperCase() }}</div>
    <div class="card-title">{{ game.title }}</div>
    <p v-if="game.description" class="description">{{ game.description }}</p>
    <p v-if="game.release_date" class="release-date">{{ game.release_date }}</p>
    <p class="playtime">{{ Math.round(game.total_playtime / 60) }} min played</p>
    <button class="play" @click="library.launchGame(game)">Play</button>
    <button class="fetch-cover" :disabled="fetchingCover" @click="library.fetchCoverArt(game)">
      {{ fetchingCover ? "Fetching..." : "Fetch Cover Art" }}
    </button>
    <button
      class="fetch-metadata"
      :disabled="fetchingMetadata"
      @click="library.fetchMetadata(game)"
    >
      {{ fetchingMetadata ? "Fetching..." : "Fetch Metadata" }}
    </button>
    <button class="edit" @click="library.openEdit(game)">Edit</button>
    <button class="remove" @click="library.deleteGame(game.id)">Remove</button>
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
  line-clamp: 3;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.release-date,
.playtime {
  font-size: 0.75rem;
  opacity: 0.6;
}

.fetch-cover,
.fetch-metadata,
.edit,
.remove {
  font-size: 0.8rem;
}
</style>
