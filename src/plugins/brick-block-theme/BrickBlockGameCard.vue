<script setup lang="ts">
import { computed } from "vue";
import { useLibraryStore } from "../../stores/library";
import type { Game } from "../../db";

const props = defineProps<{ game: Game }>();

const library = useLibraryStore();

const fetchingCover = computed(() => library.fetchingCoverFor === props.game.id);
const fetchingMetadata = computed(() => library.fetchingMetadataFor === props.game.id);
</script>

<template>
  <div class="brick-card">
    <div class="brick-frame">
      <img v-if="game.cover_art_url" class="cover" :src="game.cover_art_url" :alt="game.title" />
      <div v-else class="cover-placeholder">★</div>
    </div>
    <div class="brick-title">{{ game.title }}</div>
    <p v-if="game.description" class="description">{{ game.description }}</p>
    <p v-if="game.release_date" class="release-date">{{ game.release_date }}</p>
    <p class="playtime">{{ Math.round(game.total_playtime / 60) }} MIN</p>
    <button class="brick-btn play" @click="library.launchGame(game)">▶ PLAY</button>
    <button class="brick-btn" :disabled="fetchingCover" @click="library.fetchCoverArt(game)">
      {{ fetchingCover ? "..." : "COVER" }}
    </button>
    <button class="brick-btn" :disabled="fetchingMetadata" @click="library.fetchMetadata(game)">
      {{ fetchingMetadata ? "..." : "INFO" }}
    </button>
    <button class="brick-btn" @click="library.openEdit(game)">EDIT</button>
    <button class="brick-btn danger" @click="library.deleteGame(game.id)">X</button>
  </div>
</template>

<style scoped>
.brick-card {
  border: 4px solid var(--color-surface1, #7c2c00);
  border-radius: 4px;
  padding: 0.75rem;
  background: var(--color-mantle, #a4e4fc);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  image-rendering: pixelated;
}

.brick-frame {
  width: 100%;
  aspect-ratio: 3 / 4;
  border: 3px solid var(--color-surface1, #7c2c00);
  border-radius: 2px;
  box-sizing: border-box;
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
  overflow: hidden;
}

.cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  font-size: 3rem;
  color: #fce303;
  text-shadow: 2px 2px 0 var(--color-surface1, #7c2c00);
}

.brick-title {
  font-family: var(--font-pixel, "Press Start 2P", monospace);
  font-size: 0.6rem;
  text-align: center;
  color: var(--color-text, #1a1a2e);
  line-height: 1.4;
}

.description {
  font-size: 0.65rem;
  opacity: 0.85;
  text-align: center;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.release-date,
.playtime {
  font-size: 0.65rem;
  opacity: 0.7;
}

.brick-btn {
  font-family: var(--font-pixel, "Press Start 2P", monospace);
  font-size: 0.55rem;
  background: var(--color-accent, #e52521);
  color: #fff;
  border: 2px solid var(--color-surface1, #7c2c00);
  border-radius: 3px;
  padding: 0.35rem 0.5rem;
  cursor: pointer;
}

.brick-btn.danger {
  background: var(--color-danger, #b71c1c);
}

.brick-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
