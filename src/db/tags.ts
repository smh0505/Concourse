import { getDb } from "./client";

export class TagRepository {
  /** `profileId` resolves/creates each name within its own profile's tag namespace - two
   *  profiles can each have their own "Co-op" tag as of Milestone 30, so a bare name lookup is
   *  no longer enough to find (or create) the right row. */
  async addToGame(gameId: number, tagNames: string[], profileId: number): Promise<void> {
    const db = await getDb();
    for (const name of tagNames) {
      await db.execute("INSERT OR IGNORE INTO tags (name, profile_id) VALUES ($1, $2)", [
        name,
        profileId,
      ]);
      await db.execute(
        `INSERT OR IGNORE INTO game_tags (game_id, tag_id)
         SELECT $1, id FROM tags WHERE name = $2 AND profile_id = $3`,
        [gameId, name, profileId],
      );
    }
  }

  async removeFromGame(gameId: number, tagName: string, profileId: number): Promise<void> {
    const db = await getDb();
    await db.execute(
      `DELETE FROM game_tags
       WHERE game_id = $1 AND tag_id = (SELECT id FROM tags WHERE name = $2 AND profile_id = $3)`,
      [gameId, tagName, profileId],
    );
  }

  async getAll(profileId: number): Promise<string[]> {
    const db = await getDb();
    const rows = await db.select<{ name: string }[]>(
      "SELECT name FROM tags WHERE profile_id = $1 ORDER BY name",
      [profileId],
    );
    return rows.map((r) => r.name);
  }

  /** Milestone 30 step 3 - kids mode. Needs ids (unlike `getAll`) because `hidden_tags` keys
   *  off tag_id, not name. Takes an explicit target profileId rather than the store's own
   *  `activeProfileId()` convenience - this is always called cross-profile, by Admin managing
   *  a different profile's hide-list. */
  async listWithIds(profileId: number): Promise<{ id: number; name: string }[]> {
    const db = await getDb();
    return db.select<{ id: number; name: string }[]>(
      "SELECT id, name FROM tags WHERE profile_id = $1 ORDER BY name",
      [profileId],
    );
  }

  /** Milestone 30 step 3 - which of `profileId`'s own tags are currently hidden from its
   *  library view. */
  async getHiddenTagIds(profileId: number): Promise<number[]> {
    const db = await getDb();
    const rows = await db.select<{ tag_id: number }[]>(
      "SELECT tag_id FROM hidden_tags WHERE profile_id = $1",
      [profileId],
    );
    return rows.map((r) => r.tag_id);
  }

  /** Milestone 30 step 3 - Admin's toggle handler. Replaces the full hidden-tag set for
   *  `profileId` in one call rather than exposing separate hide/unhide methods, since the UI
   *  is a checklist (whole-set state), not one-at-a-time actions. */
  async setHiddenTagIds(profileId: number, tagIds: number[]): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM hidden_tags WHERE profile_id = $1", [profileId]);
    for (const tagId of tagIds) {
      await db.execute("INSERT INTO hidden_tags (profile_id, tag_id) VALUES ($1, $2)", [
        profileId,
        tagId,
      ]);
    }
  }

  /** No profileId filter needed - `gameId` already belongs to exactly one profile, and every
   *  tag it's linked to via game_tags necessarily belongs to that same profile (a game can only
   *  ever be tagged with tags from its own profile in the first place). */
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
  async create(name: string, profileId: number): Promise<void> {
    const db = await getDb();
    await db.execute("INSERT OR IGNORE INTO tags (name, profile_id) VALUES ($1, $2)", [
      name,
      profileId,
    ]);
  }

  /** Renaming onto an already-existing tag name (within the same profile) merges into it
   *  instead of erroring on the UNIQUE(name, profile_id) constraint - every game tagged with
   *  `oldName` ends up tagged with `newName`, and `oldName` itself is removed. */
  async rename(oldName: string, newName: string, profileId: number): Promise<void> {
    if (oldName === newName) return;
    const db = await getDb();
    const existing = await db.select<{ id: number }[]>(
      "SELECT id FROM tags WHERE name = $1 AND profile_id = $2",
      [newName, profileId],
    );
    if (existing.length > 0) {
      await db.execute(
        `INSERT OR IGNORE INTO game_tags (game_id, tag_id)
         SELECT game_id, $1 FROM game_tags
         WHERE tag_id = (SELECT id FROM tags WHERE name = $2 AND profile_id = $3)`,
        [existing[0].id, oldName, profileId],
      );
      await db.execute("DELETE FROM tags WHERE name = $1 AND profile_id = $2", [oldName, profileId]);
    } else {
      await db.execute("UPDATE tags SET name = $1 WHERE name = $2 AND profile_id = $3", [
        newName,
        oldName,
        profileId,
      ]);
    }
  }

  /** Cascades to `game_tags` via its own `ON DELETE CASCADE` - no manual cleanup needed. */
  async delete(name: string, profileId: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM tags WHERE name = $1 AND profile_id = $2", [name, profileId]);
  }

  /** Milestone 30 - profile deletion cascade. `game_tags` rows for this profile's games are
   *  already gone by the time this runs (games.deleteByProfile's own cascade) - this only
   *  cleans up the now-unused `tags` rows themselves. */
  async deleteAllForProfile(profileId: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM tags WHERE profile_id = $1", [profileId]);
  }

  /** How many games carry each tag, for the manager's own list - `total_playtime`-style
   *  aggregates live on `games` directly, but tag usage has no equivalent, always needs its
   *  own query. */
  async getUsageCounts(profileId: number): Promise<Record<string, number>> {
    const db = await getDb();
    const rows = await db.select<{ name: string; count: number }[]>(
      `SELECT tags.name as name, COUNT(game_tags.game_id) as count
       FROM tags LEFT JOIN game_tags ON game_tags.tag_id = tags.id
       WHERE tags.profile_id = $1
       GROUP BY tags.id ORDER BY tags.name`,
      [profileId],
    );
    return Object.fromEntries(rows.map((r) => [r.name, r.count]));
  }
}
