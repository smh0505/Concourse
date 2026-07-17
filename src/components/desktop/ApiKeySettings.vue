<script setup lang="ts">
import { useLibraryStore } from "../../stores/library";

const library = useLibraryStore();
</script>

<template>
  <form class="settings-form" @submit.prevent="library.saveApiKeys">
    <input v-model="library.sgdbApiKey" type="password" placeholder="SteamGridDB API key" />
    <input v-model="library.igdbClientId" type="password" placeholder="IGDB client ID" />
    <input v-model="library.igdbClientSecret" type="password" placeholder="IGDB client secret" />
    <button type="submit">Save Keys</button>
  </form>
</template>

<style scoped>
.settings-form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.settings-form input {
  flex: 1;
}
</style>
