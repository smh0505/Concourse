import { computed, ref, type Component } from "vue";
import type { ThemeSlotName } from "../plugins/types";

const activeSlots = ref<Partial<Record<ThemeSlotName, Component>>>({});

export function setActiveSlots(slots: Partial<Record<ThemeSlotName, Component>>) {
  activeSlots.value = slots;
}

export function clearActiveSlots() {
  activeSlots.value = {};
}

/** Resolves to the active theme's override for `name`, falling back to the built-in component. */
export function useThemeSlot(name: ThemeSlotName, fallback: Component) {
  return computed(() => activeSlots.value[name] ?? fallback);
}
