<template>
  <div class="skeleton-card">
    <div class="shimmer" />
  </div>
</template>

<style scoped>
.skeleton-card {
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-md);
  border: var(--button-border-width) solid var(--color-surface1);
  background: var(--color-surface0);
  overflow: hidden;
  position: relative;
}

/* .shimmer (shared, styles.css) supplies the shimmer effect itself. */
</style>
