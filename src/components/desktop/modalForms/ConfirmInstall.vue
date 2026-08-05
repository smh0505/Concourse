<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BaseModal from "../common/BaseModal.vue";
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
const { t } = useI18n();

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
    ? t("confirmInstall.registryScope", { hive: scope.hive, prefix: scope.prefix })
    : t("confirmInstall.filesScope", { prefix: scope.prefix });
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
    :title="manifest ? t('confirmInstall.title', { name: manifest.name }) : undefined"
    max-width="380px"
    @close="emit('close')"
  >
    <template v-if="manifest" #body>
      <dl class="plugin-info">
        <dt>{{ t("confirmInstall.id") }}</dt>
        <dd>{{ manifest.id }}</dd>
        <dt>{{ t("confirmInstall.version") }}</dt>
        <dd>{{ manifest.version }}</dd>
        <dt>{{ t("confirmInstall.kind") }}</dt>
        <dd>{{ manifest.kind }}</dd>
      </dl>
      <small v-if="manifest.kind === 'theme'">
        {{ t("confirmInstall.themeNotice") }}
      </small>
      <template v-else>
        <small>
          {{ t("confirmInstall.codeWarning") }}
        </small>
        <div v-if="manifest.pathScopes.length || manifest.httpScopes.length" class="scope-list">
          <p class="scope-list-title">{{ t("confirmInstall.declaresAccessTo") }}</p>
          <ul>
            <li v-for="(scope, i) in manifest.pathScopes" :key="`path-${i}`">
              {{ formatPathScope(scope) }}
            </li>
            <li v-for="host in manifest.httpScopes" :key="`http-${host}`">
              {{ t("confirmInstall.networkScope", { host }) }}
            </li>
          </ul>
        </div>
      </template>
      <label v-if="needsRunProgramsGrant" class="permission-grant">
        <input type="checkbox" v-model="runProgramsGranted" />
        {{ t("confirmInstall.runProgramsGrant") }}
      </label>
    </template>
    <template v-if="manifest" #footer>
      <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
      <button
        type="button"
        :disabled="installing || (needsRunProgramsGrant && !runProgramsGranted)"
        @click="onSubmit"
      >
        {{ installing ? t("confirmInstall.installing") : t("confirmInstall.install") }}
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

/* small (shared, styles.css) supplies the base look entirely - this component's own body is
   already flex-column (BaseModal.vue's .modal-body), nothing extra needed locally. */

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
  gap: var(--space-2);
  font-size: 0.8rem;
  margin-top: 0.6rem;
  padding: 0.5rem;
  border: var(--button-border-width) solid var(--color-danger);
  border-radius: var(--radius-sm);
}

.permission-grant input {
  margin-top: 0.15rem;
}
</style>
