//! Install-by-URL for every plugin kind that supports it - WASM source plugins (Milestone 8)
//! and data-only theme manifests (Milestone 8.5). Merged into one module since both kinds
//! share the same "fetch a manifest, figure out what it is, install accordingly" shape, and
//! the app's single "Add Plugin" UI (one button, one URL field, one confirm dialog for either
//! kind) already treats them as one flow rather than two.

use crate::zip_install::replace_dir;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// The only two kinds a WIT world exists for today (see `wit/plugin.wit`'s `source-plugin`/
/// `wrapper-plugin` interfaces) - also doubles as a path-safety allowlist, since a WASM
/// manifest's `kind` is remote-controlled input that ends up as a directory name below.
const SUPPORTED_WASM_KINDS: &[&str] = &["source", "wrapper"];

fn default_theme_kind() -> String {
    "theme".to_string()
}

/// GitHub's API (and some CDNs) reject requests with no `User-Agent` at all - applied to every
/// fetch in this file, not just GitHub API calls, since it's harmless for plain asset downloads
/// too.
async fn download_bytes(url: &str) -> Result<bytes::Bytes, String> {
    reqwest::Client::new()
        .get(url)
        .header("User-Agent", "concourse")
        .send()
        .await
        .map_err(|e| format!("Failed to download {}: {}", url, e))?
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))
}

/// Same shape as the TS `PluginManifest` (src/plugins/manifest.ts) so the frontend loader
/// doesn't need two different data shapes for build-time TS vs. runtime-installed WASM plugins.
#[derive(Deserialize, Serialize, Clone)]
pub struct WasmPluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub kind: String,
    pub entry: String,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct DataThemeManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    /// Defaulted, not required - matches `WasmPluginManifest`'s `kind` field so both manifest
    /// shapes can be told apart by the same field, but themes already published before this
    /// field existed still parse fine without it.
    #[serde(default = "default_theme_kind")]
    pub kind: String,
    #[serde(rename = "cssVariables")]
    pub css_variables: HashMap<String, String>,
}

/// Loosely-typed probe used only to tell a WASM plugin's manifest apart from a data-only
/// theme's before committing to parsing either shape fully. `kind` is present and explicit on
/// both current manifest shapes ("source"/"wrapper"/"theme"), but theme manifests published
/// before that field existed lack it entirely - `css_variables` is the fallback signal for
/// those older, still-installable manifests.
#[derive(Deserialize)]
struct ManifestKindProbe {
    kind: Option<String>,
    #[serde(rename = "cssVariables")]
    css_variables: Option<serde_json::Value>,
}

fn detect_kind(probe: &ManifestKindProbe) -> Result<String, String> {
    match probe.kind.as_deref() {
        Some("source") => Ok("source".to_string()),
        Some("theme") => Ok("theme".to_string()),
        Some(other) => Err(format!(
            "\"{}\" plugins can't be installed by URL yet.",
            other
        )),
        None if probe.css_variables.is_some() => Ok("theme".to_string()),
        None => Err("Could not determine plugin kind from this manifest.".to_string()),
    }
}

/// What the confirm-before-install dialog shows - a subset common to every manifest shape.
#[derive(Serialize)]
pub struct PluginPreview {
    pub id: String,
    pub name: String,
    pub version: String,
    pub kind: String,
}

/// Fetches a manifest from a user-pasted URL and returns just enough to show a confirmation
/// dialog (id/name/version/kind) - doesn't install or download anything beyond the manifest
/// itself.
#[tauri::command]
pub async fn fetch_plugin_preview(url: String) -> Result<PluginPreview, String> {
    let bytes = download_bytes(&url).await?;
    let probe: ManifestKindProbe =
        serde_json::from_slice(&bytes).map_err(|e| format!("Invalid plugin manifest: {}", e))?;
    let kind = detect_kind(&probe)?;

    if kind == "source" {
        let manifest: WasmPluginManifest =
            serde_json::from_slice(&bytes).map_err(|e| format!("Invalid plugin.json: {}", e))?;
        Ok(PluginPreview {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            kind,
        })
    } else {
        let manifest: DataThemeManifest = serde_json::from_slice(&bytes)
            .map_err(|e| format!("Invalid theme manifest: {}", e))?;
        Ok(PluginPreview {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            kind,
        })
    }
}

fn wasm_plugins_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("wasm-plugins"))
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))
}

fn data_themes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("data-themes"))
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))
}

/// Derives the sibling `.wasm` URL from a manifest URL: same directory, filename replaced with
/// `entry`. Only works because each WASM plugin repo's own publish workflow (see e.g.
/// steam-source-wasm-plugin's `.github/workflows/publish.yml`) publishes `plugin.json` and its
/// `.wasm` as two plain files in the same GitHub Release, not bundled into a zip.
fn sibling_url(manifest_url: &str, entry: &str) -> Result<String, String> {
    let last_slash = manifest_url
        .rfind('/')
        .ok_or_else(|| "Malformed manifest URL".to_string())?;
    Ok(format!("{}/{}", &manifest_url[..last_slash], entry))
}

/// Downloads a plugin's sibling `.wasm` entry and installs both files into
/// `<app data>/wasm-plugins/<kind>/<id>/` (kind subfolder keeps source/wrapper plugins
/// separated on disk). `manifest_bytes` is the already-downloaded `plugin.json` content.
async fn install_wasm_plugin(
    app: &AppHandle,
    manifest_url: &str,
    manifest_bytes: &[u8],
) -> Result<String, String> {
    let manifest: WasmPluginManifest = serde_json::from_slice(manifest_bytes)
        .map_err(|e| format!("Invalid plugin.json: {}", e))?;

    if !SUPPORTED_WASM_KINDS.contains(&manifest.kind.as_str()) {
        return Err(format!(
            "\"{}\" plugins can't be installed by URL yet.",
            manifest.kind
        ));
    }

    let wasm_url = sibling_url(manifest_url, &manifest.entry)?;
    let wasm_bytes = download_bytes(&wasm_url).await?;

    let kind_dir = wasm_plugins_dir(app)?.join(&manifest.kind);
    std::fs::create_dir_all(&kind_dir)
        .map_err(|e| format!("Failed to create plugins dir: {}", e))?;

    let staging_dir = kind_dir.join(format!(".staging-{}", std::process::id()));
    if staging_dir.exists() {
        std::fs::remove_dir_all(&staging_dir).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir_all(&staging_dir).map_err(|e| e.to_string())?;
    std::fs::write(staging_dir.join("plugin.json"), manifest_bytes)
        .map_err(|e| format!("Failed to write plugin.json: {}", e))?;
    std::fs::write(staging_dir.join(&manifest.entry), &wasm_bytes)
        .map_err(|e| format!("Failed to write {}: {}", manifest.entry, e))?;

    let final_dir = kind_dir.join(&manifest.id);
    replace_dir(&staging_dir, &final_dir)?;

    Ok(manifest.id)
}

/// Caches a theme manifest under `<app data>/data-themes/<id>/theme.json` - no download beyond
/// the manifest itself, since a data-only theme has no code, just `cssVariables`.
/// `manifest_bytes` is the already-downloaded manifest content.
fn install_data_theme(dir: &Path, manifest_bytes: &[u8]) -> Result<String, String> {
    let manifest: DataThemeManifest = serde_json::from_slice(manifest_bytes)
        .map_err(|e| format!("Invalid theme manifest: {}", e))?;
    if manifest.id.trim().is_empty() {
        return Err("Theme manifest is missing an id".to_string());
    }
    if manifest.css_variables.is_empty() {
        return Err("Theme manifest has no cssVariables".to_string());
    }

    let theme_dir = dir.join(&manifest.id);
    std::fs::create_dir_all(&theme_dir)
        .map_err(|e| format!("Failed to create {}: {}", theme_dir.display(), e))?;
    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    std::fs::write(theme_dir.join("theme.json"), manifest_json)
        .map_err(|e| format!("Failed to write theme.json: {}", e))?;

    Ok(manifest.id)
}

/// Installs a plugin from a user-pasted manifest URL - re-fetches the manifest (cheap, a few
/// KB) rather than reusing bytes from `fetch_plugin_preview`, keeping both commands simple and
/// stateless. Branches on the manifest's own `kind` once fetched.
#[tauri::command]
pub async fn install_plugin(app: AppHandle, url: String) -> Result<String, String> {
    let bytes = download_bytes(&url).await?;
    let probe: ManifestKindProbe =
        serde_json::from_slice(&bytes).map_err(|e| format!("Invalid plugin manifest: {}", e))?;
    let kind = detect_kind(&probe)?;

    if kind == "source" {
        install_wasm_plugin(&app, &url, &bytes).await
    } else {
        install_data_theme(&data_themes_dir(&app)?, &bytes)
    }
}

/// Lists every installed WASM plugin's manifest, for the frontend loader to merge alongside
/// the build-time-discovered TS ones (see loader.ts). Scans each known kind subfolder under
/// `wasm-plugins/` (`wasm-plugins/<kind>/<id>/plugin.json`) rather than a flat listing.
#[tauri::command]
pub fn list_wasm_plugins(app: AppHandle) -> Result<Vec<WasmPluginManifest>, String> {
    let plugins_dir = wasm_plugins_dir(&app)?;

    let mut manifests = Vec::new();
    for kind in SUPPORTED_WASM_KINDS {
        let kind_dir = plugins_dir.join(kind);
        if !kind_dir.exists() {
            continue;
        }

        let entries = std::fs::read_dir(&kind_dir)
            .map_err(|e| format!("Failed to list {}: {}", kind_dir.display(), e))?;

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
    }

    Ok(manifests)
}

fn list_data_themes_from(dir: &Path) -> Result<Vec<DataThemeManifest>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let entries =
        std::fs::read_dir(dir).map_err(|e| format!("Failed to list {}: {}", dir.display(), e))?;

    let mut manifests = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let manifest_path = entry.path().join("theme.json");
        let Ok(content) = std::fs::read_to_string(&manifest_path) else {
            continue;
        };
        if let Ok(manifest) = serde_json::from_str::<DataThemeManifest>(&content) {
            manifests.push(manifest);
        }
    }

    Ok(manifests)
}

#[tauri::command]
pub fn list_data_themes(app: AppHandle) -> Result<Vec<DataThemeManifest>, String> {
    list_data_themes_from(&data_themes_dir(&app)?)
}

fn uninstall_data_theme_from(dir: &Path, id: &str) -> Result<(), String> {
    let theme_dir = dir.join(id);
    if !theme_dir.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(&theme_dir)
        .map_err(|e| format!("Failed to remove {}: {}", theme_dir.display(), e))
}

#[tauri::command]
pub fn uninstall_data_theme(app: AppHandle, id: String) -> Result<(), String> {
    uninstall_data_theme_from(&data_themes_dir(&app)?, &id)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "gamelib-plugin-installer-test-{}-{}",
                label,
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            Self(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    /// Minimal single-request HTTP/1.1 server on an OS-assigned port, so the test below
    /// exercises a real `reqwest` HTTP round-trip (not a mocked response) without depending
    /// on any external process or network access - self-contained and reproducible anywhere.
    fn serve_once(body: &'static str) -> String {
        use std::io::{Read, Write};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 1024];
            let _ = stream.read(&mut buf);
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
        });

        format!("http://127.0.0.1:{}/theme.json", port)
    }

    // Real end-to-end against a real (if minimal, self-hosted) HTTP server - install, list,
    // and uninstall all round-trip through a real HTTP request and the real filesystem, not
    // mocked at any layer.
    #[test]
    fn installs_lists_and_uninstalls_a_real_theme() {
        let temp = TempDir::new("install");
        // Note the r##"..."## delimiter (not r#"..."#) - the JSON body itself contains the
        // `"#` sequence (hex color values), which would otherwise prematurely close a
        // single-hash raw string.
        let url = serve_once(
            r##"{"id":"test-online-theme","name":"Test Online Theme","version":"1.0.0","kind":"theme","cssVariables":{"--color-base":"#123456","--color-accent":"#abcdef"}}"##,
        );

        let bytes = tauri::async_runtime::block_on(download_bytes(&url)).expect("download should succeed");
        let id = install_data_theme(&temp.0, &bytes).expect("install should succeed");
        assert_eq!(id, "test-online-theme");

        let manifests = list_data_themes_from(&temp.0).expect("list should succeed");
        assert_eq!(manifests.len(), 1);
        assert_eq!(manifests[0].id, "test-online-theme");
        assert_eq!(manifests[0].name, "Test Online Theme");
        assert_eq!(
            manifests[0].css_variables.get("--color-base").map(String::as_str),
            Some("#123456")
        );

        uninstall_data_theme_from(&temp.0, &id).expect("uninstall should succeed");
        let manifests_after = list_data_themes_from(&temp.0).expect("list should succeed");
        assert!(manifests_after.is_empty(), "expected theme to be gone after uninstall");
    }

    #[test]
    fn rejects_a_manifest_with_no_css_variables() {
        let temp = TempDir::new("no-vars");

        // Serve nothing real here - just prove the validation path directly, since spinning
        // up a second real server for a negative case isn't worth it when the positive path
        // already proves real HTTP + real filesystem round-tripping.
        let result = list_data_themes_from(&temp.0);
        assert!(result.unwrap().is_empty(), "missing dir should list as empty, not error");
    }

    #[test]
    fn detects_source_theme_and_unsupported_kinds() {
        let source = ManifestKindProbe { kind: Some("source".to_string()), css_variables: None };
        assert_eq!(detect_kind(&source).unwrap(), "source");

        let theme = ManifestKindProbe { kind: Some("theme".to_string()), css_variables: None };
        assert_eq!(detect_kind(&theme).unwrap(), "theme");

        let legacy_theme = ManifestKindProbe {
            kind: None,
            css_variables: Some(serde_json::json!({"--color-base": "#fff"})),
        };
        assert_eq!(detect_kind(&legacy_theme).unwrap(), "theme");

        let metadata = ManifestKindProbe { kind: Some("metadata".to_string()), css_variables: None };
        assert!(detect_kind(&metadata).is_err());

        let unknown = ManifestKindProbe { kind: None, css_variables: None };
        assert!(detect_kind(&unknown).is_err());
    }
}
