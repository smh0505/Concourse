import { defineStore } from "pinia";
import { computed, ref } from "vue";

/** Multi-select state for the library grid/list (Milestone 25 batch ops) - its own store
 *  rather than fields on library.ts, since selection is UI mode/interaction state, not library
 *  data itself (mirrors why tags/collections split out of library.ts: a genuinely separate
 *  concern, not just "a lot of library actions"). A Set (not an array) since membership checks
 *  (isSelected, called once per rendered card/row) need to stay O(1). */
export const useLibrarySelectionStore = defineStore("librarySelection", () => {
  const active = ref(false);
  const selectedIds = ref<Set<number>>(new Set());

  const count = computed(() => selectedIds.value.size);

  function enter() {
    active.value = true;
  }

  /** Leaving selection mode always clears the selection too - there's no "paused" selection
   *  state to resume later, re-entering always starts fresh. */
  function exit() {
    active.value = false;
    selectedIds.value = new Set();
  }

  /** Reassigns (not mutates) selectedIds.value - a Set mutated in place wouldn't trigger Vue's
   *  reactivity for computed/watchers keyed off the ref itself. */
  function toggle(id: number) {
    const next = new Set(selectedIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds.value = next;
  }

  function isSelected(id: number): boolean {
    return selectedIds.value.has(id);
  }

  function selectAll(ids: number[]) {
    selectedIds.value = new Set(ids);
  }

  function clear() {
    selectedIds.value = new Set();
  }

  return { active, selectedIds, count, enter, exit, toggle, isSelected, selectAll, clear };
});
