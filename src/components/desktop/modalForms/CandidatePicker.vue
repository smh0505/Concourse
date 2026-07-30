<script setup lang="ts">
import { reactive, watch } from "vue";
import BaseModal from "../BaseModal.vue";
import type { PendingCandidateSection } from "../../../stores/metadataProviders";

// Mounted once globally (App.vue, same pattern as ToastContainer) - metadataProviders.ts's
// fetchMetadata pauses mid-flow and awaits a promise that this modal resolves via
// onSubmit, so it needs to be reachable regardless of which UI surface (GameCard, EditGame,
// GameListRow, ...) actually triggered the fetch.
//
// One section per ambiguous provider rather than a separate modal per provider - a click
// selects/deselects that provider's chosen candidate (radio-like: at most one per section),
// a single Continue button submits every section's selection (or lack of one, meaning "skip
// this provider") at once.
const props = defineProps<{
  open: boolean;
  sections: PendingCandidateSection[];
  onSubmit: (selections: Record<string, string | null>) => void;
}>();

const selected = reactive<Record<string, string | null>>({});

watch(
  () => props.sections,
  (sections) => {
    for (const key of Object.keys(selected)) delete selected[key];
    for (const section of sections) selected[section.pluginId] = null;
  },
  { immediate: true },
);

function toggle(pluginId: string, candidateId: string) {
  selected[pluginId] = selected[pluginId] === candidateId ? null : candidateId;
}

function submit() {
  props.onSubmit({ ...selected });
}
</script>

<template>
  <BaseModal :open="open" title="Multiple matches found" max-width="480px" @close="submit">
    <template #body>
      <small>
        Some providers found more than one match. Pick the right one per provider, or leave a
        section unselected to skip it.
      </small>
      <div v-for="section in sections" :key="section.pluginId" class="section">
        <h3 class="section-title">{{ section.pluginName }}</h3>
        <ul class="candidate-list">
          <li v-for="candidate in section.candidates" :key="candidate.id">
            <button
              type="button"
              class="candidate-button"
              :class="{ selected: selected[section.pluginId] === candidate.id }"
              @click="toggle(section.pluginId, candidate.id)"
            >
              <img
                v-if="candidate.imageUrl"
                class="candidate-thumb"
                :src="candidate.imageUrl"
                :alt="candidate.label"
              />
              <span class="candidate-label">{{ candidate.label }}</span>
            </button>
          </li>
        </ul>
      </div>
    </template>
    <template #footer>
      <button type="button" @click="submit">Continue</button>
    </template>
  </BaseModal>
</template>

<style scoped>
/* small (shared, styles.css) supplies the base look; this component's own body is already
   flex-column (BaseModal.vue's .modal-body), so the margin below is the only extra needed. */
small {
  margin: 0 0 0.75rem;
}

.section + .section {
  margin-top: 0.9rem;
}

.section-title {
  font-size: 0.85rem;
  margin: 0 0 0.4rem;
}

.candidate-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.candidate-button {
  width: 100%;
  justify-content: flex-start;
  text-align: left;
  gap: 0.6rem;
}

.candidate-button.selected {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-on-accent);
}

.candidate-thumb {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.candidate-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
