<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { computed, ref, watch } from "vue";
import BaseModal from "../BaseModal.vue";
import { RUN_PROGRAMS_CAPABILITY, type PathScope, type PluginPreview } from "../../../plugins/manifest";

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

// Milestone 13 path/URL allowlisting is entirely self-declared by the plugin's own manifest -
// the host enforces it either way, but nothing surfaced it to the person deciding whether to
// install at all. Visibility only (not itself an enforcement step, unlike the checkbox above) -
// a malicious author can declare whatever they want here, this just stops it being invisible.
function formatPathScope(scope: PathScope): string {
  return scope.type === "registry"
    ? `Registry: ${scope.hive}\\${scope.prefix}`
    : `Files under: ${scope.prefix}`;
}

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
      <template v-else>
        <p class="hint">
          This downloads and runs code from the URL you provided. File/registry/network access
          is scoped to what it declares below (host-enforced) - but that scope is self-declared
          by the plugin's own author, not verified against what the code actually does. Only
          install plugins from sources you fully trust.
        </p>
        <div v-if="manifest.pathScopes.length || manifest.httpScopes.length" class="scope-list">
          <p class="scope-list-title">Declares access to:</p>
          <ul>
            <li v-for="(scope, i) in manifest.pathScopes" :key="`path-${i}`">
              {{ formatPathScope(scope) }}
            </li>
            <li v-for="host in manifest.httpScopes" :key="`http-${host}`">Network: {{ host }}</li>
          </ul>
        </div>
      </template>
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

.scope-list {
  margin-top: 0.5rem;
  font-size: 0.75rem;
}

.scope-list-title {
  margin: 0 0 0.2rem;
  opacity: 0.8;
}

.scope-list ul {
  margin: 0;
  padding-left: 1.1rem;
}

.scope-list li {
  font-family: monospace;
  word-break: break-all;
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
