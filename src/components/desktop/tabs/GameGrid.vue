<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { IconInboxOff } from "@tabler/icons-vue";

import GameCard from "@/components/desktop/game/GameCard.vue";
import SkeletonCard from "@/components/desktop/game/SkeletonCard.vue";
import { useLibraryStore } from "@/stores/library";
import { usePluginStore } from "@/stores/plugins";
import { useSkeletonCount } from "@/composables/useSkeletonCount";

const { t } = useI18n();
const library = useLibraryStore();
const plugins = usePluginStore();

const gridEl = ref<HTMLElement | null>(null);
// 140/187 match .grid's own minmax(140px, 1fr) column width and the resulting 3:4 card aspect
// ratio - an underestimate of the real rendered card size (auto-fill can stretch columns
// wider than 140px), which is fine here: it only means slightly more skeletons than strictly
// needed, safely clipped by .content's scroll lock during a scan rather than leaving a gap.
const SKELETON_COUNT = useSkeletonCount(gridEl, { itemWidth: 140, itemHeight: 187, gap: 16 });
</script>

<template>
  <div ref="gridEl" class="grid">
    <template v-if="plugins.scanning">
      <SkeletonCard v-for="n in SKELETON_COUNT" :key="`skeleton-${n}`" />
    </template>
    <template v-else>
      <GameCard v-for="game in library.filteredGames" :key="game.id" :game="game" />
      <div v-if="library.filteredGames.length === 0" class="empty empty-state">
        <template v-if="library.games.length === 0">
          <IconInboxOff :size="32" :stroke-width="1.5" />
          <p>{{ t("library.emptyMessage") }}</p>
        </template>
        <template v-else>
          <p>{{ t("library.noMatchMessage") }}</p>
        </template>
      </div>
    </template>
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
