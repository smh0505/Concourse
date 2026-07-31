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
    class="tile bp-cover-frame"
    :class="{ 'bp-cover-focused': focused }"
    @click="emit('select')"
    @mouseenter="emit('hover')"
  >
    <CardVisualRenderer v-if="activeCardVisual" :node="activeCardVisual" :game="game" />
    <template v-else>
      <img v-if="game.cover_art_url" class="tile-cover" :src="game.cover_art_url" :alt="game.title" />
      <div v-else class="tile-cover-placeholder bp-cover-placeholder">{{ game.title.charAt(0).toUpperCase() }}</div>
    </template>
    <div class="tile-title">{{ game.title }}</div>
  </button>
</template>

<style scoped>
/* .bp-cover-frame (shared, styles.css) supplies background/border/radius/padding/cursor. */
.tile {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  color: inherit;
  font-family: inherit;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

/* .bp-cover-focused (shared, styles.css) supplies border-color/box-shadow; this layers the
   tile-specific scale-up on top. */
.tile.bp-cover-focused {
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
  font-size: 1.25rem;
  font-weight: 600;
  text-align: center;
  /* --tile-title-font-family/--tile-title-text-shadow aren't part of the base design-token
     scale - opt-in per-element hooks, same reasoning as --balloon-font-family on GameCard.vue's
     balloon. Undeclared by default (inherits the tile's own font, no shadow) - only a theme
     wanting a pixel/display font (needing a readability shadow to match) sets these. */
  font-family: var(--tile-title-font-family, inherit);
  text-shadow: var(--tile-title-text-shadow, none);
}
</style>
