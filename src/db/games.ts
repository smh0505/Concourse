import { getDb } from "./client";
import type { Game, GameEditFields } from "./types";

export class GameRepository {
  async list(): Promise<Game[]> {
    const db = await getDb();
    return db.select<Game[]>("SELECT * FROM games ORDER BY title COLLATE NOCASE");
  }

  async add(title: string, executablePath: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT INTO games (title, executable_path) VALUES ($1, $2)",
      [title, executablePath],
    );
  }

  async addWithPlatform(
    title: string,
    executablePath: string,
    platform: string,
    installDir?: string,
  ): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT INTO games (title, executable_path, platform, install_dir) VALUES ($1, $2, $3, $4)",
      [title, executablePath, platform, installDir ?? null],
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
         skip_discord_presence = $11,
         translated_title = NULL,
         translated_description = NULL,
         translated_locale = NULL,
         show_translated_title = 0,
         show_translated_description = 0
       WHERE id = $12`,
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
        fields.skip_discord_presence,
        id,
      ],
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
