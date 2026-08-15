import { getDb } from "./client";

/** Mirrors TagRepository exactly, over `collections`/`game_collections` instead of
 *  `tags`/`game_tags` - a collection groups a series/franchise (e.g. "Final Fantasy"), a
 *  different organizing concept from a tag, kept as its own table rather than folded into tags.
 *  `profileId` threading (Milestone 30) mirrors TagRepository's for the same reason - two
 *  profiles can each have their own "Final Fantasy" collection without colliding. */
export class CollectionRepository {
  async addToGame(gameId: number, names: string[], profileId: number): Promise<void> {
    const db = await getDb();
    for (const name of names) {
      await db.execute("INSERT OR IGNORE INTO collections (name, profile_id) VALUES ($1, $2)", [
        name,
        profileId,
      ]);
      await db.execute(
        `INSERT OR IGNORE INTO game_collections (game_id, collection_id)
         SELECT $1, id FROM collections WHERE name = $2 AND profile_id = $3`,
        [gameId, name, profileId],
      );
    }
  }

  async removeFromGame(gameId: number, name: string, profileId: number): Promise<void> {
    const db = await getDb();
    await db.execute(
      `DELETE FROM game_collections
       WHERE game_id = $1 AND collection_id = (SELECT id FROM collections WHERE name = $2 AND profile_id = $3)`,
      [gameId, name, profileId],
    );
  }

  async getAll(profileId: number): Promise<string[]> {
    const db = await getDb();
    const rows = await db.select<{ name: string }[]>(
      "SELECT name FROM collections WHERE profile_id = $1 ORDER BY name",
      [profileId],
    );
    return rows.map((r) => r.name);
  }

  /** No profileId filter needed - same reasoning as TagRepository.getForGame. */
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

  async create(name: string, profileId: number): Promise<void> {
    const db = await getDb();
    await db.execute("INSERT OR IGNORE INTO collections (name, profile_id) VALUES ($1, $2)", [
      name,
      profileId,
    ]);
  }

  async rename(oldName: string, newName: string, profileId: number): Promise<void> {
    if (oldName === newName) return;
    const db = await getDb();
    const existing = await db.select<{ id: number }[]>(
      "SELECT id FROM collections WHERE name = $1 AND profile_id = $2",
      [newName, profileId],
    );
    if (existing.length > 0) {
      await db.execute(
        `INSERT OR IGNORE INTO game_collections (game_id, collection_id)
         SELECT game_id, $1 FROM game_collections
         WHERE collection_id = (SELECT id FROM collections WHERE name = $2 AND profile_id = $3)`,
        [existing[0].id, oldName, profileId],
      );
      await db.execute("DELETE FROM collections WHERE name = $1 AND profile_id = $2", [
        oldName,
        profileId,
      ]);
    } else {
      await db.execute("UPDATE collections SET name = $1 WHERE name = $2 AND profile_id = $3", [
        newName,
        oldName,
        profileId,
      ]);
    }
  }

  async delete(name: string, profileId: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM collections WHERE name = $1 AND profile_id = $2", [
      name,
      profileId,
    ]);
  }

  /** Milestone 30 - profile deletion cascade, mirrors TagRepository.deleteAllForProfile. */
  async deleteAllForProfile(profileId: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM collections WHERE profile_id = $1", [profileId]);
  }

  async getUsageCounts(profileId: number): Promise<Record<string, number>> {
    const db = await getDb();
    const rows = await db.select<{ name: string; count: number }[]>(
      `SELECT collections.name as name, COUNT(game_collections.game_id) as count
       FROM collections LEFT JOIN game_collections ON game_collections.collection_id = collections.id
       WHERE collections.profile_id = $1
       GROUP BY collections.id ORDER BY collections.name`,
      [profileId],
    );
    return Object.fromEntries(rows.map((r) => [r.name, r.count]));
  }
}
