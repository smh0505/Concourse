<script setup lang="ts">
import { ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";

// Generic install-by-URL modal - not theme-specific. Any plugin kind that grows its own
// install-by-URL capability (source, metadata, etc.) can reuse this by passing its own
// title/label/onInstall instead of duplicating the modal markup. The kind-specific install
// logic (and its own busy state, toasts) stays in that kind's own Pinia store - this
// component only owns the URL input and open/close state.
const props = defineProps<{
  open: boolean;
  title: string;
  label: string;
  placeholder?: string;
  installing: boolean;
  onInstall: (url: string) => Promise<void>;
}>();
const emit = defineEmits<{ close: [] }>();

const url = ref("");

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) url.value = "";
  },
);

async function onSubmit() {
  const trimmed = url.value.trim();
  if (!trimmed) return;
  // onInstall (e.g. pluginInstall.previewInstall) already catches its own errors and toasts -
  // this just fires it and closes.
  await props.onInstall(trimmed);
  emit("close");
}
</script>

<template>
  <BaseModal :open="open" max-width="420px" @close="emit('close')">
    <form class="modal-body" @submit.prevent="onSubmit">
      <h2>{{ title }}</h2>
      <label>
        {{ label }}
        <input v-model="url" :placeholder="placeholder" />
      </label>
      <div class="modal-actions">
        <button type="button" @click="emit('close')">Cancel</button>
        <button type="submit" :disabled="installing || !url.trim()">
          {{ installing ? "Installing..." : "Install" }}
        </button>
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

.modal-body input {
  font-family: inherit;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
