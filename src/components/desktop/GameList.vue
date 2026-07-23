<script setup lang="ts">
import { IconInboxOff } from "@tabler/icons-vue";
import GameListRow from "./GameListRow.vue";
import SkeletonRow from "./SkeletonRow.vue";
import { useLibraryStore } from "../../stores/library";
import { usePluginStore } from "../../stores/plugins";

const library = useLibraryStore();
const plugins = usePluginStore();

const SKELETON_COUNT = 4;
</script>

<template>
  <div class="list">
    <template v-if="plugins.scanning">
      <SkeletonRow v-for="n in SKELETON_COUNT" :key="`skeleton-${n}`" />
    </template>
    <GameListRow v-for="game in library.filteredGames" :key="game.id" :game="game" />
    <div v-if="!plugins.scanning && library.filteredGames.length === 0" class="empty">
      <template v-if="library.games.length === 0">
        <IconInboxOff :size="28" :stroke-width="1.5" />
        <p>Your library is empty. Add a game or scan a source plugin to get started.</p>
      </template>
      <template v-else>
        <p>No games match your search/filters.</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  opacity: 0.7;
  text-align: center;
}
</style>
