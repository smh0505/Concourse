import { getDb } from "./client";

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
}
