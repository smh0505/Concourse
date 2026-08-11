import type { Component } from "vue";

export interface PluginBase {
  id: string;
  name: string;
  /** Optional inline settings UI, rendered under this plugin's row in the settings panel. */
  settingsComponent?: Component;
}

/** A plugin that manages its own downloaded dependency, tagged via the manifest's
 *  `installable` flag. Gets the generic InstallableStatus.vue Install button for free unless
 *  it sets its own settingsComponent. */
export interface Installable {
  install(): Promise<void>;
  uninstall(): Promise<void>;
  isInstalled(): Promise<boolean>;
}

export interface GameEntry {
  id: string;
  title: string;
  executablePath: string;
  platform: string;
  coverArtUrl?: string;
  /** Used for folder-based playtime tracking on URI-launched entries. */
  installDir?: string;
}

export interface SourcePlugin extends PluginBase {
  scan(): Promise<GameEntry[]>;
  launch(entry: GameEntry): Promise<void>;
  getInstallStatus(entry: GameEntry): Promise<boolean>;
}

export interface MetadataResult {
  description: string | null;
  releaseDate: string | null;
  genres: string[];
  /** A text-only provider (IGDB) leaves these unset; an art-only provider (SteamGridDB) leaves
   *  the text fields unset. metadataProviders.ts merges first-non-null across providers. */
  coverArtUrl?: string | null;
  backgroundArtUrl?: string | null;
}

/** One search match - usually exactly one, but can be genuinely ambiguous (duplicate/reissue
 *  sharing a title). `label` is provider-controlled free text for disambiguation. */
export interface MetadataCandidate {
  id: string;
  label: string;
  /** Absent when a provider's search returns no per-result images (e.g. SteamGridDB). */
  imageUrl?: string;
}

export interface MetadataProviderPlugin extends PluginBase {
  /** metadataProviders.ts auto-picks a sole candidate, prompts on multiple, skips on none. */
  searchCandidates(title: string): Promise<MetadataCandidate[]>;
  fetchMetadataById(id: string): Promise<MetadataResult | null>;
}

export interface GamepadButtonBinding {
  kind: "button";
  index: number;
}

export interface GamepadAxisBinding {
  kind: "axis";
  axis: number;
  /** Which way the axis travels when "pressed": +1 positive-going, -1 negative-going. */
  sign: 1 | -1;
}

/** Exactly one source at a time - a button, an axis crossing (some pads report a d-pad or
 *  triggers as axes), or unbound (null). Remapping replaces, never adds. */
export type GamepadDirectionBinding = GamepadButtonBinding | GamepadAxisBinding | null;

export interface GamepadMapping {
  dpadUp: GamepadDirectionBinding;
  dpadDown: GamepadDirectionBinding;
  dpadLeft: GamepadDirectionBinding;
  dpadRight: GamepadDirectionBinding;
  buttonConfirm: GamepadDirectionBinding;
  buttonCancel: GamepadDirectionBinding;
  /** Crossing threshold (0-1), shared across every axis binding, not per-axis. */
  axisThreshold?: number;
  repeatDelayMs?: number;
  repeatIntervalMs?: number;
}

/** One button's placement on `GamepadRemapSettings.vue`'s live diagram. `index` is a real
 *  Gamepad API standard-mapping index (same space `GamepadButtonBinding.index` uses); `x`/`y`
 *  are % of the silhouette. Lets a manifest reposition/add/omit diagram buttons instead of
 *  every plugin using the component's built-in default layout - doesn't redefine what an index
 *  means, just where it's drawn. */
export interface GamepadLayoutButton {
  index: number;
  x: number;
  y: number;
  shape: "round" | "pill" | "stick";
}

/** A custom controller-body outline replacing the diagram's default
 *  (`@tabler/icons-vue`'s `device-gamepad-2`). Both fields required together - a path's
 *  coordinates are meaningless without its own viewBox. */
export interface GamepadSilhouette {
  viewBox: string;
  path: string;
}

export interface ControllerMappingPlugin extends PluginBase {
  mapping: GamepadMapping;
}

export interface LocaleProfile {
  name: string;
  guid: string;
}

/** A compatibility wrapper (Locale Remulator/Emulator) - self-contained: manages its own
 *  install (`Installable`), lists locale profiles, launches through one. Unlike Steam/GOG's
 *  auto-detected paths, install() always resolves the same deterministic location. */
export interface WrapperPlugin extends PluginBase, Installable {
  listProfiles(): Promise<LocaleProfile[]>;
  launch(profileGuid: string, executablePath: string): Promise<void>;
}

export interface ThemePlugin extends PluginBase {
  /** CSS custom properties (e.g. "--color-base") applied to :root while active. */
  cssVariables?: Record<string, string>;
  /** Milestone 17 - closed-vocabulary JSON AST overriding GameCard's cover-visual region, no
   *  executable code. Untyped here - untrusted until `validateCardVisualAst` runs (see
   *  `theme/cardVisualRegistry.ts`). */
  cardVisual?: unknown;
  /** Font files loaded via @font-face while active - declarative, but untrusted third-party
   *  content injected into real CSS, so `theme/fontFaceRegistry.ts` strictly validates every
   *  field (allowlisted chars, https-only url) before building any CSS text from it. */
  fontFaces?: unknown;
  activate?(): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
