import { GameRepository } from "./games";
import { TagRepository } from "./tags";
import { PlaytimeRepository } from "./playtime";
import { SettingsRepository } from "./settings";

export const games = new GameRepository();
export const tags = new TagRepository();
export const playtime = new PlaytimeRepository();
export const settings = new SettingsRepository();

export type { Game, GameEditFields } from "./types";
