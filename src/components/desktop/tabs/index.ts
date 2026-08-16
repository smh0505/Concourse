// Barrel - see src/stores/index.ts's own comment for the reasoning. UiTest.vue is deliberately
// still dynamic-imported directly by its own path in App.vue, not through this barrel - a
// dynamic import() of a barrel-exported name pulls in the whole barrel's module graph
// statically, defeating the code-splitting that dynamic import exists for here in the first
// place (see App.vue's own comment on that import for why it needs to stay a real split point).
export { default as AdminReviewSection } from "./AdminReviewSection.vue";
export { default as AppSettings } from "./AppSettings.vue";
export { default as CollectionsPanel } from "./CollectionsPanel.vue";
export { default as GameFilters } from "./GameFilters.vue";
export { default as GameGrid } from "./GameGrid.vue";
export { default as GameList } from "./GameList.vue";
export { default as PluginSettings } from "./PluginSettings.vue";
export { default as StatsPanel } from "./StatsPanel.vue";
export { default as TagsPanel } from "./TagsPanel.vue";
