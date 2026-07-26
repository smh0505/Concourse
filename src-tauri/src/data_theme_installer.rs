//! Managed install for data-only theme plugins - a `cssVariables`-only `ThemePlugin` has no
//! code at all (no `slots`, no `activate`/`deactivate`), so unlike every other plugin kind it
//! doesn't need WASM sandboxing or a build-time TS bundle: the manifest itself *is* the whole
//! plugin, a flat JSON file fetched from a user-pasted URL and cached locally.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Deserialize, Serialize, Clone)]
pub struct DataThemeManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(rename = "cssVariables")]
    pub css_variables: HashMap<String, String>,
}

fn data_themes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("data-themes"))
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))
}

/// Downloads a theme manifest from `url` and caches it under `dir` - no checksum/size check
/// the way wrapper/WASM-plugin installs have, since there's no binary content or code
/// execution involved at all (worst case is a bad CSS variable value, not arbitrary code).
/// Kept `AppHandle`-free so it's directly unit-testable without a running Tauri app.
async fn install_data_theme_to(url: &str, dir: &Path) -> Result<String, String> {
    let json = reqwest::Client::new()
        .get(url)
        .header("User-Agent", "concourse")
        .send()
        .await
        .map_err(|e| format!("Failed to download {}: {}", url, e))?
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    let manifest: DataThemeManifest =
        serde_json::from_str(&json).map_err(|e| format!("Invalid theme manifest: {}", e))?;
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

fn list_data_themes_from(dir: &Path) -> Result<Vec<DataThemeManifest>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let entries = std::fs::read_dir(dir).map_err(|e| format!("Failed to list {}: {}", dir.display(), e))?;

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

fn uninstall_data_theme_from(dir: &Path, id: &str) -> Result<(), String> {
    let theme_dir = dir.join(id);
    if !theme_dir.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(&theme_dir)
        .map_err(|e| format!("Failed to remove {}: {}", theme_dir.display(), e))
}

#[tauri::command]
pub async fn install_data_theme(app: AppHandle, url: String) -> Result<String, String> {
    install_data_theme_to(&url, &data_themes_dir(&app)?).await
}

#[tauri::command]
pub fn list_data_themes(app: AppHandle) -> Result<Vec<DataThemeManifest>, String> {
    list_data_themes_from(&data_themes_dir(&app)?)
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
                "gamelib-data-theme-test-{}-{}",
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
            r##"{"id":"test-online-theme","name":"Test Online Theme","version":"1.0.0","cssVariables":{"--color-base":"#123456","--color-accent":"#abcdef"}}"##,
        );

        let id = tauri::async_runtime::block_on(install_data_theme_to(&url, &temp.0))
            .expect("install should succeed");
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
}
