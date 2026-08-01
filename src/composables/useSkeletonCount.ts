import { onMounted, onUnmounted, ref, type Ref } from "vue";

interface SkeletonCountOptions {
  /** Omit for full-width rows (list view) - grid view needs this to compute columns. */
  itemWidth?: number;
  itemHeight: number;
  gap: number;
  minCount?: number;
}

/**
 * Computes how many skeleton placeholders are needed to fill the container's visible area,
 * instead of a fixed guess that leaves the view mostly empty on a maximized/large window.
 * Reads the container's own width (columns) and its parent's height (the actual scrollable
 * viewport - the container itself has no intrinsic height while only a handful of skeletons
 * are rendered, so measuring it directly would be circular). Deliberately overestimates
 * rather than undershoots - during a scan the container's scroll is locked, so a few extra
 * off-screen skeletons just get clipped, not left as a visible gap.
 */
export function useSkeletonCount(
  containerRef: Ref<HTMLElement | null>,
  options: SkeletonCountOptions,
) {
  const count = ref(options.minCount ?? 6);
  let observer: ResizeObserver | undefined;

  function recompute() {
    const el = containerRef.value;
    if (!el) return;
    const width = el.clientWidth;
    const height = el.parentElement?.clientHeight ?? el.clientHeight;
    if (width === 0 || height === 0) return;

    const cols = options.itemWidth
      ? Math.max(1, Math.floor((width + options.gap) / (options.itemWidth + options.gap)))
      : 1;
    const rows =
      Math.max(1, Math.ceil((height + options.gap) / (options.itemHeight + options.gap))) + 1;
    count.value = Math.max(options.minCount ?? 1, cols * rows);
  }

  onMounted(() => {
    const el = containerRef.value;
    if (!el) return;
    observer = new ResizeObserver(recompute);
    observer.observe(el);
    if (el.parentElement) observer.observe(el.parentElement);
    recompute();
  });

  onUnmounted(() => observer?.disconnect());

  return count;
}
