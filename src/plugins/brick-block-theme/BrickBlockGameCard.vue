<script setup lang="ts">
import { computed, ref } from "vue";
import {
  IconEdit,
  IconInfoCircle,
  IconLoader2,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-vue";
import { useLibraryStore } from "../../stores/library";
import { useBalloonAnchor } from "../../composables/useBalloonAnchor";
import type { Game } from "../../db";

// Same structure/behavior as the built-in GameCard.vue (Milestone 9's cover-only-by-default,
// hover-slide footer, Teleport balloon) - this theme only reskins it for an 8-bit feel
// (chunky pixel border, pixel font, sharp corners) rather than replacing the layout outright,
// which the pre-Milestone-9 version of this file did (always-expanded card with every button
// and text field visible at once, no hover/balloon behavior at all).

const props = defineProps<{ game: Game }>();

const library = useLibraryStore();

const fetchingMetadata = computed(() => library.fetchingMetadataFor === props.game.id);
const playtimeMinutes = computed(() => Math.round(props.game.total_playtime / 60));

const cardEl = ref<HTMLElement | null>(null);
const { balloonEl, anchor: balloonAnchor, onMouseEnter, onMouseLeave } = useBalloonAnchor(cardEl);
</script>

<template>
  <div ref="cardEl" class="card" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
    <div class="card-visual">
      <img v-if="game.cover_art_url" class="cover" :src="game.cover_art_url" :alt="game.title" />
      <div v-else class="cover-placeholder">★</div>

      <div v-if="fetchingMetadata" class="fetch-overlay">
        <IconLoader2 :size="24" :stroke-width="1.75" class="spin" />
      </div>

      <div class="footer">
        <button class="play" title="Play" @click="library.launchGame(game)">
          <IconPlayerPlay :size="15" :stroke-width="1.75" />
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
        ref="balloonEl"
        class="balloon brick-balloon"
        :class="`balloon-${balloonAnchor.placement}`"
        :style="{ top: `${balloonAnchor.top}px`, left: `${balloonAnchor.left}px` }"
      >
        <div class="balloon-title">{{ game.title }}</div>
        <div class="balloon-playtime">{{ playtimeMinutes }} MIN</div>
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
  border-radius: 0;
  border: 3px solid var(--color-surface1, #7c2c00);
  image-rendering: pixelated;
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
  background: repeating-linear-gradient(
    45deg,
    var(--color-surface0, #c84c0c),
    var(--color-surface0, #c84c0c) 10px,
    var(--color-surface1, #7c2c00) 10px,
    var(--color-surface1, #7c2c00) 12px
  );
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  color: #fce303;
  text-shadow: 2px 2px 0 var(--color-surface1, #7c2c00);
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
  border-radius: 0;
  border: 2px solid var(--color-surface1, #7c2c00);
}

.fetch-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  color: var(--color-on-accent);
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
/* Global (not scoped) since this only tweaks the balloon that's teleported to <body> - the
   base .balloon/.balloon-above/.balloon-below/etc. rules already come from the built-in
   GameCard.vue, which GameGrid.vue always imports as the slot fallback regardless of active
   theme, so they're always present; this just layers the pixel font + sharp corners on top
   when the balloon also carries .brick-balloon (only true while this theme is active). */
.brick-balloon {
  /* Overrides the base .balloon's background: var(--color-crust) - this theme's crust
     (#0058f8) is a heavily saturated blue, way too dark/loud for a small text tooltip. Mantle
     is the theme's lighter sky-blue, reads cleanly against the balloon's dark --color-text. */
  background: var(--color-mantle, #a4e4fc);
  border-radius: 0;
  border: 2px solid var(--color-surface1, #7c2c00);
}

.brick-balloon.balloon-above::after {
  border-top-color: var(--color-mantle, #a4e4fc);
}

.brick-balloon.balloon-below::after {
  border-bottom-color: var(--color-mantle, #a4e4fc);
}

.brick-balloon .balloon-title,
.brick-balloon .balloon-playtime {
  font-family: var(--font-pixel, "Press Start 2P", monospace);
}

.brick-balloon .balloon-title {
  font-size: 0.85rem;
  line-height: 1.4;
}

.brick-balloon .balloon-playtime {
  font-size: 0.75rem;
}
</style>
