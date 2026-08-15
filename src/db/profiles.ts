import { getDb } from "./client";

export interface Profile {
  id: number;
  name: string;
}

export class ProfileRepository {
  async list(): Promise<Profile[]> {
    const db = await getDb();
    return db.select<Profile[]>("SELECT * FROM profiles ORDER BY id");
  }

  async create(name: string): Promise<number> {
    const db = await getDb();
    const result = await db.execute("INSERT INTO profiles (name) VALUES ($1)", [name]);
    return result.lastInsertId as number;
  }

  async rename(id: number, name: string): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE profiles SET name = $1 WHERE id = $2", [name, id]);
  }

  /** Cascades nowhere on its own - games/tags/collections reference profile_id without
   *  ON DELETE CASCADE (losing an entire library silently on a profile deletion would be far
   *  too destructive for a foreign-key side effect). Deleting the games etc. belonging to this
   *  profile, if that's what the caller wants, is a separate explicit step. */
  async delete(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM profiles WHERE id = $1", [id]);
  }
}
