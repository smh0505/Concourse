import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  games as gameRepo,
  playtime as playtimeRepo,
  settings as settingsRepo,
  tags as tagRepo,
  type Game,
  type GameEditFields,
} from "../db";

const SGDB_API_KEY_SETTING = "steamgriddb_api_key";
const IGDB_CLIENT_ID_SETTING = "igdb_client_id";
const IGDB_CLIENT_SECRET_SETTING = "igdb_client_secret";

interface IgdbMetadata {
  description: string | null;
  release_date: string | null;
  genres: string[];
}

interface GameSessionEnded {
  game_id: number;
  start_time: string;
  end_time: string;
  duration_seconds: number;
}

export const useLibraryStore = defineStore("library", () => {
  const games = ref<Game[]>([]);
  const gameTags = ref<Record<number, string[]>>({});
  const allTags = ref<string[]>([]);
  const search = ref("");
  const activeTagFilter = ref<string | null>(null);
  const error = ref("");
  const sgdbApiKey = ref("");
  const igdbClientId = ref("");
  const igdbClientSecret = ref("");
  const fetchingCoverFor = ref<number | null>(null);
  const fetchingMetadataFor = ref<number | null>(null);
  const editingGame = ref<Game | null>(null);

  let unlistenSessionEnded: UnlistenFn | undefined;

  const filteredGames = computed(() => {
    const query = search.value.trim().toLowerCase();
    return games.value.filter((game) => {
      const matchesSearch = !query || game.title.toLowerCase().includes(query);
      const matchesTag =
        !activeTagFilter.value || gameTags.value[game.id]?.includes(activeTagFilter.value);
      return matchesSearch && matchesTag;
    });
  });

  async function refresh() {
    games.value = await gameRepo.list();
    const tagEntries = await Promise.all(
      games.value.map(async (g) => [g.id, await tagRepo.getForGame(g.id)] as const),
    );
    gameTags.value = Object.fromEntries(tagEntries);
    allTags.value = await tagRepo.getAll();
  }

  function toggleTagFilter(tag: string) {
    activeTagFilter.value = activeTagFilter.value === tag ? null : tag;
  }

  async function addTag(game: Game, name: string) {
    await tagRepo.addToGame(game.id, [name]);
    await refresh();
  }

  async function removeTag(game: Game, tag: string) {
    await tagRepo.removeFromGame(game.id, tag);
    await refresh();
  }

  async function saveApiKeys() {
    await settingsRepo.set(SGDB_API_KEY_SETTING, sgdbApiKey.value.trim());
    await settingsRepo.set(IGDB_CLIENT_ID_SETTING, igdbClientId.value.trim());
    await settingsRepo.set(IGDB_CLIENT_SECRET_SETTING, igdbClientSecret.value.trim());
  }

  async function fetchMetadata(game: Game) {
    error.value = "";
    if (!igdbClientId.value.trim() || !igdbClientSecret.value.trim()) {
      error.value = "Set IGDB client ID and secret first.";
      return;
    }
    fetchingMetadataFor.value = game.id;
    try {
      const meta = await invoke<IgdbMetadata | null>("fetch_igdb_metadata", {
        clientId: igdbClientId.value.trim(),
        clientSecret: igdbClientSecret.value.trim(),
        title: game.title,
      });
      if (meta) {
        await gameRepo.updateMetadata(game.id, meta.description, meta.release_date);
        if (meta.genres.length > 0) {
          await tagRepo.addToGame(game.id, meta.genres);
        }
        await refresh();
      } else {
        error.value = `No IGDB metadata found for "${game.title}".`;
      }
    } catch (e) {
      error.value = String(e);
    } finally {
      fetchingMetadataFor.value = null;
    }
  }

  async function fetchCoverArt(game: Game) {
    error.value = "";
    if (!sgdbApiKey.value.trim()) {
      error.value = "Set a SteamGridDB API key first.";
      return;
    }
    fetchingCoverFor.value = game.id;
    try {
      const url = await invoke<string | null>("fetch_cover_art", {
        apiKey: sgdbApiKey.value.trim(),
        title: game.title,
      });
      if (url) {
        await gameRepo.updateCoverArt(game.id, url);
        await refresh();
      } else {
        error.value = `No cover art found for "${game.title}".`;
      }
    } catch (e) {
      error.value = String(e);
    } finally {
      fetchingCoverFor.value = null;
    }
  }

  async function addGame(title: string, executablePath: string) {
    error.value = "";
    try {
      await gameRepo.add(title, executablePath);
      await refresh();
    } catch (e) {
      error.value = String(e);
    }
  }

  async function deleteGame(id: number) {
    await gameRepo.delete(id);
    await refresh();
  }

  function openEdit(game: Game) {
    editingGame.value = game;
  }

  function cancelEdit() {
    editingGame.value = null;
  }

  async function saveEdit(fields: GameEditFields) {
    if (!editingGame.value) return;
    await gameRepo.update(editingGame.value.id, fields);
    editingGame.value = null;
    await refresh();
  }

  async function launchGame(game: Game) {
    error.value = "";
    try {
      await invoke("launch_game", { gameId: game.id, executablePath: game.executable_path });
    } catch (e) {
      error.value = String(e);
    }
  }

  async function init() {
    sgdbApiKey.value = (await settingsRepo.get(SGDB_API_KEY_SETTING)) ?? "";
    igdbClientId.value = (await settingsRepo.get(IGDB_CLIENT_ID_SETTING)) ?? "";
    igdbClientSecret.value = (await settingsRepo.get(IGDB_CLIENT_SECRET_SETTING)) ?? "";
    await refresh();

    unlistenSessionEnded = await listen<GameSessionEnded>("game-session-ended", async (event) => {
      const { game_id, start_time, end_time, duration_seconds } = event.payload;
      await playtimeRepo.recordSession(game_id, start_time, end_time, duration_seconds);
      await refresh();
    });
  }

  function dispose() {
    unlistenSessionEnded?.();
  }

  return {
    games,
    gameTags,
    allTags,
    search,
    activeTagFilter,
    error,
    sgdbApiKey,
    igdbClientId,
    igdbClientSecret,
    fetchingCoverFor,
    fetchingMetadataFor,
    editingGame,
    filteredGames,
    refresh,
    toggleTagFilter,
    addTag,
    removeTag,
    saveApiKeys,
    fetchMetadata,
    fetchCoverArt,
    addGame,
    deleteGame,
    openEdit,
    cancelEdit,
    saveEdit,
    launchGame,
    init,
    dispose,
  };
});
