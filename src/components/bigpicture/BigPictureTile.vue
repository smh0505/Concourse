<script setup lang="ts">
import type { Game } from "../../db";

defineProps<{ game: Game; focused: boolean }>();

const emit = defineEmits<{ select: []; hover: [] }>();
</script>

<template>
  <button
    class="tile bp-cover-frame"
    :class="{ focused, 'bp-cover-focused': focused }"
    @click="emit('select')"
    @mouseenter="emit('hover')"
  >
    <img v-if="game.cover_art_url" class="tile-cover" :src="game.cover_art_url" :alt="game.title" />
    <div v-else class="tile-cover-placeholder bp-cover-placeholder">{{ game.title.charAt(0).toUpperCase() }}</div>
    <div class="tile-title">{{ game.title }}</div>
  </button>
</template>

<style scoped>
/* .bp-cover-frame (shared, styles.css) supplies background/border/radius/padding/cursor. */
.tile {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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
}
</style>
