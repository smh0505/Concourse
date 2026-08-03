import { type Ref, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";

/** Reports whether an image's average perceived luminance is dark enough that text on top of
 *  it should flip to a light color - used for GameDetail.vue's backdrop, where a game's own
 *  background art can be any brightness.
 *
 *  Delegates the actual sampling to the Rust `check_image_brightness` command
 *  (`image_utils.rs`) rather than a `<canvas>`/`getImageData` approach in the browser - reading
 *  pixel data from a cross-origin image requires the image to have been fetched in CORS mode
 *  *and* the server to send a matching `Access-Control-Allow-Origin` header, which cover/
 *  background art CDNs (SteamGridDB, IGDB, RAWG, TheGamesDB) generally don't send. That taints
 *  the canvas and silently defeats the whole feature regardless of the image's actual
 *  brightness - a host-side fetch isn't subject to that restriction at all. */
export function useImageBrightness(url: Ref<string | null | undefined>) {
  const isDark = ref(false);

  watch(
    url,
    async (src) => {
      isDark.value = false;
      if (!src) return;
      try {
        isDark.value = await invoke<boolean>("check_image_brightness", { url: src });
      } catch (e) {
        // Download/decode failure (bad URL, unsupported format, network error, ...) - leave
        // `isDark` false rather than surfacing an error for something this cosmetic.
        console.error("check_image_brightness failed:", e);
      }
    },
    { immediate: true },
  );

  return isDark;
}
