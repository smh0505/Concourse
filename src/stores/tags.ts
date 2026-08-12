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
  // A Set (not a single value) - multiple tag pills can be active at once, OR'd together (a
  // game matches if it carries *any* selected tag, not all of them - narrowing further than
  // that is what stacking a second facet, like a collection filter, is for).
  const activeFilters = ref<Set<string>>(new Set());

  /** Takes the current game list from `useLibraryStore` rather than owning it - tags don't
   *  know which games exist, only which tags each one carries. */
  async function refresh(games: Game[]) {
    const entries = await Promise.all(
      games.map(async (g) => [g.id, await tagRepo.getForGame(g.id)] as const),
    );
    gameTags.value = Object.fromEntries(entries);
    allTags.value = await tagRepo.getAll();
  }

  /** Replaces the whole active set - used by library.ts's search-token sync watcher, which
   *  recomputes every active tag: token on each search change rather than diffing one at a
   *  time. */
  function setFilters(tags: string[]) {
    activeFilters.value = new Set(tags);
  }

  function matches(gameId: number): boolean {
    if (activeFilters.value.size === 0) return true;
    const gTags = gameTags.value[gameId] ?? [];
    return gTags.some((t) => activeFilters.value.has(t));
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

  /** Milestone 25 batch ops - loops the same per-game repo call rather than reusing
   *  addToGame/removeFromGame in a loop, since those each call refreshSelf() themselves; doing
   *  that per game in a multi-game batch would re-run the same full refresh N times over. */
  async function addToGames(games: Game[], names: string[]) {
    for (const game of games) await tagRepo.addToGame(game.id, names);
    await refreshSelf();
  }

  async function removeFromGames(games: Game[], name: string) {
    for (const game of games) await tagRepo.removeFromGame(game.id, name);
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
    activeFilters,
    refresh,
    setFilters,
    matches,
    addToGame,
    removeFromGame,
    addToGames,
    removeFromGames,
    create,
    rename,
    remove,
    getUsageCounts,
  };
});
