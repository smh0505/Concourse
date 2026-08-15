import { defineStore } from "pinia";
import { ref } from "vue";

import {
  profiles as profileRepo,
  games as gameRepo,
  tags as tagRepo,
  collections as collectionRepo,
  settings as settingsRepo,
  type Profile,
} from "@/db";

const ACTIVE_PROFILE_SETTING = "active_profile_id";

/** Milestone 30, step 1 - which library (profile_id) is currently active. Deliberately its own
 *  store, not folded into appSettings - profile switching drives a full library reload
 *  (`library.refresh()`), unlike every other appSettings toggle, and every other domain store
 *  (tags/collections/library itself) reads `activeProfileId` from here. */
export const useProfilesStore = defineStore("profiles", () => {
  const profiles = ref<Profile[]>([]);
  // null means "no profile selected yet" - App.vue shows the profile picker whenever this is
  // null, whether that's a first run (nothing stored) or the stored id no longer exists (that
  // profile was deleted from a different install of the same library.db, or just deleted here
  // and nothing else picked yet).
  const activeProfileId = ref<number | null>(null);

  async function loadProfiles() {
    profiles.value = await profileRepo.list();
  }

  /** Reads the last-active profile from settings and adopts it if it still exists - most users
   *  never explicitly "log out", so this makes a single-profile (or "same person every time")
   *  setup just as zero-friction as before Milestone 30, rather than forcing the picker on every
   *  launch regardless of profile count. */
  async function init() {
    await loadProfiles();
    const stored = await settingsRepo.get(ACTIVE_PROFILE_SETTING);
    const storedId = stored ? Number(stored) : null;
    activeProfileId.value =
      storedId !== null && profiles.value.some((p) => p.id === storedId) ? storedId : null;
  }

  async function switchTo(id: number) {
    activeProfileId.value = id;
    await settingsRepo.set(ACTIVE_PROFILE_SETTING, String(id));
  }

  async function createProfile(name: string): Promise<number> {
    const id = await profileRepo.create(name);
    await loadProfiles();
    return id;
  }

  async function renameProfile(id: number, name: string) {
    await profileRepo.rename(id, name);
    await loadProfiles();
  }

  /** Deletes the profile's entire library (games/tags/collections - playtime_sessions cascade
   *  via games' own FK), not just the `profiles` row itself - an orphaned library nobody can
   *  ever see again would just be dead weight in the DB, and this app has no "restore profile"
   *  concept to make keeping it around meaningful. If this was the active profile, clears
   *  activeProfileId so App.vue falls back to the picker rather than pointing at a profile that
   *  no longer exists. */
  async function deleteProfile(id: number) {
    await gameRepo.deleteByProfile(id);
    await tagRepo.deleteAllForProfile(id);
    await collectionRepo.deleteAllForProfile(id);
    await profileRepo.delete(id);
    await loadProfiles();
    if (activeProfileId.value === id) {
      activeProfileId.value = null;
      await settingsRepo.delete(ACTIVE_PROFILE_SETTING);
    }
  }

  return {
    profiles,
    activeProfileId,
    init,
    loadProfiles,
    switchTo,
    createProfile,
    renameProfile,
    deleteProfile,
  };
});
