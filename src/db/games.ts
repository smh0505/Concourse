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
    // Edited title/description invalidates any cached translation unconditionally, rather than
    // checking which field actually changed - simplest way to guarantee a stale translation can
    // never survive an edit that might have changed the very text it was translated from.
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
         translated_title = NULL,
         translated_description = NULL,
         translated_locale = NULL
       WHERE id = $11`,
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
        id,
      ],
    );
  }

  /** Title and content are translated independently (see GameDetail.vue's dropdown) - each gets
   *  its own update rather than one combined method, so translating one never touches the
   *  other's already-cached value. Both share the single translated_locale column, so
   *  translating title and content under two different active UI locales is a known, accepted
   *  edge case (the older of the two would incorrectly read as still valid). */
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
}
