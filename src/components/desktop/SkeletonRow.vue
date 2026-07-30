<template>
  <div class="skeleton-row list-row-shell">
    <div class="skeleton-thumb list-row-thumb">
      <div class="shimmer" />
    </div>
    <div class="skeleton-lines">
      <div class="skeleton-line skeleton-line-title">
        <div class="shimmer" />
      </div>
      <div class="skeleton-line skeleton-line-meta">
        <div class="shimmer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* .list-row-shell (shared, styles.css) supplies the shell layout/border/padding. */

.skeleton-thumb {
  /* .list-row-thumb (shared, styles.css) supplies width/height/flex-shrink/radius. */
  background: var(--color-surface0);
  overflow: hidden;
  position: relative;
}

.skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.skeleton-line {
  height: 0.75rem;
  border-radius: var(--radius-sm);
  background: var(--color-surface0);
  overflow: hidden;
  position: relative;
}

.skeleton-line-title {
  width: 40%;
}

.skeleton-line-meta {
  width: 25%;
}

/* .shimmer (shared, styles.css) supplies the shimmer effect itself. */
</style>
