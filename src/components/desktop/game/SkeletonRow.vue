<template>
  <div class="list-row-shell">
    <div class="skeleton-title">
      <div class="shimmer" />
    </div>
  </div>
</template>

<style scoped>
/* Matches GameListRow.vue's collapsed (non-hovered) height and layout exactly - no separate
   thumbnail box anymore, since the real row no longer has one either (cover art is its own
   background now, not a thumbnail). */
.list-row-shell {
  min-height: 2.75rem;
}

.skeleton-title {
  width: 30%;
  height: 0.9rem;
  border-radius: var(--radius-sm);
  background: var(--color-surface0);
  overflow: hidden;
  position: relative;
}

/* .shimmer (shared, styles.css) supplies the shimmer effect itself. */
</style>
