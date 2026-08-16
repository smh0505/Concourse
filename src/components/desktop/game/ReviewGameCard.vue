<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { IconCheck, IconDownload } from "@tabler/icons-vue";

import { useBalloonAnchor } from "@/composables/useBalloonAnchor";
import type { UnsharedGame } from "@/db";

const props = defineProps<{ game: UnsharedGame & { pending: boolean; hiddenByTag: boolean } }>();
const emit = defineEmits<{ approve: []; share: []; open: [] }>();

const { t } = useI18n();

const cardEl = ref<HTMLElement | null>(null);
const balloonEl = ref<HTMLElement | null>(null);
const { anchor: balloonAnchor, onMouseEnter, onMouseLeave } = useBalloonAnchor(cardEl, balloonEl);

const ribbon = computed(() => {
  if (props.game.pending) return { key: "pending", label: t("library.pendingBadge") };
  if (props.game.hiddenByTag) return { key: "hidden", label: t("library.hiddenBadge") };
  return null;
});
</script>

<template>
  <div ref="cardEl" class="card" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave" @click="emit('open')">
    <div class="card-visual">
      <img v-if="game.cover_art_url" class="cover" :src="game.cover_art_url" :alt="game.title" />
      <div v-else class="cover-placeholder">{{ game.title.charAt(0).toUpperCase() }}</div>

      <div v-if="ribbon" class="ribbon" :class="`ribbon-${ribbon.key}`">{{ ribbon.label }}</div>

      <div class="footer icon-action-row">
        <button
          v-if="game.pending"
          class="approve"
          :title="t('library.approveGame')"
          @click.stop="emit('approve')"
        >
          <IconCheck :size="15" :stroke-width="1.75" />
        </button>
        <button class="share" :title="t('library.shareGame')" @click.stop="emit('share')">
          <IconDownload :size="15" :stroke-width="1.75" />
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
        <div class="balloon-owner">{{ t("library.ownedBy", { name: game.owner_name }) }}</div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.card {
  position: relative;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.card:hover {
  transform: scale(1.06);
  z-index: 2;
}

.card-visual {
  position: relative;
  overflow: hidden;
  border-radius: var(--card-radius, var(--radius-md));
  border: var(--card-border-width, 1px) solid var(--color-surface1);
}

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
  background: var(--cover-placeholder-background, var(--color-surface0));
  color: var(--cover-placeholder-color, var(--color-text));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--cover-placeholder-font-size, 2rem);
}

/* Always visible (not hover-revealed) - status should be scannable across the whole review
   section at a glance, same reasoning as GameCard's .select-check. */
.ribbon {
  position: absolute;
  top: 0.4rem;
  left: 0.4rem;
  padding: 0.15rem 0.4rem;
  border-radius: var(--radius-sm);
  font-size: 0.7rem;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
}

.ribbon-pending {
  background: var(--color-warning, #d97706);
}

.ribbon-hidden {
  background: rgba(0, 0, 0, 0.65);
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
</style>

<style>
/* Teleported to <body>, can't be scoped - same reasoning as GameCard.vue's identical block. */
.balloon-owner {
  font-size: 0.7rem;
  opacity: 0.7;
  white-space: nowrap;
}
</style>
