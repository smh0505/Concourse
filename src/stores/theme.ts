import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

import { settings as settingsRepo } from "@/db";
import { getAvailablePluginManifests, loadEnabledPlugins } from "@/plugins/loader";
import { setActiveCardVisual, clearActiveCardVisual } from "@/theme/cardVisualRegistry";
import { setActiveFontFaces, clearActiveFontFaces } from "@/theme/fontFaceRegistry";
import { useToastStore } from "./toasts";
import { useProfilesStore } from "./profiles";
import { i18n } from "@/i18n";
import type { PluginManifest } from "@/plugins/manifest";
import type { ThemePlugin } from "@/plugins/types";

const ACTIVE_THEME_SETTING = "active_theme_id";
const DEFAULT_THEME_ID = "catppuccin-latte";

/** Per-profile, not global - each profile picks its own look. init() now runs after profile
 *  selection (App.vue), unlike before - the profile picker itself (ProfileSwitcher.vue) shows
 *  before any theme.init() has ever run, so it renders in whatever styles.css's own :root
 *  block defines (Catppuccin Latte, the compiled-in default) rather than any profile's actual
 *  choice - a theme plugin only overrides those tokens at runtime, :root already has real
 *  values on its own. That's a deliberate, stable "picker always looks the same" choice, not a
 *  gap to fill with a separate theme system just for that one screen. */
function activeProfileId(): number {
  return useProfilesStore().activeProfileId!;
}

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

  async function refreshManifests() {
    manifests.value = await getAvailablePluginManifests("theme");
  }

  async function loadThemePlugin(id: string): Promise<ThemePlugin | null> {
    const plugins = await loadEnabledPlugins<ThemePlugin>("theme", new Set([id]));
    return plugins[0] ?? null;
  }

  async function uninstallDataTheme(id: string) {
    const toasts = useToastStore();
    try {
      await invoke("uninstall_data_theme", { id });
      if (activeThemeId.value === id) await setActiveTheme(DEFAULT_THEME_ID);
      await refreshManifests();
    } catch (e) {
      toasts.push(i18n.global.t("pluginSettings.removeThemeFailed", { error: String(e) }), "error");
    }
  }

  async function setActiveTheme(id: string | null) {
    if (activePlugin?.deactivate) await activePlugin.deactivate();
    clearActiveCardVisual();
    clearActiveFontFaces();
    applyCssVariables(undefined);
    activePlugin = null;

    if (id) {
      const plugin = await loadThemePlugin(id);
      if (plugin) {
        activePlugin = plugin;
        setActiveCardVisual(plugin.cardVisual);
        setActiveFontFaces(plugin.fontFaces);
        applyCssVariables(plugin.cssVariables);
        if (plugin.activate) await plugin.activate();
      }
    }

    activeThemeId.value = id;
    await settingsRepo.setForProfile(activeProfileId(), ACTIVE_THEME_SETTING, id ?? "");
  }

  async function init() {
    await refreshManifests();

    const stored = await settingsRepo.getForProfile(activeProfileId(), ACTIVE_THEME_SETTING);
    if (stored === null) {
      await setActiveTheme(DEFAULT_THEME_ID);
    } else {
      await setActiveTheme(stored || null);
    }
  }

  return {
    manifests,
    activeThemeId,
    setActiveTheme,
    refreshManifests,
    uninstallDataTheme,
    init,
  };
});
