<script setup lang="ts">
import { ref } from "vue";
import { useLibraryStore } from "../../stores/library";

const library = useLibraryStore();

const title = ref("");
const executablePath = ref("");
const error = ref("");

async function onSubmit() {
  if (!title.value.trim() || !executablePath.value.trim()) {
    error.value = "Title and executable path are required.";
    return;
  }
  error.value = "";
  await library.addGame(title.value.trim(), executablePath.value.trim());
  title.value = "";
  executablePath.value = "";
}
</script>

<template>
  <form class="add-form" @submit.prevent="onSubmit">
    <input v-model="title" placeholder="Title" />
    <input v-model="executablePath" placeholder="Executable path" />
    <button type="submit">Add Game</button>
  </form>
  <p v-if="error" class="error">{{ error }}</p>
</template>

<style scoped>
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
</style>
