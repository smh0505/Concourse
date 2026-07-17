import { getDb } from "./client";

export class TagRepository {
  async addToGame(gameId: number, tagNames: string[]): Promise<void> {
    const db = await getDb();
    for (const name of tagNames) {
      await db.execute("INSERT OR IGNORE INTO tags (name) VALUES ($1)", [name]);
      await db.execute(
        `INSERT OR IGNORE INTO game_tags (game_id, tag_id)
         SELECT $1, id FROM tags WHERE name = $2`,
        [gameId, name],
      );
    }
  }

  async removeFromGame(gameId: number, tagName: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      `DELETE FROM game_tags
       WHERE game_id = $1 AND tag_id = (SELECT id FROM tags WHERE name = $2)`,
      [gameId, tagName],
    );
  }

  async getAll(): Promise<string[]> {
    const db = await getDb();
    const rows = await db.select<{ name: string }[]>("SELECT name FROM tags ORDER BY name");
    return rows.map((r) => r.name);
  }

  async getForGame(gameId: number): Promise<string[]> {
    const db = await getDb();
    const rows = await db.select<{ name: string }[]>(
      `SELECT tags.name FROM tags
       JOIN game_tags ON game_tags.tag_id = tags.id
       WHERE game_tags.game_id = $1
       ORDER BY tags.name`,
      [gameId],
    );
    return rows.map((r) => r.name);
  }
}
