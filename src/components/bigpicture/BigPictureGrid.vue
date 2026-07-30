<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from "vue";
import { IconInboxOff } from "@tabler/icons-vue";
import { useLibraryStore } from "../../stores/library";
import { useGamepadNav } from "../../composables/useGamepadNav";
import { useThemeSlot } from "../../theme/slotRegistry";
import BigPictureTile from "./BigPictureTile.vue";

const emit = defineEmits<{ close: [] }>();

const library = useLibraryStore();
const tileComponent = useThemeSlot("BigPictureTile", BigPictureTile);

const gridRef = ref<HTMLElement | null>(null);
const rootRef = ref<HTMLElement | null>(null);
const columns = ref(1);

function recomputeColumns() {
  const el = gridRef.value;
  if (!el) return;
  const style = getComputedStyle(el);
  columns.value = style.gridTemplateColumns.split(" ").length;
}

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  recomputeColumns();
  resizeObserver = new ResizeObserver(recomputeColumns);
  if (gridRef.value) resizeObserver.observe(gridRef.value);
  rootRef.value?.focus();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

const { focusedIndex } = useGamepadNav({
  itemCount: () => library.games.length,
  columns: () => columns.value,
  onSelect: (index) => {
    const game = library.games[index];
    if (game) library.launchGame(game);
  },
  onCancel: () => emit("close"),
});

function onKeydown(event: KeyboardEvent) {
  const count = library.games.length;
  if (count === 0) return;
  const cols = Math.max(1, columns.value);
  const current = Math.min(focusedIndex.value, count - 1);
  const col = current % cols;

  if (event.key === "ArrowUp" && current - cols >= 0) focusedIndex.value = current - cols;
  else if (event.key === "ArrowDown" && current + cols < count) focusedIndex.value = current + cols;
  else if (event.key === "ArrowLeft" && col > 0) focusedIndex.value = current - 1;
  else if (event.key === "ArrowRight" && col < cols - 1 && current + 1 < count) focusedIndex.value = current + 1;
  else if (event.key === "Enter") {
    const game = library.games[focusedIndex.value];
    if (game) library.launchGame(game);
  } else if (event.key === "Escape") emit("close");
  else return;

  event.preventDefault();
}

const tileRefs = ref<(HTMLElement | null)[]>([]);
const focusedTile = computed(() => tileRefs.value[focusedIndex.value]);
const focusedBackgroundUrl = computed(
  () => library.games[focusedIndex.value]?.background_art_url ?? null,
);

function setTileRef(index: number, el: Element | ComponentPublicInstance | null) {
  if (el === null) {
    tileRefs.value[index] = null;
  } else if ("$el" in el) {
    tileRefs.value[index] = el.$el as HTMLElement;
  } else {
    tileRefs.value[index] = el as HTMLElement;
  }
}

watch(focusedTile, (el) => el?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
</script>

<template>
  <div class="big-picture bp-surface" ref="rootRef" tabindex="0" @keydown="onKeydown">
    <Transition name="backdrop-fade">
      <div
        v-if="focusedBackgroundUrl"
        :key="focusedBackgroundUrl"
        class="backdrop bp-backdrop"
        :style="{ backgroundImage: `url(${focusedBackgroundUrl})` }"
      />
    </Transition>
    <div class="backdrop-overlay bp-backdrop-overlay-base" />
    <div class="tile-grid" ref="gridRef">
      <component
        :is="tileComponent"
        v-for="(game, index) in library.games"
        :key="game.id"
        :ref="(el: Element | ComponentPublicInstance | null) => setTileRef(index, el)"
        :game="game"
        :focused="index === focusedIndex"
        @select="library.launchGame(game)"
        @hover="focusedIndex = index"
      />
      <div v-if="library.games.length === 0" class="empty bp-empty-state">
        <IconInboxOff :size="48" :stroke-width="1.5" />
        <p>No games in library.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* .bp-surface (shared, styles.css) supplies the fixed dark-fullscreen base. */
.big-picture {
  overflow-y: auto;
  padding: 3rem;
  /* Console-style UI - scrolling still works (gamepad/keyboard nav scrollIntoView,
     mouse wheel), just without a visible scrollbar track. */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.big-picture::-webkit-scrollbar {
  display: none;
}

/* .bp-backdrop (shared, styles.css) supplies the backdrop image positioning entirely. */

/* .bp-backdrop-overlay-base (shared, styles.css) supplies position/inset/z-index; the
   gradient's alpha stops are deliberately specific to this surface. */
.backdrop-overlay {
  background: linear-gradient(180deg, rgba(17, 17, 17, 0.55) 0%, rgba(17, 17, 17, 0.9) 100%);
}

.tile-grid {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-6, 2rem);
}

/* .bp-empty-state (shared, styles.css) supplies the shared look; this layers the
   grid-specific full-width span and centered text on top. */
.empty {
  grid-column: 1 / -1;
  text-align: center;
}
</style>
