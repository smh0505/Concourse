import { type Ref, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";

// Module-level cache: check_image_brightness re-downloads/re-decodes the full image every
// call, so cache by URL to skip that round-trip on revisit. Caches the Promise (not just the
// result) so a rapid re-navigation reuses an in-flight request instead of duplicating it.
const brightnessCache = new Map<string, Promise<boolean>>();

function checkBrightnessCached(url: string): Promise<boolean> {
  let pending = brightnessCache.get(url);
  if (!pending) {
    pending = invoke<boolean>("check_image_brightness", { url });
    brightnessCache.set(url, pending);
    // Don't cache a failure - a transient network error shouldn't permanently mark this URL "not dark".
    pending.catch(() => brightnessCache.delete(url));
  }
  return pending;
}

/** Whether an image's average perceived luminance is dark enough that text over it should
 *  flip to a light color (GameDetail.vue's backdrop). Sampling happens in Rust
 *  (`check_image_brightness`, image_utils.rs) rather than via `<canvas>`/`getImageData` -
 *  cover/background art CDNs generally don't send CORS headers, which silently taints the
 *  canvas and defeats the whole feature; a host-side fetch isn't subject to that. */
export function useImageBrightness(url: Ref<string | null | undefined>) {
  const isDark = ref(false);
  // False until the check resolves - lets callers hide brightness-dependent styling instead of
  // briefly rendering against the default (unresolved) guess.
  const isReady = ref(false);

  watch(
    url,
    async (src) => {
      isDark.value = false;
      isReady.value = false;
      if (!src) {
        isReady.value = true;
        return;
      }
      try {
        isDark.value = await checkBrightnessCached(src);
      } catch (e) {
        console.error("check_image_brightness failed:", e);
      } finally {
        isReady.value = true;
      }
    },
    { immediate: true },
  );

  return { isDark, isReady };
}
