<script setup lang="ts">
import { onMounted, ref } from "vue";
import { settings as settingsRepo } from "../../db";
import type { SettingsSchemaField } from "../../plugins/manifest";

// Generic settings form for any WASM plugin that declares a settingsSchema in its plugin.json
// (e.g. an API key) - WASM plugins have no other way to collect user-typed config, unlike
// TS-authored plugins' own settingsComponent. One instance of this per plugin, driven entirely
// by its schema - no per-plugin custom form code needed on either side.
//
// Fields-only: the Cancel/Save buttons live in SettingsButton.vue's #footer (a different slot
// location than this form's own content), so save() is exposed here and called via a ref from
// loader.ts's attachSettingsSchemaForm instead of this component owning its own submit button.
const props = defineProps<{
  pluginId: string;
  schema: SettingsSchemaField[];
}>();

// Same "plugin:<id>:<key>" format the host's PluginHostState::namespaced_settings_key uses for
// a WASM guest's own settings-get/settings-set calls - writing here directly (bypassing WASM
// entirely, since this is just a key-value read/write) means a plugin can read back whatever
// gets saved here without any extra wiring.
function namespacedKey(key: string): string {
  return `plugin:${props.pluginId}:${key}`;
}

const values = ref<Record<string, string>>({});

async function save() {
  for (const field of props.schema) {
    await settingsRepo.set(namespacedKey(field.key), (values.value[field.key] ?? "").trim());
  }
}

onMounted(async () => {
  const loaded: Record<string, string> = {};
  for (const field of props.schema) {
    loaded[field.key] = (await settingsRepo.get(namespacedKey(field.key))) ?? "";
  }
  values.value = loaded;
});

defineExpose({ save });
</script>

<template>
  <div class="settings-fields">
    <label v-for="field in schema" :key="field.key">
      {{ field.label }}
      <input v-model="values[field.key]" :type="field.type ?? 'text'" />
    </label>
  </div>
</template>

<style scoped>
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
