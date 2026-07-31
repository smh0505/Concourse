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
    <div v-if="!plugins.scanning && library.filteredGames.length === 0" class="empty-state">
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
  gap: var(--space-2);
  /* Owns the scrollbar now (App.vue's .content no longer scrolls) - flex:1/min-height:0 lets
     this size to whatever's left below GameFilters, padding-bottom restores the breathing room
     .content's own bottom padding used to provide before it moved here. */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: var(--space-5);
}

/* .empty-state (shared, styles.css) supplies this rule's entire look. */
</style>
