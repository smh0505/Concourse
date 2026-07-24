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
>;
