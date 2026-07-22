import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  games as gameRepo,
  playtime as playtimeRepo,
  settings as settingsRepo,
  tags as tagRepo,
  type Game,
  type GameEditFields,
} from "../db";
import type { GameEntry } from "../plugins/types";
import { useMetadataProviderStore } from "./metadataProviders";
import { useAppSettingsStore } from "./appSettings";

const SGDB_API_KEY_SETTING = "steamgriddb_api_key";
const VIEW_MODE_SETTING = "view_mode";

/** Parent folder of a real filesystem executable path; null for URIs, which have none. */
function parentDir(executablePath: string): string | null {
  if (executablePath.includes("://")) return null;
  const lastSeparator = Math.max(executablePath.lastIndexOf("\\"), executablePath.lastIndexOf("/"));
  return lastSeparator > 0 ? executablePath.slice(0, lastSeparator) : null;
}

export type ViewMode = "grid" | "list";

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
  const fetchingCoverFor = ref<number | null>(null);
  const fetchingMetadataFor = ref<number | null>(null);
  const fetchingBackgroundFor = ref<number | null>(null);
  const editingGame = ref<Game | null>(null);
  const viewMode = ref<ViewMode>("grid");

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

  async function setViewMode(mode: ViewMode) {
    viewMode.value = mode;
    await settingsRepo.set(VIEW_MODE_SETTING, mode);
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
  }

  async function fetchMetadata(game: Game) {
    error.value = "";
    fetchingMetadataFor.value = game.id;
    try {
      const metadataProviders = useMetadataProviderStore();
      const meta = await metadataProviders.fetchMetadata(game.title);
      if (meta) {
        await gameRepo.updateMetadata(game.id, meta.description, meta.releaseDate);
        if (meta.genres.length > 0) {
          await tagRepo.addToGame(game.id, meta.genres);
        }
        await refresh();
      } else {
        error.value = `No metadata found for "${game.title}".`;
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

  async function fetchBackgroundArt(game: Game) {
    error.value = "";
    if (!sgdbApiKey.value.trim()) {
      error.value = "Set a SteamGridDB API key first.";
      return;
    }
    fetchingBackgroundFor.value = game.id;
    try {
      const url = await invoke<string | null>("fetch_background_art", {
        apiKey: sgdbApiKey.value.trim(),
        title: game.title,
      });
      if (url) {
        await gameRepo.updateBackgroundArt(game.id, url);
        await refresh();
      } else {
        error.value = `No background art found for "${game.title}".`;
      }
    } catch (e) {
      error.value = String(e);
    } finally {
      fetchingBackgroundFor.value = null;
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

  /**
   * Imports scanned plugin entries. A title matching an existing game merges into that
   * row (executable_path/platform upgraded to the scanned source, id preserved so
   * playtime history and tags carry over); otherwise a new game row is inserted.
   * Games with skip_dedup set are never merge targets - a title match against one of
   * those always inserts a separate new row instead, so both coexist.
   */
  async function importEntries(entries: GameEntry[]): Promise<{ added: number; merged: number }> {
    const titleToGame = new Map(
      games.value.filter((g) => !g.skip_dedup).map((g) => [g.title.toLowerCase(), g]),
    );
    let added = 0;
    let merged = 0;

    for (const entry of entries) {
      const existing = titleToGame.get(entry.title.toLowerCase());
      if (existing) {
        await gameRepo.updateLaunchSource(
          existing.id,
          entry.executablePath,
          entry.platform,
          entry.installDir,
        );
        merged++;
      } else {
        await gameRepo.addWithPlatform(
          entry.title,
          entry.executablePath,
          entry.platform,
          entry.installDir,
        );
        added++;
      }
    }

    if (added > 0 || merged > 0) await refresh();
    return { added, merged };
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
      // A URI (e.g. "steam://rungameid/730") can't be spawned as a process - hand it
      // to the OS's protocol handler instead. We get no process handle this way, so
      // playtime tracking (which relies on waiting for a spawned child to exit) is
      // skipped for these rather than recording a guessed/fake duration.
      //
      // GOG has no registered URI scheme of its own (unlike Steam/Epic) - GalaxyClient.exe
      // is invoked directly with CLI flags instead, so "gog://" is a pseudo-URI used only
      // to route through invoke("launch_gog_game", ...) rather than openUrl().
      const isUri = game.executable_path.includes("://");

      if (game.locale_profile_guid && game.locale_wrapper && !isUri) {
        const appSettings = useAppSettingsStore();
        // Both wrappers relay to the real target exe - we get no confirmed process-exit
        // signal from either (see locale_remulator.rs/locale_emulator.rs), so this falls
        // back to the same folder-based tracking as the URI-launched sources.
        if (game.locale_wrapper === "lr") {
          if (!appSettings.localeRemulatorPath) {
            error.value = "Locale Remulator path not configured (see Settings).";
            return;
          }
          await invoke("launch_via_locale_remulator", {
            lrprocPath: appSettings.localeRemulatorPath,
            profileGuid: game.locale_profile_guid,
            executablePath: game.executable_path,
          });
        } else {
          if (!appSettings.localeEmulatorPath) {
            error.value = "Locale Emulator path not configured (see Settings).";
            return;
          }
          await invoke("launch_via_locale_emulator", {
            leprocPath: appSettings.localeEmulatorPath,
            profileGuid: game.locale_profile_guid,
            executablePath: game.executable_path,
          });
        }
      } else if (game.executable_path.startsWith("gog://")) {
        const gameId = game.executable_path.replace("gog://", "");
        await invoke("launch_gog_game", { gameId });
      } else if (isUri) {
        await openUrl(game.executable_path);
      } else {
        await invoke("launch_game", { gameId: game.id, executablePath: game.executable_path });
        return;
      }

      // URI-launched games (and wrapper-launched ones) get no process handle from the
      // launch call itself, but if we know the install folder (Steam/Epic/GOG scans record
      // it, or - for manual/wrapped entries - the executable's own parent folder), poll for
      // a process running from under that folder instead - see
      // launcher.rs::track_folder_playtime.
      const installDir = game.install_dir ?? parentDir(game.executable_path);
      if (installDir) {
        await invoke("track_folder_playtime", { gameId: game.id, installDir });
      }
    } catch (e) {
      error.value = String(e);
    }
  }

  async function init() {
    sgdbApiKey.value = (await settingsRepo.get(SGDB_API_KEY_SETTING)) ?? "";
    const storedViewMode = await settingsRepo.get(VIEW_MODE_SETTING);
    if (storedViewMode === "grid" || storedViewMode === "list") viewMode.value = storedViewMode;
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
    fetchingCoverFor,
    fetchingMetadataFor,
    fetchingBackgroundFor,
    editingGame,
    viewMode,
    filteredGames,
    refresh,
    toggleTagFilter,
    setViewMode,
    addTag,
    removeTag,
    saveApiKeys,
    fetchMetadata,
    fetchCoverArt,
    fetchBackgroundArt,
    addGame,
    deleteGame,
    importEntries,
    openEdit,
    cancelEdit,
    saveEdit,
    launchGame,
    init,
    dispose,
  };
});
