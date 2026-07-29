//! Milestone 14 - verifies a downloaded WASM plugin binary against a GitHub Artifact
//! Attestation (Sigstore), confirming it was genuinely built by that repo's own CI from a
//! specific commit, unmodified since.
//!
//! Important limit, worth stating plainly: this proves *provenance/integrity* ("this artifact
//! really is what that repo's `publish.yml` produced"), not *trustworthiness* - a repo owner
//! who writes malicious code from day one gets a perfectly valid, perfectly real attestation
//! for it, since their own CI genuinely built and signed exactly what they committed. This
//! closes a different, narrower gap: tampering after the fact (a compromised CDN, a stolen
//! release token pushing an asset that never went through the real commit-and-build flow, a
//! hijacked repo slipping in a rogue release). It does not answer "is this author trustworthy" -
//! that's the milestone's separate curated-registry/revocation bullets, not this one.
//!
//! Verification is currently advisory, not enforced - install still proceeds either way, with
//! the result surfaced to the frontend. Hard-rejecting on failure isn't viable yet since no
//! existing plugin release predates this feature actually has an attestation to check against;
//! once every plugin repo's CI has been updated and has at least one signed release, this can
//! tighten into a real gate.

use sha2::{Digest, Sha256};
use sigstore_trust_root::TrustedRoot;
use sigstore_types::Bundle;
use sigstore_verify::{verify_with_trusted_root, VerificationPolicy};

const GITHUB_OIDC_ISSUER: &str = "https://token.actions.githubusercontent.com";

#[derive(serde::Deserialize)]
struct AttestationsResponse {
    attestations: Vec<AttestationEntry>,
}

#[derive(serde::Deserialize)]
struct AttestationEntry {
    bundle: serde_json::Value,
}

/// Parses `{owner}/{repo}` out of a `github.com`-hosted manifest/release-asset URL (e.g.
/// `https://github.com/smh0505/steam-source-wasm-plugin/releases/.../plugin.json`). Returns
/// `None` for anything not hosted on github.com - plugins aren't required to publish there,
/// this feature just can't do anything for ones that don't.
pub fn parse_github_owner_repo(url: &str) -> Option<(String, String)> {
    let parsed = reqwest::Url::parse(url).ok()?;
    if !matches!(parsed.host_str(), Some(h) if h.eq_ignore_ascii_case("github.com")) {
        return None;
    }
    let mut segments = parsed.path_segments()?;
    let owner = segments.next()?.to_string();
    let repo = segments.next()?.to_string();
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((owner, repo))
}

/// Fetches and verifies a Sigstore build-provenance attestation for `artifact_bytes`,
/// confirming it was built by `{owner}/{repo}`'s own `publish.yml` workflow on its default
/// branch - matches this project's own convention across every plugin repo (workflow file
/// literally named `publish.yml`, triggered on push to `main`). A repo using a different
/// workflow filename or branch would need this updated to match; there's no way to discover
/// that generically, since the identity check has to be an exact match by design (that's what
/// makes it meaningful).
///
/// Returns `Err` with a human-readable reason on any failure (no attestation found, signature
/// invalid, wrong repo/workflow, network failure) - never panics, since this runs against
/// attacker-influenced input (a downloaded plugin binary) by design. `Ok(())` means the
/// artifact is genuinely what that repo's CI produced; it says nothing about whether that
/// repo's author is trustworthy (see module doc comment).
pub async fn verify_plugin_provenance(
    artifact_bytes: &[u8],
    owner: &str,
    repo: &str,
) -> Result<(), String> {
    let digest = format!("{:x}", Sha256::digest(artifact_bytes));

    let url = format!(
        "https://api.github.com/repos/{}/{}/attestations/sha256:{}",
        owner, repo, digest
    );
    let response = reqwest::Client::new()
        .get(&url)
        .header("User-Agent", "concourse")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch attestation: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "No attestation found for this build (HTTP {}) - it may predate signed releases.",
            response.status()
        ));
    }

    let parsed: AttestationsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse attestation response: {}", e))?;

    let bundle_value = parsed
        .attestations
        .into_iter()
        .next()
        .ok_or_else(|| "No attestation found for this build.".to_string())?
        .bundle;
    let bundle_json = serde_json::to_string(&bundle_value)
        .map_err(|e| format!("Failed to re-serialize attestation bundle: {}", e))?;
    let bundle =
        Bundle::from_json(&bundle_json).map_err(|e| format!("Invalid attestation bundle: {}", e))?;

    let trusted_root =
        TrustedRoot::production().map_err(|e| format!("Failed to load trust root: {}", e))?;

    let expected_identity = format!(
        "https://github.com/{}/{}/.github/workflows/publish.yml@refs/heads/main",
        owner, repo
    );
    let policy = VerificationPolicy::default()
        .require_identity(expected_identity)
        .require_issuer(GITHUB_OIDC_ISSUER);

    let result = verify_with_trusted_root(artifact_bytes, &bundle, &policy, &trusted_root)
        .map_err(|e| format!("Attestation verification failed: {}", e))?;

    if !result.success {
        return Err("Attestation verification failed.".to_string());
    }

    Ok(())
}
