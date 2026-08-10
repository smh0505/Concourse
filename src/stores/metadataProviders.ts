import { defineStore } from "pinia";
import { ref } from "vue";

import { settings as settingsRepo } from "@/db";
import { getAvailablePluginManifests, loadEnabledPlugins } from "@/plugins/loader";
import { i18n } from "@/i18n";
import { useToastStore } from "./toasts";
import type { PluginManifest } from "@/plugins/manifest";
import type { MetadataCandidate, MetadataProviderPlugin, MetadataResult } from "@/plugins/types";

export interface PendingCandidateSection {
  pluginId: string;
  pluginName: string;
  candidates: MetadataCandidate[];
}

const ENABLED_PROVIDERS_SETTING = "enabled_metadata_providers";
// No bundled default anymore - IGDB/SteamGridDB are both runtime-installed WASM plugins now
// (install-by-URL), not guaranteed present for a fresh install the way the old built-in TS
// igdb plugin was.
const DEFAULT_PROVIDER_IDS: string[] = [];

export const useMetadataProviderStore = defineStore("metadataProviders", () => {
  const manifests = ref<PluginManifest[]>([]);
  // Ordered, not just a membership set - fetchMetadata below queries providers in this order
  // and it's first-non-null-wins per field, so this order is the provider-priority order.
  const enabledIds = ref<string[]>([]);
  const loadedPlugins = ref<MetadataProviderPlugin[]>([]);
  // Set (not cleared) by fetchMetadata below once every enabled provider's search has finished
  // and more than one provider came back ambiguous (2+ candidates) - a mounted
  // CandidatePicker.vue renders one section per ambiguous provider and calls
  // submitCandidateSelections once, which resolves the pending promise fetchMetadata is
  // awaiting. Providers with 0 or exactly 1 candidate never show up here at all - they're
  // resolved automatically without interrupting the user.
  const pendingCandidateSections = ref<PendingCandidateSection[] | null>(null);
  let resolvePendingSelections: ((selections: Record<string, string | null>) => void) | null =
    null;

  function promptForCandidates(
    sections: PendingCandidateSection[],
  ): Promise<Record<string, string | null>> {
    pendingCandidateSections.value = sections;
    return new Promise((resolve) => {
      resolvePendingSelections = resolve;
    });
  }

  function submitCandidateSelections(selections: Record<string, string | null>) {
    resolvePendingSelections?.(selections);
    resolvePendingSelections = null;
    pendingCandidateSections.value = null;
  }

  async function persistEnabledIds() {
    await settingsRepo.set(ENABLED_PROVIDERS_SETTING, JSON.stringify(enabledIds.value));
  }

  async function reloadPlugins() {
    loadedPlugins.value = await loadEnabledPlugins<MetadataProviderPlugin>(
      "metadata",
      enabledIds.value,
    );
  }

  async function toggleProvider(id: string) {
    const idx = enabledIds.value.indexOf(id);
    if (idx !== -1) enabledIds.value.splice(idx, 1);
    else enabledIds.value.push(id);
    await persistEnabledIds();
    await reloadPlugins();
  }

  async function moveProvider(id: string, direction: -1 | 1) {
    const idx = enabledIds.value.indexOf(id);
    const target = idx + direction;
    if (idx === -1 || target < 0 || target >= enabledIds.value.length) return;
    const [entry] = enabledIds.value.splice(idx, 1);
    enabledIds.value.splice(target, 0, entry);
    await persistEnabledIds();
    await reloadPlugins();
  }

  /**
   * Queries every enabled provider and merges the results: first non-null wins for
   * description/releaseDate/coverArtUrl/backgroundArtUrl (in provider-enable order - a
   * text-only provider like IGDB leaves the art fields unset, an art-only provider like
   * SteamGridDB leaves the text fields unset, so this naturally combines both without either
   * needing to know about the other), genres are unioned across all providers. A provider
   * that throws or finds nothing is skipped rather than failing the whole fetch, so one bad/
   * misconfigured provider doesn't block the others.
   *
   * Each provider is a two-step searchCandidates/fetchMetadataById call rather than one direct
   * fetch, so a provider whose own search is genuinely ambiguous (e.g. a duplicate/reissue
   * sharing the exact same title) can surface that instead of silently guessing. Runs in two
   * phases rather than resolving each provider one at a time: phase 1 calls searchCandidates on
   * every provider up front (toasting each provider's result as it comes in) and picks a
   * chosenId immediately for the 0/1-candidate cases; phase 2, if any provider came back
   * ambiguous (2+ candidates), shows ONE combined picker (one section per ambiguous provider,
   * see CandidatePicker.vue) instead of interrupting once per provider. chosenIds stays index-
   * aligned with loadedPlugins throughout specifically so provider-priority order (which field
   * wins a merge conflict) survives the pause for user input - an ambiguous provider resolved
   * late by the picker still merges at its original priority position, not appended at the end.
   */
  async function fetchMetadata(title: string): Promise<MetadataResult | null> {
    if (loadedPlugins.value.length === 0) {
      throw new Error(i18n.global.t("metadataProviders.noProviderEnabled"));
    }

    const toasts = useToastStore();
    const chosenIds: (string | null)[] = new Array(loadedPlugins.value.length).fill(null);
    const ambiguousSections: (PendingCandidateSection & { index: number })[] = [];

    for (let i = 0; i < loadedPlugins.value.length; i++) {
      const plugin = loadedPlugins.value[i];
      let candidates: MetadataCandidate[];
      try {
        candidates = await plugin.searchCandidates(title);
      } catch {
        toasts.push(i18n.global.t("metadataProviders.searchFailed", { name: plugin.name }), "error");
        continue;
      }

      if (candidates.length === 0) {
        toasts.push(i18n.global.t("metadataProviders.noMatch", { name: plugin.name }), "info");
      } else if (candidates.length === 1) {
        toasts.push(i18n.global.t("metadataProviders.foundMatch", { name: plugin.name }), "success");
        chosenIds[i] = candidates[0].id;
      } else {
        toasts.push(
          i18n.global.t("metadataProviders.matchesFound", {
            name: plugin.name,
            count: candidates.length,
          }),
          "info",
        );
        ambiguousSections.push({ index: i, pluginId: plugin.id, pluginName: plugin.name, candidates });
      }
    }

    if (ambiguousSections.length > 0) {
      const selections = await promptForCandidates(ambiguousSections);
      for (const section of ambiguousSections) {
        chosenIds[section.index] = selections[section.pluginId] ?? null;
      }
    }

    let description: string | null = null;
    let releaseDate: string | null = null;
    let coverArtUrl: string | null = null;
    let backgroundArtUrl: string | null = null;
    const genres = new Set<string>();
    let foundAny = false;

    for (let i = 0; i < loadedPlugins.value.length; i++) {
      const id = chosenIds[i];
      if (id === null) continue;

      let result: MetadataResult | null;
      try {
        result = await loadedPlugins.value[i].fetchMetadataById(id);
      } catch {
        continue;
      }
      if (!result) continue;

      foundAny = true;
      description ??= result.description;
      releaseDate ??= result.releaseDate;
      coverArtUrl ??= result.coverArtUrl ?? null;
      backgroundArtUrl ??= result.backgroundArtUrl ?? null;
      for (const genre of result.genres) genres.add(genre);
    }

    if (!foundAny) return null;
    return { description, releaseDate, genres: [...genres], coverArtUrl, backgroundArtUrl };
  }

  async function refreshManifests() {
    manifests.value = await getAvailablePluginManifests("metadata");
  }

  async function init() {
    await refreshManifests();

    const stored = await settingsRepo.get(ENABLED_PROVIDERS_SETTING);
    if (stored === null) {
      enabledIds.value = [...DEFAULT_PROVIDER_IDS];
      await persistEnabledIds();
    } else {
      try {
        enabledIds.value = JSON.parse(stored);
      } catch {
        enabledIds.value = [];
      }
    }

    await reloadPlugins();
  }

  return {
    manifests,
    enabledIds,
    loadedPlugins,
    pendingCandidateSections,
    toggleProvider,
    moveProvider,
    submitCandidateSelections,
    fetchMetadata,
    refreshManifests,
    init,
  };
});
