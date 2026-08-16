import { getDb } from "./client";

export class SettingsRepository {
  async get(key: string): Promise<string | null> {
    const db = await getDb();
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM settings WHERE key = $1",
      [key],
    );
    return rows[0]?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
      [key, value],
    );
  }

  async delete(key: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM settings WHERE key = $1", [key]);
  }

  /** Milestone 30 step 2 - plugin enablement/settings and controller mapping moved from a
   *  global key to one scoped per profile. Falls back to the old global key (and copies it
   *  forward) if the scoped one has never been written yet - a lazy, one-time migration for
   *  whatever was already configured under the global key before this profile existed to have
   *  its own copy, without a separate upfront migration pass. Only ever matters for profile 1
   *  ("Admin", the pre-M30 profile) - any other profile has no legacy global value to inherit,
   *  so this is a no-op fallback for them (both reads come back null, same as before). */
  async getForProfile(profileId: number, key: string): Promise<string | null> {
    const scopedKey = `profile:${profileId}:${key}`;
    const scoped = await this.get(scopedKey);
    if (scoped !== null) return scoped;

    const legacy = await this.get(key);
    if (legacy !== null) await this.set(scopedKey, legacy);
    return legacy;
  }

  async setForProfile(profileId: number, key: string, value: string): Promise<void> {
    await this.set(`profile:${profileId}:${key}`, value);
  }
}
