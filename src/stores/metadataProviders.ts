import { defineStore } from "pinia";
import { ref } from "vue";
import { settings as settingsRepo } from "../db";
import { getAvailablePluginManifests, loadEnabledPlugins } from "../plugins/loader";
import type { PluginManifest } from "../plugins/manifest";
import type { MetadataProviderPlugin, MetadataResult } from "../plugins/types";

const ENABLED_PROVIDERS_SETTING = "enabled_metadata_providers";
const DEFAULT_PROVIDER_IDS = ["igdb"];

export const useMetadataProviderStore = defineStore("metadataProviders", () => {
  const manifests = ref<PluginManifest[]>([]);
  const enabledIds = ref<Set<string>>(new Set());
  const loadedPlugins = ref<MetadataProviderPlugin[]>([]);

  async function persistEnabledIds() {
    await settingsRepo.set(ENABLED_PROVIDERS_SETTING, JSON.stringify([...enabledIds.value]));
  }

  async function reloadPlugins() {
    loadedPlugins.value = await loadEnabledPlugins<MetadataProviderPlugin>(
      "metadata",
      enabledIds.value,
    );
  }

  async function toggleProvider(id: string) {
    if (enabledIds.value.has(id)) enabledIds.value.delete(id);
    else enabledIds.value.add(id);
    await persistEnabledIds();
    await reloadPlugins();
  }

  /**
   * Queries every enabled provider and merges the results: first non-null wins for
   * description/releaseDate (in provider-enable order), genres are unioned across all
   * providers. A provider that throws or finds nothing is skipped rather than failing
   * the whole fetch, so one bad/misconfigured provider doesn't block the others.
   */
  async function fetchMetadata(title: string): Promise<MetadataResult | null> {
    if (loadedPlugins.value.length === 0) {
      throw new Error("No metadata provider enabled.");
    }

    let description: string | null = null;
    let releaseDate: string | null = null;
    const genres = new Set<string>();
    let foundAny = false;

    for (const plugin of loadedPlugins.value) {
      let result: MetadataResult | null;
      try {
        result = await plugin.fetchMetadata(title);
      } catch {
        continue;
      }
      if (!result) continue;

      foundAny = true;
      description ??= result.description;
      releaseDate ??= result.releaseDate;
      for (const genre of result.genres) genres.add(genre);
    }

    if (!foundAny) return null;
    return { description, releaseDate, genres: [...genres] };
  }

  async function init() {
    manifests.value = await getAvailablePluginManifests("metadata");

    const stored = await settingsRepo.get(ENABLED_PROVIDERS_SETTING);
    if (stored === null) {
      enabledIds.value = new Set(DEFAULT_PROVIDER_IDS);
      await persistEnabledIds();
    } else {
      try {
        enabledIds.value = new Set(JSON.parse(stored));
      } catch {
        enabledIds.value = new Set();
      }
    }

    await reloadPlugins();
  }

  return { manifests, enabledIds, loadedPlugins, toggleProvider, fetchMetadata, init };
});
