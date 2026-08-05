import { defineStore } from "pinia";
import { ref } from "vue";

import { collections as collectionRepo, type Game } from "@/db";
import { useLibraryStore } from "./library";

/** Mirrors tags.ts exactly, over collections instead - split out of library.ts at the same
 *  time and for the same reason (its own dedicated "Collections" manager tab). */
export const useCollectionsStore = defineStore("collections", () => {
  const gameCollections = ref<Record<number, string[]>>({});
  const allCollections = ref<string[]>([]);
  const activeFilter = ref<string | null>(null);

  async function refresh(games: Game[]) {
    const entries = await Promise.all(
      games.map(async (g) => [g.id, await collectionRepo.getForGame(g.id)] as const),
    );
    gameCollections.value = Object.fromEntries(entries);
    allCollections.value = await collectionRepo.getAll();
  }

  function toggleFilter(name: string) {
    activeFilter.value = activeFilter.value === name ? null : name;
  }

  function matches(gameId: number): boolean {
    return (
      !activeFilter.value || (gameCollections.value[gameId]?.includes(activeFilter.value) ?? false)
    );
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
