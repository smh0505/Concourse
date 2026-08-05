// Barrel - re-exports every store from one path so a consumer touching many domains at once
// (App.vue, most obviously) needs one import line per store, not one per file/directory.
// Store files themselves still import each other directly (e.g. library.ts -> ./wrapperPlugins),
// never through this barrel - keeps their own module graph simple and avoids any risk of a
// barrel-induced circular-import surprise between stores that reference each other.
export * from "./appSettings";
export * from "./appUpdate";
export * from "./collections";
export * from "./controllerMapping";
export * from "./library";
export * from "./metadataProviders";
export * from "./pluginInstall";
export * from "./pluginUpdates";
export * from "./plugins";
export * from "./stats";
export * from "./tags";
export * from "./theme";
export * from "./toasts";
export * from "./translation";
export * from "./wrapperPlugins";
