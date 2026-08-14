<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from "vue";
import { IconInboxOff } from "@tabler/icons-vue";
import { useI18n } from "vue-i18n";

import { useLibraryStore } from "@/stores/library";
import { useGamepadNav } from "@/composables/useGamepadNav";
import { suppressMouseActivity, useMouseActivity } from "@/composables/useMouseActivity";
import BigPictureTile from "./BigPictureTile.vue";

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
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

const mouseActive = useMouseActivity();

function onKeydown(event: KeyboardEvent) {
  const count = library.games.length;
  if (count === 0) return;
  const cols = Math.max(1, columns.value);
  const current = Math.min(focusedIndex.value, count - 1);
  const col = current % cols;

  if (event.key === "ArrowUp" && current - cols >= 0) {
    suppressMouseActivity();
    focusedIndex.value = current - cols;
  } else if (event.key === "ArrowDown" && current + cols < count) {
    suppressMouseActivity();
    focusedIndex.value = current + cols;
  } else if (event.key === "ArrowLeft" && col > 0) {
    suppressMouseActivity();
    focusedIndex.value = current - 1;
  } else if (event.key === "ArrowRight" && col < cols - 1 && current + 1 < count) {
    suppressMouseActivity();
    focusedIndex.value = current + 1;
  } else if (event.key === "Enter") {
    const game = library.games[focusedIndex.value];
    if (game) library.launchGame(game);
  } else if (event.key === "Escape") emit("close");
  else return;

  event.preventDefault();
}

/** Gates hover-driven focus changes - a tile's `mouseenter` fires whenever it moves under a
 *  stationary cursor too (Big Picture's own focus-lift transform does exactly that), not only
 *  on real cursor movement, so honoring every `mouseenter` right after a keyboard/gamepad move
 *  would silently fight the input that just ran. See useMouseActivity.ts. */
function onTileHover(index: number) {
  if (mouseActive.value) focusedIndex.value = index;
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

/** `scrollIntoView({ block: "nearest" })` stops once the tile is visible, ignoring the
 *  container's own top/bottom padding - force true scroll extremes on the first/last row. */
watch(focusedTile, (el) => {
  if (!el) return;
  const container = rootRef.value;
  const cols = Math.max(1, columns.value);
  const count = library.games.length;
  const row = Math.floor(focusedIndex.value / cols);
  const lastRow = Math.floor((count - 1) / cols);

  if (container && row === 0) {
    container.scrollTo({ top: 0, behavior: "smooth" });
  } else if (container && row === lastRow) {
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  } else {
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
});
</script>

<template>
  <div
    class="big-picture bp-surface"
    :class="{ 'mouse-idle': !mouseActive }"
    ref="rootRef"
    tabindex="0"
    @keydown="onKeydown"
  >
    <Transition name="backdrop-fade">
      <div
        v-if="focusedBackgroundUrl"
        :key="focusedBackgroundUrl"
        class="bp-backdrop"
        :style="{ backgroundImage: `url(${focusedBackgroundUrl})` }"
      />
    </Transition>
    <div class="backdrop-overlay bp-backdrop-overlay-base" />
    <div class="tile-grid" ref="gridRef">
      <BigPictureTile
        v-for="(game, index) in library.games"
        :key="game.id"
        :ref="(el: Element | ComponentPublicInstance | null) => setTileRef(index, el)"
        :game="game"
        :focused="index === focusedIndex"
        @select="library.launchGame(game)"
        @hover="onTileHover(index)"
      />
      <div v-if="library.games.length === 0" class="empty bp-empty-state">
        <IconInboxOff :size="48" :stroke-width="1.5" />
        <p>{{ t("bigPicture.emptyLibrary") }}</p>
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

/* Hides the OS cursor once gamepad/keyboard nav takes over (useMouseActivity.ts) - otherwise it
   sits motionless, still triggering :hover styling (BigPictureTile.vue) elsewhere from focus. */
.big-picture.mouse-idle {
  cursor: none;
}

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
