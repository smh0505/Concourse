import { defineStore } from "pinia";
import { ref } from "vue";

import { collections as collectionRepo, type Game } from "@/db";
import { useLibraryStore } from "./library";

/** Mirrors tags.ts exactly, over collections instead - split out of library.ts at the same
 *  time and for the same reason (its own dedicated "Collections" manager tab). */
export const useCollectionsStore = defineStore("collections", () => {
  const gameCollections = ref<Record<number, string[]>>({});
  const allCollections = ref<string[]>([]);
  // See tags.ts's identical activeFilters for why this is a Set (multi-select, OR'd within
  // this facet) rather than a single value.
  const activeFilters = ref<Set<string>>(new Set());

  async function refresh(games: Game[]) {
    const entries = await Promise.all(
      games.map(async (g) => [g.id, await collectionRepo.getForGame(g.id)] as const),
    );
    gameCollections.value = Object.fromEntries(entries);
    allCollections.value = await collectionRepo.getAll();
  }

  /** See tags.ts's identical setFilters for why this replaces the whole set. */
  function setFilters(names: string[]) {
    activeFilters.value = new Set(names);
  }

  function matches(gameId: number): boolean {
    if (activeFilters.value.size === 0) return true;
    const gCollections = gameCollections.value[gameId] ?? [];
    return gCollections.some((c) => activeFilters.value.has(c));
  }

  /** Re-runs just this store's own refresh - a collection mutation never changes which games
   *  exist, only collection data. */
  async function refreshSelf() {
    await refresh(useLibraryStore().games);
  }

  async function addToGame(game: Game, names: string[]) {
    await collectionRepo.addToGame(game.id, names);
    await refreshSelf();
  }

  async function removeFromGame(game: Game, name: string) {
    await collectionRepo.removeFromGame(game.id, name);
    await refreshSelf();
  }

  /** Milestone 25 batch ops - see tags.ts's identical addToGames/removeFromGames for why this
   *  loops the raw repo call instead of reusing addToGame/removeFromGame (each of those calls
   *  refreshSelf() itself). */
  async function addToGames(games: Game[], names: string[]) {
    for (const game of games) await collectionRepo.addToGame(game.id, names);
    await refreshSelf();
  }

  async function removeFromGames(games: Game[], name: string) {
    for (const game of games) await collectionRepo.removeFromGame(game.id, name);
    await refreshSelf();
  }

  async function create(name: string) {
    await collectionRepo.create(name);
    await refreshSelf();
  }

  async function rename(oldName: string, newName: string) {
    await collectionRepo.rename(oldName, newName);
    await refreshSelf();
  }

  async function remove(name: string) {
    await collectionRepo.delete(name);
    await refreshSelf();
  }

  async function getUsageCounts() {
    return collectionRepo.getUsageCounts();
  }

  return {
    gameCollections,
    allCollections,
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
