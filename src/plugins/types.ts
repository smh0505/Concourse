import type { Component } from "vue";

export interface PluginBase {
  id: string;
  name: string;
  /** Optional inline settings UI, rendered under this plugin's row in the settings panel. */
  settingsComponent?: Component;
}

/** Composable with any plugin kind (tagged via the manifest's `installable` flag) - a plugin
 *  that manages its own downloaded dependency rather than just working with what's already on
 *  disk. A plugin implementing this and not setting its own settingsComponent gets the
 *  generic InstallableStatus.vue Install button for free. */
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
  /** Known install folder, used for folder-based playtime tracking on URI-launched entries. */
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
  /** Optional - a text-only provider (e.g. IGDB) leaves these unset; an art-only provider
   *  (e.g. SteamGridDB) leaves description/releaseDate/genres unset. metadataProviders.ts's
   *  merge picks the first non-null value across every enabled provider, same as the text
   *  fields. */
  coverArtUrl?: string | null;
  backgroundArtUrl?: string | null;
}

/** One plausible match from a provider's own search - usually there's exactly one, but a
 *  provider's search can genuinely be ambiguous (a duplicate/reissue sharing the same title).
 *  `label` is free-form display text the provider controls, so it can disambiguate identically-
 *  named candidates itself (e.g. RAWG appending a release year). */
export interface MetadataCandidate {
  id: string;
  label: string;
  /** Optional thumbnail shown next to `label` in the candidate picker - a provider whose
   *  search doesn't return per-result images (e.g. SteamGridDB's autocomplete) leaves this
   *  unset; that provider's section just renders text. */
  imageUrl?: string;
}

export interface MetadataProviderPlugin extends PluginBase {
  /** Every plausible match for `title` - metadataProviders.ts's fetchMetadata auto-picks the
   *  sole candidate when there's exactly one, prompts the user when there's more than one, and
   *  skips this provider entirely when there are none. */
  searchCandidates(title: string): Promise<MetadataCandidate[]>;
  /** Full metadata for one specific candidate previously returned by searchCandidates. */
  fetchMetadataById(id: string): Promise<MetadataResult | null>;
}

export interface GamepadButtonBinding {
  kind: "button";
  index: number;
}

export interface GamepadAxisBinding {
  kind: "axis";
  axis: number;
  /** Which way the axis travels when this direction is "pressed" - +1 for a positive-going
   *  axis value, -1 for negative-going. */
  sign: 1 | -1;
}

/** Every mapped input is driven by exactly one source at a time - a discrete button, an axis
 *  crossing (some pads report a d-pad or analog triggers as axes, not buttons), or nothing yet
 *  (null). Not both at once - remapping replaces whatever was bound before. */
export type GamepadDirectionBinding = GamepadButtonBinding | GamepadAxisBinding | null;

export interface GamepadMapping {
  dpadUp: GamepadDirectionBinding;
  dpadDown: GamepadDirectionBinding;
  dpadLeft: GamepadDirectionBinding;
  dpadRight: GamepadDirectionBinding;
  buttonConfirm: GamepadDirectionBinding;
  buttonCancel: GamepadDirectionBinding;
  /** Crossing threshold (0-1) for any axis binding above - shared by every input's axis binding,
   *  not per-axis. */
  axisThreshold?: number;
  repeatDelayMs?: number;
  repeatIntervalMs?: number;
}

/** One physical button's placement on `GamepadRemapSettings.vue`'s live diagram - `index` is a
 *  real Gamepad API standard-mapping index (same semantic space `GamepadButtonBinding.index`
 *  and `buttonNames.ts` already use), `x`/`y` are % of the silhouette's own box. Lets a
 *  manifest reposition, add, or omit diagram buttons instead of every plugin being stuck with
 *  the component's own built-in `standard-gamepad`-shaped default layout - the *set* of buttons
 *  this diagram draws is manifest-driven data, not a fixed assumption baked into the UI. Doesn't
 *  redefine what an index *means* (still the same 17 real Gamepad API buttons `buttonNames.ts`
 *  knows how to label) - just where, if anywhere, each one is drawn. */
export interface GamepadLayoutButton {
  index: number;
  x: number;
  y: number;
  shape: "round" | "pill" | "stick";
}

/** A custom controller-body outline for the live diagram, replacing the component's own default
 *  (`@tabler/icons-vue`'s `device-gamepad-2` outer path) - `viewBox` is the standard SVG
 *  attribute value (e.g. `"0 3 24 18"`), `path` is a single `<path d="...">` string. Both
 *  required together since a path's coordinates are only meaningful relative to its own
 *  viewBox. */
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

/** A compatibility wrapper (e.g. Locale Remulator/Locale Emulator) - fully self-contained:
 *  manages its own download/install (`Installable`), lists the locale profiles the user has
 *  set up, and launches a target executable through one of them. Unlike Steam/GOG's
 *  auto-detected registry paths, install() always installs to (and the plugin itself always
 *  resolves) the same deterministic location, so there's no path for the host to own or pass
 *  in. */
export interface WrapperPlugin extends PluginBase, Installable {
  listProfiles(): Promise<LocaleProfile[]>;
  launch(profileGuid: string, executablePath: string): Promise<void>;
}

export interface ThemePlugin extends PluginBase {
  /** CSS custom properties (e.g. "--color-base") applied to :root while this theme is active. */
  cssVariables?: Record<string, string>;
  /** Milestone 17 - a closed-vocabulary JSON AST overriding GameCard's cover-visual region
   *  (image-or-placeholder) without needing a real Vue component (`slots`, install-time only)
   *  or executable code of any kind. Untyped here deliberately (not `AstNode` from
   *  `theme/cardVisualAst`) - the value is untrusted data regardless of source and always goes
   *  through `validateCardVisualAst` before use; see `theme/cardVisualRegistry.ts`. */
  cardVisual?: unknown;
  /** Real font files a theme wants loaded via @font-face while active - declarative data (no
   *  code), but still untrusted third-party content injected into a real <style> block, so
   *  `theme/fontFaceRegistry.ts` validates every field strictly (family/weight/style against a
   *  safe-character allowlist, url must parse as https:) before ever constructing CSS text
   *  from it - a family name or url containing `"`/`;`/`}` could otherwise break out of the
   *  @font-face rule and inject arbitrary CSS elsewhere on the page. */
  fontFaces?: unknown;
  /** Called when this theme becomes the active one. */
  activate?(): void | Promise<void>;
  /** Called when this theme is replaced by another (or deselected). */
  deactivate?(): void | Promise<void>;
}
