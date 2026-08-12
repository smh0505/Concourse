import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
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
import { i18n } from "@/i18n";
import { useMetadataProviderStore } from "./metadataProviders";
import { useWrapperPluginStore } from "./wrapperPlugins";
import { useToastStore } from "./toasts";
import { useTagsStore } from "./tags";
import { useCollectionsStore } from "./collections";

const VIEW_MODE_SETTING = "view_mode";
const SORT_OPTION_SETTING = "sort_option";

/** Parent folder of a real filesystem executable path; null for URIs, which have none. */
function parentDir(executablePath: string): string | null {
  if (executablePath.includes("://")) return null;
  const lastSeparator = Math.max(executablePath.lastIndexOf("\\"), executablePath.lastIndexOf("/"));
  return lastSeparator > 0 ? executablePath.slice(0, lastSeparator) : null;
}

export type ViewMode = "grid" | "list";
export type SortOption = "title" | "recentlyPlayed" | "mostPlayed" | "recentlyAdded";

/** Strips a single pair of wrapping double-quotes, if present - used for multi-word tag:/
 *  collection: token values (`tag:"Final Fantasy"`). */
function stripQuotes(value: string): string {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

interface ParsedSearchTokens {
  platformFilter: string | null;
  tagFilter: string | null;
  collectionFilter: string | null;
  titleQuery: string;
}

/** Pulls platform:/tag:/collection: tokens out of the raw search string, lowercased, leaving
 *  whatever's left as the plain title query - shared by `filteredGames` (the actual filtering)
 *  and the tag/collection-pill sync watcher below (so a typed token also highlights its pill),
 *  so the two never drift out of sync on what counts as a token. */
function parseSearchTokens(raw: string): ParsedSearchTokens {
  // Tag/collection names can contain spaces ("Co-op" is fine unquoted, but "Final Fantasy"
  // isn't) - a plain \s+ split would break those into two tokens. Quoted values
  // (tag:"Final Fantasy") are pulled out first as their own tokens before falling back to a
  // whitespace split for everything else.
  const tokens: string[] = [];
  const tokenPattern = /(\w+:"[^"]*")|\S+/g;
  for (const match of raw.trim().matchAll(tokenPattern)) {
    tokens.push(match[0]);
  }

  let platformFilter: string | null = null;
  let tagFilter: string | null = null;
  let collectionFilter: string | null = null;
  // Lookup table (prefix -> setter) instead of an if/else-if chain per prefix - same dispatch
  // shape as loader.ts's WASM_PLUGIN_FACTORIES/DATA_PLUGIN_FACTORIES, adding a fourth token
  // prefix here is a new entry, not a new branch.
  const TOKEN_PREFIXES: Record<string, (value: string) => void> = {
    "platform:": (value) => (platformFilter = value),
    "tag:": (value) => (tagFilter = value),
    "collection:": (value) => (collectionFilter = value),
  };
  const titleTokens: string[] = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    const prefix = Object.keys(TOKEN_PREFIXES).find((p) => lower.startsWith(p));
    if (prefix) {
      TOKEN_PREFIXES[prefix](stripQuotes(token.slice(prefix.length)).toLowerCase());
    } else {
      titleTokens.push(token);
    }
  }

  return { platformFilter, tagFilter, collectionFilter, titleQuery: titleTokens.join(" ").toLowerCase() };
}

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
  const sortOption = ref<SortOption>("title");
  // game_id -> last playtime_sessions.end_time, for the "recently played" sort - not on `Game`
  // itself (see PlaytimeRepository.getAllLastPlayed's own doc comment), so it's fetched
  // alongside `games` in refresh() and looked up by id here rather than re-queried per sort.
  const lastPlayedByGameId = ref<Map<number, string>>(new Map());

  let unlistenSessionEnded: UnlistenFn | undefined;

  // The search box is the single source of truth for the tag/collection filter - GameFilters.vue's
  // pills no longer call tags.toggleFilter()/collections.toggleFilter() directly; clicking one
  // instead adds/removes a tag:"name"/collection:"name" token from `search` (see
  // GameFilters.vue's togglePillToken), and this watcher is the only place that ever writes
  // tags.activeFilter/collections.activeFilter - always mirroring the token exactly (set when
  // present, cleared when absent) rather than the old additive-only "clicking a pill never
  // touches the box" split. One mechanism computing the filter instead of two that could drift
  // out of sync with each other was the whole point - a pill's highlighted state now always
  // matches what's literally sitting in the search box, nothing to reconcile.
  watch(
    search,
    (raw) => {
      const { tagFilter, collectionFilter } = parseSearchTokens(raw);
      const tags = useTagsStore();
      const collections = useCollectionsStore();
      const canonicalTag = tagFilter ? tags.allTags.find((t) => t.toLowerCase() === tagFilter) : null;
      tags.setFilter(canonicalTag ?? null);
      const canonicalCollection = collectionFilter
        ? collections.allCollections.find((c) => c.toLowerCase() === collectionFilter)
        : null;
      collections.setFilter(canonicalCollection ?? null);
    },
    { immediate: true },
  );

  const filteredGames = computed(() => {
    const tags = useTagsStore();
    const collections = useCollectionsStore();
    // tag:/collection: tokens now drive the Tags/Collections panel's own pill activeFilter
    // directly (see the sync watcher below, which highlights the matching pill), so filtering
    // by them here just means going through tags.matches()/collections.matches() like a normal
    // pill click would - no separate token-based AND-filter needed alongside it. platform: has
    // no pill equivalent, so it's still matched directly here.
    const { platformFilter, titleQuery } = parseSearchTokens(search.value);

    const filtered = games.value.filter((game) => {
      const matchesPlatform =
        !platformFilter || (game.platform ?? "").toLowerCase() === platformFilter;
      const matchesSearch = !titleQuery || game.title.toLowerCase().includes(titleQuery);
      return matchesPlatform && matchesSearch && tags.matches(game.id) && collections.matches(game.id);
    });

    // gameRepo.list() itself already returns title-A-Z order, so "title" needs no re-sort here
    // (and skipping it keeps the default, most-common case cheapest) - the other three all need
    // a real comparator. "recentlyAdded" uses id as a proxy for insertion order (autoincrement,
    // no separate created-at column) rather than adding one just for this.
    if (sortOption.value === "title") return filtered;
    const sorted = [...filtered];
    if (sortOption.value === "mostPlayed") {
      sorted.sort((a, b) => b.total_playtime - a.total_playtime);
    } else if (sortOption.value === "recentlyAdded") {
      sorted.sort((a, b) => b.id - a.id);
    } else if (sortOption.value === "recentlyPlayed") {
      sorted.sort((a, b) => {
        const aPlayed = lastPlayedByGameId.value.get(a.id);
        const bPlayed = lastPlayedByGameId.value.get(b.id);
        if (!aPlayed && !bPlayed) return 0;
        if (!aPlayed) return 1; // never-played games sort after any played game
        if (!bPlayed) return -1;
        return bPlayed.localeCompare(aPlayed);
      });
    }
    return sorted;
  });

  async function refresh() {
    games.value = await gameRepo.list();
    lastPlayedByGameId.value = new Map(
      (await playtimeRepo.getAllLastPlayed()).map((row) => [row.game_id, row.last_played]),
    );
    await useTagsStore().refresh(games.value);
    await useCollectionsStore().refresh(games.value);
  }

  async function setViewMode(mode: ViewMode) {
    viewMode.value = mode;
    await settingsRepo.set(VIEW_MODE_SETTING, mode);
  }

  async function setSortOption(option: SortOption) {
    sortOption.value = option;
    await settingsRepo.set(SORT_OPTION_SETTING, option);
  }

  /** Adds/replaces/removes a tag:/collection: token in `search` - the write half of the search
   *  box being the single source of truth for the tag/collection filter (see the sync watcher
   *  above). GameFilters.vue's pills call this instead of tags.toggleFilter()/
   *  collections.toggleFilter() directly, so a pill click is really just editing the search
   *  string; the watcher picks the change up and updates activeFilter from there, same as if
   *  the user had typed the token by hand. `value: null` removes the token (drops it from the
   *  search string entirely) rather than leaving an empty tag:"" behind. */
  function setSearchToken(kind: "tag" | "collection", value: string | null) {
    const prefix = `${kind}:`;
    const tokens = Array.from(search.value.matchAll(/(\w+:"[^"]*")|\S+/g), (m) => m[0]);
    const kept = tokens.filter((token) => !token.toLowerCase().startsWith(prefix));
    if (value) kept.push(`${prefix}"${value}"`);
    search.value = kept.join(" ");
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
        toasts.push(i18n.global.t("library.noMetadataFound", { title: game.title }), "error");
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
        toasts.push(i18n.global.t("library.noBackgroundArtFound", { title: game.title }), "error");
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

  /** Milestone 25 batch ops - loops gameRepo.delete rather than calling deleteGame per id,
   *  which would re-run refresh()'s full games+lastPlayed+tags+collections reload once per
   *  game instead of once for the whole batch. */
  async function deleteGames(ids: number[]) {
    for (const id of ids) await gameRepo.delete(id);
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

  /** `locale` records which UI locale this translation is *for*, so a later locale switch can
   *  tell it's stale without re-calling the engine. */
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

  /** Persists GameDetail.vue's "show" toggle state per game. */
  async function setShowTranslated(gameId: number, showTitle: boolean, showDescription: boolean) {
    await gameRepo.updateShowTranslated(gameId, showTitle, showDescription);
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
      } else if (game.executable_path.startsWith("xbox://")) {
        // Same pseudo-URI reasoning as GOG above - xbox-wasm's launch() decodes this into a
        // shell:appsFolder invocation. Only the family name (before "!") feeds `id`, matching
        // the plugin's own scan() id shape.
        const familyName = game.executable_path.replace("xbox://", "").split("!")[0];
        await invoke("wasm_plugin_launch", {
          pluginId: "xbox-wasm",
          entry: {
            id: `xbox-${familyName}`,
            title: game.title,
            executablePath: game.executable_path,
            platform: game.platform ?? "xbox",
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
    const storedSortOption = await settingsRepo.get(SORT_OPTION_SETTING);
    if (
      storedSortOption === "title" ||
      storedSortOption === "recentlyPlayed" ||
      storedSortOption === "mostPlayed" ||
      storedSortOption === "recentlyAdded"
    ) {
      sortOption.value = storedSortOption;
    }
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
    sortOption,
    filteredGames,
    refresh,
    setViewMode,
    setSortOption,
    setSearchToken,
    fetchMetadata,
    fetchBackgroundArt,
    addGame,
    deleteGame,
    deleteGames,
    importEntries,
    openDetail,
    closeDetail,
    saveEdit,
    saveTranslatedTitle,
    saveTranslatedDescription,
    revokeTranslatedTitle,
    revokeTranslatedDescription,
    revokeTranslation,
    setShowTranslated,
    launchGame,
    init,
    dispose,
  };
});
