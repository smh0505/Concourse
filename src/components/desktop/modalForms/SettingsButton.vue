<script setup lang="ts">
import { ref } from "vue";
import BaseModal from "../BaseModal.vue";

// Generic "button that opens a modal containing an arbitrary settings form" - used to wrap
// API-key-style forms (IGDB's own, and the generic WasmPluginSettingsForm) so they don't sit
// inline under every plugin row. Not used for InstallableStatus.vue's Install/Uninstall toggle
// - that one benefits from staying visible at a glance, not worth hiding behind a click.
//
// The slotted form is fields-only (no button of its own) - onSave is supplied by the caller
// (typically a ref into the slotted form's exposed save() method), since Cancel/Save live here
// in the footer, a separate slot location from the form's own content.
const props = defineProps<{ title: string; onSave: () => Promise<void> }>();
const open = ref(false);

async function onSubmit() {
  await props.onSave();
  open.value = false;
}
</script>

<template>
  <button type="button" class="settings-trigger" @click="open = true">Settings</button>
  <BaseModal :open="open" :title="title" max-width="380px" @close="open = false">
    <template #body>
      <slot />
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
</style>
