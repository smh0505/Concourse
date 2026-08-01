import { onMounted, reactive, ref } from "vue";

interface NamedItemManagerOptions {
  create: (name: string) => Promise<void>;
  rename: (oldName: string, newName: string) => Promise<void>;
  delete: (name: string) => Promise<void>;
  getUsageCounts: () => Promise<Record<string, number>>;
}

/** Shared create/rename/delete/usage-count state machine behind the Tags and Collections
 *  manager panels - the two are structurally identical (same interaction, different backing
 *  store actions), so this is the one place that logic lives instead of duplicated twice. */
export function useNamedItemManager(options: NamedItemManagerOptions) {
  const counts = ref<Record<string, number>>({});
  const newName = ref("");
  const editingName = ref<string | null>(null);
  const editingValue = ref("");

  async function refreshCounts() {
    counts.value = await options.getUsageCounts();
  }

  onMounted(refreshCounts);

  async function onCreate() {
    const name = newName.value.trim();
    if (!name) return;
    await options.create(name);
    newName.value = "";
    await refreshCounts();
  }

  function startEdit(name: string) {
    editingName.value = name;
    editingValue.value = name;
  }

  function cancelEdit() {
    editingName.value = null;
    editingValue.value = "";
  }

  async function confirmEdit() {
    const trimmed = editingValue.value.trim();
    if (trimmed && editingName.value && trimmed !== editingName.value) {
      await options.rename(editingName.value, trimmed);
      await refreshCounts();
    }
    cancelEdit();
  }

  async function onDelete(name: string) {
    await options.delete(name);
    await refreshCounts();
  }

  // reactive() (not a plain object) - templates access this as `manager.counts`/
  // `manager.editingName` etc., not `manager.counts.value`; a plain object of refs would
  // only auto-unwrap at the top level (`manager` itself), not on nested property access.
  return reactive({
    counts,
    newName,
    editingName,
    editingValue,
    onCreate,
    startEdit,
    cancelEdit,
    confirmEdit,
    onDelete,
  });
}
