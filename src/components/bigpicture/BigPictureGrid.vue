<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useLibraryStore } from "../../stores/library";
import { useGamepadNav } from "../../composables/useGamepadNav";

const emit = defineEmits<{ close: [] }>();

const library = useLibraryStore();

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

watch(focusedTile, (el) => el?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
</script>

<template>
  <div class="big-picture" ref="rootRef" tabindex="0" @keydown="onKeydown">
    <div class="tile-grid" ref="gridRef">
      <button
        class="tile"
        v-for="(game, index) in library.games"
        :key="game.id"
        :ref="(el) => (tileRefs[index] = el as HTMLElement)"
        :class="{ focused: index === focusedIndex }"
        @click="library.launchGame(game)"
        @mouseenter="focusedIndex = index"
      >
        <img v-if="game.cover_art_url" class="tile-cover" :src="game.cover_art_url" :alt="game.title" />
        <div v-else class="tile-cover-placeholder">{{ game.title.charAt(0).toUpperCase() }}</div>
        <div class="tile-title">{{ game.title }}</div>
      </button>
      <p v-if="library.games.length === 0" class="empty">No games in library.</p>
    </div>
  </div>
</template>

<style scoped>
.big-picture {
  position: fixed;
  inset: 0;
  background: #111;
  color: #fff;
  overflow-y: auto;
  padding: 3rem;
  z-index: 20;
  outline: none;
}

.tile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 2rem;
}

.tile {
  background: none;
  border: 3px solid transparent;
  border-radius: 12px;
  padding: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  color: inherit;
  font-family: inherit;
  transition: transform 0.1s ease, border-color 0.1s ease;
}

.tile.focused {
  border-color: #fff;
  transform: scale(1.05);
}

.tile-cover,
.tile-cover-placeholder {
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 10px;
}

.tile-cover {
  object-fit: cover;
}

.tile-cover-placeholder {
  background: #444;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 4rem;
}

.tile-title {
  font-size: 1.25rem;
  font-weight: 600;
  text-align: center;
}

.empty {
  grid-column: 1 / -1;
  opacity: 0.7;
  font-size: 1.5rem;
  text-align: center;
}
</style>
