<script setup lang="ts">
import { ref } from "vue";
import { useLibraryStore } from "../../../stores/library";
import BaseModal from "../BaseModal.vue";

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

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
  emit("close");
}
</script>

<template>
  <BaseModal :open="open" title="Add Game" max-width="380px" @close="emit('close')">
    <template #body>
      <form class="add-game-form" @submit.prevent="onSubmit">
        <label>
          Title
          <input v-model="title" placeholder="Title" />
        </label>
        <label>
          Executable path
          <input v-model="executablePath" placeholder="Executable path" />
        </label>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </template>
    <template #footer>
      <button type="button" @click="emit('close')">Cancel</button>
      <button type="button" @click="onSubmit">Add Game</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.add-game-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.add-game-form label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  text-align: left;
}

.error {
  color: var(--color-danger);
}
</style>
