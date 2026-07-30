import { computed, ref } from "vue";
import { validateCardVisualAst, type AstNode } from "./cardVisualAst";

const activeCardVisual = ref<AstNode | null>(null);

/** Validates once at theme-activation time (not per-render) - a manifest's `cardVisual` is
 *  untrusted data regardless of which plugin kind it came from (data-theme JSON especially,
 *  but validated uniformly for every source), so rejecting it here means renderCardVisualAst
 *  never has to be defensive against malformed input on every call. An invalid AST is logged
 *  and ignored (falls back to the built-in markup) rather than breaking theme activation. */
export function setActiveCardVisual(node: unknown | undefined) {
  if (!node) {
    activeCardVisual.value = null;
    return;
  }
  try {
    activeCardVisual.value = validateCardVisualAst(node);
  } catch (e) {
    console.error("Invalid cardVisual AST, falling back to the built-in card visual:", e);
    activeCardVisual.value = null;
  }
}

export function clearActiveCardVisual() {
  activeCardVisual.value = null;
}

export function useActiveCardVisual() {
  return computed(() => activeCardVisual.value);
}
