import { defineStore } from "pinia";
import { ref } from "vue";
import { settings as settingsRepo } from "../db";
import { getAvailablePluginManifests, loadEnabledPlugins } from "../plugins/loader";
import { setActiveSlots, clearActiveSlots } from "../theme/slotRegistry";
import type { PluginManifest } from "../plugins/manifest";
import type { ThemePlugin } from "../plugins/types";

const ACTIVE_THEME_SETTING = "active_theme_id";
const DEFAULT_THEME_ID = "catppuccin-latte";

let appliedCssVarNames: string[] = [];

function applyCssVariables(vars: Record<string, string> | undefined) {
  const root = document.documentElement.style;
  for (const name of appliedCssVarNames) root.removeProperty(name);
  appliedCssVarNames = [];

  if (!vars) return;
  for (const [name, value] of Object.entries(vars)) {
    root.setProperty(name, value);
    appliedCssVarNames.push(name);
  }
}

export const useThemeStore = defineStore("theme", () => {
  const manifests = ref<PluginManifest[]>([]);
  const activeThemeId = ref<string | null>(null);
  let activePlugin: ThemePlugin | null = null;

  async function loadThemePlugin(id: string): Promise<ThemePlugin | null> {
    const plugins = await loadEnabledPlugins<ThemePlugin>("theme", new Set([id]));
    return plugins[0] ?? null;
  }

  async function setActiveTheme(id: string | null) {
    if (activePlugin?.deactivate) await activePlugin.deactivate();
    clearActiveSlots();
    applyCssVariables(undefined);
    activePlugin = null;

    if (id) {
      const plugin = await loadThemePlugin(id);
      if (plugin) {
        activePlugin = plugin;
        setActiveSlots(plugin.slots ?? {});
        applyCssVariables(plugin.cssVariables);
        if (plugin.activate) await plugin.activate();
      }
    }

    activeThemeId.value = id;
    await settingsRepo.set(ACTIVE_THEME_SETTING, id ?? "");
  }

  async function init() {
    manifests.value = getAvailablePluginManifests("theme");

    const stored = await settingsRepo.get(ACTIVE_THEME_SETTING);
    if (stored === null) {
      await setActiveTheme(DEFAULT_THEME_ID);
    } else {
      await setActiveTheme(stored || null);
    }
  }

  return { manifests, activeThemeId, setActiveTheme, init };
});
