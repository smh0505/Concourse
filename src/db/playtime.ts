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
   *  session log, so this always needs its own query rather than reading off `Game` directly. */
  async getRecentlyPlayed(limit: number): Promise<RecentlyPlayedEntry[]> {
    const db = await getDb();
    return db.select<RecentlyPlayedEntry[]>(
      `SELECT game_id, MAX(end_time) as last_played
       FROM playtime_sessions
       GROUP BY game_id
       ORDER BY last_played DESC
       LIMIT $1`,
      [limit],
    );
  }
}
