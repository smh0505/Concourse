import { getDb } from "./client";
import type { Game, GameEditFields } from "./types";

export class GameRepository {
  /** Milestone 30 - only the active profile's games. Every source-plugin scan/manual add also
   *  writes profile_id (see add/addWithPlatform below), so this is a plain equality filter, not
   *  a join. Milestone 30 step 3 - also excludes any game carrying a tag Admin hid for this
   *  profile ("kids mode"), so every consumer (grid, list, Big Picture, stats) respects the
   *  hide-list automatically without its own filtering logic. */
  async list(profileId: number): Promise<Game[]> {
    const db = await getDb();
    return db.select<Game[]>(
      `SELECT * FROM games
       WHERE profile_id = $1
       AND id NOT IN (
         SELECT game_tags.game_id FROM game_tags
         JOIN hidden_tags ON hidden_tags.tag_id = game_tags.tag_id
         WHERE hidden_tags.profile_id = $1
       )
       ORDER BY title COLLATE NOCASE`,
      [profileId],
    );
  }

  async add(title: string, executablePath: string, profileId: number): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT INTO games (title, executable_path, profile_id) VALUES ($1, $2, $3)",
      [title, executablePath, profileId],
    );
  }

  async addWithPlatform(
    title: string,
    executablePath: string,
    platform: string,
    profileId: number,
    installDir?: string,
  ): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT INTO games (title, executable_path, platform, install_dir, profile_id) VALUES ($1, $2, $3, $4, $5)",
      [title, executablePath, platform, installDir ?? null, profileId],
    );
  }

  async updateLaunchSource(
    id: number,
    executablePath: string,
    platform: string,
    installDir?: string,
  ): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE games SET executable_path = $1, platform = $2, install_dir = $3 WHERE id = $4",
      [executablePath, platform, installDir ?? null, id],
    );
  }

  async delete(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM games WHERE id = $1", [id]);
  }

  /** Milestone 30 - profile deletion cascade. Cascades to game_tags/game_collections/
   *  playtime_sessions via their existing ON DELETE CASCADE FKs, same as a single-game delete. */
  async deleteByProfile(profileId: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM games WHERE profile_id = $1", [profileId]);
  }

  async updateCoverArt(id: number, coverArtUrl: string): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE games SET cover_art_url = $1 WHERE id = $2", [coverArtUrl, id]);
  }

  async updateBackgroundArt(id: number, backgroundArtUrl: string): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE games SET background_art_url = $1 WHERE id = $2", [
      backgroundArtUrl,
      id,
    ]);
  }

  async updateMetadata(
    id: number,
    description: string | null,
    releaseDate: string | null,
  ): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE games SET description = $1, release_date = $2 WHERE id = $3",
      [description, releaseDate, id],
    );
  }

  async update(id: number, fields: GameEditFields): Promise<void> {
    const db = await getDb();
    // Edited title/description invalidates any cached translation and view-toggle state
    // unconditionally, rather than checking which field changed.
    await db.execute(
      `UPDATE games SET
         title = $1,
         executable_path = $2,
         platform = $3,
         cover_art_url = $4,
         background_art_url = $5,
         description = $6,
         release_date = $7,
         skip_dedup = $8,
         locale_profile_guid = $9,
         locale_wrapper = $10,
         skip_presence = $11,
         pseudo_fullscreen = $12,
         always_on_top = $13,
         remember_window = $14,
         dpi_override = $15,
         force_resolution = $16,
         resolution_width = $17,
         resolution_height = $18,
         resolution_refresh = $19,
         translated_title = NULL,
         translated_description = NULL,
         translated_locale = NULL,
         show_translated_title = 0,
         show_translated_description = 0
       WHERE id = $20`,
      [
        fields.title,
        fields.executable_path,
        fields.platform,
        fields.cover_art_url,
        fields.background_art_url,
        fields.description,
        fields.release_date,
        fields.skip_dedup,
        fields.locale_profile_guid,
        fields.locale_wrapper,
        fields.skip_presence,
        fields.pseudo_fullscreen,
        fields.always_on_top,
        fields.remember_window,
        fields.dpi_override,
        fields.force_resolution,
        fields.resolution_width,
        fields.resolution_height,
        fields.resolution_refresh,
        id,
      ],
    );
  }

  /** Captured automatically at session end (Milestone 39 stretch) - separate from update() since
   *  this isn't part of the user-facing edit form, it's system-maintained state. */
  async updateWindowRect(id: number, x: number, y: number, width: number, height: number): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE games SET window_x = $1, window_y = $2, window_width = $3, window_height = $4 WHERE id = $5",
      [x, y, width, height, id],
    );
  }

  /** Title and content translate independently - each gets its own update so translating one
   *  never touches the other's already-cached value. */
  async updateTranslatedTitle(id: number, translatedTitle: string, locale: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE games SET translated_title = $1, translated_locale = $2 WHERE id = $3",
      [translatedTitle, locale, id],
    );
  }

  async updateTranslatedDescription(id: number, translatedDescription: string, locale: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE games SET translated_description = $1, translated_locale = $2 WHERE id = $3",
      [translatedDescription, locale, id],
    );
  }

  /** Only clears the field itself, leaving translated_locale untouched - the other field's
   *  cached translation may still depend on it. */
  async clearTranslatedTitle(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE games SET translated_title = NULL WHERE id = $1", [id]);
  }

  async clearTranslatedDescription(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE games SET translated_description = NULL WHERE id = $1", [id]);
  }

  async clearTranslation(id: number): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE games SET translated_title = NULL, translated_description = NULL, translated_locale = NULL WHERE id = $1",
      [id],
    );
  }

  /** Persists which of title/description GameDetail.vue's "show" toggle displays, per game. */
  async updateShowTranslated(id: number, showTitle: boolean, showDescription: boolean): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE games SET show_translated_title = $1, show_translated_description = $2 WHERE id = $3",
      [showTitle ? 1 : 0, showDescription ? 1 : 0, id],
    );
  }
}
