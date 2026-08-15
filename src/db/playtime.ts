import { getDb } from "./client";

export interface RecentlyPlayedEntry {
  game_id: number;
  last_played: string;
}

export class PlaytimeRepository {
  async recordSession(
    gameId: number,
    startTime: string,
    endTime: string,
    durationSeconds: number,
  ): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT INTO playtime_sessions (game_id, start_time, end_time, duration_seconds) VALUES ($1, $2, $3, $4)",
      [gameId, startTime, endTime, durationSeconds],
    );
    await db.execute(
      "UPDATE games SET total_playtime = total_playtime + $1 WHERE id = $2",
      [durationSeconds, gameId],
    );
  }

  /** Most recent session end time per game, newest first - `total_playtime` lives on the
   *  `games` row already (aggregate), but "when was this last played" only exists in the
   *  session log, so this always needs its own query rather than reading off `Game` directly.
   *  `playtime_sessions` has no `profile_id` of its own (Milestone 30) - scoped transitively via
   *  a join to `games`, rather than duplicating the column onto every session row. */
  async getRecentlyPlayed(limit: number, profileId: number): Promise<RecentlyPlayedEntry[]> {
    const db = await getDb();
    return db.select<RecentlyPlayedEntry[]>(
      `SELECT playtime_sessions.game_id as game_id, MAX(playtime_sessions.end_time) as last_played
       FROM playtime_sessions
       JOIN games ON games.id = playtime_sessions.game_id
       WHERE games.profile_id = $2
       GROUP BY playtime_sessions.game_id
       ORDER BY last_played DESC
       LIMIT $1`,
      [limit, profileId],
    );
  }

  /** Same query as getRecentlyPlayed, unlimited - library.ts's "recently played" sort needs
   *  every game's last-played time (games with none sort last), not just a top-N list for a
   *  stats widget. */
  async getAllLastPlayed(profileId: number): Promise<RecentlyPlayedEntry[]> {
    const db = await getDb();
    return db.select<RecentlyPlayedEntry[]>(
      `SELECT playtime_sessions.game_id as game_id, MAX(playtime_sessions.end_time) as last_played
       FROM playtime_sessions
       JOIN games ON games.id = playtime_sessions.game_id
       WHERE games.profile_id = $1
       GROUP BY playtime_sessions.game_id`,
      [profileId],
    );
  }
}
