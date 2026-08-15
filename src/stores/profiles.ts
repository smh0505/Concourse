import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

import {
  profiles as profileRepo,
  games as gameRepo,
  tags as tagRepo,
  collections as collectionRepo,
  settings as settingsRepo,
  type Profile,
} from "@/db";

const ACTIVE_PROFILE_SETTING = "active_profile_id";
// sessionStorage (not a Pinia ref) - survives the window.location.reload() every "switch
// profile" flow uses (ProfilesPanel.vue's switchProfile, App.vue's onSwitchProfile), unlike
// in-memory state which a reload wipes entirely.
const SKIP_AUTO_BIG_PICTURE_ONCE_KEY = "skip_auto_big_picture_once";

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

  // The seeded profile (migration v13 always inserts it as id 1, "Admin") is the one permanent
  // admin - not a renameable/reassignable flag, since renaming a profile's display name (e.g.
  // back to "Default") must not accidentally strip or grant this. Gates profile management
  // (ProfilesPanel) out of Settings for every other profile.
  const isAdmin = computed(() => activeProfileId.value === 1);

  async function loadProfiles() {
    profiles.value = await profileRepo.list();
  }

  /** Reads the last-active profile from settings and adopts it if it still exists - most users
   *  never explicitly "log out", so this makes a single-profile (or "same person every time")
   *  setup just as zero-friction as before Milestone 30, rather than forcing the picker on every
   *  launch regardless of profile count.
   *
   *  `adoptRemembered: false` (App.vue passes this whenever auto-launching straight into Big
   *  Picture) skips that entirely, always landing on `null` - a console's "who's playing" boot
   *  screen should show every time in that mode, not silently resume whoever used it last, even
   *  though the desktop launch path deliberately does the opposite for the same setting. */
  async function init(options?: { adoptRemembered?: boolean }) {
    await loadProfiles();
    if (options?.adoptRemembered === false) {
      activeProfileId.value = null;
      return;
    }
    const stored = await settingsRepo.get(ACTIVE_PROFILE_SETTING);
    const storedId = stored ? Number(stored) : null;
    activeProfileId.value =
      storedId !== null && profiles.value.some((p) => p.id === storedId) ? storedId : null;
  }

  async function switchTo(id: number) {
    activeProfileId.value = id;
    await settingsRepo.set(ACTIVE_PROFILE_SETTING, String(id));
  }

  /** Clears the remembered active profile without picking a new one - the caller (a "Switch
   *  Profile" nav action) is expected to reload the window right after, same as
   *  ProfilesPanel.vue's own switchProfile, so App.vue's onMounted re-runs from scratch and
   *  lands on ProfileSwitcher instead of re-adopting the same profile it just backed out of. */
  async function backToPicker() {
    activeProfileId.value = null;
    await settingsRepo.delete(ACTIVE_PROFILE_SETTING);
  }

  /** Call right before a "switch profile" reload (App.vue's onSwitchProfile,
   *  ProfilesPanel.vue's switchProfile) - App.vue's onMounted otherwise has no way to tell that
   *  reload apart from a genuine fresh app launch, and would wrongly re-apply
   *  autoLaunchBigPicture on every mid-session profile switch even though the user was sitting
   *  in the desktop window (the only place either of those actions is reachable from) when they
   *  triggered it. */
  function skipAutoBigPictureOnce() {
    sessionStorage.setItem(SKIP_AUTO_BIG_PICTURE_ONCE_KEY, "1");
  }

  /** Consumes (clears) the flag - a one-shot check, not a persistent setting. */
  function consumeSkipAutoBigPictureOnce(): boolean {
    const skip = sessionStorage.getItem(SKIP_AUTO_BIG_PICTURE_ONCE_KEY) === "1";
    if (skip) sessionStorage.removeItem(SKIP_AUTO_BIG_PICTURE_ONCE_KEY);
    return skip;
  }

  async function createProfile(name: string): Promise<number> {
    const id = await profileRepo.create(name);
    await loadProfiles();
    return id;
  }

  async function renameProfile(id: number, name: string) {
    // Same belt-and-suspenders reasoning as deleteProfile's id-1 guard - ProfilesPanel.vue
    // already hides the rename button for it, this doesn't rely on that alone.
    if (id === 1) throw new Error("The Admin profile can't be renamed.");
    await profileRepo.rename(id, name);
    await loadProfiles();
  }

  /** The raw PIN is only ever hashed Rust-side (`hash_profile_pin`) - this repo/store never
   *  writes a plaintext PIN anywhere, including in transit to the DB layer. */
  async function setPin(id: number, pin: string) {
    const hash = await invoke<string>("hash_profile_pin", { pin });
    await profileRepo.setPinHash(id, hash);
    await loadProfiles();
  }

  async function clearPin(id: number) {
    await profileRepo.setPinHash(id, null);
    await loadProfiles();
  }

  /** No PIN set on `id` trivially verifies true - ProfileSwitcher only needs to prompt at all
   *  when this profile actually has one. */
  async function verifyPin(id: number, pin: string): Promise<boolean> {
    const profile = profiles.value.find((p) => p.id === id);
    if (!profile?.pin_hash) return true;
    return invoke<boolean>("verify_profile_pin", { pin, stored: profile.pin_hash });
  }

  /** Deletes the profile's entire library (games/tags/collections - playtime_sessions cascade
   *  via games' own FK), not just the `profiles` row itself - an orphaned library nobody can
   *  ever see again would just be dead weight in the DB, and this app has no "restore profile"
   *  concept to make keeping it around meaningful. If this was the active profile, clears
   *  activeProfileId so App.vue falls back to the picker rather than pointing at a profile that
   *  no longer exists. */
  async function deleteProfile(id: number) {
    // Belt-and-suspenders against the delete button ProfilesPanel.vue already hides for id 1 -
    // this store method has no other caller today, but shouldn't rely on UI-level hiding alone
    // to keep the permanent Admin profile from being wiped.
    if (id === 1) throw new Error("The Admin profile can't be deleted.");
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
    isAdmin,
    init,
    loadProfiles,
    switchTo,
    backToPicker,
    skipAutoBigPictureOnce,
    consumeSkipAutoBigPictureOnce,
    createProfile,
    renameProfile,
    deleteProfile,
    setPin,
    clearPin,
    verifyPin,
  };
});
