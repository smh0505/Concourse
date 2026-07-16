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
