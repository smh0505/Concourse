<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  IconEdit,
  IconInfoCircle,
  IconLoader2,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-vue";
import { useLibraryStore } from "../../stores/library";
import { useBalloonAnchor } from "../../composables/useBalloonAnchor";
import { CardVisualRenderer } from "../../theme/cardVisualAst";
import { useActiveCardVisual } from "../../theme/cardVisualRegistry";
import type { Game } from "../../db";

const props = defineProps<{ game: Game }>();

const { t } = useI18n();
const library = useLibraryStore();
const activeCardVisual = useActiveCardVisual();

const fetchingMetadata = computed(() => library.fetchingMetadataFor === props.game.id);
const playtimeMinutes = computed(() => Math.round(props.game.total_playtime / 60));

const cardEl = ref<HTMLElement | null>(null);
const { balloonEl, anchor: balloonAnchor, onMouseEnter, onMouseLeave } = useBalloonAnchor(cardEl);
</script>

<template>
  <div ref="cardEl" class="card" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
    <div class="card-visual">
      <CardVisualRenderer v-if="activeCardVisual" :node="activeCardVisual" :game="game" />
      <template v-else>
        <img v-if="game.cover_art_url" class="cover" :src="game.cover_art_url" :alt="game.title" />
        <div v-else class="cover-placeholder">{{ game.title.charAt(0).toUpperCase() }}</div>
      </template>

      <div v-if="fetchingMetadata" class="fetch-overlay">
        <IconLoader2 :size="24" :stroke-width="1.75" class="spin" />
      </div>

      <div class="footer icon-action-row">
        <button class="play" :title="t('gameCard.play')" @click="library.launchGame(game)">
          <IconPlayerPlay :size="15" :stroke-width="1.75" />
        </button>
        <button
          class="fetch-metadata"
          :title="t('gameCard.fetchMetadata')"
          :disabled="fetchingMetadata"
          @click="library.fetchMetadata(game)"
        >
          <IconInfoCircle :size="15" :stroke-width="1.75" />
        </button>
        <button class="edit" :title="t('gameCard.edit')" @click="library.openDetail(game)">
          <IconEdit :size="15" :stroke-width="1.75" />
        </button>
        <button class="remove" :title="t('gameCard.remove')" @click="library.deleteGame(game.id)">
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
        class="balloon"
        :class="`balloon-${balloonAnchor.placement}`"
        :style="{ top: `${balloonAnchor.top}px`, left: `${balloonAnchor.left}px` }"
      >
        <div class="balloon-title">{{ game.title }}</div>
        <div class="balloon-playtime">{{ t("gameCard.minutesPlayed", { minutes: playtimeMinutes }) }}</div>
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
  /* --card-radius/--card-border-width aren't part of the base design-token scale - opt-in
     per-element hooks (same pattern as --balloon-* above), undeclared by default so most
     themes never think about them - only a theme wanting a chunkier/sharper card frame than
     --radius-md's default look needs to set them. */
  border-radius: var(--card-radius, var(--radius-md));
  border: var(--card-border-width, 1px) solid var(--color-surface1);
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

/* .icon-action-row (shared, styles.css) supplies the button sizing entirely. */

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
/* .cover/.cover-placeholder can't be `scoped` either - when an active theme provides a
   cardVisual AST (Milestone 17), CardVisualRenderer (a separate component) renders these
   elements instead of GameCard's own template, so they'd never carry GameCard's compiled
   data-v-* attribute and a scoped rule would silently never match them. */
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
  /* Opt-in per-element hooks, same pattern as the balloon/card hooks above - undeclared by
     default (falls back to the existing plain look), only set by a theme wanting something
     richer than a flat background/color (e.g. a diagonal stripe pattern via a full
     repeating-linear-gradient(...) value, which a CSS custom property can hold just as well
     as a single color). */
  background: var(--cover-placeholder-background, var(--color-surface0));
  color: var(--cover-placeholder-color, var(--color-text));
  text-shadow: var(--cover-placeholder-text-shadow, none);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--cover-placeholder-font-size, 2rem);
}

/* Teleported to <body>, so this can't be a `scoped` style - the balloon is no longer a
   descendant of this component's root element in the actual DOM. */
.balloon {
  position: fixed;
  padding: 0.4rem 0.65rem;
  /* --balloon-border-width/--balloon-radius aren't part of the base design-token scale (like
     --font-pixel below, they're opt-in per-element hooks, undeclared by default so most themes
     never think about them - a theme only sets them if it wants a chunkier/sharper balloon than
     --radius-sm's default look). */
  border: var(--balloon-border-width, 0) solid var(--color-surface1);
  border-radius: var(--balloon-radius, var(--radius-sm));
  background: var(--balloon-background, var(--color-crust));
  color: var(--color-text);
  box-shadow: var(--shadow-md);
  /* width: max-content (not fit-content/auto) is required here - a position:fixed box with
     only `left` set (no `right`) sizes fit-content/auto using "available space" computed as
     (containing block width - left), NOT the content's real preferred width. Since `left` is
     the card's center x, that shrinks the box the closer a card sits to the right edge,
     forcing an early wrap regardless of how much room actually exists. max-content explicitly
     ignores that available-space constraint and sizes off real content instead; max-width
     below still caps extremely long titles into multiple lines. */
  width: max-content;
  max-width: 300px;
  white-space: normal;
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
  /* Tracks --balloon-background (not hardcoded to --color-crust separately) so the arrow can
     never visually drift from the balloon body it's attached to, regardless of theme. */
  border-top-color: var(--balloon-background, var(--color-crust));
}

.balloon-below::after {
  bottom: 100%;
  border-bottom-color: var(--balloon-background, var(--color-crust));
}

.balloon-title,
.balloon-playtime {
  font-family: var(--balloon-font-family, inherit);
}

.balloon-title {
  font-weight: 600;
  font-size: 0.8rem;
}

.balloon-playtime {
  font-size: 0.7rem;
  opacity: 0.7;
  white-space: nowrap;
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
