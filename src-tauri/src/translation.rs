//! Offline translation for game descriptions, via llama.cpp's own prebuilt server binary
//! (Milestone 21's second half). Not a Rust ML crate dependency - nothing is compiled or linked
//! into this app's own binary. Instead, llama.cpp's official prebuilt Windows release (CPU-only
//! x64 build - it bundles a dedicated `llama-gemma3-cli.exe`, confirming real Gemma 3 support in
//! this exact build) is downloaded once, the same way a wrapper plugin manages its own installed
//! runtime, and run as a subprocess talked to over its OpenAI-compatible HTTP API.
//!
//! Why this instead of a Rust crate: two real dead ends found first. `llama-cpp-2`/
//! `llama-cpp-sys-2` (a Rust binding that compiles llama.cpp from source) has live Windows CMake
//! build bugs. `mistralrs` (pure Rust via Candle, no CMake) compiles clean but its own GGUF
//! loader has no `gemma3` architecture entry at all yet (`Unknown GGUF architecture "gemma3"`,
//! hit for real, not just in research) - `llama.cpp` itself is GGUF's reference implementation
//! and has mature Gemma 3 support, so talking to its own server binary over HTTP sidesteps both
//! problems without adding a heavy dependency to every user's binary regardless of whether they
//! ever use translation.

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

const LLAMA_CPP_VERSION: &str = "b10290";
const LLAMA_CPP_ASSET: &str = "llama-b10290-bin-win-cpu-x64.zip";
const SERVER_PORT: u16 = 8712;

/// One selectable model tier. `repo`/`file` are both needed to build the real download URL
/// (`https://huggingface.co/{repo}/resolve/main/{file}`) and the on-disk path this gets saved
/// to (`<app data>/models/{id}/{file}`). All tiers are Q4_K_M quantizations from established
/// community quantizers (`mradermacher`, `unsloth`) - a consistent quantization level across
/// tiers rather than mixing quant levels, so the size/quality tradeoff is driven by parameter
/// count alone.
#[derive(Clone, Serialize)]
pub struct TranslationModel {
    id: String,
    name: String,
    repo: String,
    file: String,
    size_bytes: u64,
}

/// Two model families, deliberately mixed rather than only offering translation-specialized
/// ones: `translategemma-4b` (fine-tuned from Gemma 3 specifically for translation, 55
/// languages) translates better per byte than a same-size general-purpose model, but RAM is
/// the harder constraint for a background app sharing a machine with a running game -
/// `gemma3-1b` and `gemma4-e4b` are offered as meaningfully cheaper (RAM-wise) general-purpose
/// alternatives, at a real quality cost since neither is translation-tuned.
///
/// The 12B/27B TranslateGemma tiers this list used to offer were deliberately removed - their
/// 7.3GB/16.6GB resident RAM footprints (this engine loads the full GGUF into RAM, not just
/// disk) are a bad fit for a background service expected to coexist with a running game on a
/// typical 16-32GB gaming machine (see devlog for the sizing analysis behind this cutoff). All
/// remaining tiers stay under 5GB. Sizes below are real quantized Q4_K_M file sizes verified
/// against each repo's actual GGUF listing (not derived from parameter count alone - Gemma 4's
/// E2B/E4B naming reflects "effective" active params under its elastic sizing, not on-disk
/// size, so e.g. its own E2B GGUF is actually larger than translategemma-4b's despite the
/// smaller name, which is why E2B isn't offered here).
pub fn list_models() -> Vec<TranslationModel> {
    vec![
        TranslationModel {
            id: "gemma3-1b".to_string(),
            name: "Gemma 3 1B (cheapest, general-purpose)".to_string(),
            repo: "unsloth/gemma-3-1b-it-GGUF".to_string(),
            file: "gemma-3-1b-it-Q4_K_M.gguf".to_string(),
            size_bytes: 845_000_000,
        },
        TranslationModel {
            id: "translategemma-4b".to_string(),
            name: "TranslateGemma 4B (recommended, translation-specialized)".to_string(),
            repo: "mradermacher/translategemma-4b-it-GGUF".to_string(),
            file: "translategemma-4b-it.Q4_K_M.gguf".to_string(),
            size_bytes: 2_490_000_000,
        },
        TranslationModel {
            id: "gemma4-e4b".to_string(),
            name: "Gemma 4 E4B (balanced, general-purpose)".to_string(),
            repo: "unsloth/gemma-4-E4B-it-GGUF".to_string(),
            file: "gemma-4-E4B-it-Q4_K_M.gguf".to_string(),
            size_bytes: 4_980_000_000,
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

fn llama_cpp_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("llama-cpp"))
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))
}

fn llama_server_exe(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(llama_cpp_dir(app)?.join("llama-server.exe"))
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

#[tauri::command]
pub fn is_translation_engine_downloaded(app: AppHandle) -> Result<bool, String> {
    Ok(llama_server_exe(&app)?.exists())
}

/// Downloads llama.cpp's own prebuilt CPU-only Windows server build once - a flat zip (no
/// wrapping subfolder, verified against a real download of this exact release), extracted
/// straight into `<app data>/llama-cpp/`. Pinned to a specific release tag, not "latest" - same
/// "never trust a mutable pointer" reasoning the plugin registry already pins exact commit SHAs
/// for. Small enough (~18MB) that a one-shot download suffices, unlike the multi-gigabyte model
/// files below.
#[tauri::command]
pub async fn download_translation_engine(app: AppHandle) -> Result<(), String> {
    let dir = llama_cpp_dir(&app)?;
    let url = format!(
        "https://github.com/ggml-org/llama.cpp/releases/download/{}/{}",
        LLAMA_CPP_VERSION, LLAMA_CPP_ASSET
    );
    let bytes = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to download {}: {}", url, e))?
        .error_for_status()
        .map_err(|e| format!("Failed to download {}: {}", url, e))?
        .bytes()
        .await
        .map_err(|e| format!("Failed to download {}: {}", url, e))?;

    let staging_dir = llama_cpp_dir(&app)?.with_extension("staging");
    crate::zip_install::extract_zip(&bytes, &staging_dir)?;
    crate::zip_install::replace_dir(&staging_dir, &dir)?;
    Ok(())
}

#[derive(Clone, Serialize)]
struct TranslationDownloadProgress {
    model_id: String,
    downloaded_bytes: u64,
    total_bytes: u64,
}

/// Streams the GGUF into `<app data>/models/<id>/<file>`, emitting `translation-download-
/// progress` as it goes - the file itself is multi-gigabyte, so unlike the engine zip above
/// (small, one-shot) or every other download in this app (small plugin manifests/`.wasm`
/// files), this genuinely needs incremental progress reporting.
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

/// The currently-running `llama-server.exe`, if any - starting it (loading a multi-gigabyte
/// GGUF) is too slow to redo per translation call, so it stays running across calls and only
/// restarts when the requested model id actually changes.
struct RunningServer {
    model_id: String,
    child: Child,
}

pub struct TranslationState(Mutex<Option<RunningServer>>);

impl TranslationState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }

    /// Called from `RunEvent::Exit` - a plain synchronous fire-and-forget kill, not an
    /// `.await`ed `child.kill()`, since app-exit teardown isn't running inside the async
    /// runtime by the time this fires. `blocking_lock` is safe here: this always runs on the
    /// main thread outside of any async task, never inside a `tokio::sync::Mutex` guard held
    /// elsewhere.
    pub fn shutdown(&self) {
        if let Some(mut running) = self.0.blocking_lock().take() {
            let _ = running.child.start_kill();
        }
    }
}

async fn wait_until_ready(client: &reqwest::Client) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}/health", SERVER_PORT);
    for _ in 0..120 {
        if let Ok(resp) = client.get(&url).send().await {
            if resp.status().is_success() {
                return Ok(());
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    Err("Translation engine didn't become ready in time.".to_string())
}

async fn ensure_server(
    app: &AppHandle,
    state: &TranslationState,
    model_id: &str,
) -> Result<(), String> {
    let mut guard = state.0.lock().await;
    if let Some(running) = guard.as_ref() {
        if running.model_id == model_id {
            return Ok(());
        }
    }

    // Switching models (or starting for the first time) - stop whatever's running first, since
    // only one server/port is managed at a time.
    if let Some(mut running) = guard.take() {
        let _ = running.child.kill().await;
    }

    let model_spec = find_model(model_id)?;
    let dir = models_dir(app, model_id)?;
    let model_path = dir.join(&model_spec.file);
    if !model_path.exists() {
        return Err(format!(
            "Model '{}' isn't downloaded yet - download it in Settings first.",
            model_spec.name
        ));
    }

    let server_exe = llama_server_exe(app)?;
    if !server_exe.exists() {
        return Err(
            "Translation engine isn't downloaded yet - download it in Settings first.".to_string(),
        );
    }

    let child = Command::new(&server_exe)
        .arg("-m")
        .arg(&model_path)
        .arg("--port")
        .arg(SERVER_PORT.to_string())
        .arg("-c")
        .arg("4096")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to start translation engine: {}", e))?;

    *guard = Some(RunningServer {
        model_id: model_id.to_string(),
        child,
    });
    drop(guard);

    wait_until_ready(&reqwest::Client::new()).await
}

#[derive(Serialize)]
struct ChatMessage {
    role: &'static str,
    content: String,
}

#[derive(Serialize)]
struct ChatRequest {
    model: &'static str,
    messages: Vec<ChatMessage>,
    temperature: f32,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessageResponse,
}

#[derive(Deserialize)]
struct ChatMessageResponse {
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[tauri::command]
pub async fn translate_text(
    app: AppHandle,
    state: tauri::State<'_, TranslationState>,
    model_id: String,
    text: String,
    target_language: String,
) -> Result<String, String> {
    ensure_server(&app, &state, &model_id).await?;

    let prompt = format!(
        "Translate the following text into {}. Only output the translation, nothing else.\n\n{}",
        target_language, text
    );
    let request = ChatRequest {
        model: "translation",
        messages: vec![ChatMessage {
            role: "user",
            content: prompt,
        }],
        temperature: 0.3,
    };

    let response = reqwest::Client::new()
        .post(format!(
            "http://127.0.0.1:{}/v1/chat/completions",
            SERVER_PORT
        ))
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Translation request failed: {}", e))?
        .error_for_status()
        .map_err(|e| format!("Translation request failed: {}", e))?
        .json::<ChatResponse>()
        .await
        .map_err(|e| format!("Failed to parse translation response: {}", e))?;

    response
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or_else(|| "Model returned an empty response".to_string())
}
