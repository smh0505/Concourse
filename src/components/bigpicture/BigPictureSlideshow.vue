<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { IconInboxOff } from "@tabler/icons-vue";
import { useLibraryStore } from "../../stores/library";
import { useGamepadNav } from "../../composables/useGamepadNav";

const emit = defineEmits<{ close: [] }>();

const library = useLibraryStore();
const rootRef = ref<HTMLElement | null>(null);

onMounted(() => rootRef.value?.focus());

// A "grid" with columns == item count degenerates into a plain 1D list for
// useGamepadNav's movement logic - up/down never trigger (cols is always >= the current
// index), left/right just walk the list. Reused rather than hand-rolling equivalent logic.
const { focusedIndex } = useGamepadNav({
  itemCount: () => library.games.length,
  columns: () => library.games.length,
  onSelect: (index) => {
    const game = library.games[index];
    if (game) library.launchGame(game);
  },
  onCancel: () => emit("close"),
});

function onKeydown(event: KeyboardEvent) {
  const count = library.games.length;
  if (count === 0) return;

  if (event.key === "ArrowLeft" && focusedIndex.value > 0) focusedIndex.value -= 1;
  else if (event.key === "ArrowRight" && focusedIndex.value < count - 1) focusedIndex.value += 1;
  else if (event.key === "Enter") {
    const game = library.games[focusedIndex.value];
    if (game) library.launchGame(game);
  } else if (event.key === "Escape") emit("close");
  else return;

  event.preventDefault();
}

const focusedGame = computed(() => library.games[focusedIndex.value] ?? null);
const playtimeMinutes = computed(() =>
  focusedGame.value ? Math.round(focusedGame.value.total_playtime / 60) : 0,
);

// Always exactly 7 slots (offsets -3..3), even past the ends of the library, with
// out-of-range slots rendered as inert placeholders - otherwise `justify-content: center`
// centers the shorter row near the first/last game instead of the selected cover.
const VISIBLE_NEIGHBORS = 3;
type CoverSlot =
  | { kind: "game"; id: number; index: number; offset: number }
  | { kind: "dummy"; offset: number };

const visibleCovers = computed<CoverSlot[]>(() => {
  const games = library.games;
  const center = focusedIndex.value;
  const slots: CoverSlot[] = [];
  for (let offset = -VISIBLE_NEIGHBORS; offset <= VISIBLE_NEIGHBORS; offset++) {
    const index = center + offset;
    const game = games[index];
    slots.push(game ? { kind: "game", id: game.id, index, offset } : { kind: "dummy", offset });
  }
  return slots;
});

function coverStyle(offset: number) {
  const distance = Math.abs(offset);
  const scale = 1.15 - distance * 0.15;
  const opacity = 1 - distance * 0.2;
  return { transform: `scale(${scale})`, opacity: Math.max(opacity, 0.3) };
}
</script>

<template>
  <div class="slideshow" ref="rootRef" tabindex="0" @keydown="onKeydown">
    <Transition name="backdrop-fade">
      <div
        v-if="focusedGame?.background_art_url"
        :key="focusedGame.background_art_url"
        class="backdrop"
        :style="{ backgroundImage: `url(${focusedGame.background_art_url})` }"
      />
    </Transition>
    <div class="backdrop-overlay" />

    <div v-if="focusedGame" class="info">
      <div class="info-title">{{ focusedGame.title }}</div>
      <div class="info-playtime">{{ playtimeMinutes }} min played</div>
    </div>
    <div v-else class="empty">
      <IconInboxOff :size="48" :stroke-width="1.5" />
      <p>No games in library.</p>
    </div>

    <div class="cover-strip">
      <template v-for="item in visibleCovers" :key="item.kind === 'game' ? item.id : `dummy-${item.offset}`">
        <div v-if="item.kind === 'dummy'" class="strip-cover strip-cover-dummy" />
        <button
          v-else
          class="strip-cover"
          :class="{ centered: item.offset === 0 }"
          :style="coverStyle(item.offset)"
          @click="item.offset === 0 ? library.launchGame(library.games[item.index]) : (focusedIndex = item.index)"
        >
          <img
            v-if="library.games[item.index].cover_art_url"
            :src="library.games[item.index].cover_art_url!"
            :alt="library.games[item.index].title"
          />
          <div v-else class="strip-cover-placeholder">
            {{ library.games[item.index].title.charAt(0).toUpperCase() }}
          </div>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.slideshow {
  position: fixed;
  inset: 0;
  background: #111;
  color: #fff;
  overflow: hidden;
  z-index: 20;
  outline: none;
}

.backdrop {
  position: fixed;
  inset: 0;
  background-size: cover;
  background-position: center;
  z-index: 0;
}

.backdrop-fade-enter-active,
.backdrop-fade-leave-active {
  transition: opacity 0.4s ease;
}

.backdrop-fade-enter-from,
.backdrop-fade-leave-to {
  opacity: 0;
}

.backdrop-overlay {
  position: fixed;
  inset: 0;
  background: linear-gradient(180deg, rgba(17, 17, 17, 0.35) 0%, rgba(17, 17, 17, 0.92) 100%);
  z-index: 1;
}

.info {
  position: relative;
  z-index: 2;
  padding: 3rem 3rem 0;
  text-align: center;
}

.info-title {
  font-size: 2.5rem;
  font-weight: 700;
}

.info-playtime {
  margin-top: 0.5rem;
  font-size: 1rem;
  opacity: 0.7;
}

.empty {
  position: relative;
  z-index: 2;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3, 0.75rem);
  opacity: 0.7;
  font-size: 1.5rem;
}

.cover-strip {
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  bottom: 4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.strip-cover {
  flex-shrink: 0;
  width: 140px;
  aspect-ratio: 3 / 4;
  padding: 0;
  border: 3px solid transparent;
  border-radius: var(--radius-lg, 12px);
  background: none;
  cursor: pointer;
  overflow: hidden;
  transition:
    transform 0.2s ease,
    opacity 0.2s ease,
    border-color 0.2s ease;
}

.strip-cover.centered {
  border-color: var(--color-accent, #fff);
  box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.5));
}

.strip-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.strip-cover-dummy {
  visibility: hidden;
  pointer-events: none;
}

.strip-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #444;
  font-size: 2.5rem;
}
</style>
