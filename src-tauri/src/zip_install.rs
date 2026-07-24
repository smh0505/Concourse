//! Shared download-a-zip-and-extract-it-safely shape. Split into three steps rather than one
//! all-in-one function so callers that need to inspect the raw bytes first (e.g. a SHA256
//! check) can do so. Used directly (async) by `wasm_plugin_installer.rs`, and re-exposed as
//! synchronous host functions in `wasm_plugins.rs` (`extract-zip`/`unwrap-single-subdir`/
//! `replace-dir`) so WASM plugins - e.g. the wrapper plugins' own managed-install flow - can
//! use the same logic without needing to compile a zip-parsing crate into every guest.

use std::io::Cursor;
use std::path::Path;

pub async fn download_bytes(url: &str) -> Result<bytes::Bytes, String> {
    reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to download {}: {}", url, e))?
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))
}

/// Extracts zip bytes into `staging_dir` (created fresh; any existing directory there is
/// removed first). Doesn't move the result anywhere else - callers call `replace_dir`
/// themselves once they know (or have inspected the content to determine) the final location.
pub fn extract_zip(bytes: &[u8], staging_dir: &Path) -> Result<(), String> {
    if staging_dir.exists() {
        std::fs::remove_dir_all(staging_dir).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir_all(staging_dir).map_err(|e| e.to_string())?;

    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|e| format!("Failed to open download as a zip: {}", e))?;
    archive
        .extract(staging_dir)
        .map_err(|e| format!("Failed to extract zip: {}", e))
}

/// Many release zips wrap their contents in one top-level folder matching the archive's own
/// name (e.g. `Locale_Remulator.1.6.0.zip` contains `Locale_Remulator.1.6.0/LRProc.exe`). If
/// `dir` contains exactly one entry and it's a directory, returns that subdirectory; otherwise
/// returns `dir` unchanged.
pub fn unwrap_single_subdir(dir: &Path) -> Result<std::path::PathBuf, String> {
    let mut entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to list {}: {}", dir.display(), e))?
        .collect::<std::io::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    if entries.len() == 1 && entries[0].path().is_dir() {
        Ok(entries.remove(0).path())
    } else {
        Ok(dir.to_path_buf())
    }
}

/// Atomically replaces whatever's at `final_dir` with `staging_dir` (remove-then-rename) -
/// so a failed/interrupted install never leaves a partially-extracted directory where the
/// final one is expected.
pub fn replace_dir(staging_dir: &Path, final_dir: &Path) -> Result<(), String> {
    if final_dir.exists() {
        std::fs::remove_dir_all(final_dir).map_err(|e| e.to_string())?;
    }
    std::fs::rename(staging_dir, final_dir)
        .map_err(|e| format!("Failed to install to {}: {}", final_dir.display(), e))
}
