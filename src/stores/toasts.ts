import { defineStore } from "pinia";
import { ref } from "vue";

export type ToastType = "error" | "success" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  /** Present only for an actionable toast (e.g. "Update available" with an Update Now/Later
   *  choice) - see `pushAction`. Plain functions in a closure, not anything Vue-reactive-wrapped
   *  itself, so nothing here is affected by `toasts` being a `ref<Toast[]>`. */
  actions?: ToastAction[];
}

const AUTO_DISMISS_MS = 5000;

export const useToastStore = defineStore("toasts", () => {
  const toasts = ref<Toast[]>([]);
  let nextId = 0;

  function push(message: string, type: ToastType = "info") {
    const id = nextId++;
    toasts.value.push({ id, message, type });
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }

  /** An actionable toast - never auto-dismisses, since the whole point is giving the user a
   *  deliberate choice (e.g. "Update Now" vs "Later") rather than losing it to a 5s timer.
   *  Dismissed only by clicking the toast body itself (not one of its action buttons, see
   *  ToastContainer.vue) or a caller explicitly calling `dismiss(id)`. Returns the new toast's
   *  id so the caller can dismiss it itself once an action is taken. */
  function pushAction(message: string, actions: ToastAction[], type: ToastType = "info"): number {
    const id = nextId++;
    toasts.value.push({ id, message, type, actions });
    return id;
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return { toasts, push, pushAction, dismiss };
});
