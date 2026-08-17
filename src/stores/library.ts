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
  type UnsharedGame,
} from "@/db";
import type { GameEntry } from "@/plugins/types";
import { i18n } from "@/i18n";
import { useMetadataProviderStore } from "./metadataProviders";
import { useWrapperPluginStore } from "./wrapperPlugins";
import { useToastStore } from "./toasts";
import { useTagsStore, type PillMatchMode } from "./tags";
import { useCollectionsStore } from "./collections";
import { useProfilesStore } from "./profiles";

/** App.vue gates the main library UI behind profile selection (see profiles.ts) - by the time
 *  any of this store's mutating actions can run, a profile is guaranteed active. */
function activeProfileId(): number {
  return useProfilesStore().activeProfileId!;
}

const VIEW_MODE_SETTING = "view_mode";
const SORT_OPTION_SETTING = "sort_option";
// Milestone 39 stretch - resolution switching has to apply before the process spawns (many
// games query the desktop resolution at their own startup), so unlike the other three window
// treatments it's orchestrated from here, not launcher.rs. This key holds the one currently-
// active override (device name + which game set it) so it can be reverted on session end, or
// restored on the next app start if the app/game crashed before that could happen.
const RESOLUTION_RESTORE_SETTING = "pending_resolution_restore";

interface PendingResolutionRestore {
  gameId: number;
  deviceName: string | null;
}

/** Applies `game`'s forced resolution (no-op if not enabled/configured) and records what to
 *  restore. Targets the monitor `game`'s last remembered window position falls on, if
 *  remember_window has one - otherwise the primary display (see resolution_override.rs). */
async function applyForcedResolution(game: Game): Promise<void> {
  if (
    game.force_resolution !== 1 ||
    game.resolution_width == null ||
    game.resolution_height == null ||
    game.resolution_refresh == null
  ) {
    return;
  }
  const hasRememberedPosition = game.remember_window === 1 && game.window_x != null && game.window_y != null;
  const deviceName = await invoke<string | null>("apply_display_mode", {
    x: hasRememberedPosition ? game.window_x : undefined,
    y: hasRememberedPosition ? game.window_y : undefined,
    width: game.resolution_width,
    height: game.resolution_height,
    refresh: game.resolution_refresh,
  });
  await settingsRepo.set(
    RESOLUTION_RESTORE_SETTING,
    JSON.stringify({ gameId: game.id, deviceName } satisfies PendingResolutionRestore),
  );
}

/** Only reverts if the pending record belongs to `gameId` - a second game's session ending first
 *  (force_resolution is a single global slot, not per-game) must not consume it. */
async function revertForcedResolution(gameId: number): Promise<void> {
  const raw = await settingsRepo.get(RESOLUTION_RESTORE_SETTING);
  if (!raw) return;
  const pending = JSON.parse(raw) as PendingResolutionRestore;
  if (pending.gameId !== gameId) return;
  await invoke("revert_display_mode", { deviceName: pending.deviceName ?? undefined });
  await settingsRepo.delete(RESOLUTION_RESTORE_SETTING);
}

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
  platformFilters: string[];
  tagFilters: string[];
  collectionFilters: string[];
  titleQuery: string;
}

/** Pulls platform:/tag:/collection: tokens out of the raw search string, lowercased, leaving
 *  whatever's left as the plain title query - shared by `filteredGames` and the pill sync
 *  watcher below so both agree on what counts as a token. Each kind collects every occurrence
 *  (not just the last) - multiple same-kind pills OR together (see tags.ts's activeFilters). */
function parseSearchTokens(raw: string): ParsedSearchTokens {
  // Quoted values (tag:"Final Fantasy") are pulled out as one token first - a plain \s+ split
  // would break multi-word names in two.
  const tokens: string[] = [];
  const tokenPattern = /(\w+:"[^"]*")|\S+/g;
  for (const match of raw.trim().matchAll(tokenPattern)) {
    tokens.push(match[0]);
  }

  const platformFilters: string[] = [];
  const tagFilters: string[] = [];
  const collectionFilters: string[] = [];
  // Lookup table (prefix -> setter), same dispatch shape as loader.ts's plugin-kind factories -
  // a new token prefix is a new entry, not a new branch.
  const TOKEN_PREFIXES: Record<string, (value: string) => void> = {
    "platform:": (value) => platformFilters.push(value),
    "tag:": (value) => tagFilters.push(value),
    "collection:": (value) => collectionFilters.push(value),
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

  return { platformFilters, tagFilters, collectionFilters, titleQuery: titleTokens.join(" ").toLowerCase() };
}

interface GameSessionEnded {
  game_id: number;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  window_x: number | null;
  window_y: number | null;
  window_width: number | null;
  window_height: number | null;
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
  // Milestone 30 - Admin opening a non-admin game from the Library tab's review section. That
  // game isn't in `games` (which only ever holds the active profile's own list()), so it can't
  // be looked up by id the way viewingGameId is below - the whole object is stashed directly,
  // read-only in GameDetail.vue (see its own isForeign check).
  const viewingForeignGame = ref<UnsharedGame | null>(null);
  const viewingGame = computed(
    () =>
      viewingForeignGame.value ??
      (viewingGameId.value !== null ? games.value.find((g) => g.id === viewingGameId.value) ?? null : null),
  );
  const viewMode = ref<ViewMode>("grid");
  const sortOption = ref<SortOption>("title");
  // game_id -> last playtime_sessions.end_time, for the "recently played" sort - not on `Game`
  // itself (see PlaytimeRepository.getAllLastPlayed's own doc comment), so it's fetched
  // alongside `games` in refresh() and looked up by id here rather than re-queried per sort.
  const lastPlayedByGameId = ref<Map<number, string>>(new Map());

  let unlistenSessionEnded: UnlistenFn | undefined;

  // The search box is the single source of truth for the tag/collection filter - pills (see
  // setSearchToken below) only ever edit `search`; this watcher is the only writer of
  // tags.activeFilters/collections.activeFilters, always mirroring whatever tokens are present.
  watch(
    search,
    (raw) => {
      const { tagFilters, collectionFilters } = parseSearchTokens(raw);
      const tags = useTagsStore();
      const collections = useCollectionsStore();
      const canonicalTags = tags.allTags.filter((t) => tagFilters.includes(t.toLowerCase()));
      tags.setFilters(canonicalTags);
      const canonicalCollections = collections.allCollections.filter((c) =>
        collectionFilters.includes(c.toLowerCase()),
      );
      collections.setFilters(canonicalCollections);
    },
    { immediate: true },
  );

  // Sentinel for games with no real platform - a manually-added game (AddGame.vue ->
  // gameRepo.add()) never touches the platform column, so without this they'd have no pill and
  // be unreachable by any platform: token.
  const MANUAL_PLATFORM = "manual";

  // Platform has no dedicated store (unlike tags/collections) - `Game.platform` is already
  // first-class data, not a separate many-to-many table - so its derived pill list/filter/mode
  // all live here instead.
  const allPlatforms = computed(() => {
    const platforms = new Set(games.value.map((g) => g.platform).filter((p): p is string => !!p));
    if (games.value.some((g) => !g.platform)) platforms.add(MANUAL_PLATFORM);
    return [...platforms].sort();
  });
  const activePlatformFilters = computed(() => {
    const { platformFilters } = parseSearchTokens(search.value);
    return new Set(allPlatforms.value.filter((p) => platformFilters.includes(p.toLowerCase())));
  });
  // "and" is honest but not very useful here specifically - Game.platform is a single value, so
  // 2+ selected platforms under "and" can never match a real game - offered anyway so platform
  // isn't the one pill kind missing the toggle the other two have.
  const platformMatchMode = ref<PillMatchMode>("or");
  function setPlatformMatchMode(mode: PillMatchMode) {
    platformMatchMode.value = mode;
  }

  const filteredGames = computed(() => {
    const tags = useTagsStore();
    const collections = useCollectionsStore();
    const { platformFilters, titleQuery } = parseSearchTokens(search.value);

    const filtered = games.value.filter((game) => {
      const gamePlatform = (game.platform ?? MANUAL_PLATFORM).toLowerCase();
      const matchesPlatform =
        platformFilters.length === 0 ||
        (platformMatchMode.value === "and"
          ? platformFilters.every((p) => p === gamePlatform)
          : platformFilters.includes(gamePlatform));
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
    games.value = await gameRepo.list(activeProfileId());
    lastPlayedByGameId.value = new Map(
      (await playtimeRepo.getAllLastPlayed(activeProfileId())).map((row) => [row.game_id, row.last_played]),
    );
    await useTagsStore().refresh(games.value);
    await useCollectionsStore().refresh(games.value);
  }

  async function setViewMode(mode: ViewMode) {
    viewMode.value = mode;
    await settingsRepo.setForProfile(activeProfileId(), VIEW_MODE_SETTING, mode);
  }

  async function setSortOption(option: SortOption) {
    sortOption.value = option;
    await settingsRepo.setForProfile(activeProfileId(), SORT_OPTION_SETTING, option);
  }

  /** Toggles one tag:/collection:/platform: token in `search` - a pill click is really just
   *  editing the search string, and the watcher above picks it up from there. Only touches the
   *  one token for `value`; other same-kind tokens are left alone, so pills of the same kind
   *  stack instead of replacing each other. */
  function setSearchToken(kind: "tag" | "collection" | "platform", value: string) {
    const prefix = `${kind}:`;
    const targetToken = `${prefix}"${value}"`.toLowerCase();
    const tokens = Array.from(search.value.matchAll(/(\w+:"[^"]*")|\S+/g), (m) => m[0]);
    const alreadyPresent = tokens.some((token) => token.toLowerCase() === targetToken);
    const next = alreadyPresent
      ? tokens.filter((token) => token.toLowerCase() !== targetToken)
      : [...tokens, `${prefix}"${value}"`];
    search.value = next.join(" ");
  }

  /** One button, every enabled metadata provider - a provider can contribute text
   *  (description/releaseDate/genres, e.g. IGDB) and/or art (coverArtUrl/backgroundArtUrl,
   *  e.g. SteamGridDB); metadataProviders.fetchMetadata already merges across all of them,
   *  first-non-null-wins per field, so this just applies whatever came back without needing
   *  to know which provider produced which piece.
   *  `skipGenreTags` - Milestone 30, set by fetchMetadataForForeign below. `tags.addToGame`
   *  always resolves against the *active* profile's own tag namespace (activeProfileId()), not
   *  the game's actual owning profile - fine for Admin's own games, wrong for a foreign one
   *  from the Library tab's review section, where it would silently attach an Admin-owned tag
   *  to another profile's game. Description/cover/background art have no such per-profile
   *  namespace, so those still apply normally either way. */
  async function fetchMetadata(game: Game, skipGenreTags = false) {
    const toasts = useToastStore();
    fetchingMetadataFor.value = game.id;
    try {
      const metadataProviders = useMetadataProviderStore();
      const meta = await metadataProviders.fetchMetadata(game.title);
      if (meta) {
        await gameRepo.updateMetadata(game.id, meta.description, meta.releaseDate);
        if (meta.genres.length > 0 && !skipGenreTags) {
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

  /** Milestone 30 - the review section's own "Fetch Metadata" action (ReviewGameCard.vue and
   *  GameDetail.vue's isForeign branch). Unlike fetchMetadata() above, `game` here was never in
   *  `games` (the active profile's own list), so refresh() re-fetching that array does nothing
   *  useful for it - re-reads this one row instead (with its owner_name join) and reassigns
   *  viewingForeignGame directly if it's the one currently open, so GameDetail picks up the new
   *  cover/description without needing to close and reopen. */
  async function fetchMetadataForForeign(game: UnsharedGame) {
    await fetchMetadata(game, true);
    const fresh = await gameRepo.getUnsharedById(game.id);
    if (fresh && viewingForeignGame.value?.id === game.id) viewingForeignGame.value = fresh;
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
      await gameRepo.add(title, executablePath, activeProfileId());
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
          activeProfileId(),
          entry.installDir,
        );
        added++;
      }
    }

    if (added > 0 || merged > 0) await refresh();
    return { added, merged };
  }

  function openDetail(game: Game) {
    viewingForeignGame.value = null;
    viewingGameId.value = game.id;
  }

  /** Milestone 30 - Admin opening a game from the Library tab's review section. Unlike
   *  openDetail above, GameDetail.vue renders this read-only (see its own isForeign check) -
   *  the game belongs to another profile's tag/collection namespace, so the usual edit/tag/
   *  collection actions aren't safe to run against it from here. */
  function openForeignDetail(game: UnsharedGame) {
    viewingGameId.value = null;
    viewingForeignGame.value = game;
  }

  function closeDetail() {
    viewingGameId.value = null;
    viewingForeignGame.value = null;
  }

  /** Unlike the old edit modal, saving here doesn't close the detail page - it stays open,
   *  showing the just-saved data, matching the "detail page convertible to an editing page"
   *  design (editing is a mode within the page, not a separate flow that exits on save).
   *  `viewingGame` picks up the refreshed data on its own (derived from `games` by id), no
   *  manual re-assignment needed here anymore. Never reachable for a foreign game - GameDetail
   *  hides the edit form entirely in that case - but guarded anyway since this writes directly. */
  async function saveEdit(fields: GameEditFields) {
    if (!viewingGame.value || viewingForeignGame.value) return;
    await gameRepo.update(viewingGame.value.id, fields);
    // Registry write, not a DB column read-back - keyed by the (possibly just-edited)
    // executable_path itself, applied once here rather than on every launch like the
    // session-lifecycle treatments (pseudo_fullscreen/always_on_top/remember_window).
    await invoke("set_dpi_override", {
      executablePath: fields.executable_path,
      mode: fields.dpi_override,
    });
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
      await applyForcedResolution(game);

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
        await invoke("launch_game", {
          gameId: game.id,
          executablePath: game.executable_path,
          title: game.title,
          pseudoFullscreen: game.pseudo_fullscreen === 1,
          alwaysOnTop: game.always_on_top === 1,
          rememberWindow: game.remember_window === 1,
          windowX: game.window_x,
          windowY: game.window_y,
          windowWidth: game.window_width,
          windowHeight: game.window_height,
        });
        return;
      }

      // No process handle from URI/wrapper launches - poll for a process under the known
      // install folder instead. See launcher.rs::track_folder_playtime.
      const installDir = game.install_dir ?? parentDir(game.executable_path);
      if (installDir) {
        await invoke("track_folder_playtime", {
          gameId: game.id,
          installDir,
          title: game.title,
          pseudoFullscreen: game.pseudo_fullscreen === 1,
          alwaysOnTop: game.always_on_top === 1,
          rememberWindow: game.remember_window === 1,
          windowX: game.window_x,
          windowY: game.window_y,
          windowWidth: game.window_width,
          windowHeight: game.window_height,
        });
      }
    } catch (e) {
      toasts.push(String(e), "error");
    }
  }

  async function init() {
    // Crash-safety net: no session survives an app restart, so any pending resolution override
    // left over from before (app or game crashed before game-session-ended could revert it) is
    // definitely stale - restore it unconditionally rather than waiting for a session that will
    // never end.
    const pendingResolutionRestore = await settingsRepo.get(RESOLUTION_RESTORE_SETTING);
    if (pendingResolutionRestore) {
      try {
        const pending = JSON.parse(pendingResolutionRestore) as PendingResolutionRestore;
        await invoke("revert_display_mode", { deviceName: pending.deviceName ?? undefined });
      } finally {
        await settingsRepo.delete(RESOLUTION_RESTORE_SETTING);
      }
    }

    const storedViewMode = await settingsRepo.getForProfile(activeProfileId(), VIEW_MODE_SETTING);
    if (storedViewMode === "grid" || storedViewMode === "list") viewMode.value = storedViewMode;
    const storedSortOption = await settingsRepo.getForProfile(activeProfileId(), SORT_OPTION_SETTING);
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
      const { game_id, start_time, end_time, duration_seconds, window_x, window_y, window_width, window_height } =
        event.payload;
      await playtimeRepo.recordSession(game_id, start_time, end_time, duration_seconds);
      // Only set when remember_window was on and the window was still findable at session end -
      // see launcher.rs's GameSessionEnded.
      if (window_x !== null && window_y !== null && window_width !== null && window_height !== null) {
        await gameRepo.updateWindowRect(game_id, window_x, window_y, window_width, window_height);
      }
      await revertForcedResolution(game_id);
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
    viewingForeignGame,
    viewMode,
    sortOption,
    filteredGames,
    allPlatforms,
    activePlatformFilters,
    platformMatchMode,
    setPlatformMatchMode,
    refresh,
    setViewMode,
    setSortOption,
    setSearchToken,
    fetchMetadata,
    fetchMetadataForForeign,
    fetchBackgroundArt,
    addGame,
    deleteGame,
    deleteGames,
    importEntries,
    openDetail,
    openForeignDetail,
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
