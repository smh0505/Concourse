<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useToastStore } from "../../stores/toasts";
import type { Installable, PluginBase } from "../../plugins/types";

/** Generic Found/Not-found status + Install/Uninstall toggle button for any plugin
 *  implementing `Installable`, regardless of kind - not wrapper-specific. `onInstallChanged`
 *  is an optional escape hatch for a caller that needs to react to a fresh install/uninstall
 *  (e.g. wrapper plugins refreshing their profile list) without baking that kind-specific
 *  knowledge into this component. */
const props = defineProps<{
  plugin: PluginBase & Installable;
  onInstallChanged?: () => void | Promise<void>;
}>();

const found = ref<boolean | null>(null);
// Which action is in flight, not derived from `found` - `found` itself gets updated (via
// refreshFound()) *before* the action finishes, so a busy label keyed off `found` would flip
// to match the new state while still technically busy, right before the button re-enables.
// Tracking the verb separately keeps the busy label showing what's actually still running.
const action = ref<"installing" | "uninstalling" | null>(null);

async function refreshFound() {
  try {
    found.value = await props.plugin.isInstalled();
  } catch {
    found.value = null;
  }
}

async function onToggle() {
  const toasts = useToastStore();
  const wasInstalled = found.value === true;
  action.value = wasInstalled ? "uninstalling" : "installing";
  try {
    if (wasInstalled) await props.plugin.uninstall();
    else await props.plugin.install();
    await refreshFound();
    await props.onInstallChanged?.();
  } catch (e) {
    const verb = wasInstalled ? "uninstall" : "install";
    toasts.push(`Failed to ${verb} ${props.plugin.name}: ${String(e)}`, "error");
  } finally {
    action.value = null;
  }
}

onMounted(refreshFound);
</script>

<template>
  <div class="settings-form installable-status">
    <span v-if="found === true" class="status-ok">Installed</span>
    <span v-else-if="found === false" class="status-bad">Not installed</span>
    <button type="button" :disabled="action !== null" @click="onToggle">
      {{ action === "installing" ? "Installing..." : action === "uninstalling" ? "Uninstalling..." : found ? "Uninstall" : "Install" }}
    </button>
  </div>
</template>

<style scoped>
.installable-status {
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
