<template>
  <div class="skeleton-row">
    <div class="skeleton-thumb">
      <div class="skeleton-shimmer" />
    </div>
    <div class="skeleton-lines">
      <div class="skeleton-line skeleton-line-title">
        <div class="skeleton-shimmer" />
      </div>
      <div class="skeleton-line skeleton-line-meta">
        <div class="skeleton-shimmer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid var(--color-surface1);
  border-radius: var(--radius-panel);
  padding: 0.5rem 0.75rem;
}

.skeleton-thumb {
  width: 48px;
  height: 64px;
  flex-shrink: 0;
  border-radius: 4px;
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
