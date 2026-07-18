<script setup lang="ts">
import GameListRow from "./GameListRow.vue";
import { useLibraryStore } from "../../stores/library";

const library = useLibraryStore();
</script>

<template>
  <div class="list">
    <GameListRow v-for="game in library.filteredGames" :key="game.id" :game="game" />
    <p v-if="library.filteredGames.length === 0" class="empty">No games match.</p>
  </div>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.empty {
  opacity: 0.7;
}
</style>
