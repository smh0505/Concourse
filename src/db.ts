import Database from "@tauri-apps/plugin-sql";

export interface Game {
  id: number;
  title: string;
  executable_path: string;
  platform: string | null;
  cover_art_url: string | null;
  background_art_url: string | null;
  description: string | null;
  release_date: string | null;
  total_playtime: number;
}

let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:library.db");
  }
  return dbPromise;
}

export async function listGames(): Promise<Game[]> {
  const db = await getDb();
  return db.select<Game[]>("SELECT * FROM games ORDER BY title COLLATE NOCASE");
}

export async function addGame(title: string, executablePath: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO games (title, executable_path) VALUES ($1, $2)",
    [title, executablePath],
  );
}

export async function deleteGame(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM games WHERE id = $1", [id]);
}

export async function updateCoverArt(id: number, coverArtUrl: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE games SET cover_art_url = $1 WHERE id = $2", [coverArtUrl, id]);
}

export async function updateMetadata(
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

export type GameEditFields = Pick<
  Game,
  | "title"
  | "executable_path"
  | "platform"
  | "cover_art_url"
  | "background_art_url"
  | "description"
  | "release_date"
>;

export async function updateGame(id: number, fields: GameEditFields): Promise<void> {
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

export async function recordPlaytimeSession(
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

export async function addTagsToGame(gameId: number, tagNames: string[]): Promise<void> {
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

export async function removeTagFromGame(gameId: number, tagName: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `DELETE FROM game_tags
     WHERE game_id = $1 AND tag_id = (SELECT id FROM tags WHERE name = $2)`,
    [gameId, tagName],
  );
}

export async function getAllTags(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ name: string }[]>("SELECT name FROM tags ORDER BY name");
  return rows.map((r) => r.name);
}

export async function getTagsForGame(gameId: number): Promise<string[]> {
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

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [key, value],
  );
}
