<script setup lang="ts">
import BaseModal from "./BaseModal.vue";
import type { PluginPreview } from "../../plugins/manifest";

// Second step of the "install by URL" flow (see AddPluginModal) for every installable plugin
// kind - shows what was actually fetched (id/name/version/kind) before committing to the real
// download. The risk warning below only applies to kinds that run code (source plugins); a
// data-only theme manifest is just cssVariables, so it gets a neutral note instead.
const props = defineProps<{
  open: boolean;
  manifest: PluginPreview | null;
  installing: boolean;
  onConfirm: () => Promise<void>;
}>();
const emit = defineEmits<{ close: [] }>();

async function onSubmit() {
  await props.onConfirm();
  emit("close");
}
</script>

<template>
  <BaseModal :open="open" max-width="380px" @close="emit('close')">
    <div v-if="manifest" class="modal-body">
      <h2>Install {{ manifest.name }}?</h2>
      <dl class="plugin-info">
        <dt>ID</dt>
        <dd>{{ manifest.id }}</dd>
        <dt>Version</dt>
        <dd>{{ manifest.version }}</dd>
        <dt>Kind</dt>
        <dd>{{ manifest.kind }}</dd>
      </dl>
      <p v-if="manifest.kind === 'theme'" class="hint">
        This installs a data-only theme (colors/CSS variables only, no code).
      </p>
      <p v-else class="hint">
        This downloads and runs code from the URL you provided. It currently runs with the
        same file, process, and network access as any program on your system - only install
        plugins from sources you fully trust.
      </p>
      <div class="modal-actions">
        <button type="button" @click="emit('close')">Cancel</button>
        <button type="button" :disabled="installing" @click="onSubmit">
          {{ installing ? "Installing..." : "Install" }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.plugin-info {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.75rem;
  font-size: 0.85rem;
  margin: 0;
}

.plugin-info dt {
  opacity: 0.7;
}

.plugin-info dd {
  margin: 0;
}

.hint {
  font-size: 0.75rem;
  opacity: 0.8;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
