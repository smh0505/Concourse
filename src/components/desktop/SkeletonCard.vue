<template>
  <div class="skeleton-card">
    <div class="skeleton-shimmer" />
  </div>
</template>

<style scoped>
.skeleton-card {
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-surface1);
  background: var(--color-surface0);
  overflow: hidden;
  position: relative;
}

.skeleton-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    transparent 30%,
    var(--color-surface1) 50%,
    transparent 70%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

@keyframes shimmer {
  from {
    background-position: 150% 0;
  }
  to {
    background-position: -50% 0;
  }
}
</style>
