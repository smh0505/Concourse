<script setup lang="ts">
import { IconInboxOff } from "@tabler/icons-vue";
import GameCard from "./GameCard.vue";
import SkeletonCard from "./SkeletonCard.vue";
import { useLibraryStore } from "../../stores/library";
import { usePluginStore } from "../../stores/plugins";

const library = useLibraryStore();
const plugins = usePluginStore();

const SKELETON_COUNT = 6;
</script>

<template>
  <div class="grid">
    <template v-if="plugins.scanning">
      <SkeletonCard v-for="n in SKELETON_COUNT" :key="`skeleton-${n}`" />
    </template>
    <GameCard v-for="game in library.filteredGames" :key="game.id" :game="game" />
    <div v-if="!plugins.scanning && library.filteredGames.length === 0" class="empty empty-state">
      <template v-if="library.games.length === 0">
        <IconInboxOff :size="32" :stroke-width="1.5" />
        <p>Your library is empty. Add a game or scan a source plugin to get started.</p>
      </template>
      <template v-else>
        <p>No games match your search/filters.</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
  /* App.vue's `.content` no longer provides horizontal inset (GameFilters.vue's `.filters`
     needs to span its full width instead) - carries its own left/right padding here, plus
     enough room for GameCard's hover scale(1.06) to bleed into without escaping `.content`'s
     own edge (still `overflow-x: hidden` there as a safety net). */
  padding: 0 var(--space-6);
}

/* .empty-state (shared, styles.css) supplies the shared layout; this layers the
   grid-specific full-width span on top. */
.empty {
  grid-column: 1 / -1;
}
</style>
