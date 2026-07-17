<script setup lang="ts">
import GameCard from "./GameCard.vue";
import { useLibraryStore } from "../../stores/library";
import { useThemeSlot } from "../../theme/slotRegistry";

const library = useLibraryStore();
const cardComponent = useThemeSlot("GameCard", GameCard);
</script>

<template>
  <div class="grid">
    <component :is="cardComponent" v-for="game in library.filteredGames" :key="game.id" :game="game" />
    <p v-if="library.filteredGames.length === 0" class="empty">No games match.</p>
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
