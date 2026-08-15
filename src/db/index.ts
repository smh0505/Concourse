import { GameRepository } from "./games";
import { TagRepository } from "./tags";
import { CollectionRepository } from "./collections";
import { PlaytimeRepository } from "./playtime";
import { SettingsRepository } from "./settings";
import { ProfileRepository } from "./profiles";

export const games = new GameRepository();
export const tags = new TagRepository();
export const collections = new CollectionRepository();
export const playtime = new PlaytimeRepository();
export const settings = new SettingsRepository();
export const profiles = new ProfileRepository();

export type { Game, GameEditFields } from "./types";
export { displayTitle } from "./types";
export type { Profile } from "./profiles";
