import { defineStore } from "pinia";
import { ref } from "vue";

import { tags as tagRepo, type Game } from "@/db";
import { useLibraryStore } from "./library";
import { useProfilesStore } from "./profiles";

/** App.vue gates the main library UI behind profile selection - by the time any of this
 *  store's mutating actions can run, a profile is guaranteed active. */
function activeProfileId(): number {
  return useProfilesStore().activeProfileId!;
}

export type PillMatchMode = "or" | "and";

/** Per-game tag assignment, the tag list, and the library's active tag filter - split out of
 *  library.ts once tags grew their own dedicated "Tags" manager tab, a genuinely separate
 *  domain from core game CRUD/launch, not just "a lot of library actions." */
export const useTagsStore = defineStore("tags", () => {
  const gameTags = ref<Record<number, string[]>>({});
  const allTags = ref<string[]>([]);
  // Multiple tag pills can be active at once, combined per matchMode ("or": any selected tag
  // matches; "and": must carry every one). Different kinds always AND together regardless -
  // matchMode only governs multiple pills within this one kind.
  const activeFilters = ref<Set<string>>(new Set());
  const matchMode = ref<PillMatchMode>("or");

  /** Takes the current game list from `useLibraryStore` rather than owning it - tags don't
   *  know which games exist, only which tags each one carries. */
  async function refresh(games: Game[]) {
    const entries = await Promise.all(
      games.map(async (g) => [g.id, await tagRepo.getForGame(g.id)] as const),
    );
    gameTags.value = Object.fromEntries(entries);
    allTags.value = await tagRepo.getAll(activeProfileId());
  }

  /** Replaces the whole active set - used by library.ts's search-token sync watcher, which
   *  recomputes every active tag: token on each search change rather than diffing one at a
   *  time. */
  function setFilters(tags: string[]) {
    activeFilters.value = new Set(tags);
  }

  function setMatchMode(mode: PillMatchMode) {
    matchMode.value = mode;
  }

  function matches(gameId: number): boolean {
    if (activeFilters.value.size === 0) return true;
    const gTags = gameTags.value[gameId] ?? [];
    return matchMode.value === "and"
      ? [...activeFilters.value].every((t) => gTags.includes(t))
      : gTags.some((t) => activeFilters.value.has(t));
  }

  /** Re-runs just this store's own refresh - a tag mutation never changes which games exist,
   *  only tag data, so there's no need to reload the whole games list the way the old combined
   *  library.ts refresh() used to for every tag action. */
  async function refreshSelf() {
    await refresh(useLibraryStore().games);
  }

  async function addToGame(game: Game, names: string[]) {
    await tagRepo.addToGame(game.id, names, activeProfileId());
    await refreshSelf();
  }

  async function removeFromGame(game: Game, name: string) {
    await tagRepo.removeFromGame(game.id, name, activeProfileId());
    await refreshSelf();
  }

  /** Milestone 25 batch ops - loops the same per-game repo call rather than reusing
   *  addToGame/removeFromGame in a loop, since those each call refreshSelf() themselves; doing
   *  that per game in a multi-game batch would re-run the same full refresh N times over. */
  async function addToGames(games: Game[], names: string[]) {
    for (const game of games) await tagRepo.addToGame(game.id, names, activeProfileId());
    await refreshSelf();
  }

  async function removeFromGames(games: Game[], name: string) {
    for (const game of games) await tagRepo.removeFromGame(game.id, name, activeProfileId());
    await refreshSelf();
  }

  /** Standalone tag management (rename/merge/delete, usage counts) for the "Tags" manager
   *  tab - distinct from the per-game add/remove above, which only ever touch one game's own
   *  assignment. */
  async function create(name: string) {
    await tagRepo.create(name, activeProfileId());
    await refreshSelf();
  }

  async function rename(oldName: string, newName: string) {
    await tagRepo.rename(oldName, newName, activeProfileId());
    await refreshSelf();
  }

  async function remove(name: string) {
    await tagRepo.delete(name, activeProfileId());
    await refreshSelf();
  }

  async function getUsageCounts() {
    return tagRepo.getUsageCounts(activeProfileId());
  }

  return {
    gameTags,
    allTags,
    activeFilters,
    matchMode,
    refresh,
    setFilters,
    setMatchMode,
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
