import { defineStore } from "pinia";
import { ref } from "vue";

import { tags as tagRepo, type Game } from "@/db";
import { useLibraryStore } from "./library";

/** Per-game tag assignment, the tag list, and the library's active tag filter - split out of
 *  library.ts once tags grew their own dedicated "Tags" manager tab, a genuinely separate
 *  domain from core game CRUD/launch, not just "a lot of library actions." */
export const useTagsStore = defineStore("tags", () => {
  const gameTags = ref<Record<number, string[]>>({});
  const allTags = ref<string[]>([]);
  const activeFilter = ref<string | null>(null);

  /** Takes the current game list from `useLibraryStore` rather than owning it - tags don't
   *  know which games exist, only which tags each one carries. */
  async function refresh(games: Game[]) {
    const entries = await Promise.all(
      games.map(async (g) => [g.id, await tagRepo.getForGame(g.id)] as const),
    );
    gameTags.value = Object.fromEntries(entries);
    allTags.value = await tagRepo.getAll();
  }

  function toggleFilter(tag: string) {
    activeFilter.value = activeFilter.value === tag ? null : tag;
  }

  function matches(gameId: number): boolean {
    return !activeFilter.value || (gameTags.value[gameId]?.includes(activeFilter.value) ?? false);
  }

  /** Re-runs just this store's own refresh - a tag mutation never changes which games exist,
   *  only tag data, so there's no need to reload the whole games list the way the old combined
   *  library.ts refresh() used to for every tag action. */
  async function refreshSelf() {
    await refresh(useLibraryStore().games);
  }

  async function addToGame(game: Game, names: string[]) {
    await tagRepo.addToGame(game.id, names);
    await refreshSelf();
  }

  async function removeFromGame(game: Game, name: string) {
    await tagRepo.removeFromGame(game.id, name);
    await refreshSelf();
  }

  /** Standalone tag management (rename/merge/delete, usage counts) for the "Tags" manager
   *  tab - distinct from the per-game add/remove above, which only ever touch one game's own
   *  assignment. */
  async function create(name: string) {
    await tagRepo.create(name);
    await refreshSelf();
  }

  async function rename(oldName: string, newName: string) {
    await tagRepo.rename(oldName, newName);
    await refreshSelf();
  }

  async function remove(name: string) {
    await tagRepo.delete(name);
    await refreshSelf();
  }

  async function getUsageCounts() {
    return tagRepo.getUsageCounts();
  }

  return {
    gameTags,
    allTags,
    activeFilter,
    refresh,
    toggleFilter,
    matches,
    addToGame,
    removeFromGame,
    create,
    rename,
    remove,
    getUsageCounts,
  };
});
