<script setup lang="ts">
import type { Game } from "../../db";

defineProps<{ game: Game; focused: boolean }>();

const emit = defineEmits<{ select: []; hover: [] }>();
</script>

<template>
  <button class="tile" :class="{ focused }" @click="emit('select')" @mouseenter="emit('hover')">
    <img v-if="game.cover_art_url" class="tile-cover" :src="game.cover_art_url" :alt="game.title" />
    <div v-else class="tile-cover-placeholder">{{ game.title.charAt(0).toUpperCase() }}</div>
    <div class="tile-title">{{ game.title }}</div>
  </button>
</template>

<style scoped>
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
  border-color: var(--color-accent, #fff);
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
</style>
