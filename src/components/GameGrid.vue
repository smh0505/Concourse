<script setup lang="ts">
import GameCard from "./GameCard.vue";
import type { Game } from "../db";

defineProps<{
  games: Game[];
  gameTags: Record<number, string[]>;
  fetchingCoverFor: number | null;
  fetchingMetadataFor: number | null;
}>();

const emit = defineEmits<{
  launch: [game: Game];
  fetchCover: [game: Game];
  fetchMetadata: [game: Game];
  edit: [game: Game];
  delete: [id: number];
  removeTag: [game: Game, tag: string];
  addTag: [game: Game, name: string];
}>();
</script>

<template>
  <div class="grid">
    <GameCard
      v-for="game in games"
      :key="game.id"
      :game="game"
      :tags="gameTags[game.id] ?? []"
      :fetching-cover="fetchingCoverFor === game.id"
      :fetching-metadata="fetchingMetadataFor === game.id"
      @launch="emit('launch', game)"
      @fetch-cover="emit('fetchCover', game)"
      @fetch-metadata="emit('fetchMetadata', game)"
      @edit="emit('edit', game)"
      @delete="emit('delete', game.id)"
      @remove-tag="(tag) => emit('removeTag', game, tag)"
      @add-tag="(name) => emit('addTag', game, name)"
    />
    <p v-if="games.length === 0" class="empty">No games match.</p>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
}

.empty {
  grid-column: 1 / -1;
  opacity: 0.7;
}
</style>
