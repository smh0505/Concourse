use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Cursor;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Same shape as the TS `PluginManifest` (src/plugins/manifest.ts) - runtime-installed WASM
/// plugins live outside `src/plugins/` (which only holds build-time TS ones) but present an
/// identical manifest so the frontend loader doesn't need two different data shapes.
#[derive(Deserialize, Serialize, Clone)]
pub struct WasmPluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub kind: String,
    pub entry: String,
}

fn wasm_plugins_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("wasm-plugins"))
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))
}

/// Downloads a plugin bundle (a zip containing `plugin.json` + a `.wasm` entry, matching
/// the existing `src/plugins/<id>/plugin.json` shape) from a user-pasted URL, verifies its
/// integrity, and extracts it into the app-data plugins dir under the id declared in its own
/// manifest. This only installs the bundle - it doesn't load/instantiate it (see
/// wasm_plugins.rs) or register it with the frontend loader (a later checklist item).
///
/// `expected_sha256` is optional since this is a paste-a-URL flow with no separate trusted
/// source for a pinned hash - when provided (e.g. the user copied it from wherever they got
/// the URL) it protects against a corrupted/tampered-in-transit download, not against a
/// malicious bundle from a source the user already chose to trust. See milestones.md
/// Milestone 8's plugin-privilege note.
#[tauri::command]
pub async fn install_wasm_plugin(
    app: AppHandle,
    url: String,
    expected_sha256: Option<String>,
) -> Result<String, String> {
    let bytes = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to download {}: {}", url, e))?
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    if let Some(expected) = &expected_sha256 {
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected) {
            return Err(format!(
                "Checksum mismatch: expected {}, got {}",
                expected, actual
            ));
        }
    }

    let plugins_dir = wasm_plugins_dir(&app)?;
    std::fs::create_dir_all(&plugins_dir)
        .map_err(|e| format!("Failed to create plugins dir: {}", e))?;

    let staging_dir = plugins_dir.join(format!(".staging-{}", std::process::id()));
    if staging_dir.exists() {
        std::fs::remove_dir_all(&staging_dir).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir_all(&staging_dir).map_err(|e| e.to_string())?;

    let mut archive = zip::ZipArchive::new(Cursor::new(bytes.as_ref()))
        .map_err(|e| format!("Failed to open bundle as a zip: {}", e))?;
    archive
        .extract(&staging_dir)
        .map_err(|e| format!("Failed to extract bundle: {}", e))?;

    let manifest_path = staging_dir.join("plugin.json");
    let manifest_content = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Bundle is missing plugin.json: {}", e))?;
    let manifest: WasmPluginManifest = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("Invalid plugin.json: {}", e))?;

    let final_dir = plugins_dir.join(&manifest.id);
    if final_dir.exists() {
        std::fs::remove_dir_all(&final_dir).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&staging_dir, &final_dir)
        .map_err(|e| format!("Failed to install to {}: {}", final_dir.display(), e))?;

    Ok(manifest.id)
}

/// Lists every installed WASM plugin's manifest, for the frontend loader to merge alongside
/// the build-time-discovered TS ones (see loader.ts).
#[tauri::command]
pub fn list_wasm_plugins(app: AppHandle) -> Result<Vec<WasmPluginManifest>, String> {
    let plugins_dir = wasm_plugins_dir(&app)?;
    if !plugins_dir.exists() {
        return Ok(Vec::new());
    }

    let entries =
        std::fs::read_dir(&plugins_dir).map_err(|e| format!("Failed to list plugins: {}", e))?;

    let mut manifests = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let is_staging = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|name| name.starts_with(".staging-"))
            .unwrap_or(true);
        if !path.is_dir() || is_staging {
            continue;
        }

        let manifest_path = path.join("plugin.json");
        let Ok(content) = std::fs::read_to_string(&manifest_path) else {
            continue;
        };
        if let Ok(manifest) = serde_json::from_str::<WasmPluginManifest>(&content) {
            manifests.push(manifest);
        }
    }

    Ok(manifests)
}
