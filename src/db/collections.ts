import { getDb } from "./client";

/** Mirrors TagRepository exactly, over `collections`/`game_collections` instead of
 *  `tags`/`game_tags` - a collection groups a series/franchise, a different organizing
 *  concept from a tag, kept as its own table rather than folded into tags. */
export class CollectionRepository {
  async addToGame(gameId: number, names: string[]): Promise<void> {
    const db = await getDb();
    for (const name of names) {
      await db.execute("INSERT OR IGNORE INTO collections (name) VALUES ($1)", [name]);
      await db.execute(
        `INSERT OR IGNORE INTO game_collections (game_id, collection_id)
         SELECT $1, id FROM collections WHERE name = $2`,
        [gameId, name],
      );
    }
  }

  async removeFromGame(gameId: number, name: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      `DELETE FROM game_collections
       WHERE game_id = $1 AND collection_id = (SELECT id FROM collections WHERE name = $2)`,
      [gameId, name],
    );
  }

  async getAll(): Promise<string[]> {
    const db = await getDb();
    const rows = await db.select<{ name: string }[]>(
      "SELECT name FROM collections ORDER BY name",
    );
    return rows.map((r) => r.name);
  }

  async getForGame(gameId: number): Promise<string[]> {
    const db = await getDb();
    const rows = await db.select<{ name: string }[]>(
      `SELECT collections.name FROM collections
       JOIN game_collections ON game_collections.collection_id = collections.id
       WHERE game_collections.game_id = $1
       ORDER BY collections.name`,
      [gameId],
    );
    return rows.map((r) => r.name);
  }

  async create(name: string): Promise<void> {
    const db = await getDb();
    await db.execute("INSERT OR IGNORE INTO collections (name) VALUES ($1)", [name]);
  }

  async rename(oldName: string, newName: string): Promise<void> {
    if (oldName === newName) return;
    const db = await getDb();
    const existing = await db.select<{ id: number }[]>(
      "SELECT id FROM collections WHERE name = $1",
      [newName],
    );
    if (existing.length > 0) {
      await db.execute(
        `INSERT OR IGNORE INTO game_collections (game_id, collection_id)
         SELECT game_id, $1 FROM game_collections
         WHERE collection_id = (SELECT id FROM collections WHERE name = $2)`,
        [existing[0].id, oldName],
      );
      await db.execute("DELETE FROM collections WHERE name = $1", [oldName]);
    } else {
      await db.execute("UPDATE collections SET name = $1 WHERE name = $2", [newName, oldName]);
    }
  }

  async delete(name: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM collections WHERE name = $1", [name]);
  }

  async getUsageCounts(): Promise<Record<string, number>> {
    const db = await getDb();
    const rows = await db.select<{ name: string; count: number }[]>(
      `SELECT collections.name as name, COUNT(game_collections.game_id) as count
       FROM collections LEFT JOIN game_collections ON game_collections.collection_id = collections.id
       GROUP BY collections.id ORDER BY collections.name`,
    );
    return Object.fromEntries(rows.map((r) => [r.name, r.count]));
  }
}
