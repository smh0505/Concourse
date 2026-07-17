<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  addGame,
  addTagsToGame,
  deleteGame,
  getAllTags,
  getSetting,
  getTagsForGame,
  listGames,
  recordPlaytimeSession,
  removeTagFromGame,
  setSetting,
  updateCoverArt,
  updateGame,
  updateMetadata,
  type Game,
  type GameEditFields,
} from "./db";

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

const games = ref<Game[]>([]);
const gameTags = ref<Record<number, string[]>>({});
const allTags = ref<string[]>([]);
const newTagInput = ref<Record<number, string>>({});
const search = ref("");
const activeTagFilter = ref<string | null>(null);
const title = ref("");
const executablePath = ref("");
const error = ref("");
const sgdbApiKey = ref("");
const igdbClientId = ref("");
const igdbClientSecret = ref("");
const fetchingCoverFor = ref<number | null>(null);
const fetchingMetadataFor = ref<number | null>(null);
const editingGame = ref<Game | null>(null);
const editForm = ref<GameEditFields>({
  title: "",
  executable_path: "",
  platform: "",
  cover_art_url: "",
  background_art_url: "",
  description: "",
  release_date: "",
});

async function refresh() {
  games.value = await listGames();
  const tagEntries = await Promise.all(
    games.value.map(async (g) => [g.id, await getTagsForGame(g.id)] as const),
  );
  gameTags.value = Object.fromEntries(tagEntries);
  allTags.value = await getAllTags();
}

const filteredGames = computed(() => {
  const query = search.value.trim().toLowerCase();
  return games.value.filter((game) => {
    const matchesSearch = !query || game.title.toLowerCase().includes(query);
    const matchesTag =
      !activeTagFilter.value || gameTags.value[game.id]?.includes(activeTagFilter.value);
    return matchesSearch && matchesTag;
  });
});

function onToggleTagFilter(tag: string) {
  activeTagFilter.value = activeTagFilter.value === tag ? null : tag;
}

async function onAddTag(game: Game) {
  const name = (newTagInput.value[game.id] ?? "").trim();
  if (!name) return;
  await addTagsToGame(game.id, [name]);
  newTagInput.value[game.id] = "";
  await refresh();
}

async function onRemoveTag(game: Game, tag: string) {
  await removeTagFromGame(game.id, tag);
  await refresh();
}

async function onSaveApiKey() {
  await setSetting(SGDB_API_KEY_SETTING, sgdbApiKey.value.trim());
  await setSetting(IGDB_CLIENT_ID_SETTING, igdbClientId.value.trim());
  await setSetting(IGDB_CLIENT_SECRET_SETTING, igdbClientSecret.value.trim());
}

async function onFetchMetadata(game: Game) {
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
      await updateMetadata(game.id, meta.description, meta.release_date);
      if (meta.genres.length > 0) {
        await addTagsToGame(game.id, meta.genres);
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

async function onFetchCoverArt(game: Game) {
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
      await updateCoverArt(game.id, url);
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

async function onAddGame() {
  error.value = "";
  if (!title.value.trim() || !executablePath.value.trim()) {
    error.value = "Title and executable path are required.";
    return;
  }
  try {
    await addGame(title.value.trim(), executablePath.value.trim());
    title.value = "";
    executablePath.value = "";
    await refresh();
  } catch (e) {
    error.value = String(e);
  }
}

async function onDeleteGame(id: number) {
  await deleteGame(id);
  await refresh();
}

function onOpenEdit(game: Game) {
  editingGame.value = game;
  editForm.value = {
    title: game.title,
    executable_path: game.executable_path,
    platform: game.platform ?? "",
    cover_art_url: game.cover_art_url ?? "",
    background_art_url: game.background_art_url ?? "",
    description: game.description ?? "",
    release_date: game.release_date ?? "",
  };
}

function onCancelEdit() {
  editingGame.value = null;
}

async function onSaveEdit() {
  if (!editingGame.value) return;
  error.value = "";
  if (!editForm.value.title.trim() || !editForm.value.executable_path.trim()) {
    error.value = "Title and executable path are required.";
    return;
  }
  const fields: GameEditFields = {
    title: editForm.value.title.trim(),
    executable_path: editForm.value.executable_path.trim(),
    platform: editForm.value.platform?.trim() || null,
    cover_art_url: editForm.value.cover_art_url?.trim() || null,
    background_art_url: editForm.value.background_art_url?.trim() || null,
    description: editForm.value.description?.trim() || null,
    release_date: editForm.value.release_date?.trim() || null,
  };
  await updateGame(editingGame.value.id, fields);
  editingGame.value = null;
  await refresh();
}

async function onLaunchGame(game: Game) {
  error.value = "";
  try {
    await invoke("launch_game", { gameId: game.id, executablePath: game.executable_path });
  } catch (e) {
    error.value = String(e);
  }
}

let unlistenSessionEnded: UnlistenFn | undefined;

onMounted(async () => {
  sgdbApiKey.value = (await getSetting(SGDB_API_KEY_SETTING)) ?? "";
  igdbClientId.value = (await getSetting(IGDB_CLIENT_ID_SETTING)) ?? "";
  igdbClientSecret.value = (await getSetting(IGDB_CLIENT_SECRET_SETTING)) ?? "";
  await refresh();

  unlistenSessionEnded = await listen<GameSessionEnded>("game-session-ended", async (event) => {
    const { game_id, start_time, end_time, duration_seconds } = event.payload;
    await recordPlaytimeSession(game_id, start_time, end_time, duration_seconds);
    await refresh();
  });
});

onUnmounted(() => {
  unlistenSessionEnded?.();
});
</script>

<template>
  <main class="container">
    <h1>Game Library</h1>

    <form class="add-form" @submit.prevent="onSaveApiKey">
      <input
        v-model="sgdbApiKey"
        type="password"
        placeholder="SteamGridDB API key"
      />
      <input
        v-model="igdbClientId"
        type="password"
        placeholder="IGDB client ID"
      />
      <input
        v-model="igdbClientSecret"
        type="password"
        placeholder="IGDB client secret"
      />
      <button type="submit">Save Keys</button>
    </form>

    <form class="add-form" @submit.prevent="onAddGame">
      <input v-model="title" placeholder="Title" />
      <input v-model="executablePath" placeholder="Executable path" />
      <button type="submit">Add Game</button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="filters">
      <input v-model="search" class="search" placeholder="Search by title..." />
      <div class="tags" v-if="allTags.length">
        <span
          class="tag filter-tag"
          :class="{ active: activeTagFilter === tag }"
          v-for="tag in allTags"
          :key="tag"
          @click="onToggleTagFilter(tag)"
        >
          {{ tag }}
        </span>
      </div>
    </div>

    <div class="grid">
      <div class="card" v-for="game in filteredGames" :key="game.id">
        <img v-if="game.cover_art_url" class="cover" :src="game.cover_art_url" :alt="game.title" />
        <div v-else class="cover-placeholder">{{ game.title.charAt(0).toUpperCase() }}</div>
        <div class="card-title">{{ game.title }}</div>
        <p v-if="game.description" class="description">{{ game.description }}</p>
        <p v-if="game.release_date" class="release-date">{{ game.release_date }}</p>
        <p class="playtime">{{ Math.round(game.total_playtime / 60) }} min played</p>
        <div class="tags" v-if="gameTags[game.id]?.length">
          <span class="tag" v-for="tag in gameTags[game.id]" :key="tag">
            {{ tag }}
            <button class="tag-remove" @click="onRemoveTag(game, tag)">&times;</button>
          </span>
        </div>
        <form class="add-tag-form" @submit.prevent="onAddTag(game)">
          <input v-model="newTagInput[game.id]" placeholder="Add tag" />
          <button type="submit">+</button>
        </form>
        <button class="play" @click="onLaunchGame(game)">Play</button>
        <button
          class="fetch-cover"
          :disabled="fetchingCoverFor === game.id"
          @click="onFetchCoverArt(game)"
        >
          {{ fetchingCoverFor === game.id ? "Fetching..." : "Fetch Cover Art" }}
        </button>
        <button
          class="fetch-metadata"
          :disabled="fetchingMetadataFor === game.id"
          @click="onFetchMetadata(game)"
        >
          {{ fetchingMetadataFor === game.id ? "Fetching..." : "Fetch Metadata" }}
        </button>
        <button class="edit" @click="onOpenEdit(game)">Edit</button>
        <button class="remove" @click="onDeleteGame(game.id)">Remove</button>
      </div>
      <p v-if="filteredGames.length === 0" class="empty">No games match.</p>
    </div>

    <div v-if="editingGame" class="modal-backdrop" @click.self="onCancelEdit">
      <form class="modal" @submit.prevent="onSaveEdit">
        <h2>Edit {{ editingGame.title }}</h2>
        <label>
          Title
          <input v-model="editForm.title" />
        </label>
        <label>
          Executable path
          <input v-model="editForm.executable_path" />
        </label>
        <label>
          Platform
          <input v-model="editForm.platform" />
        </label>
        <label>
          Cover art URL
          <input v-model="editForm.cover_art_url" />
        </label>
        <label>
          Background art URL
          <input v-model="editForm.background_art_url" />
        </label>
        <label>
          Release date
          <input v-model="editForm.release_date" placeholder="YYYY-MM-DD" />
        </label>
        <label>
          Description
          <textarea v-model="editForm.description" rows="4"></textarea>
        </label>
        <div class="modal-actions">
          <button type="button" @click="onCancelEdit">Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
    </div>
  </main>
</template>

<style scoped>
.container {
  margin: 0 auto;
  max-width: 960px;
  padding: 2rem 1.5rem;
}

.add-form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.add-form input {
  flex: 1;
}

.error {
  color: #d33;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
}

.card {
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.cover,
.cover-placeholder {
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 4px;
}

.cover {
  object-fit: cover;
}

.cover-placeholder {
  background: #444;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
}

.fetch-cover,
.fetch-metadata {
  font-size: 0.8rem;
}

.description {
  font-size: 0.75rem;
  opacity: 0.8;
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.release-date,
.playtime {
  font-size: 0.75rem;
  opacity: 0.6;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  justify-content: center;
}

.tag {
  font-size: 0.7rem;
  background: #6663;
  border-radius: 3px;
  padding: 0.1rem 0.4rem;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.tag-remove {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.8rem;
  line-height: 1;
  padding: 0;
  color: inherit;
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.search {
  width: 100%;
}

.filter-tag {
  cursor: pointer;
}

.filter-tag.active {
  background: #396cd8;
  color: #fff;
}

.add-tag-form {
  display: flex;
  gap: 0.25rem;
  width: 100%;
}

.add-tag-form input {
  flex: 1;
  font-size: 0.75rem;
}

.add-tag-form button {
  font-size: 0.75rem;
}

.card-title {
  font-weight: 600;
  text-align: center;
}

.edit,
.remove {
  font-size: 0.8rem;
}

.empty {
  grid-column: 1 / -1;
  opacity: 0.7;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.modal {
  background: #f6f6f6;
  color: #0f0f0f;
  border-radius: 8px;
  padding: 1.5rem;
  width: 90%;
  max-width: 420px;
  max-height: 85vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.modal label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  text-align: left;
}

.modal input,
.modal textarea {
  font-family: inherit;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

@media (prefers-color-scheme: dark) {
  .modal {
    background: #2f2f2f;
    color: #f6f6f6;
  }
}
</style>

<style>
:root {
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  color: #0f0f0f;
  background-color: #f6f6f6;
}

@media (prefers-color-scheme: dark) {
  :root {
    color: #f6f6f6;
    background-color: #2f2f2f;
  }
}
</style>
