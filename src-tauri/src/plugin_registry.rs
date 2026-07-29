//! Milestone 14 - the curated/reviewed plugin registry and revocation bullets, both answered
//! by one mechanism: a hand-maintained list (a separate repo,
//! github.com/smh0505/concourse-plugin-registry) of `{id, manifestUrl, wasmSha256}` entries,
//! each added only after its pinned version was actually read. Pulling (or never adding) an
//! entry there *is* revocation - no separate blocklist needed.
//!
//! This answers a different question than Milestone 14's signing piece
//! (`plugin_verification.rs`): signing proves an artifact really came from a given repo's CI
//! (authenticity of the pipeline), not that anyone has read what that pipeline built. This
//! registry is "has a human looked at this specific version" - complementary, not redundant.
//!
//! Unlike `plugin_verification.rs`'s advisory check, a pinned-hash mismatch here is a hard
//! reject: this hash was chosen by hand after review, not self-reported by the plugin's own
//! release, so a mismatch is a real, actionable "this isn't what was reviewed" signal rather
//! than "no attestation exists yet" (which every pre-Milestone-14 release would otherwise
//! trigger).

use serde::{Deserialize, Serialize};

const REGISTRY_URL: &str =
    "https://raw.githubusercontent.com/smh0505/concourse-plugin-registry/main/registry.json";

#[derive(Deserialize, Serialize, Clone)]
pub struct RegistryEntry {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub repo: String,
    #[serde(rename = "manifestUrl")]
    pub manifest_url: String,
    #[serde(rename = "wasmSha256")]
    pub wasm_sha256: String,
}

#[derive(Deserialize)]
struct RegistryFile {
    plugins: Vec<RegistryEntry>,
}

/// Fetches the current registry - a plain, unauthenticated GET against the raw file on
/// `main`, same trust model as any other manifest URL Concourse already fetches. Failure here
/// (network down, repo unreachable) just means the curated list is unavailable for this
/// session; freeform install-by-URL is unaffected either way.
#[tauri::command]
pub async fn fetch_plugin_registry() -> Result<Vec<RegistryEntry>, String> {
    let bytes = reqwest::Client::new()
        .get(REGISTRY_URL)
        .header("User-Agent", "concourse")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch plugin registry: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("Failed to read plugin registry: {}", e))?;

    let parsed: RegistryFile =
        serde_json::from_slice(&bytes).map_err(|e| format!("Invalid plugin registry: {}", e))?;
    Ok(parsed.plugins)
}
