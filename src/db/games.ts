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

  async delete(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM games WHERE id = $1", [id]);
  }

  async updateCoverArt(id: number, coverArtUrl: string): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE games SET cover_art_url = $1 WHERE id = $2", [coverArtUrl, id]);
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
    await db.execute(
      `UPDATE games SET
         title = $1,
         executable_path = $2,
         platform = $3,
         cover_art_url = $4,
         background_art_url = $5,
         description = $6,
         release_date = $7
       WHERE id = $8`,
      [
        fields.title,
        fields.executable_path,
        fields.platform,
        fields.cover_art_url,
        fields.background_art_url,
        fields.description,
        fields.release_date,
        id,
      ],
    );
  }
}
