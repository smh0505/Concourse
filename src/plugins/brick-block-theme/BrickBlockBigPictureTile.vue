<script setup lang="ts">
import type { Game } from "../../db";

defineProps<{ game: Game; focused: boolean }>();

const emit = defineEmits<{ select: []; hover: [] }>();
</script>

<template>
  <button class="brick-tile" :class="{ focused }" @click="emit('select')" @mouseenter="emit('hover')">
    <div class="brick-frame">
      <img v-if="game.cover_art_url" class="cover" :src="game.cover_art_url" :alt="game.title" />
      <div v-else class="cover-placeholder">★</div>
    </div>
    <div class="tile-title">{{ game.title }}</div>
  </button>
</template>

<style scoped>
.brick-tile {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: transform 0.1s ease;
  font-family: inherit;
}

.brick-tile.focused {
  transform: scale(1.08) translateY(-4px);
}

.brick-frame {
  width: 100%;
  aspect-ratio: 3 / 4;
  border: 4px solid var(--color-surface1, #7c2c00);
  border-radius: 4px;
  box-sizing: border-box;
  background: repeating-linear-gradient(
    45deg,
    var(--color-surface0, #c84c0c),
    var(--color-surface0, #c84c0c) 12px,
    var(--color-surface1, #7c2c00) 12px,
    var(--color-surface1, #7c2c00) 14px
  );
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.brick-tile.focused .brick-frame {
  border-color: var(--color-accent, #fce303);
  box-shadow: 0 0 0 4px var(--color-accent, #fce303);
}

.cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  font-size: 4rem;
  color: #fce303;
  text-shadow: 3px 3px 0 var(--color-surface1, #7c2c00);
}

.tile-title {
  font-family: var(--font-pixel, "Press Start 2P", monospace);
  font-size: 0.9rem;
  text-align: center;
  color: #fff;
  text-shadow: 2px 2px 0 #000;
}
</style>
