<script setup lang="ts">
import { CardVisualRenderer } from "../../theme/cardVisualAst";
import { useActiveCardVisual } from "../../theme/cardVisualRegistry";
import type { Game } from "../../db";

defineProps<{ game: Game; focused: boolean }>();

const emit = defineEmits<{ select: []; hover: [] }>();

const activeCardVisual = useActiveCardVisual();
</script>

<template>
  <button
    class="tile"
    :class="{ 'tile-selected': focused }"
    @click="emit('select')"
    @mouseenter="emit('hover')"
  >
    <div class="tile-frame bp-cover-frame" :class="{ 'bp-cover-focused': focused }">
      <CardVisualRenderer v-if="activeCardVisual" :node="activeCardVisual" :game="game" />
      <template v-else>
        <img v-if="game.cover_art_url" class="tile-cover" :src="game.cover_art_url" :alt="game.title" />
        <div v-else class="tile-cover-placeholder bp-cover-placeholder">{{ game.title.charAt(0).toUpperCase() }}</div>
      </template>
    </div>
    <div class="tile-title">{{ game.title }}</div>
  </button>
</template>

<style scoped>
.tile {
  position: relative;
  display: block;
  width: 100%;
  color: inherit;
  font-family: inherit;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  /* Lifts the whole tile (frame + title, as one rigid unit) up on reveal, rather than growing
     the frame's own box - `.tile-title` sits absolutely positioned just below the frame (see
     below), so this transform makes room for it visually without changing this tile's grid-row
     height, unlike the earlier max-height approach which grew the tile in flow and stretched
     every other tile sharing its grid row. */
  transition: transform 0.15s ease;
}

.tile:hover,
.tile.tile-selected {
  transform: translateY(-0.6rem);
}

/* .bp-cover-frame (shared, styles.css) supplies background/border/radius/padding/cursor;
   overflow:hidden here specifically means `.tile-title` (a sibling, not a child of this frame)
   is never clipped by it - moving the reveal-on-hover title outside `.tile-frame` entirely,
   rather than inside it, is what makes that possible. */
.tile-frame {
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

/* .bp-cover-focused (shared, styles.css) supplies border-color/box-shadow; this layers the
   frame-specific scale-up on top. */
.tile-frame.bp-cover-focused {
  transform: scale(1.05);
}

.tile-cover,
.tile-cover-placeholder {
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-md);
}

.tile-cover {
  object-fit: cover;
}

/* .bp-cover-placeholder (shared, styles.css) supplies background/display/align/justify. */
.tile-cover-placeholder {
  font-size: 4rem;
}

.tile-title {
  /* Absolutely positioned outside `.tile-frame`'s own box (not a flex/flow child of it), so it
     never participates in this tile's own layout height - an unselected tile shows
     cover/placeholder only, and revealing the title never grows this tile's grid-row or
     reflows any sibling tile. */
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: var(--space-2);
  font-size: 1.25rem;
  font-weight: 600;
  text-align: center;
  /* --tile-title-font-family/--tile-title-text-shadow aren't part of the base design-token
     scale - opt-in per-element hooks, same reasoning as --balloon-font-family on GameCard.vue's
     balloon. Undeclared by default (inherits the tile's own font, no shadow) - only a theme
     wanting a pixel/display font (needing a readability shadow to match) sets these. */
  font-family: var(--tile-title-font-family, inherit);
  text-shadow: var(--tile-title-text-shadow, none);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.tile:hover .tile-title,
.tile.tile-selected .tile-title {
  opacity: 1;
}
</style>
