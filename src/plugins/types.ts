import type { Component } from "vue";

export interface GameEntry {
  id: string;
  title: string;
  executablePath: string;
  platform: string;
  coverArtUrl?: string;
}

export interface SourcePlugin {
  id: string;
  name: string;
  scan(): Promise<GameEntry[]>;
  launch(entry: GameEntry): Promise<void>;
  getInstallStatus(entry: GameEntry): Promise<boolean>;
}

/** Named, swappable UI regions a theme plugin can override. */
export type ThemeSlotName = "GameCard" | "BigPictureTile";

export interface ThemePlugin {
  id: string;
  name: string;
  /** Component overrides per slot; slots not listed fall back to the built-in component. */
  slots?: Partial<Record<ThemeSlotName, Component>>;
  /** CSS custom properties (e.g. "--color-base") applied to :root while this theme is active. */
  cssVariables?: Record<string, string>;
  /** Called when this theme becomes the active one. */
  activate?(): void | Promise<void>;
  /** Called when this theme is replaced by another (or deselected). */
  deactivate?(): void | Promise<void>;
}
