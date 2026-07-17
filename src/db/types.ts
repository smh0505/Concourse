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
>;
