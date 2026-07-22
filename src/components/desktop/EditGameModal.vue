<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useLibraryStore } from "../../stores/library";
import { useAppSettingsStore } from "../../stores/appSettings";
import type { GameEditFields } from "../../db";

interface LocaleProfile {
  name: string;
  guid: string;
}

const library = useLibraryStore();
const appSettings = useAppSettingsStore();
const lrProfiles = ref<LocaleProfile[]>([]);
const leProfiles = ref<LocaleProfile[]>([]);

watch(
  () => appSettings.localeRemulatorPath,
  async (path) => {
    if (!path) {
      lrProfiles.value = [];
      return;
    }
    try {
      lrProfiles.value = await invoke<LocaleProfile[]>("list_locale_remulator_profiles", {
        lrprocPath: path,
      });
    } catch {
      lrProfiles.value = [];
    }
  },
  { immediate: true },
);

watch(
  () => appSettings.localeEmulatorPath,
  async (path) => {
    if (!path) {
      leProfiles.value = [];
      return;
    }
    try {
      leProfiles.value = await invoke<LocaleProfile[]>("list_locale_emulator_profiles", {
        leprocPath: path,
      });
    } catch {
      leProfiles.value = [];
    }
  },
  { immediate: true },
);

const form = ref<GameEditFields>({
  title: "",
  executable_path: "",
  platform: "",
  cover_art_url: "",
  background_art_url: "",
  description: "",
  release_date: "",
  skip_dedup: 0,
  locale_profile_guid: "",
  locale_wrapper: null,
});
const error = ref("");
const newTag = ref("");

/** Combines locale_wrapper + locale_profile_guid into one <select> value ("lr:<guid>" /
 *  "le:<guid>" / ""), since the two wrappers' GUIDs aren't namespaced against each other. */
const wrapperSelection = computed({
  get: () =>
    form.value.locale_wrapper && form.value.locale_profile_guid
      ? `${form.value.locale_wrapper}:${form.value.locale_profile_guid}`
      : "",
  set: (value: string) => {
    if (!value) {
      form.value.locale_wrapper = null;
      form.value.locale_profile_guid = "";
      return;
    }
    const [wrapper, guid] = value.split(":");
    form.value.locale_wrapper = wrapper as "lr" | "le";
    form.value.locale_profile_guid = guid;
  },
});

const tags = computed(() =>
  library.editingGame ? library.gameTags[library.editingGame.id] ?? [] : [],
);

async function onAddTag() {
  const name = newTag.value.trim();
  if (!name || !library.editingGame) return;
  await library.addTag(library.editingGame, name);
  newTag.value = "";
}

const fetchingBackground = computed(
  () => library.editingGame !== null && library.fetchingBackgroundFor === library.editingGame.id,
);

async function onFetchBackgroundArt() {
  if (!library.editingGame) return;
  await library.fetchBackgroundArt(library.editingGame);
  const updated = library.games.find((g) => g.id === library.editingGame?.id);
  if (updated) form.value.background_art_url = updated.background_art_url ?? "";
}

watch(
  () => library.editingGame,
  (game) => {
    if (!game) return;
    error.value = "";
    form.value = {
      title: game.title,
      executable_path: game.executable_path,
      platform: game.platform ?? "",
      cover_art_url: game.cover_art_url ?? "",
      background_art_url: game.background_art_url ?? "",
      description: game.description ?? "",
      release_date: game.release_date ?? "",
      skip_dedup: game.skip_dedup,
      locale_profile_guid: game.locale_profile_guid ?? "",
      locale_wrapper: game.locale_wrapper,
    };
  },
  { immediate: true },
);

async function onSave() {
  if (!form.value.title.trim() || !form.value.executable_path.trim()) {
    error.value = "Title and executable path are required.";
    return;
  }
  await library.saveEdit({
    title: form.value.title.trim(),
    executable_path: form.value.executable_path.trim(),
    platform: form.value.platform?.trim() || null,
    cover_art_url: form.value.cover_art_url?.trim() || null,
    background_art_url: form.value.background_art_url?.trim() || null,
    description: form.value.description?.trim() || null,
    release_date: form.value.release_date?.trim() || null,
    skip_dedup: form.value.skip_dedup,
    locale_profile_guid: form.value.locale_profile_guid?.trim() || null,
    locale_wrapper: form.value.locale_wrapper,
  });
}
</script>

<template>
  <div v-if="library.editingGame" class="modal-backdrop" @click.self="library.cancelEdit">
    <form class="modal" @submit.prevent="onSave">
      <h2>Edit {{ library.editingGame.title }}</h2>
      <label>
        Title
        <input v-model="form.title" />
      </label>
      <label>
        Executable path
        <input v-model="form.executable_path" />
      </label>
      <label>
        Platform
        <input v-model="form.platform" />
      </label>
      <label>
        Cover art URL
        <input v-model="form.cover_art_url" />
      </label>
      <label>
        Background art URL
        <div class="input-with-button">
          <input v-model="form.background_art_url" />
          <button type="button" :disabled="fetchingBackground" @click="onFetchBackgroundArt">
            {{ fetchingBackground ? "..." : "Fetch" }}
          </button>
        </div>
      </label>
      <label>
        Release date
        <input v-model="form.release_date" placeholder="YYYY-MM-DD" />
      </label>
      <label>
        Description
        <textarea v-model="form.description" rows="4"></textarea>
      </label>
      <label class="checkbox-label">
        <input
          type="checkbox"
          :checked="form.skip_dedup === 1"
          @change="form.skip_dedup = ($event.target as HTMLInputElement).checked ? 1 : 0"
        />
        Keep separate from plugin scans (don't merge/dedup this entry)
      </label>
      <label>
        Compatibility wrapper profile
        <select v-model="wrapperSelection">
          <option value="">None</option>
          <optgroup label="Locale Remulator" v-if="lrProfiles.length">
            <option v-for="profile in lrProfiles" :key="profile.guid" :value="`lr:${profile.guid}`">
              {{ profile.name }}
            </option>
          </optgroup>
          <optgroup label="Locale Emulator" v-if="leProfiles.length">
            <option v-for="profile in leProfiles" :key="profile.guid" :value="`le:${profile.guid}`">
              {{ profile.name }}
            </option>
          </optgroup>
        </select>
        <span v-if="!lrProfiles.length && !leProfiles.length" class="hint">
          No profiles found - configure a wrapper path in Settings and create a profile via
          its editor first.
        </span>
      </label>
      <div class="tags-section">
        <span>Tags</span>
        <div class="tags" v-if="tags.length">
          <span class="tag" v-for="tag in tags" :key="tag">
            {{ tag }}
            <button class="tag-remove" @click="library.removeTag(library.editingGame!, tag)">&times;</button>
          </span>
        </div>
        <form class="add-tag-form" @submit.prevent="onAddTag">
          <input v-model="newTag" placeholder="Add tag" />
          <button type="submit">+</button>
        </form>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="modal-actions">
        <button type="button" @click="library.cancelEdit">Cancel</button>
        <button type="submit">Save</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.modal {
  background: var(--color-mantle);
  color: var(--color-text);
  border-radius: 8px;
  padding: 1.5rem;
  width: 90%;
  max-width: 420px;
  max-height: 85vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.modal label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  text-align: left;
}

.modal input,
.modal textarea {
  font-family: inherit;
}

.input-with-button {
  display: flex;
  gap: 0.4rem;
}

.input-with-button input {
  flex: 1;
}

.input-with-button button {
  font-size: 0.8rem;
}

.checkbox-label {
  flex-direction: row !important;
  align-items: center;
  gap: 0.5rem !important;
}

.tags-section {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  text-align: left;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.tag {
  font-size: 0.7rem;
  background: var(--color-surface0);
  border-radius: 3px;
  padding: 0.1rem 0.4rem;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.tag-remove {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.8rem;
  line-height: 1;
  padding: 0;
  color: inherit;
}

.add-tag-form {
  display: flex;
  gap: 0.25rem;
}

.add-tag-form input {
  flex: 1;
  font-size: 0.85rem;
}

.error {
  color: var(--color-danger);
}

.hint {
  font-size: 0.75rem;
  opacity: 0.8;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
