<script setup lang="ts">
import { onMounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { addGame, deleteGame, listGames, type Game } from "./db";

const games = ref<Game[]>([]);
const title = ref("");
const executablePath = ref("");
const error = ref("");

async function refresh() {
  games.value = await listGames();
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

async function onLaunchGame(game: Game) {
  error.value = "";
  try {
    await invoke("launch_game", { executablePath: game.executable_path });
  } catch (e) {
    error.value = String(e);
  }
}

onMounted(refresh);
</script>

<template>
  <main class="container">
    <h1>Game Library</h1>

    <form class="add-form" @submit.prevent="onAddGame">
      <input v-model="title" placeholder="Title" />
      <input v-model="executablePath" placeholder="Executable path" />
      <button type="submit">Add Game</button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="grid">
      <div class="card" v-for="game in games" :key="game.id">
        <div class="cover-placeholder">{{ game.title.charAt(0).toUpperCase() }}</div>
        <div class="card-title">{{ game.title }}</div>
        <button class="play" @click="onLaunchGame(game)">Play</button>
        <button class="remove" @click="onDeleteGame(game.id)">Remove</button>
      </div>
      <p v-if="games.length === 0" class="empty">No games yet. Add one above.</p>
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

.cover-placeholder {
  width: 100%;
  aspect-ratio: 3 / 4;
  background: #444;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  border-radius: 4px;
}

.card-title {
  font-weight: 600;
  text-align: center;
}

.remove {
  font-size: 0.8rem;
}

.empty {
  grid-column: 1 / -1;
  opacity: 0.7;
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
