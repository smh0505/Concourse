import { computed, markRaw, ref, type Component } from "vue";
import type { ThemeSlotName } from "../plugins/types";

const activeSlots = ref<Partial<Record<ThemeSlotName, Component>>>({});

// markRaw each component value specifically - Vue's "component was made reactive" warning
// (and the deep-proxy overhead behind it) comes from ref() wrapping the SFC objects
// themselves, not from the container. markRaw flags just those objects as reactivity-exempt
// (Vue checks for this before deciding whether to proxy something), which fixes the warning
// while leaving the ref's own top-level reactivity - the part useThemeSlot's computed()
// actually depends on to notice setActiveSlots()/clearActiveSlots() - untouched. A plain
// shallowRef swap looked equivalent but wasn't: it broke theme style application, so this is
// the narrower, Vue-recommended fix instead.
export function setActiveSlots(slots: Partial<Record<ThemeSlotName, Component>>) {
  const raw: Partial<Record<ThemeSlotName, Component>> = {};
  for (const [name, component] of Object.entries(slots) as [ThemeSlotName, Component][]) {
    raw[name] = markRaw(component);
  }
  activeSlots.value = raw;
}

export function clearActiveSlots() {
  activeSlots.value = {};
}

/** Resolves to the active theme's override for `name`, falling back to the built-in component. */
export function useThemeSlot(name: ThemeSlotName, fallback: Component) {
  return computed(() => activeSlots.value[name] ?? fallback);
}
