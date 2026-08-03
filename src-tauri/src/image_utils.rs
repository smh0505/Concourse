//! General-purpose image helpers that don't belong to any single external integration -
//! currently just brightness sampling for GameDetail.vue's backdrop text-color flip.
//!
//! Done host-side rather than in the frontend via `<canvas>`/`getImageData` specifically to
//! sidestep browser CORS: reading pixel data from a cross-origin image requires the image to
//! have been fetched in CORS mode *and* the server to send a matching `Access-Control-Allow-
//! Origin` header, which cover/background art CDNs (SteamGridDB, IGDB, RAWG, TheGamesDB)
//! generally don't - the canvas ends up "tainted" and `getImageData` throws, silently
//! defeating the whole feature regardless of the image's actual brightness. A host-side fetch
//! via `reqwest` isn't subject to that restriction at all, since it's not a browser request.

use image::GenericImageView;

/// Downloads `url` and reports whether its average perceived luminance is below a "dark"
/// threshold. Downscales before sampling - only a coarse brightness estimate is needed, not
/// per-pixel precision, so decoding at full resolution would be wasted work.
#[tauri::command]
pub async fn check_image_brightness(url: String) -> Result<bool, String> {
    let bytes = reqwest::get(&url)
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let thumbnail = img.thumbnail(16, 16);

    let mut total = 0u64;
    let mut count = 0u64;
    for (_, _, pixel) in thumbnail.pixels() {
        let [r, g, b, _] = pixel.0;
        // Perceived luminance (ITU-R BT.601) - weights green heaviest, matching how the eye
        // actually perceives brightness, rather than a flat RGB average.
        total += (0.299 * r as f64 + 0.587 * g as f64 + 0.114 * b as f64) as u64;
        count += 1;
    }

    if count == 0 {
        return Ok(false);
    }
    Ok((total / count) < 110)
}
