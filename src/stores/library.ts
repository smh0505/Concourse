import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

import {
  games as gameRepo,
  playtime as playtimeRepo,
  settings as settingsRepo,
  type Game,
  type GameEditFields,
} from "@/db";
import type { GameEntry } from "@/plugins/types";
import { useMetadataProviderStore } from "./metadataProviders";
import { useWrapperPluginStore } from "./wrapperPlugins";
import { useToastStore } from "./toasts";
import { useTagsStore } from "./tags";
import { useCollectionsStore } from "./collections";

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
  const search = ref("");
  const fetchingMetadataFor = ref<number | null>(null);
  const fetchingBackgroundFor = ref<number | null>(null);
  // Derived from `games` by id rather than a static ref holding a Game object directly - any
  // `refresh()` (metadata fetch, background art fetch, a plugin scan, ...) replaces `games`
  // wholesale with fresh objects from a new DB query, which would otherwise leave a plain ref
  // pointing at a stale, orphaned object that never reflects those updates.
  const viewingGameId = ref<number | null>(null);
  const viewingGame = computed(() =>
    viewingGameId.value !== null ? games.value.find((g) => g.id === viewingGameId.value) ?? null : null,
  );
  const viewMode = ref<ViewMode>("grid");

  let unlistenSessionEnded: UnlistenFn | undefined;

  const filteredGames = computed(() => {
    const tags = useTagsStore();
    const collections = useCollectionsStore();
    const query = search.value.trim().toLowerCase();
    return games.value.filter((game) => {
      const matchesSearch = !query || game.title.toLowerCase().includes(query);
      return matchesSearch && tags.matches(game.id) && collections.matches(game.id);
    });
  });

  async function refresh() {
    games.value = await gameRepo.list();
    await useTagsStore().refresh(games.value);
    await useCollectionsStore().refresh(games.value);
  }

  async function setViewMode(mode: ViewMode) {
    viewMode.value = mode;
    await settingsRepo.set(VIEW_MODE_SETTING, mode);
  }

  /** One button, every enabled metadata provider - a provider can contribute text
   *  (description/releaseDate/genres, e.g. IGDB) and/or art (coverArtUrl/backgroundArtUrl,
   *  e.g. SteamGridDB); metadataProviders.fetchMetadata already merges across all of them,
   *  first-non-null-wins per field, so this just applies whatever came back without needing
   *  to know which provider produced which piece. */
  async function fetchMetadata(game: Game) {
    const toasts = useToastStore();
    fetchingMetadataFor.value = game.id;
    try {
      const metadataProviders = useMetadataProviderStore();
      const meta = await metadataProviders.fetchMetadata(game.title);
      if (meta) {
        await gameRepo.updateMetadata(game.id, meta.description, meta.releaseDate);
        if (meta.genres.length > 0) {
          await useTagsStore().addToGame(game, meta.genres);
        }
        if (meta.coverArtUrl) await gameRepo.updateCoverArt(game.id, meta.coverArtUrl);
        if (meta.backgroundArtUrl) await gameRepo.updateBackgroundArt(game.id, meta.backgroundArtUrl);
        await refresh();
      } else {
        toasts.push(`No metadata found for "${game.title}".`, "error");
      }
    } catch (e) {
      toasts.push(String(e), "error");
    } finally {
      fetchingMetadataFor.value = null;
    }
  }

  /** GameDetail's dedicated "just refresh background art without leaving the page"
   *  button - goes through the same enabled-metadata-provider merge fetchMetadata() does,
   *  applying only backgroundArtUrl, rather than a SteamGridDB-specific command directly. */
  async function fetchBackgroundArt(game: Game) {
    const toasts = useToastStore();
    fetchingBackgroundFor.value = game.id;
    try {
      const metadataProviders = useMetadataProviderStore();
      const meta = await metadataProviders.fetchMetadata(game.title);
      if (meta?.backgroundArtUrl) {
        await gameRepo.updateBackgroundArt(game.id, meta.backgroundArtUrl);
        await refresh();
      } else {
        toasts.push(`No background art found for "${game.title}".`, "error");
      }
    } catch (e) {
      toasts.push(String(e), "error");
    } finally {
      fetchingBackgroundFor.value = null;
    }
  }

  async function addGame(title: string, executablePath: string) {
    try {
      await gameRepo.add(title, executablePath);
      await refresh();
    } catch (e) {
      useToastStore().push(String(e), "error");
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

  function openDetail(game: Game) {
    viewingGameId.value = game.id;
  }

  function closeDetail() {
    viewingGameId.value = null;
  }

  /** Unlike the old edit modal, saving here doesn't close the detail page - it stays open,
   *  showing the just-saved data, matching the "detail page convertible to an editing page"
   *  design (editing is a mode within the page, not a separate flow that exits on save).
   *  `viewingGame` picks up the refreshed data on its own (derived from `games` by id), no
   *  manual re-assignment needed here anymore. */
  async function saveEdit(fields: GameEditFields) {
    if (!viewingGame.value) return;
    await gameRepo.update(viewingGame.value.id, fields);
    await refresh();
  }

  /** Persists an offline-translated title/description alongside the original (Milestone 21's
   *  deferred follow-up) - `locale` records which UI locale this translation is *for*, so a
   *  later locale switch can tell the cached translation is stale without re-calling the engine
   *  just to find out. Title and content translate independently (GameDetail.vue's dropdown),
   *  so each gets its own action rather than one combined save. */
  async function saveTranslatedTitle(gameId: number, translatedTitle: string, locale: string) {
    await gameRepo.updateTranslatedTitle(gameId, translatedTitle, locale);
    await refresh();
  }

  async function saveTranslatedDescription(gameId: number, translatedDescription: string, locale: string) {
    await gameRepo.updateTranslatedDescription(gameId, translatedDescription, locale);
    await refresh();
  }

  async function revokeTranslatedTitle(gameId: number) {
    await gameRepo.clearTranslatedTitle(gameId);
    await refresh();
  }

  async function revokeTranslatedDescription(gameId: number) {
    await gameRepo.clearTranslatedDescription(gameId);
    await refresh();
  }

  async function revokeTranslation(gameId: number) {
    await gameRepo.clearTranslation(gameId);
    await refresh();
  }

  async function launchGame(game: Game) {
    const toasts = useToastStore();
    try {
      // A URI (e.g. "steam://rungameid/730") can't be spawned as a process - hand it to the
      // OS's protocol handler instead. GOG has no registered URI scheme that launches a
      // specific installed game (it does register goggalaxy://, but not documented/used for
      // this); "gog://" is a pseudo-URI that routes to the gog-wasm plugin's own launch()
      // below instead, the same way any other SourcePlugin's launch() would be called.
      const isUri = game.executable_path.includes("://");

      if (game.locale_profile_guid && game.locale_wrapper && !isUri) {
        const wrapperPlugins = useWrapperPluginStore();
        // No wrapper plugin gives a confirmed process-exit signal, so playtime falls back to
        // the same folder-based tracking as URI-launched sources.
        await wrapperPlugins.launch(game.locale_wrapper, game.locale_profile_guid, game.executable_path);
      } else if (game.executable_path.startsWith("gog://")) {
        const gameId = game.executable_path.replace("gog://", "");
        await invoke("wasm_plugin_launch", {
          pluginId: "gog-wasm",
          entry: {
            id: `gog-${gameId}`,
            title: game.title,
            executablePath: game.executable_path,
            platform: game.platform ?? "gog",
            coverArtUrl: game.cover_art_url ?? undefined,
            installDir: game.install_dir ?? undefined,
          },
        });
      } else if (isUri) {
        await openUrl(game.executable_path);
      } else {
        await invoke("launch_game", { gameId: game.id, executablePath: game.executable_path });
        return;
      }

      // No process handle from URI/wrapper launches - poll for a process under the known
      // install folder instead. See launcher.rs::track_folder_playtime.
      const installDir = game.install_dir ?? parentDir(game.executable_path);
      if (installDir) {
        await invoke("track_folder_playtime", { gameId: game.id, installDir });
      }
    } catch (e) {
      toasts.push(String(e), "error");
    }
  }

  async function init() {
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
    search,
    fetchingMetadataFor,
    fetchingBackgroundFor,
    viewingGame,
    viewMode,
    filteredGames,
    refresh,
    setViewMode,
    fetchMetadata,
    fetchBackgroundArt,
    addGame,
    deleteGame,
    importEntries,
    openDetail,
    closeDetail,
    saveEdit,
    saveTranslatedTitle,
    saveTranslatedDescription,
    revokeTranslatedTitle,
    revokeTranslatedDescription,
    revokeTranslation,
    launchGame,
    init,
    dispose,
  };
});
