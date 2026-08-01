<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import BaseModal from "../BaseModal.vue";
import { usePluginInstallStore } from "../../../stores/pluginInstall";

// Generic install-by-URL modal - not theme-specific. Any plugin kind that grows its own
// install-by-URL capability (source, metadata, etc.) can reuse this by passing its own
// title/label/onInstall instead of duplicating the modal markup. The kind-specific install
// logic (and its own busy state, toasts) stays in that kind's own Pinia store - this
// component only owns the URL input and open/close state.
//
// Milestone 14's curated registry adds a second path alongside freeform URL paste: a list of
// hand-reviewed, pinned-hash entries fetched from concourse-plugin-registry. Reads directly
// from pluginInstall.ts (not passed as a prop) since a registry entry is always installed
// through that exact store's own preview/confirm flow anyway - no reason to thread it through
// generic props the way title/label/onInstall are.
const props = defineProps<{
  open: boolean;
  title: string;
  label: string;
  placeholder?: string;
  installing: boolean;
  onInstall: (url: string, expectedSha256?: string | null) => Promise<void>;
}>();
const emit = defineEmits<{ close: [] }>();

const pluginInstall = usePluginInstallStore();
const url = ref("");

onMounted(() => {
  pluginInstall.loadRegistry();
});

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      url.value = "";
      // Re-fetch every open, not just onMounted - this component stays mounted the whole
      // time PluginSettings.vue is (see its own `:open` prop), so onMounted's loadRegistry
      // only ever ran once; a new registry entry or version bump never showed up without a
      // full app restart until this re-fetch was added. (Update checks used to live here too,
      // as a "third moment" alongside app start/focus - dropped as genuinely redundant, since
      // this modal only opens from inside PluginSettings.vue, whose own onMounted already
      // covers the same check every time Settings is (re)entered.)
      pluginInstall.loadRegistry();
    }
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

async function installFromRegistry(manifestUrl: string, wasmSha256: string) {
  await props.onInstall(manifestUrl, wasmSha256);
  emit("close");
}
</script>

<template>
  <BaseModal :open="open" :title="title" max-width="420px" @close="emit('close')">
    <template #body>
      <div v-if="pluginInstall.registryEntries.length > 0" class="registry-section">
        <p class="registry-title">
          Curated plugins (reviewed, hash-pinned - see
          <a href="https://github.com/smh0505/concourse-plugin-registry" target="_blank" rel="noopener">
            concourse-plugin-registry</a>)
        </p>
        <ul class="registry-list">
          <li v-for="entry in pluginInstall.registryEntries" :key="entry.id">
            <span class="registry-entry-name">{{ entry.name }}</span>
            <span class="registry-entry-repo">{{ entry.repo }}</span>
            <button
              type="button"
              class="compact-button"
              :disabled="installing"
              @click="installFromRegistry(entry.manifestUrl, entry.wasmSha256)"
            >
              Install
            </button>
          </li>
        </ul>
        <p class="registry-divider">or paste a manifest URL directly:</p>
      </div>
      <p v-else-if="pluginInstall.loadingRegistry" class="registry-loading">
        Loading curated plugins...
      </p>

      <!-- No submit button inside - Enter still submits natively via this form's own submit
           event; the visible button lives in #footer, a separate slot location, so it can't
           be a real type="submit" inside this <form> anymore. -->
      <form class="add-plugin-form" @submit.prevent="onSubmit">
        <label>
          {{ label }}
          <input v-model="url" :placeholder="placeholder" />
        </label>
      </form>
    </template>
    <template #footer>
      <button type="button" @click="emit('close')">Cancel</button>
      <button type="button" :disabled="installing || !url.trim()" @click="onSubmit">
        {{ installing ? "Installing..." : "Install" }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.registry-section {
  margin-bottom: 0.75rem;
}

.registry-title {
  font-size: 0.75rem;
  opacity: 0.7;
  margin: 0 0 0.4rem;
}

.registry-title a {
  color: var(--color-accent);
}

.registry-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.registry-list li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.85rem;
}

.registry-entry-name {
  font-weight: 600;
}

.registry-entry-repo {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.6;
  font-size: 0.75rem;
}

/* .compact-button (shared, styles.css) supplies this rule's entire look. */

.registry-divider {
  font-size: 0.75rem;
  opacity: 0.6;
  margin: 0.6rem 0 0.4rem;
}

.registry-loading {
  font-size: 0.75rem;
  opacity: 0.6;
  margin: 0 0 0.5rem;
}

.add-plugin-form label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  text-align: left;
}

.add-plugin-form input {
  font-family: inherit;
  width: 100%;
}
</style>
