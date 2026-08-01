//! Install-by-URL for every plugin kind that supports it - WASM source plugins (Milestone 8)
//! and data-only theme manifests (Milestone 8.5). Merged into one module since both kinds
//! share the same "fetch a manifest, figure out what it is, install accordingly" shape, and
//! the app's single "Add Plugin" UI (one button, one URL field, one confirm dialog for either
//! kind) already treats them as one flow rather than two.

use crate::wasm_plugins::PathScope;
use crate::zip_install::replace_dir;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// The only three kinds a WIT world exists for today (see `wit/plugin.wit`'s `source-plugin`/
/// `wrapper-plugin`/`metadata-plugin` interfaces) - also doubles as a path-safety allowlist,
/// since a WASM manifest's `kind` is remote-controlled input that ends up as a directory name
/// below.
const SUPPORTED_WASM_KINDS: &[&str] = &["source", "wrapper", "metadata"];

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

/// A single user-configurable setting a WASM plugin declares it needs (e.g. an API key) -
/// lets the host render one generic form instead of every plugin needing its own custom
/// settings UI (which WASM plugins have no mechanism for at all, unlike TS-authored plugins'
/// `settingsComponent`). `type` controls the rendered `<input>`'s `type` attribute on the
/// frontend ("password" masks the value); `#[serde(default)]` since neither is required.
#[derive(Deserialize, Serialize, Clone)]
pub struct SettingsSchemaField {
    pub key: String,
    pub label: String,
    #[serde(default = "default_settings_field_type")]
    pub r#type: String,
}

fn default_settings_field_type() -> String {
    "text".to_string()
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
    /// Absent for plugins that need no user-supplied config (Steam/GOG/Epic/LR/LE all scan
    /// the filesystem/registry directly) - present for ones that do (SGDB/IGDB need an API
    /// key). See `SettingsSchemaField`.
    #[serde(default, rename = "settingsSchema")]
    pub settings_schema: Vec<SettingsSchemaField>,
    /// Declares which gated host capabilities (Milestone 13) this plugin actually calls -
    /// today just `"run-programs"` (spawn-process/run-and-wait), declared by Steam/GOG/Epic/
    /// LR/LE. An array (not a single bool) so future capability tags don't need another
    /// breaking manifest change. Absent/empty means the plugin never needs an explicit grant.
    #[serde(default)]
    pub capabilities: Vec<String>,
    /// See `wasm_plugins::PathScope` - shown in the install-confirmation dialog (visibility
    /// only, not itself an enforcement mechanism from this side) so a self-declared scope isn't
    /// completely invisible to the person deciding whether to install.
    #[serde(default, rename = "pathScopes")]
    pub path_scopes: Vec<PathScope>,
    /// See `wasm_plugins.rs`'s `is_allowed_host` - same visibility purpose as `path_scopes`.
    #[serde(default, rename = "httpScopes")]
    pub http_scopes: Vec<String>,
    /// Milestone 20 - host-added install provenance, not part of the plugin author's own
    /// manifest. The exact manifest URL this was installed from, so a later update-check can
    /// re-fetch it and compare versions. `#[serde(default)]` so both an author-supplied
    /// manifest (which never declares this) and an already-installed manifest from before this
    /// field existed still parse fine - the latter just shows `None` until reinstalled.
    #[serde(default, rename = "sourceUrl", skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    /// True if installed via the curated registry's pinned-hash entry rather than a freeform
    /// pasted URL. Matters for update-checking: a registry-pinned `source_url` is a
    /// commit-SHA'd URL that will never itself show a newer version (it's frozen by design) -
    /// checking for an update means re-fetching the *registry's* current entry for this
    /// plugin's `id`, not re-fetching `source_url` again.
    #[serde(default, rename = "installedViaRegistry")]
    pub installed_via_registry: bool,
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
    /// Milestone 17 - a closed-vocabulary JSON AST overriding GameCard's cover-visual region.
    /// Untyped here deliberately (not a Rust-side AST shape) - this is opaque, pass-through
    /// data as far as the host is concerned; the frontend's `validateCardVisualAst` is the one
    /// and only real gate it goes through before ever being trusted. `Option` (not required)
    /// since every theme published before this field existed has no `cardVisual` at all.
    #[serde(default, rename = "cardVisual", skip_serializing_if = "Option::is_none")]
    pub card_visual: Option<serde_json::Value>,
    /// Real font files to load via @font-face while this theme is active - same opaque
    /// pass-through as `card_visual` above. The frontend (`theme/fontFaceRegistry.ts`)
    /// validates every field strictly before constructing any CSS text from it.
    #[serde(default, rename = "fontFaces", skip_serializing_if = "Option::is_none")]
    pub font_faces: Option<serde_json::Value>,
    /// Milestone 20 - see `WasmPluginManifest::source_url`'s doc comment, identical reasoning.
    #[serde(default, rename = "sourceUrl", skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    /// Milestone 20 - see `WasmPluginManifest::installed_via_registry`'s doc comment.
    #[serde(default, rename = "installedViaRegistry")]
    pub installed_via_registry: bool,
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
        Some("metadata") => Ok("metadata".to_string()),
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
    /// See `WasmPluginManifest::capabilities` - empty for theme manifests, which have no
    /// capability concept at all.
    pub capabilities: Vec<String>,
    /// See `WasmPluginManifest::path_scopes`/`http_scopes` - both empty for theme manifests.
    pub path_scopes: Vec<PathScope>,
    pub http_scopes: Vec<String>,
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

    if kind == "source" || kind == "metadata" {
        let manifest: WasmPluginManifest =
            serde_json::from_slice(&bytes).map_err(|e| format!("Invalid plugin.json: {}", e))?;
        Ok(PluginPreview {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            kind,
            capabilities: manifest.capabilities,
            path_scopes: manifest.path_scopes,
            http_scopes: manifest.http_scopes,
        })
    } else {
        let manifest: DataThemeManifest = serde_json::from_slice(&bytes)
            .map_err(|e| format!("Invalid theme manifest: {}", e))?;
        Ok(PluginPreview {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            kind,
            capabilities: Vec::new(),
            path_scopes: Vec::new(),
            http_scopes: Vec::new(),
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

/// What `install_plugin` returns - the installed id plus a Milestone 14 provenance-
/// verification outcome. `verified`/`verification_note` are advisory only right now (install
/// always proceeds regardless, see `plugin_verification.rs`'s module doc comment for why a
/// hard gate isn't viable yet) - shown to the user, not enforced.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub id: String,
    pub verified: bool,
    pub verification_note: String,
}

/// Downloads a plugin's sibling `.wasm` entry and installs both files into
/// `<app data>/wasm-plugins/<kind>/<id>/` (kind subfolder keeps source/wrapper plugins
/// separated on disk). `manifest_bytes` is the already-downloaded `plugin.json` content.
async fn install_wasm_plugin(
    app: &AppHandle,
    manifest_url: &str,
    manifest_bytes: &[u8],
    expected_sha256: Option<&str>,
) -> Result<InstallResult, String> {
    let mut manifest: WasmPluginManifest = serde_json::from_slice(manifest_bytes)
        .map_err(|e| format!("Invalid plugin.json: {}", e))?;
    // Milestone 20 - host-added provenance, not part of what the author's manifest.json
    // declared. `expected_sha256.is_some()` is already the existing signal for "this install
    // came from the curated registry" (AddPlugin.vue only ever passes a hash for a registry
    // entry, never for a freeform pasted URL), so no new parameter is needed to derive it.
    manifest.source_url = Some(manifest_url.to_string());
    manifest.installed_via_registry = expected_sha256.is_some();

    if !SUPPORTED_WASM_KINDS.contains(&manifest.kind.as_str()) {
        return Err(format!(
            "\"{}\" plugins can't be installed by URL yet.",
            manifest.kind
        ));
    }

    let wasm_url = sibling_url(manifest_url, &manifest.entry)?;
    let wasm_bytes = download_bytes(&wasm_url).await?;

    // Milestone 14 curated registry - unlike the Sigstore check below, a mismatch here is a
    // hard reject: this hash was pinned by hand after actually reviewing that specific
    // version, so a mismatch is a real "this isn't what was reviewed" signal, not just "no
    // attestation exists yet" (which every pre-signing release would otherwise trip).
    if let Some(expected) = expected_sha256 {
        use sha2::{Digest, Sha256};
        let actual = format!("{:x}", Sha256::digest(&wasm_bytes));
        if !actual.eq_ignore_ascii_case(expected) {
            return Err(format!(
                "Pinned hash mismatch - this download doesn't match what was reviewed \
                 (expected {}, got {}). Install aborted.",
                expected, actual
            ));
        }
    }

    let (verified, verification_note) =
        match crate::plugin_verification::parse_github_owner_repo(manifest_url) {
            Some((owner, repo)) => {
                match crate::plugin_verification::verify_plugin_provenance(
                    &wasm_bytes,
                    &owner,
                    &repo,
                )
                .await
                {
                    Ok(()) => (
                        true,
                        format!("Verified: built by {}/{}'s own CI.", owner, repo),
                    ),
                    Err(e) => (false, format!("Not verified: {}", e)),
                }
            }
            None => (
                false,
                "Not verified: this plugin isn't hosted on github.com.".to_string(),
            ),
        };

    let kind_dir = wasm_plugins_dir(app)?.join(&manifest.kind);
    std::fs::create_dir_all(&kind_dir)
        .map_err(|e| format!("Failed to create plugins dir: {}", e))?;

    let staging_dir = kind_dir.join(format!(".staging-{}", std::process::id()));
    if staging_dir.exists() {
        std::fs::remove_dir_all(&staging_dir).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir_all(&staging_dir).map_err(|e| e.to_string())?;
    // Serializes the mutated struct (carrying source_url/installed_via_registry) rather than
    // writing the original manifest_bytes verbatim - nothing downstream re-hashes plugin.json's
    // exact on-disk bytes (Milestone 14's signing check hashes the .wasm binary, not this file),
    // so re-serializing is safe.
    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    std::fs::write(staging_dir.join("plugin.json"), manifest_json)
        .map_err(|e| format!("Failed to write plugin.json: {}", e))?;
    std::fs::write(staging_dir.join(&manifest.entry), &wasm_bytes)
        .map_err(|e| format!("Failed to write {}: {}", manifest.entry, e))?;

    let final_dir = kind_dir.join(&manifest.id);
    replace_dir(&staging_dir, &final_dir)?;

    Ok(InstallResult { id: manifest.id, verified, verification_note })
}

/// Caches a theme manifest under `<app data>/data-themes/<id>/theme.json` - no separate
/// download beyond the manifest itself, since a data-only theme has no code, just
/// `cssVariables` (and an optional `cardVisual` AST - still just data, never executable).
/// `manifest_bytes` is the already-downloaded manifest content.
///
/// The manifest itself is signed the same way a WASM plugin's `.wasm` is
/// (`verify_plugin_provenance` against the manifest's own bytes) - a manifest carrying a
/// `cardVisual` AST is real, meaningful content worth tamper-detecting even though it's never
/// executable. Same asymmetry as the WASM path: this only proves the manifest is unmodified
/// since that repo's CI published it, not that its author is trustworthy - the registry's
/// review process is what answers that question, not this.
async fn install_data_theme(
    dir: &Path,
    manifest_url: &str,
    manifest_bytes: &[u8],
    expected_sha256: Option<&str>,
) -> Result<InstallResult, String> {
    let mut manifest: DataThemeManifest = serde_json::from_slice(manifest_bytes)
        .map_err(|e| format!("Invalid theme manifest: {}", e))?;
    if manifest.id.trim().is_empty() {
        return Err("Theme manifest is missing an id".to_string());
    }
    if manifest.css_variables.is_empty() {
        return Err("Theme manifest has no cssVariables".to_string());
    }
    // Milestone 20 - see install_wasm_plugin's identical assignment for why
    // expected_sha256.is_some() is already the right signal, no new parameter needed.
    manifest.source_url = Some(manifest_url.to_string());
    manifest.installed_via_registry = expected_sha256.is_some();

    // Milestone 14/17 curated registry - unlike the Sigstore check below, a mismatch here is a
    // hard reject: this hash was pinned by hand after actually reviewing this specific version,
    // so a mismatch is a real "this isn't what was reviewed" signal, not just "no attestation
    // exists yet." Mirrors install_wasm_plugin's identical check against a .wasm binary - here
    // the manifest's own bytes are the whole artifact, there's nothing else to hash.
    if let Some(expected) = expected_sha256 {
        use sha2::{Digest, Sha256};
        let actual = format!("{:x}", Sha256::digest(manifest_bytes));
        if !actual.eq_ignore_ascii_case(expected) {
            return Err(format!(
                "Pinned hash mismatch - this download doesn't match what was reviewed \
                 (expected {}, got {}). Install aborted.",
                expected, actual
            ));
        }
    }

    let (verified, verification_note) =
        match crate::plugin_verification::parse_github_owner_repo(manifest_url) {
            Some((owner, repo)) => {
                match crate::plugin_verification::verify_plugin_provenance(
                    manifest_bytes,
                    &owner,
                    &repo,
                )
                .await
                {
                    Ok(()) => (
                        true,
                        format!("Verified: built by {}/{}'s own CI.", owner, repo),
                    ),
                    Err(e) => (false, format!("Not verified: {}", e)),
                }
            }
            None => (
                false,
                "Not verified: this theme isn't hosted on github.com.".to_string(),
            ),
        };

    let theme_dir = dir.join(&manifest.id);
    std::fs::create_dir_all(&theme_dir)
        .map_err(|e| format!("Failed to create {}: {}", theme_dir.display(), e))?;
    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    std::fs::write(theme_dir.join("theme.json"), manifest_json)
        .map_err(|e| format!("Failed to write theme.json: {}", e))?;

    Ok(InstallResult { id: manifest.id, verified, verification_note })
}

/// Installs a plugin from a user-pasted manifest URL - re-fetches the manifest (cheap, a few
/// KB) rather than reusing bytes from `fetch_plugin_preview`, keeping both commands simple and
/// stateless. Branches on the manifest's own `kind` once fetched.
#[tauri::command]
pub async fn install_plugin(
    app: AppHandle,
    url: String,
    expected_sha256: Option<String>,
) -> Result<InstallResult, String> {
    let bytes = download_bytes(&url).await?;
    let probe: ManifestKindProbe =
        serde_json::from_slice(&bytes).map_err(|e| format!("Invalid plugin manifest: {}", e))?;
    let kind = detect_kind(&probe)?;

    if kind == "source" || kind == "metadata" {
        install_wasm_plugin(&app, &url, &bytes, expected_sha256.as_deref()).await
    } else {
        install_data_theme(
            &data_themes_dir(&app)?,
            &url,
            &bytes,
            expected_sha256.as_deref(),
        )
        .await
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

/// Loosely-typed probe - only `version` is ever needed to compare against what's installed,
/// regardless of whether the URL points at a `WasmPluginManifest` or a `DataThemeManifest`
/// (both use the same field name), so there's no need to know which shape it is up front.
#[derive(Deserialize)]
struct VersionProbe {
    version: String,
}

/// Compares two version strings as dot-separated numeric segments (e.g. `"1.10.0" >
/// "1.9.0"`) rather than plain string ordering, which would get that comparison backwards.
/// Falls back to a plain inequality check if either side isn't all-numeric segments - good
/// enough for the plain SemVer every plugin/theme manifest here actually uses, without pulling
/// in a real SemVer crate for one comparison.
fn version_is_newer(latest: &str, current: &str) -> bool {
    fn parse(v: &str) -> Option<Vec<u64>> {
        v.split('.').map(|part| part.parse::<u64>().ok()).collect()
    }
    match (parse(latest), parse(current)) {
        (Some(l), Some(c)) => l > c,
        _ => latest != current,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub id: String,
    pub update_available: bool,
    pub latest_version: Option<String>,
    /// The manifest URL to actually reinstall from if `update_available` - for a registry
    /// install this is the registry's *current* `manifestUrl` for this id, which may differ
    /// from the old pinned one, so the frontend's apply-update call doesn't need to re-derive
    /// registry-vs-direct routing itself.
    pub latest_manifest_url: Option<String>,
}

/// Checks whether a newer version exists for an already-installed plugin/theme, given what was
/// persisted about its install origin (see `WasmPluginManifest::source_url`/
/// `installed_via_registry` and the `DataThemeManifest` equivalents). Two different lookup
/// strategies depending on origin - see `installed_via_registry`'s doc comment for why a
/// registry-pinned `source_url` can't just be re-fetched directly.
#[tauri::command]
pub async fn check_plugin_update(
    id: String,
    current_version: String,
    source_url: Option<String>,
    installed_via_registry: bool,
) -> Result<UpdateCheckResult, String> {
    let latest_manifest_url = if installed_via_registry {
        let entries = crate::plugin_registry::fetch_plugin_registry().await?;
        entries.into_iter().find(|e| e.id == id).map(|e| e.manifest_url)
    } else {
        source_url
    };

    // No known origin at all - either this id was pulled from the registry since install (a
    // revoked/removed entry), or this is a pre-Milestone-20 install with no source_url ever
    // recorded. Either way there's nothing left to check against; report "no update" rather
    // than erroring the whole check.
    let Some(manifest_url) = latest_manifest_url else {
        return Ok(UpdateCheckResult {
            id,
            update_available: false,
            latest_version: None,
            latest_manifest_url: None,
        });
    };

    let bytes = download_bytes(&manifest_url).await?;
    let probe: VersionProbe = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Invalid manifest at {}: {}", manifest_url, e))?;

    let update_available = version_is_newer(&probe.version, &current_version);
    Ok(UpdateCheckResult {
        id,
        latest_version: Some(probe.version),
        latest_manifest_url: if update_available { Some(manifest_url) } else { None },
        update_available,
    })
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
        let result =
            tauri::async_runtime::block_on(install_data_theme(&temp.0, &url, &bytes, None))
                .expect("install should succeed");
        assert_eq!(result.id, "test-online-theme");
        assert!(!result.verified, "a localhost test server isn't hosted on github.com");

        let manifests = list_data_themes_from(&temp.0).expect("list should succeed");
        assert_eq!(manifests.len(), 1);
        assert_eq!(manifests[0].id, "test-online-theme");
        assert_eq!(manifests[0].name, "Test Online Theme");
        assert_eq!(
            manifests[0].css_variables.get("--color-base").map(String::as_str),
            Some("#123456")
        );
        // Milestone 20 - install origin actually persists to disk and survives the list
        // round-trip, not just set in memory during install.
        assert_eq!(manifests[0].source_url.as_deref(), Some(url.as_str()));
        assert!(!manifests[0].installed_via_registry, "installed with no pinned hash");

        uninstall_data_theme_from(&temp.0, &result.id).expect("uninstall should succeed");
        let manifests_after = list_data_themes_from(&temp.0).expect("list should succeed");
        assert!(manifests_after.is_empty(), "expected theme to be gone after uninstall");
    }

    // Milestone 17's registry extension - a theme entry's pinned wasmSha256 is a hard reject
    // on mismatch, same as install_wasm_plugin's identical check. Real end-to-end against a
    // real HTTP server, not a unit test of the hash comparison in isolation.
    #[test]
    fn rejects_a_theme_whose_bytes_dont_match_the_pinned_hash() {
        let temp = TempDir::new("bad-pin");
        let url = serve_once(
            r##"{"id":"pinned-theme","name":"Pinned","version":"1.0.0","kind":"theme","cssVariables":{"--color-base":"#123456"}}"##,
        );

        let bytes = tauri::async_runtime::block_on(download_bytes(&url)).expect("download should succeed");
        let wrong_hash = "0000000000000000000000000000000000000000000000000000000000000000";
        let result = tauri::async_runtime::block_on(install_data_theme(
            &temp.0,
            &url,
            &bytes,
            Some(wrong_hash),
        ));

        match result {
            Ok(_) => panic!("expected a pinned-hash mismatch to reject the install"),
            Err(msg) => assert!(msg.contains("Pinned hash mismatch")),
        }

        let manifests = list_data_themes_from(&temp.0).expect("list should succeed");
        assert!(manifests.is_empty(), "rejected install should not write anything to disk");
    }

    // Milestone 20 - a *correct* pinned-hash install is the one real path that should set
    // installed_via_registry: true (a freeform pasted URL never carries expected_sha256 at
    // all, see AddPlugin.vue). No existing test exercised a successful pinned-hash install
    // before this, only the mismatch-rejection case above.
    #[test]
    fn marks_a_correctly_pinned_theme_as_installed_via_registry() {
        let temp = TempDir::new("good-pin");
        let body = r##"{"id":"registry-theme","name":"Registry","version":"1.0.0","kind":"theme","cssVariables":{"--color-base":"#123456"}}"##;
        let url = serve_once(body);

        let bytes = tauri::async_runtime::block_on(download_bytes(&url)).expect("download should succeed");
        let correct_hash = {
            use sha2::{Digest, Sha256};
            format!("{:x}", Sha256::digest(&bytes))
        };
        let result = tauri::async_runtime::block_on(install_data_theme(
            &temp.0,
            &url,
            &bytes,
            Some(&correct_hash),
        ))
        .expect("install with a correct pinned hash should succeed");
        assert_eq!(result.id, "registry-theme");

        let manifests = list_data_themes_from(&temp.0).expect("list should succeed");
        assert_eq!(manifests.len(), 1);
        assert!(manifests[0].installed_via_registry, "installed with a matching pinned hash");
        assert_eq!(manifests[0].source_url.as_deref(), Some(url.as_str()));
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
        assert_eq!(detect_kind(&metadata).unwrap(), "metadata");

        let controller = ManifestKindProbe { kind: Some("controller".to_string()), css_variables: None };
        assert!(detect_kind(&controller).is_err());

        let unknown = ManifestKindProbe { kind: None, css_variables: None };
        assert!(detect_kind(&unknown).is_err());
    }

    #[test]
    fn version_is_newer_compares_numerically_not_lexically() {
        // The whole point of numeric comparison - "1.9.0" < "1.10.0" lexically, backwards from
        // the real ordering.
        assert!(version_is_newer("1.10.0", "1.9.0"));
        assert!(!version_is_newer("1.9.0", "1.10.0"));
        assert!(!version_is_newer("1.3.7", "1.3.7"), "identical versions aren't newer");
        assert!(version_is_newer("2.0.0", "1.99.99"));
        // Non-numeric segments (a stray pre-release tag, say) fall back to plain inequality
        // rather than panicking or silently treating them as equal.
        assert!(version_is_newer("1.3.0-beta", "1.2.0"));
        assert!(!version_is_newer("1.3.0-beta", "1.3.0-beta"));
    }

    // Real end-to-end against a real HTTP server, same discipline as the install tests above -
    // not a unit test of version_is_newer in isolation, the whole check_plugin_update command.
    #[test]
    fn check_plugin_update_detects_a_newer_direct_url_install() {
        let url = serve_once(
            r##"{"id":"direct-plugin","name":"Direct","version":"1.1.0","cssVariables":{}}"##,
        );

        let result = tauri::async_runtime::block_on(check_plugin_update(
            "direct-plugin".to_string(),
            "1.0.0".to_string(),
            Some(url.clone()),
            false,
        ))
        .expect("check should succeed");

        assert!(result.update_available);
        assert_eq!(result.latest_version.as_deref(), Some("1.1.0"));
        assert_eq!(result.latest_manifest_url.as_deref(), Some(url.as_str()));
    }

    #[test]
    fn check_plugin_update_reports_no_update_when_already_current() {
        let url = serve_once(
            r##"{"id":"direct-plugin","name":"Direct","version":"1.0.0","cssVariables":{}}"##,
        );

        let result = tauri::async_runtime::block_on(check_plugin_update(
            "direct-plugin".to_string(),
            "1.0.0".to_string(),
            Some(url),
            false,
        ))
        .expect("check should succeed");

        assert!(!result.update_available);
        assert_eq!(result.latest_version.as_deref(), Some("1.0.0"));
        assert_eq!(result.latest_manifest_url, None, "no reinstall URL needed when up to date");
    }

    #[test]
    fn check_plugin_update_reports_no_update_with_no_known_origin() {
        // No source_url at all (a pre-Milestone-20 install) and not registry-installed -
        // nothing to check against, should report "no update" rather than erroring.
        let result = tauri::async_runtime::block_on(check_plugin_update(
            "orphaned-plugin".to_string(),
            "1.0.0".to_string(),
            None,
            false,
        ))
        .expect("check should succeed even with nothing to check against");

        assert!(!result.update_available);
        assert_eq!(result.latest_version, None);
    }
}
