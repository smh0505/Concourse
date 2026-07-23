<script setup lang="ts">
import { ref } from "vue";
import { useLibraryStore } from "../../stores/library";
import BaseModal from "./BaseModal.vue";

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
  <BaseModal :open="open" max-width="380px" @close="emit('close')">
    <form class="modal-body" @submit.prevent="onSubmit">
      <h2>Add Game</h2>
      <label>
        Title
        <input v-model="title" placeholder="Title" />
      </label>
      <label>
        Executable path
        <input v-model="executablePath" placeholder="Executable path" />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="modal-actions">
        <button type="button" @click="emit('close')">Cancel</button>
        <button type="submit">Add Game</button>
      </div>
    </form>
  </BaseModal>
</template>

<style scoped>
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.modal-body label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  text-align: left;
}

.error {
  color: var(--color-danger);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
