<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-vue";

import { useLibraryStore } from "@/stores/library";
import { useToastStore } from "@/stores/toasts";
import { games as gameRepo } from "@/db";
import type { UnsharedGame } from "@/db";
import ReviewGameCard from "@/components/desktop/game/ReviewGameCard.vue";

const { t } = useI18n();
const library = useLibraryStore();
const toasts = useToastStore();

// Milestone 30 - only rendered for Admin (App.vue's own v-if="profiles.isAdmin" gate), so no
// per-profile scoping needed here beyond what listUnsharedForAdmin already does. Starts folded -
// a deliberate default posture, not a remembered preference (see milestones.md's own note).
const expanded = ref(false);
const games = ref<(UnsharedGame & { pending: boolean; hiddenByTag: boolean })[]>([]);
const loading = ref(false);

/** hiddenByTag can't be read off a column the way pending can (pending_review is direct) - it's
 *  derived by checking, for every distinct owning profile represented, whether that profile's
 *  own list() would currently include the game. Same diffing approach the old Settings-panel
 *  cross-profile view used, just spanning every non-admin profile in one pass instead of one
 *  profile at a time. */
async function load() {
  loading.value = true;
  try {
    const raw = await gameRepo.listUnsharedForAdmin();
    const profileIds = [...new Set(raw.map((g) => g.profile_id))];
    const visibleLists = await Promise.all(profileIds.map((pid) => gameRepo.list(pid)));
    const visibleIds = new Set(visibleLists.flat().map((g) => g.id));
    games.value = raw.map((g) => ({
      ...g,
      pending: g.pending_review === 1,
      hiddenByTag: g.pending_review === 0 && !visibleIds.has(g.id),
    }));
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function approve(game: UnsharedGame) {
  await gameRepo.approvePending(game.id);
  await load();
  toasts.push(t("library.approvedGame", { title: game.title }), "success");
}

async function share(game: UnsharedGame) {
  await gameRepo.shareToAdmin(game.id);
  await load();
  await library.refresh();
  toasts.push(t("library.sharedGame", { title: game.title }), "success");
}
</script>

<template>
  <div v-if="!loading && games.length > 0" class="review-section">
    <button type="button" class="review-toggle" @click="expanded = !expanded">
      <IconChevronDown v-if="expanded" :size="16" :stroke-width="1.75" />
      <IconChevronRight v-else :size="16" :stroke-width="1.75" />
      {{ t("library.reviewSectionTitle", { count: games.length }) }}
    </button>

    <div v-if="expanded" class="grid">
      <ReviewGameCard
        v-for="game in games"
        :key="game.id"
        :game="game"
        @approve="approve(game)"
        @share="share(game)"
        @open="library.openForeignDetail(game)"
      />
    </div>
  </div>
</template>

<style scoped>
.review-section {
  padding: 0 var(--space-6) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.review-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  padding: var(--space-2) 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
}
</style>
