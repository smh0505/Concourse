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
  /* Owns the scrollbar now (App.vue's .content no longer scrolls) - flex:1/min-height:0 lets
     this size to whatever's left below GameFilters, padding-bottom restores the breathing room
     .content's own bottom padding used to provide before it moved here. */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* overflow-x:hidden would stop the horizontal scrollbar but also clips GameCard's
     :hover scale(1.06) at the leftmost/rightmost column, cutting the card off instead of
     letting it visually overflow like every other column already does into its neighbor's
     gap. This side padding gives edge cards the same breathing room a middle column gets from
     `gap` for free, so the scale transform never reaches this container's own edge in the
     first place - no scrollbar, no clipping. */
  padding: 0 var(--space-3) var(--space-5);
}

/* .empty-state (shared, styles.css) supplies the shared layout; this layers the
   grid-specific full-width span on top. */
.empty {
  grid-column: 1 / -1;
}
</style>
