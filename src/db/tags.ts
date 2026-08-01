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

  /** Standalone create, not attached to any game - the manager's own "add tag" affordance,
   *  distinct from `addToGame` (which creates implicitly as a side effect of tagging a game). */
  async create(name: string): Promise<void> {
    const db = await getDb();
    await db.execute("INSERT OR IGNORE INTO tags (name) VALUES ($1)", [name]);
  }

  /** Renaming onto an already-existing tag name merges into it instead of erroring on the
   *  UNIQUE constraint - every game tagged with `oldName` ends up tagged with `newName`,
   *  and `oldName` itself is removed. */
  async rename(oldName: string, newName: string): Promise<void> {
    if (oldName === newName) return;
    const db = await getDb();
    const existing = await db.select<{ id: number }[]>("SELECT id FROM tags WHERE name = $1", [
      newName,
    ]);
    if (existing.length > 0) {
      await db.execute(
        `INSERT OR IGNORE INTO game_tags (game_id, tag_id)
         SELECT game_id, $1 FROM game_tags
         WHERE tag_id = (SELECT id FROM tags WHERE name = $2)`,
        [existing[0].id, oldName],
      );
      await db.execute("DELETE FROM tags WHERE name = $1", [oldName]);
    } else {
      await db.execute("UPDATE tags SET name = $1 WHERE name = $2", [newName, oldName]);
    }
  }

  /** Cascades to `game_tags` via its own `ON DELETE CASCADE` - no manual cleanup needed. */
  async delete(name: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM tags WHERE name = $1", [name]);
  }

  /** How many games carry each tag, for the manager's own list - `total_playtime`-style
   *  aggregates live on `games` directly, but tag usage has no equivalent, always needs its
   *  own query. */
  async getUsageCounts(): Promise<Record<string, number>> {
    const db = await getDb();
    const rows = await db.select<{ name: string; count: number }[]>(
      `SELECT tags.name as name, COUNT(game_tags.game_id) as count
       FROM tags LEFT JOIN game_tags ON game_tags.tag_id = tags.id
       GROUP BY tags.id ORDER BY tags.name`,
    );
    return Object.fromEntries(rows.map((r) => [r.name, r.count]));
  }
}
