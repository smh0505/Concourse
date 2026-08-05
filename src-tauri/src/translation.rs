//! Offline translation for game descriptions, via a local LLM (Milestone 21's second half).
//! Built-in host-native module, not a WASM plugin - `mistralrs` (Candle-based inference) is a
//! heavy native dependency that doesn't fit the wasmtime Component Model sandbox the way a
//! source/metadata/wrapper plugin does. The model itself is still opt-in: nothing is bundled
//! into the installer, a user picks a tier and downloads it on first use.
//!
//! Engine choice: `mistralrs`, not `llama-cpp-2` - the research spike (see .claude/devlog.md)
//! found live Windows-specific bugs in `llama-cpp-sys-2` (a CMake build failure in a recent
//! patch version, a >4GB-GGUF MSVC correctness bug) and verified `mistralrs` compiles clean on
//! this target with no native build step at all (pure Rust via Candle).

use std::path::PathBuf;
use std::sync::Arc;

use mistralrs::{GgufModelBuilder, Model, TextMessageRole, TextMessages};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

/// One selectable model tier. `repo`/`file` are both needed to build the real download URL
/// (`https://huggingface.co/{repo}/resolve/main/{file}`) and the on-disk path this gets saved
/// to (`<app data>/models/{id}/{file}`). All three tiers are the same Q4_K_M quantization from
/// `mradermacher` (a well-established community GGUF quantizer) - a consistent quality/size
/// tradeoff point across tiers rather than mixing quant levels.
#[derive(Clone, Serialize)]
pub struct TranslationModel {
    id: String,
    name: String,
    repo: String,
    file: String,
    size_bytes: u64,
}

/// 12B is the recommended default, not necessarily the largest - per the model comparison this
/// milestone's own research already did, TranslateGemma's 12B checkpoint reportedly beats the
/// 27B baseline on benchmarks, and `mradermacher`'s own listing calls 12B's Q4_K_M "fast,
/// recommended." 4B/27B are offered too since size/quality is still a real user tradeoff.
pub fn list_models() -> Vec<TranslationModel> {
    vec![
        TranslationModel {
            id: "translategemma-4b".to_string(),
            name: "TranslateGemma 4B (fast)".to_string(),
            repo: "mradermacher/translategemma-4b-it-GGUF".to_string(),
            file: "translategemma-4b-it.Q4_K_M.gguf".to_string(),
            size_bytes: 2_600_000_000,
        },
        TranslationModel {
            id: "translategemma-12b".to_string(),
            name: "TranslateGemma 12B (recommended)".to_string(),
            repo: "mradermacher/translategemma-12b-it-GGUF".to_string(),
            file: "translategemma-12b-it.Q4_K_M.gguf".to_string(),
            size_bytes: 7_400_000_000,
        },
        TranslationModel {
            id: "translategemma-27b".to_string(),
            name: "TranslateGemma 27B (best quality)".to_string(),
            repo: "mradermacher/translategemma-27b-it-GGUF".to_string(),
            file: "translategemma-27b-it.Q4_K_M.gguf".to_string(),
            size_bytes: 16_600_000_000,
        },
    ]
}

fn find_model(model_id: &str) -> Result<TranslationModel, String> {
    list_models()
        .into_iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| format!("Unknown translation model id: {}", model_id))
}

fn models_dir(app: &AppHandle, model_id: &str) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("models").join(model_id))
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))
}

#[tauri::command]
pub fn list_translation_models() -> Vec<TranslationModel> {
    list_models()
}

#[tauri::command]
pub fn is_translation_model_downloaded(app: AppHandle, model_id: String) -> Result<bool, String> {
    let model = find_model(&model_id)?;
    Ok(models_dir(&app, &model_id)?.join(&model.file).exists())
}

#[derive(Clone, Serialize)]
struct TranslationDownloadProgress {
    model_id: String,
    downloaded_bytes: u64,
    total_bytes: u64,
}

/// Streams the GGUF into `<app data>/models/<id>/<file>`, emitting `translation-download-
/// progress` as it goes - the file itself is multi-gigabyte, so unlike every other download in
/// this app (small plugin manifests/`.wasm` files, a one-shot `bytes()` read), this genuinely
/// needs incremental progress reporting rather than a single all-at-once buffer.
#[tauri::command]
pub async fn download_translation_model(app: AppHandle, model_id: String) -> Result<(), String> {
    let model = find_model(&model_id)?;
    let dir = models_dir(&app, &model_id)?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Failed to create model directory: {}", e))?;

    let url = format!(
        "https://huggingface.co/{}/resolve/main/{}",
        model.repo, model.file
    );
    let mut response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to download {}: {}", url, e))?
        .error_for_status()
        .map_err(|e| format!("Failed to download {}: {}", url, e))?;

    let total_bytes = response.content_length().unwrap_or(model.size_bytes);
    let dest_path = dir.join(&model.file);
    // Downloaded to a temp path first, renamed into place on success - a half-downloaded file
    // left at the real path would otherwise look "downloaded" to is_translation_model_downloaded
    // on next launch.
    let tmp_path = dir.join(format!("{}.part", model.file));
    let mut file = tokio::fs::File::create(&tmp_path)
        .await
        .map_err(|e| format!("Failed to create {}: {}", tmp_path.display(), e))?;

    let mut downloaded_bytes = 0u64;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Download interrupted: {}", e))?
    {
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|e| format!("Failed to write {}: {}", tmp_path.display(), e))?;
        downloaded_bytes += chunk.len() as u64;
        let _ = app.emit(
            "translation-download-progress",
            TranslationDownloadProgress {
                model_id: model_id.clone(),
                downloaded_bytes,
                total_bytes,
            },
        );
    }

    tokio::fs::rename(&tmp_path, &dest_path)
        .await
        .map_err(|e| format!("Failed to finalize download: {}", e))?;

    Ok(())
}

/// The one loaded model, if any - loading a multi-gigabyte GGUF is too slow to redo on every
/// `translate_text` call, so this stays loaded across calls and only reloads when the
/// requested model id actually changes.
struct LoadedModel {
    model_id: String,
    model: Arc<Model>,
}

pub struct TranslationState(Mutex<Option<LoadedModel>>);

impl TranslationState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

async fn get_or_load_model(
    app: &AppHandle,
    state: &TranslationState,
    model_id: &str,
) -> Result<Arc<Model>, String> {
    let mut guard = state.0.lock().await;
    if let Some(loaded) = guard.as_ref() {
        if loaded.model_id == model_id {
            return Ok(loaded.model.clone());
        }
    }

    let model_spec = find_model(model_id)?;
    let dir = models_dir(app, model_id)?;
    if !dir.join(&model_spec.file).exists() {
        return Err(format!(
            "Model '{}' isn't downloaded yet - download it in Settings first.",
            model_spec.name
        ));
    }

    let model = GgufModelBuilder::new(
        dir.to_string_lossy().to_string(),
        vec![model_spec.file.clone()],
    )
    .with_logging()
    .build()
    .await
    .map_err(|e| format!("Failed to load model '{}': {}", model_spec.name, e))?;

    let model = Arc::new(model);
    *guard = Some(LoadedModel {
        model_id: model_id.to_string(),
        model: model.clone(),
    });
    Ok(model)
}

#[tauri::command]
pub async fn translate_text(
    app: AppHandle,
    state: tauri::State<'_, TranslationState>,
    model_id: String,
    text: String,
    target_language: String,
) -> Result<String, String> {
    let model = get_or_load_model(&app, &state, &model_id).await?;

    let prompt = format!(
        "Translate the following text into {}. Only output the translation, nothing else.\n\n{}",
        target_language, text
    );
    let messages = TextMessages::new().add_message(TextMessageRole::User, prompt);
    let response = model
        .send_chat_request(messages)
        .await
        .map_err(|e| format!("Translation failed: {}", e))?;

    response.choices[0]
        .message
        .content
        .clone()
        .ok_or_else(|| "Model returned an empty response".to_string())
}
