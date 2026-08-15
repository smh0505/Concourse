export interface Game {
  id: number;
  title: string;
  executable_path: string;
  platform: string | null;
  cover_art_url: string | null;
  background_art_url: string | null;
  description: string | null;
  release_date: string | null;
  total_playtime: number;
  /** SQLite boolean (0/1). When set, plugin scans never merge into this row - a title
   *  match inserts a separate new row instead of overwriting executable_path/platform. */
  skip_dedup: number;
  /** Known install folder, used for folder-based playtime tracking on URI-launched games. */
  install_dir: string | null;
  /** Profile GUID (from LRConfig.xml/LEConfig.xml, created via the wrapper's own GUI). When
   *  set together with locale_wrapper, launch wraps the executable through that wrapper's
   *  exe instead of spawning it directly. */
  locale_profile_guid: string | null;
  /** Which wrapper plugin id locale_profile_guid belongs to (e.g. "locale-remulator-wasm") -
   *  GUIDs aren't namespaced against each other across wrapper plugins, so this disambiguates
   *  which one to launch via. */
  locale_wrapper: string | null;
  /** Cached offline-translation output, kept alongside title/description rather than
   *  overwriting them. translated_locale is the UI locale this was translated *into* - a
   *  mismatch against the current UI locale means the cached translation is stale. */
  translated_title: string | null;
  translated_description: string | null;
  translated_locale: string | null;
  /** SQLite booleans (0/1) - which of title/description GameDetail.vue's "show" toggle
   *  currently displays, persisted per-game. */
  show_translated_title: number;
  show_translated_description: number;
  /** SQLite boolean (0/1) - per-game opt-out from every enabled presence plugin (Milestone 29 -
   *  Discord, a local OBS overlay, etc.), not just Discord specifically. */
  skip_presence: number;
  /** SQLite boolean (0/1) - Milestone 39's per-game opt-in for borderless pseudo-fullscreen
   *  (built-in feature, not a plugin). Off by default - not every game benefits. */
  pseudo_fullscreen: number;
  /** SQLite boolean (0/1) - Milestone 39 stretch, per-game opt-in to keep the game window
   *  pinned above every other window for the session. Independent of pseudo_fullscreen. */
  always_on_top: number;
  /** SQLite boolean (0/1) - Milestone 39 stretch, per-game opt-in to restore the game window's
   *  last position/size on the next launch. */
  remember_window: number;
  /** Captured automatically at session end when remember_window is on - not user-editable via
   *  the edit form, so not part of GameEditFields. NULL until a session has actually captured
   *  one. */
  window_x: number | null;
  window_y: number | null;
  window_width: number | null;
  window_height: number | null;
  /** Milestone 39 stretch - DPI-awareness compatibility override, one of "none" | "application" |
   *  "system" | "system_enhanced". Persistent per-exe registry setting (AppCompatFlags\Layers,
   *  same mechanism as Explorer's own "Change high DPI settings" dialog) - applied by invoking
   *  set_dpi_override when saved, not tied to launch/exit like the other three. */
  dpi_override: string;
  /** SQLite boolean (0/1) - Milestone 39 stretch, per-game opt-in to switch the target display
   *  to resolution_width/height/refresh before launch, reverting after the session ends. Unlike
   *  dpi_override this is a real session-lifecycle treatment (see resolution_override.rs). */
  force_resolution: number;
  resolution_width: number | null;
  resolution_height: number | null;
  resolution_refresh: number | null;
  /** Milestone 30 - which profile's library this game belongs to. Not user-editable via the
   *  edit form (moving a game between profiles isn't supported in v1) - set once at insert. */
  profile_id: number;
}

export type GameEditFields = Pick<
  Game,
  | "title"
  | "executable_path"
  | "platform"
  | "cover_art_url"
  | "background_art_url"
  | "description"
  | "release_date"
  | "skip_dedup"
  | "locale_profile_guid"
  | "locale_wrapper"
  | "skip_presence"
  | "pseudo_fullscreen"
  | "always_on_top"
  | "remember_window"
  | "dpi_override"
  | "force_resolution"
  | "resolution_width"
  | "resolution_height"
  | "resolution_refresh"
>;

/** The title to show for `game` under the current UI `locale` - a valid cached translation, or
 *  the original. Shared by every place that names a game outside GameDetail.vue itself (which
 *  additionally lets the user toggle back to the original on demand). */
export function displayTitle(game: Game, locale: string): string {
  return game.translated_title && game.translated_locale === locale ? game.translated_title : game.title;
}
