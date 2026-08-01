<script setup lang="ts">
import { computed, onMounted } from "vue";
import { IconChartBar, IconClock, IconDeviceGamepad2 } from "@tabler/icons-vue";
import { useLibraryStore } from "../../stores/library";
import { useStatsStore } from "../../stores/stats";
import type { Game } from "../../db";

const library = useLibraryStore();
const stats = useStatsStore();

onMounted(() => {
  stats.refresh();
});

const totalGames = computed(() => library.games.length);
const totalPlaytimeSeconds = computed(() =>
  library.games.reduce((sum, game) => sum + game.total_playtime, 0),
);
const totalHours = computed(() => secondsToHours(totalPlaytimeSeconds.value));

const mostPlayed = computed(() =>
  [...library.games]
    .filter((game) => game.total_playtime > 0)
    .sort((a, b) => b.total_playtime - a.total_playtime)
    .slice(0, 5),
);

// stats.recentlyPlayed only has ids (session log doesn't duplicate game metadata) - map back
// onto already-loaded library.games, dropping any id whose game was since deleted.
const recentlyPlayed = computed(() => {
  const byId = new Map(library.games.map((game) => [game.id, game]));
  return stats.recentlyPlayed
    .map((entry) => byId.get(entry.gameId))
    .filter((game): game is Game => !!game);
});

function secondsToHours(seconds: number) {
  return Math.round((seconds / 3600) * 10) / 10;
}

function hoursPlayed(game: Game) {
  return secondsToHours(game.total_playtime);
}
</script>

<template>
  <div class="stats-panel settings-panel">
    <div class="summary">
      <div class="summary-card">
        <IconDeviceGamepad2 :size="22" :stroke-width="1.75" />
        <div>
          <div class="summary-value">{{ totalGames }}</div>
          <div class="summary-label">Games in library</div>
        </div>
      </div>
      <div class="summary-card">
        <IconClock :size="22" :stroke-width="1.75" />
        <div>
          <div class="summary-value">{{ totalHours }}</div>
          <div class="summary-label">Hours played</div>
        </div>
      </div>
    </div>

    <section v-if="mostPlayed.length > 0" class="section">
      <h3><IconChartBar :size="16" :stroke-width="1.75" /> Most Played</h3>
      <div class="stat-list">
        <div
          v-for="game in mostPlayed"
          :key="game.id"
          class="stat-row"
          :class="{ 'no-cover': !game.cover_art_url }"
          :style="game.cover_art_url ? { backgroundImage: `url(${game.cover_art_url})` } : undefined"
        >
          <div class="scrim" />
          <div class="stat-row-title">{{ game.title }}</div>
          <div class="stat-row-subtitle">{{ hoursPlayed(game) }} hrs</div>
        </div>
      </div>
    </section>

    <section v-if="recentlyPlayed.length > 0" class="section">
      <h3><IconClock :size="16" :stroke-width="1.75" /> Recently Played</h3>
      <div class="stat-list">
        <div
          v-for="game in recentlyPlayed"
          :key="game.id"
          class="stat-row"
          :class="{ 'no-cover': !game.cover_art_url }"
          :style="game.cover_art_url ? { backgroundImage: `url(${game.cover_art_url})` } : undefined"
        >
          <div class="scrim" />
          <div class="stat-row-title">{{ game.title }}</div>
        </div>
      </div>
    </section>

    <div v-if="mostPlayed.length === 0 && recentlyPlayed.length === 0" class="empty empty-state">
      <IconChartBar :size="32" :stroke-width="1.5" />
      <p>Play a game to see stats here.</p>
    </div>
  </div>
</template>

<style scoped>
.stats-panel {
  margin-bottom: var(--space-5);
}

.summary {
  display: flex;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

.summary-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: 1;
  padding: var(--space-3) var(--space-4);
  border: var(--button-border-width) solid var(--color-surface1);
  border-radius: var(--radius-lg);
  background: var(--color-mantle);
}

.summary-value {
  font-size: 1.4rem;
  font-weight: 700;
}

.summary-label {
  font-size: 0.75rem;
  opacity: 0.7;
}

.section {
  margin-bottom: var(--space-5);
}

.section h3 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.9rem;
  margin: 0 0 var(--space-3);
}

.stat-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* .list-row-shell (shared, styles.css) supplies the flex/border/radius/padding base -
   reusing GameListRow.vue's cover-as-background look for visual consistency, but static (no
   hover-expand) since these rows are informational, not actionable. */
.stat-row {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 2.75rem;
  padding: var(--space-2) var(--space-3);
  border: var(--button-border-width) solid var(--color-surface1);
  border-radius: var(--radius-lg);
  background-size: cover;
  background-position: center;
}

.stat-row.no-cover {
  /* Same opt-in hooks GameCard's .cover-placeholder uses. */
  background: var(--cover-placeholder-background, var(--color-surface0));
}

.scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(to right, rgba(0, 0, 0, 0.75) 40%, rgba(0, 0, 0, 0.25));
}

.stat-row-title {
  position: relative;
  z-index: 1;
  font-weight: 600;
  color: var(--color-on-accent);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-row-subtitle {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--color-on-accent);
  opacity: 0.85;
}

/* .empty-state (shared, styles.css) supplies this rule's entire look. */
</style>
