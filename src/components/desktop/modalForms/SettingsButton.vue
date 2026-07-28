<script setup lang="ts">
import { onMounted, ref } from "vue";
import { settings as settingsRepo } from "../../../db";
import type { SettingsSchemaField } from "../../../plugins/manifest";
import BaseModal from "../BaseModal.vue";

// Generic settings button for any WASM plugin that declares a settingsSchema in its
// plugin.json (e.g. an API key) - WASM plugins have no other way to collect user-typed config,
// unlike TS-authored plugins' own settingsComponent. Not used for InstallableStatus.vue's
// Install/Uninstall toggle - that one benefits from staying visible at a glance, not worth
// hiding behind a click.
const props = defineProps<{
  title: string;
  pluginId: string;
  schema: SettingsSchemaField[];
}>();
const open = ref(false);

// Same "plugin:<id>:<key>" format the host's PluginHostState::namespaced_settings_key uses for
// a WASM guest's own settings-get/settings-set calls - writing here directly (bypassing WASM
// entirely, since this is just a key-value read/write) means a plugin can read back whatever
// gets saved here without any extra wiring.
function namespacedKey(key: string): string {
  return `plugin:${props.pluginId}:${key}`;
}

const values = ref<Record<string, string>>({});

async function loadValues() {
  const loaded: Record<string, string> = {};
  for (const field of props.schema) {
    loaded[field.key] = (await settingsRepo.get(namespacedKey(field.key))) ?? "";
  }
  values.value = loaded;
}

async function onSubmit() {
  for (const field of props.schema) {
    await settingsRepo.set(namespacedKey(field.key), (values.value[field.key] ?? "").trim());
  }
  open.value = false;
}

onMounted(loadValues);
</script>

<template>
  <button type="button" class="settings-trigger" @click="open = true">Settings</button>
  <BaseModal :open="open" :title="title" max-width="380px" @close="open = false">
    <template #body>
      <div class="settings-fields">
        <label v-for="field in schema" :key="field.key">
          {{ field.label }}
          <input v-model="values[field.key]" :type="field.type ?? 'text'" />
        </label>
      </div>
    </template>
    <template #footer>
      <button type="button" @click="open = false">Cancel</button>
      <button type="button" @click="onSubmit">Save</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.settings-trigger {
  font-size: 0.85rem;
}

.settings-fields {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.settings-fields label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  text-align: left;
}
</style>
