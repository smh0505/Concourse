import { defineStore } from "pinia";
import { ref } from "vue";

import { playtime as playtimeRepo } from "@/db";

const RECENTLY_PLAYED_LIMIT = 10;

interface RecentlyPlayedRow {
  gameId: number;
  lastPlayed: string;
}

export const useStatsStore = defineStore("stats", () => {
  const recentlyPlayed = ref<RecentlyPlayedRow[]>([]);

  async function refresh() {
    const rows = await playtimeRepo.getRecentlyPlayed(RECENTLY_PLAYED_LIMIT);
    recentlyPlayed.value = rows.map((row) => ({
      gameId: row.game_id,
      lastPlayed: row.last_played,
    }));
  }

  return { recentlyPlayed, refresh };
});
