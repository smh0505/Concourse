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
}

export interface MetadataProviderPlugin extends PluginBase {
  fetchMetadata(title: string): Promise<MetadataResult | null>;
}

export interface GamepadMapping {
  dpadUp: number;
  dpadDown: number;
  dpadLeft: number;
  dpadRight: number;
  buttonConfirm: number;
  buttonCancel: number;
  axisThreshold?: number;
  repeatDelayMs?: number;
  repeatIntervalMs?: number;
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

/** Named, swappable UI regions a theme plugin can override. */
export type ThemeSlotName = "GameCard" | "BigPictureTile";

export interface ThemePlugin extends PluginBase {
  /** Component overrides per slot; slots not listed fall back to the built-in component. */
  slots?: Partial<Record<ThemeSlotName, Component>>;
  /** CSS custom properties (e.g. "--color-base") applied to :root while this theme is active. */
  cssVariables?: Record<string, string>;
  /** Called when this theme becomes the active one. */
  activate?(): void | Promise<void>;
  /** Called when this theme is replaced by another (or deselected). */
  deactivate?(): void | Promise<void>;
}
