<script setup lang="ts">
import { ref } from "vue";
import { IconInboxOff } from "@tabler/icons-vue";
import GameListRow from "../GameListRow.vue";
import SkeletonRow from "../SkeletonRow.vue";
import { useLibraryStore } from "../../../stores/library";
import { usePluginStore } from "../../../stores/plugins";
import { useSkeletonCount } from "../../../composables/useSkeletonCount";

const library = useLibraryStore();
const plugins = usePluginStore();

const listEl = ref<HTMLElement | null>(null);
// 44 matches GameListRow's own collapsed min-height (2.75rem, border-box so already includes
// its padding/border); 8 matches .list's own row gap below. A slight underestimate is fine -
// see GameGrid.vue's identical reasoning.
const SKELETON_COUNT = useSkeletonCount(listEl, { itemHeight: 44, gap: 8 });
</script>

<template>
  <div ref="listEl" class="list">
    <template v-if="plugins.scanning">
      <SkeletonRow v-for="n in SKELETON_COUNT" :key="`skeleton-${n}`" />
    </template>
    <template v-else>
      <GameListRow v-for="game in library.filteredGames" :key="game.id" :game="game" />
      <div v-if="library.filteredGames.length === 0" class="empty-state">
        <template v-if="library.games.length === 0">
          <IconInboxOff :size="28" :stroke-width="1.5" />
          <p>Your library is empty. Add a game or scan a source plugin to get started.</p>
        </template>
        <template v-else>
          <p>No games match your search/filters.</p>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  /* App.vue's `.content` no longer provides horizontal inset (GameFilters.vue's `.filters`
     needs to span its full width instead) - carries its own left/right padding here. */
  padding: 0 var(--space-6);
}

/* .empty-state (shared, styles.css) supplies this rule's entire look. */
</style>
