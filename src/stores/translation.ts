import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { settings as settingsRepo } from "@/db";

const TRANSLATION_MODEL_SETTING = "translation_model";

export interface TranslationModel {
  id: string;
  name: string;
  repo: string;
  file: string;
  size_bytes: number;
}

interface TranslationDownloadProgress {
  model_id: string;
  downloaded_bytes: number;
  total_bytes: number;
}

/** Milestone 21's second half - offline translation via llama.cpp's own prebuilt server binary,
 *  run as a subprocess (host-native Rust module, see src-tauri/src/translation.rs - not an ML
 *  crate dependency). Unlike the plugin stores, there's nothing installable/multi-select here -
 *  one selected model tier, downloaded on first use, plus the engine binary itself (a separate,
 *  much smaller one-time download). */
export const useTranslationStore = defineStore("translation", () => {
  const models = ref<TranslationModel[]>([]);
  const selectedModelId = ref<string | null>(null);
  const downloadedIds = ref<Set<string>>(new Set());
  const engineDownloaded = ref(false);
  const downloadingEngine = ref(false);
  // Only one download can realistically run at a time (a multi-GB fetch) - a single in-flight
  // id plus its progress, rather than a per-model map nothing else needs.
  const downloadingId = ref<string | null>(null);
  const downloadProgress = ref<{ downloaded: number; total: number } | null>(null);
  const translating = ref(false);

  let unlistenProgress: UnlistenFn | undefined;

  async function refreshDownloadedStatus() {
    const results = await Promise.all(
      models.value.map(async (m) => ({
        id: m.id,
        downloaded: await invoke<boolean>("is_translation_model_downloaded", { modelId: m.id }),
      })),
    );
    downloadedIds.value = new Set(results.filter((r) => r.downloaded).map((r) => r.id));
  }

  async function setSelectedModel(modelId: string) {
    selectedModelId.value = modelId;
    await settingsRepo.set(TRANSLATION_MODEL_SETTING, modelId);
  }

  async function downloadModel(modelId: string) {
    downloadingId.value = modelId;
    downloadProgress.value = { downloaded: 0, total: 0 };
    try {
      await invoke("download_translation_model", { modelId });
      downloadedIds.value = new Set([...downloadedIds.value, modelId]);
    } finally {
      downloadingId.value = null;
      downloadProgress.value = null;
    }
  }

  function isDownloaded(modelId: string): boolean {
    return downloadedIds.value.has(modelId);
  }

  async function downloadEngine() {
    downloadingEngine.value = true;
    try {
      await invoke("download_translation_engine");
      engineDownloaded.value = true;
    } finally {
      downloadingEngine.value = false;
    }
  }

  async function removeEngine() {
    await invoke("remove_translation_engine");
    engineDownloaded.value = false;
  }

  async function removeModel(modelId: string) {
    await invoke("remove_translation_model", { modelId });
    downloadedIds.value = new Set([...downloadedIds.value].filter((id) => id !== modelId));
  }

  /** Translates `text` into `targetLanguage` using the currently-selected model - throws if no
   *  model is selected/downloaded yet, since there's nothing sensible to fall back to. */
  async function translate(text: string, targetLanguage: string): Promise<string> {
    if (!selectedModelId.value) throw new Error("No translation model selected.");
    translating.value = true;
    try {
      return await invoke<string>("translate_text", {
        modelId: selectedModelId.value,
        text,
        targetLanguage,
      });
    } finally {
      translating.value = false;
    }
  }

  async function init() {
    models.value = await invoke<TranslationModel[]>("list_translation_models");
    selectedModelId.value = (await settingsRepo.get(TRANSLATION_MODEL_SETTING)) || models.value[0]?.id || null;
    await refreshDownloadedStatus();
    engineDownloaded.value = await invoke<boolean>("is_translation_engine_downloaded");

    unlistenProgress = await listen<TranslationDownloadProgress>("translation-download-progress", (event) => {
      if (event.payload.model_id !== downloadingId.value) return;
      downloadProgress.value = {
        downloaded: event.payload.downloaded_bytes,
        total: event.payload.total_bytes,
      };
    });
  }

  function dispose() {
    unlistenProgress?.();
  }

  return {
    models,
    selectedModelId,
    downloadingId,
    downloadProgress,
    translating,
    engineDownloaded,
    downloadingEngine,
    setSelectedModel,
    downloadModel,
    removeModel,
    downloadEngine,
    removeEngine,
    isDownloaded,
    translate,
    init,
    dispose,
  };
});
