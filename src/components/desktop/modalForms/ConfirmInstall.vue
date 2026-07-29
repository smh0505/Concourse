<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { computed, ref, watch } from "vue";
import BaseModal from "../BaseModal.vue";
import { RUN_PROGRAMS_CAPABILITY, type PluginPreview } from "../../../plugins/manifest";

// Second step of the "install by URL" flow (see AddPlugin.vue) for every installable plugin
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

// Milestone 13 capability gating - a plugin that declares it runs other programs needs an
// explicit, visible grant before spawn-process/run-and-wait will do anything (see
// wasm_plugins.rs's has_capability). Install stays disabled until this is checked.
const needsRunProgramsGrant = computed(
  () => props.manifest?.capabilities.includes(RUN_PROGRAMS_CAPABILITY) ?? false,
);
const runProgramsGranted = ref(false);
watch(
  () => props.manifest,
  () => {
    runProgramsGranted.value = false;
  },
);

async function onSubmit() {
  if (needsRunProgramsGrant.value && props.manifest) {
    await invoke("grant_plugin_capability", {
      pluginId: props.manifest.id,
      capability: RUN_PROGRAMS_CAPABILITY,
    });
  }
  await props.onConfirm();
  emit("close");
}
</script>

<template>
  <BaseModal
    :open="open"
    :title="manifest ? `Install ${manifest.name}?` : undefined"
    max-width="380px"
    @close="emit('close')"
  >
    <template v-if="manifest" #body>
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
        same file and network access as any program on your system - only install plugins
        from sources you fully trust.
      </p>
      <label v-if="needsRunProgramsGrant" class="permission-grant">
        <input type="checkbox" v-model="runProgramsGranted" />
        This plugin runs other programs on your system (e.g. launching a game). I understand
        and allow this.
      </label>
    </template>
    <template v-if="manifest" #footer>
      <button type="button" @click="emit('close')">Cancel</button>
      <button
        type="button"
        :disabled="installing || (needsRunProgramsGrant && !runProgramsGranted)"
        @click="onSubmit"
      >
        {{ installing ? "Installing..." : "Install" }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
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

.permission-grant {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.8rem;
  margin-top: 0.6rem;
  padding: 0.5rem;
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-sm);
}

.permission-grant input {
  margin-top: 0.15rem;
}
</style>
