//! Milestone 30 - optional per-profile PIN. Threat model is casual switching by another
//! household member, not a real access-control boundary (`library.db` is a plain file on the
//! same machine - anyone with filesystem access can read it regardless of what's hashed inside),
//! so a salted SHA-256 is a reasonable, dependency-light choice over a full password KDF
//! (argon2/bcrypt) built for defending against offline brute force at scale.

use rand::RngCore;
use sha2::{Digest, Sha256};

const SALT_LEN: usize = 16;

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn hex_decode(hex: &str) -> Option<Vec<u8>> {
    if hex.len() % 2 != 0 {
        return None;
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).ok())
        .collect()
}

fn hash_with_salt(pin: &str, salt: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(salt);
    hasher.update(pin.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Returns `"<salt_hex>:<hash_hex>"`, stored as `profiles.pin_hash`.
#[tauri::command]
pub fn hash_profile_pin(pin: String) -> String {
    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    let hash_hex = hash_with_salt(&pin, &salt);
    format!("{}:{}", hex_encode(&salt), hash_hex)
}

/// `stored` is whatever `hash_profile_pin` previously produced. A malformed `stored` value
/// (shouldn't happen - this is the only writer) fails closed, not open.
#[tauri::command]
pub fn verify_profile_pin(pin: String, stored: String) -> bool {
    let Some((salt_hex, expected_hash)) = stored.split_once(':') else {
        return false;
    };
    let Some(salt) = hex_decode(salt_hex) else {
        return false;
    };
    hash_with_salt(&pin, &salt) == expected_hash
}
