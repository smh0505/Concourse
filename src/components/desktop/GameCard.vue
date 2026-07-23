<script setup lang="ts">
import { computed, ref } from "vue";
import {
  IconEdit,
  IconInfoCircle,
  IconLoader2,
  IconPhoto,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-vue";
import { useLibraryStore } from "../../stores/library";
import type { Game } from "../../db";

const props = defineProps<{ game: Game }>();

const library = useLibraryStore();

const fetchingCover = computed(() => library.fetchingCoverFor === props.game.id);
const fetchingMetadata = computed(() => library.fetchingMetadataFor === props.game.id);
const playtimeMinutes = computed(() => Math.round(props.game.total_playtime / 60));

// Positioned via Teleport + the card's own viewport rect (rather than a plain
// `position: absolute` child) so it can flip to below the card when the card's top edge is
// scrolled out of view - there'd be no room to show it above in that case.
const MIN_SPACE_ABOVE = 60;

const cardEl = ref<HTMLElement | null>(null);
const balloonAnchor = ref<{ top: number; left: number; placement: "above" | "below" } | null>(
  null,
);

function onMouseEnter() {
  const rect = cardEl.value?.getBoundingClientRect();
  if (!rect) return;
  const placement = rect.top < MIN_SPACE_ABOVE ? "below" : "above";
  balloonAnchor.value = {
    top: placement === "above" ? rect.top : rect.bottom,
    left: rect.left + rect.width / 2,
    placement,
  };
}

function onMouseLeave() {
  balloonAnchor.value = null;
}
</script>

<template>
  <div ref="cardEl" class="card" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
    <div class="card-visual">
      <img v-if="game.cover_art_url" class="cover" :src="game.cover_art_url" :alt="game.title" />
      <div v-else class="cover-placeholder">{{ game.title.charAt(0).toUpperCase() }}</div>

      <div v-if="fetchingCover || fetchingMetadata" class="fetch-overlay">
        <IconLoader2 :size="24" :stroke-width="1.75" class="spin" />
      </div>

      <div class="footer">
        <button class="play" title="Play" @click="library.launchGame(game)">
          <IconPlayerPlay :size="15" :stroke-width="1.75" />
        </button>
        <button
          class="fetch-cover"
          title="Fetch Cover Art"
          :disabled="fetchingCover"
          @click="library.fetchCoverArt(game)"
        >
          <IconPhoto :size="15" :stroke-width="1.75" />
        </button>
        <button
          class="fetch-metadata"
          title="Fetch Metadata"
          :disabled="fetchingMetadata"
          @click="library.fetchMetadata(game)"
        >
          <IconInfoCircle :size="15" :stroke-width="1.75" />
        </button>
        <button class="edit" title="Edit" @click="library.openEdit(game)">
          <IconEdit :size="15" :stroke-width="1.75" />
        </button>
        <button class="remove" title="Remove" @click="library.deleteGame(game.id)">
          <IconTrash :size="15" :stroke-width="1.75" />
        </button>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <Transition name="balloon-fade">
      <div
        v-if="balloonAnchor"
        class="balloon"
        :class="`balloon-${balloonAnchor.placement}`"
        :style="{ top: `${balloonAnchor.top}px`, left: `${balloonAnchor.left}px` }"
      >
        <div class="balloon-title">{{ game.title }}</div>
        <div class="balloon-playtime">{{ playtimeMinutes }} min played</div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.card {
  position: relative;
  transition: transform 0.15s ease;
}

.card:hover {
  transform: scale(1.06);
  z-index: 2;
}

.card-visual {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-surface1);
}

.cover,
.cover-placeholder {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
}

.cover {
  object-fit: cover;
}

.cover-placeholder {
  background: var(--color-surface0);
  color: var(--color-text);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
}

.footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 0.25rem;
  padding: 0.4rem;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
  transform: translateY(100%);
  transition: transform 0.18s ease;
}

.card:hover .footer {
  transform: translateY(0);
}

.footer button {
  flex: 1;
  min-width: 0;
  padding: 0.35rem 0;
}

.fetch-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  color: var(--color-base);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<style>
/* Teleported to <body>, so this can't be a `scoped` style - the balloon is no longer a
   descendant of this component's root element in the actual DOM. */
.balloon {
  position: fixed;
  padding: 0.4rem 0.65rem;
  border-radius: var(--radius-sm);
  background: var(--color-crust);
  color: var(--color-text);
  box-shadow: var(--shadow-md);
  white-space: nowrap;
  pointer-events: none;
  z-index: 100;
}

.balloon-above {
  transform: translate(-50%, calc(-100% - 8px));
}

.balloon-below {
  transform: translate(-50%, 8px);
}

.balloon::after {
  content: "";
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
}

/* Arrow points down toward the card when the balloon sits above it, and up toward the
   card when flipped below (near the top of the scroll area). */
.balloon-above::after {
  top: 100%;
  border-top-color: var(--color-crust);
}

.balloon-below::after {
  bottom: 100%;
  border-bottom-color: var(--color-crust);
}

.balloon-title {
  font-weight: 600;
  font-size: 0.8rem;
}

.balloon-playtime {
  font-size: 0.7rem;
  opacity: 0.7;
}

.balloon-fade-enter-active,
.balloon-fade-leave-active {
  transition: opacity 0.15s ease;
}

.balloon-fade-enter-from,
.balloon-fade-leave-to {
  opacity: 0;
}
</style>
