//! Offline translation for game descriptions (Milestone 21's second half). Not a Rust ML crate
//! dependency - llama.cpp's own prebuilt server binary is downloaded once and run as a
//! subprocess, talked to over its OpenAI-compatible HTTP API, instead of linking an inference
//! engine into this app's own binary. See devlog for why (mistralrs/llama-cpp-2 both hit real
//! dead ends first) and for the model-lineup research history behind `list_models()` below.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

const LLAMA_CPP_VERSION: &str = "b10290";
const LLAMA_CPP_ASSET: &str = "llama-b10290-bin-win-cpu-x64.zip";
const SERVER_PORT: u16 = 8712;
// Stops the idle server automatically, not just on model-switch/app-exit - see devlog.
const IDLE_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const IDLE_CHECK_INTERVAL: Duration = Duration::from_secs(30);

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

/// 4 tiers, all under ~2.5GB resident RAM (the sweet spot sized against real 16GB/32GB gaming
/// machines - see devlog). `translategemma-4b` is the recommended default (translation-tuned,
/// no regional bias); `qwen2.5-1.5b`/`qwen3-4b` are cheaper/broader general-purpose
/// alternatives; `qwen3-4b-abliterated` is an explicitly opt-in, non-default uncensored variant
/// for translating NSFW games' own descriptions without false-positive refusals. Rejected
/// candidates (`gemma3-1b`, `gemma4-e4b`, EuroLLM-1.7B) and the full reasoning for every pick
/// here are recorded in devlog, not repeated in this comment - check there before re-proposing
/// an alternative that might already be a documented dead end.
pub fn list_models() -> Vec<TranslationModel> {
    vec![
        TranslationModel {
            id: "qwen2.5-1.5b".to_string(),
            name: "Qwen2.5 1.5B (cheapest, general-purpose)".to_string(),
            repo: "Qwen/Qwen2.5-1.5B-Instruct-GGUF".to_string(),
            file: "qwen2.5-1.5b-instruct-q4_k_m.gguf".to_string(),
            size_bytes: 1_120_000_000,
        },
        TranslationModel {
            id: "translategemma-4b".to_string(),
            name: "TranslateGemma 4B (recommended, translation-specialized)".to_string(),
            repo: "mradermacher/translategemma-4b-it-GGUF".to_string(),
            file: "translategemma-4b-it.Q4_K_M.gguf".to_string(),
            size_bytes: 2_490_000_000,
        },
        TranslationModel {
            id: "qwen3-4b".to_string(),
            name: "Qwen3 4B (broader coverage, general-purpose)".to_string(),
            repo: "unsloth/Qwen3-4B-GGUF".to_string(),
            file: "Qwen3-4B-Q4_K_M.gguf".to_string(),
            size_bytes: 2_500_000_000,
        },
        TranslationModel {
            id: "qwen3-4b-abliterated".to_string(),
            name: "Qwen3 4B Abliterated (opt-in, uncensored - for NSFW game descriptions)"
                .to_string(),
            repo: "bartowski/mlabonne_Qwen3-4B-abliterated-GGUF".to_string(),
            file: "mlabonne_Qwen3-4B-abliterated-Q4_K_M.gguf".to_string(),
            size_bytes: 2_500_000_000,
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

/// Deletes the downloaded engine binary - stops the running server first if there is one, since
/// deleting `llama-server.exe` while it's still running would otherwise fail on Windows (the OS
/// keeps a running executable's file locked).
#[tauri::command]
pub async fn remove_translation_engine(
    app: AppHandle,
    state: tauri::State<'_, TranslationState>,
) -> Result<(), String> {
    if let Some(mut running) = state.running.lock().await.take() {
        let _ = running.child.kill().await;
    }
    let dir = llama_cpp_dir(&app)?;
    if dir.exists() {
        tokio::fs::remove_dir_all(&dir)
            .await
            .map_err(|e| format!("Failed to remove {}: {}", dir.display(), e))?;
    }
    Ok(())
}

/// Deletes a downloaded model's GGUF - stops the running server first if it's currently serving
/// this exact model, same locked-file reasoning as `remove_translation_engine`.
#[tauri::command]
pub async fn remove_translation_model(
    app: AppHandle,
    state: tauri::State<'_, TranslationState>,
    model_id: String,
) -> Result<(), String> {
    {
        let mut guard = state.running.lock().await;
        if guard.as_ref().is_some_and(|r| r.model_id == model_id) {
            if let Some(mut running) = guard.take() {
                let _ = running.child.kill().await;
            }
        }
    }
    let dir = models_dir(&app, &model_id)?;
    if dir.exists() {
        tokio::fs::remove_dir_all(&dir)
            .await
            .map_err(|e| format!("Failed to remove {}: {}", dir.display(), e))?;
    }
    Ok(())
}

#[derive(Clone, Serialize)]
struct TranslationDownloadProgress {
    model_id: String,
    downloaded_bytes: u64,
    total_bytes: u64,
}

/// Payload for `translation-model-loading`/`translation-model-unloaded` - fired around the
/// actual `llama-server.exe` lifecycle (not just the download step above) so the frontend can
/// toast real backend-driven events like the idle-timeout auto-shutdown, which happens with no
/// frontend call in progress to hang a toast off of otherwise.
#[derive(Clone, Serialize)]
struct TranslationModelEvent {
    model_id: String,
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
/// restarts when the requested model id actually changes (or gets stopped by the idle watchdog
/// below after `IDLE_TIMEOUT` of disuse). `generation` disambiguates this instance from
/// whatever might replace it in the `Mutex` slot later - the watchdog task spawned alongside a
/// given server captures this value and only ever acts on a server it still matches, so an old
/// watchdog can never kill a newer server that happens to occupy the same slot.
struct RunningServer {
    model_id: String,
    child: Child,
    last_used: Instant,
    generation: u64,
}

pub struct TranslationState {
    running: Mutex<Option<RunningServer>>,
    next_generation: AtomicU64,
}

impl TranslationState {
    pub fn new() -> Self {
        Self {
            running: Mutex::new(None),
            next_generation: AtomicU64::new(0),
        }
    }

    /// Called from `RunEvent::Exit` - a plain synchronous fire-and-forget kill, not an
    /// `.await`ed `child.kill()`, since app-exit teardown isn't running inside the async
    /// runtime by the time this fires. `blocking_lock` is safe here: this always runs on the
    /// main thread outside of any async task, never inside a `tokio::sync::Mutex` guard held
    /// elsewhere.
    pub fn shutdown(&self) {
        if let Some(mut running) = self.running.blocking_lock().take() {
            let _ = running.child.start_kill();
        }
    }
}

/// Polls every `IDLE_CHECK_INTERVAL` and stops the server once it's sat unused for
/// `IDLE_TIMEOUT` - spawned once per server start (from `ensure_server`), not a single
/// long-lived task, so it naturally stops mattering once the server it watches is gone.
/// Exits quietly (no error to report - this isn't a user-initiated action) as soon as the slot
/// no longer holds the generation it was spawned for, whether that's because the server was
/// killed by a model switch, by `shutdown()` on app exit, or by this same function already
/// having fired.
async fn watch_idle(app: AppHandle, generation: u64) {
    loop {
        tokio::time::sleep(IDLE_CHECK_INTERVAL).await;

        let state = app.state::<TranslationState>();
        let mut guard = state.running.lock().await;
        match guard.as_ref() {
            Some(running) if running.generation == generation => {
                if running.last_used.elapsed() < IDLE_TIMEOUT {
                    continue;
                }
            }
            _ => return,
        }

        if let Some(mut running) = guard.take() {
            drop(guard);
            let _ = app.emit(
                "translation-model-unloaded",
                TranslationModelEvent {
                    model_id: running.model_id.clone(),
                },
            );
            let _ = running.child.kill().await;
        }
        return;
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
    let mut guard = state.running.lock().await;
    if let Some(running) = guard.as_mut() {
        if running.model_id == model_id {
            running.last_used = Instant::now();
            return Ok(());
        }
    }

    // Switching models (or starting for the first time) - stop whatever's running first, since
    // only one server/port is managed at a time.
    if let Some(mut running) = guard.take() {
        let _ = app.emit(
            "translation-model-unloaded",
            TranslationModelEvent {
                model_id: running.model_id.clone(),
            },
        );
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

    let _ = app.emit(
        "translation-model-loading",
        TranslationModelEvent {
            model_id: model_id.to_string(),
        },
    );

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

    let generation = state.next_generation.fetch_add(1, Ordering::SeqCst);
    *guard = Some(RunningServer {
        model_id: model_id.to_string(),
        child,
        last_used: Instant::now(),
        generation,
    });
    drop(guard);

    tauri::async_runtime::spawn(watch_idle(app.clone(), generation));

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
