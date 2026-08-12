<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  IconCheck,
  IconEdit,
  IconInfoCircle,
  IconLoader2,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-vue";

import { useLibraryStore } from "@/stores/library";
import { useAppSettingsStore } from "@/stores/appSettings";
import { useLibrarySelectionStore } from "@/stores/librarySelection";
import { useBalloonAnchor } from "@/composables/useBalloonAnchor";
import { CardVisualRenderer } from "@/theme/cardVisualAst";
import { useActiveCardVisual } from "@/theme/cardVisualRegistry";
import { displayTitle, type Game } from "@/db";

const props = defineProps<{ game: Game }>();

const { t } = useI18n();
const library = useLibraryStore();
const appSettings = useAppSettingsStore();
const selection = useLibrarySelectionStore();
const activeCardVisual = useActiveCardVisual();

const fetchingMetadata = computed(() => library.fetchingMetadataFor === props.game.id);
const playtimeMinutes = computed(() => Math.round(props.game.total_playtime / 60));
const title = computed(() => displayTitle(props.game, appSettings.locale));
const selected = computed(() => selection.isSelected(props.game.id));

const cardEl = ref<HTMLElement | null>(null);
const balloonEl = ref<HTMLElement | null>(null);
const { anchor: balloonAnchor, onMouseEnter, onMouseLeave } = useBalloonAnchor(cardEl, balloonEl);

/** Milestone 25 batch ops - the whole card becomes one big toggle target while selection mode
 *  is active, instead of leaving the play/edit/remove footer reachable (which would make a
 *  bulk-select session too easy to derail with an accidental single-game action - the footer
 *  is hidden entirely below while selection.active, see the template). */
function onCardClick() {
  if (selection.active) selection.toggle(props.game.id);
}
</script>

<template>
  <div
    ref="cardEl"
    class="card"
    :class="{ selected: selection.active && selected, selectable: selection.active }"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @click="onCardClick"
  >
    <div class="card-visual">
      <CardVisualRenderer v-if="activeCardVisual" :node="activeCardVisual" :game="game" />
      <template v-else>
        <img v-if="game.cover_art_url" class="cover" :src="game.cover_art_url" :alt="game.title" />
        <div v-else class="cover-placeholder">{{ game.title.charAt(0).toUpperCase() }}</div>
      </template>

      <div v-if="fetchingMetadata" class="fetch-overlay">
        <IconLoader2 :size="24" :stroke-width="1.75" class="spin" />
      </div>

      <Transition name="select-check">
        <div v-if="selection.active" class="select-check" :class="{ checked: selected }">
          <IconCheck v-if="selected" :size="14" :stroke-width="2.5" />
        </div>
      </Transition>

      <div v-if="!selection.active" class="footer icon-action-row">
        <button class="play" :title="t('gameCard.play')" @click.stop="library.launchGame(game)">
          <IconPlayerPlay :size="15" :stroke-width="1.75" />
        </button>
        <button
          class="fetch-metadata"
          :title="t('gameCard.fetchMetadata')"
          :disabled="fetchingMetadata"
          @click.stop="library.fetchMetadata(game)"
        >
          <IconInfoCircle :size="15" :stroke-width="1.75" />
        </button>
        <button class="edit" :title="t('gameCard.edit')" @click.stop="library.openDetail(game)">
          <IconEdit :size="15" :stroke-width="1.75" />
        </button>
        <button class="remove" :title="t('gameCard.remove')" @click.stop="library.deleteGame(game.id)">
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
        <div class="balloon-title">{{ title }}</div>
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

/* Milestone 25 batch ops - a ring instead of the pill-style .accent-active fill, since a fill
   would obscure the cover art underneath; box-shadow (not border) so it doesn't shift layout
   or get clipped by .card-visual's own border-radius the way an inset border sometimes can. */
.card.selected {
  box-shadow: 0 0 0 3px var(--color-accent);
  border-radius: var(--card-radius, var(--radius-md));
}

.card.selectable {
  cursor: pointer;
}

.select-check {
  position: absolute;
  top: 0.4rem;
  left: 0.4rem;
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 50%;
  border: 2px solid #fff;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  /* Always visible while selection mode is active (not hover-revealed like .footer) - the
     whole point is being able to see selection state across every card at a glance. */
}

.select-check.checked {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-on-accent);
}

/* Pop-in/out as selection mode itself toggles, not per-item selection (toggling checked just
   swaps .checked's background, no transition needed there - see .checked above). */
.select-check-enter-active,
.select-check-leave-active {
  transition:
    transform 0.15s ease-in-out,
    opacity 0.15s ease-in-out;
}

.select-check-enter-from,
.select-check-leave-to {
  transform: scale(0.5);
  opacity: 0;
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
  /* Fixed white, not a theme token - same fix as GameListRow.vue's identical overlay: this
     background is a hardcoded black regardless of theme, so --color-on-accent (which tracks
     --color-base, dark for dark themes) gave dark-on-dark text for dark themes. */
  color: #fff;
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
