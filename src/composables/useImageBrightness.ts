import { type Ref, ref, watch } from "vue";

/** Samples an image's average perceived luminance to decide whether text on top of it should
 *  flip to a light color - used for GameDetail.vue's backdrop, where a game's own background
 *  art can be any brightness. Draws the image downscaled onto an offscreen canvas (cheap -
 *  only a handful of pixels need reading, not the full-resolution image) rather than reading
 *  full-size pixel data.
 *
 *  Best-effort: an image whose host doesn't serve CORS headers taints the canvas, which makes
 *  `getImageData` throw - caught and treated as "not dark" (falls back to the default text
 *  color) rather than guessing wrong or surfacing an error for something this cosmetic. */
export function useImageBrightness(url: Ref<string | null | undefined>) {
  const isDark = ref(false);

  watch(
    url,
    (src) => {
      isDark.value = false;
      if (!src) return;

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const size = 16;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, size, size);
          const { data } = ctx.getImageData(0, 0, size, size);

          let total = 0;
          let count = 0;
          for (let i = 0; i < data.length; i += 4) {
            // Perceived luminance (ITU-R BT.601) - weights green heaviest, matching how the
            // eye actually perceives brightness, rather than a flat RGB average.
            total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            count++;
          }
          isDark.value = count > 0 && total / count < 110;
        } catch {
          // Tainted canvas (no CORS) or another decode failure - leave `isDark` false.
        }
      };
      img.src = src;
    },
    { immediate: true },
  );

  return isDark;
}
