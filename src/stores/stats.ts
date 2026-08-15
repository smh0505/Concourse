import { defineStore } from "pinia";
import { ref } from "vue";

import { playtime as playtimeRepo } from "@/db";
import { useProfilesStore } from "./profiles";

const RECENTLY_PLAYED_LIMIT = 10;

interface RecentlyPlayedRow {
  gameId: number;
  lastPlayed: string;
}

export const useStatsStore = defineStore("stats", () => {
  const recentlyPlayed = ref<RecentlyPlayedRow[]>([]);

  async function refresh() {
    // App.vue gates the main library UI behind profile selection - guaranteed active here.
    const rows = await playtimeRepo.getRecentlyPlayed(RECENTLY_PLAYED_LIMIT, useProfilesStore().activeProfileId!);
    recentlyPlayed.value = rows.map((row) => ({
      gameId: row.game_id,
      lastPlayed: row.last_played,
    }));
  }

  return { recentlyPlayed, refresh };
});
