<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useToastStore } from "../../stores/toasts";
import { useWrapperPluginStore } from "../../stores/wrapperPlugins";
import type { WrapperPlugin } from "../../plugins/types";

const props = defineProps<{ plugin: WrapperPlugin }>();

const wrapperPlugins = useWrapperPluginStore();
const found = ref<boolean | null>(null);
const installing = ref(false);

async function refreshFound() {
  try {
    found.value = await props.plugin.isInstalled();
  } catch {
    found.value = null;
  }
}

async function onInstall() {
  const toasts = useToastStore();
  installing.value = true;
  try {
    await props.plugin.install();
    await refreshFound();
    // wrapperPlugins.profiles is keyed off a fixed, plugin-owned location - not something a
    // reinstall changes the "path" of, so there's nothing for a watch to key off. Explicitly
    // refreshed instead, same reasoning as the Found/Not-found status above.
    await wrapperPlugins.refreshProfiles();
  } catch (e) {
    toasts.push(`Failed to install ${props.plugin.name}: ${String(e)}`, "error");
  } finally {
    installing.value = false;
  }
}

onMounted(refreshFound);
</script>

<template>
  <div class="settings-form wrapper-install">
    <span v-if="found === true" class="status-ok">Installed</span>
    <span v-else-if="found === false" class="status-bad">Not installed</span>
    <button type="button" :disabled="installing" @click="onInstall">
      {{ installing ? "Installing..." : "Install" }}
    </button>
  </div>
</template>

<style scoped>
.wrapper-install {
  align-items: center;
  gap: 0.5rem;
}

.status-ok {
  color: var(--color-accent);
  font-size: 0.75rem;
}

.status-bad {
  color: var(--color-danger);
  font-size: 0.75rem;
}
</style>
