<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  IconEdit,
  IconInfoCircle,
  IconLoader2,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-vue";

import { useLibraryStore } from "@/stores/library";
import { useAppSettingsStore } from "@/stores/appSettings";
import { displayTitle, type Game } from "@/db";

const props = defineProps<{ game: Game }>();

const { t } = useI18n();
const library = useLibraryStore();
const appSettings = useAppSettingsStore();

const fetchingMetadata = computed(() => library.fetchingMetadataFor === props.game.id);
const title = computed(() => displayTitle(props.game, appSettings.locale));
</script>

<template>
  <div
    class="list-row-shell"
    :class="{ 'no-cover': !game.cover_art_url }"
    :style="game.cover_art_url ? { backgroundImage: `url(${game.cover_art_url})` } : undefined"
  >
    <div class="scrim" />

    <div v-if="fetchingMetadata" class="fetch-overlay">
      <IconLoader2 :size="18" :stroke-width="1.75" class="spin" />
    </div>

    <div class="info">
      <div class="title">{{ title }}</div>
      <div class="details">
        <p v-if="game.description" class="description">{{ game.description }}</p>
        <div class="meta">
          <span v-if="game.release_date">{{ game.release_date }}</span>
          <span>{{ t("gameCard.minutesPlayed", { minutes: Math.round(game.total_playtime / 60) }) }}</span>
        </div>
      </div>
    </div>

    <div class="actions icon-action-row">
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
</template>

<style scoped>
/* .list-row-shell (shared, styles.css) supplies the flex/border/radius/padding base; this
   layers the cover-as-background redesign on top - collapsed to just the title by default,
   expanding on hover to reveal description/meta/actions, cover art itself as the row's
   background instead of a separate thumbnail. */
.list-row-shell {
  position: relative;
  overflow: hidden;
  background-size: cover;
  background-position: center;
  min-height: 2.75rem;
  transition: min-height 0.2s ease;
}

.list-row-shell:hover {
  min-height: 6rem;
}

.list-row-shell.no-cover {
  /* Same opt-in hooks GameCard's .cover-placeholder uses, so a theme's placeholder look
     (e.g. Brick Block's stripe pattern) still applies here instead of falling back silently.
     `background` (not `background-image`) - the default value is a plain color, which isn't
     valid for `background-image` alone. */
  background: var(--cover-placeholder-background, var(--color-surface0));
}

.scrim {
  position: absolute;
  inset: 0;
  /* Strong on the text side (left), fading out toward the cover art peeking through on the
     right - keeps title/details readable regardless of how bright the cover art itself is,
     without fully hiding the art. Tinted toward --color-tint (styles.css, defaults to
     --color-crust), not --color-base directly - gives more punch than base while staying
     theme-overridable per-theme if crust itself doesn't pair with --color-text (see
     --color-tint's own doc comment - Brick Block overrides it for exactly this reason). */
  background: linear-gradient(
    to right,
    color-mix(in srgb, var(--color-tint) 80%, transparent) 40%,
    color-mix(in srgb, var(--color-tint) 25%, transparent)
  );
}

.fetch-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  /* Fixed white, not a theme token - this overlay's background is a hardcoded black regardless
     of theme, so the readable text color is fixed too. --color-on-accent was wrong here: it
     tracks --color-base (the theme's own background color), which is dark for dark themes -
     dark text on this black overlay was unreadable. */
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

.info {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.15rem;
  /* --color-text, not --color-on-accent - .scrim above now tints toward --color-base itself
     (not a fixed black), so the theme's own text/base contrast pair holds here same as anywhere
     else in the app. --color-on-accent tracked --color-base directly instead, which was dark
     for dark themes against the (then-fixed-black) scrim - the bug this replaces. */
  color: var(--color-text);
}

.title {
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

.details {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    max-height 0.2s ease,
    opacity 0.15s ease;
}

.list-row-shell:hover .details {
  max-height: 3rem;
  opacity: 1;
}

.description {
  font-size: 0.75rem;
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0.2rem 0 0;
}

.meta {
  display: flex;
  gap: var(--space-3);
  font-size: 0.7rem;
  opacity: 0.75;
  margin-top: 0.15rem;
}

/* .icon-action-row (shared, styles.css) supplies `flex: 1` sizing, which relies on the row
   being stretched to fill a fixed width (true for GameCard's full-width footer, not here) -
   without that stretch, `flex: 1` + zero horizontal padding collapses each button down to
   icon-only width. Overridden below for this row's own, unstretched context. */
.actions {
  position: relative;
  z-index: 1;
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
  max-width: 0;
  padding-left: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  transition:
    max-width 0.2s ease,
    padding-left 0.2s ease,
    opacity 0.15s ease;
}

.actions button {
  flex: 0 0 auto;
  padding: 0.35rem;
}

.list-row-shell:hover .actions {
  max-width: 12rem;
  padding-left: var(--space-3);
  opacity: 1;
  pointer-events: auto;
}
</style>
