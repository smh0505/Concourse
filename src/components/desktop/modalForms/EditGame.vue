<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useLibraryStore } from "../../../stores/library";
import { useWrapperPluginStore, type WrapperProfile } from "../../../stores/wrapperPlugins";
import BaseModal from "../BaseModal.vue";
import type { GameEditFields } from "../../../db";

const library = useLibraryStore();
const wrapperPlugins = useWrapperPluginStore();

const profilesByPlugin = computed(() => {
  const groups = new Map<string, WrapperProfile[]>();
  for (const profile of wrapperPlugins.profiles) {
    const list = groups.get(profile.pluginId) ?? [];
    list.push(profile);
    groups.set(profile.pluginId, list);
  }
  return groups;
});

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

/** Combines locale_wrapper + locale_profile_guid into one <select> value
 *  ("<pluginId>:<guid>" / ""), since GUIDs aren't namespaced against each other across
 *  wrapper plugins. GUIDs themselves aren't guaranteed unique enough alone to split on ":"
 *  safely, so this splits on the first ":" only - plugin ids never contain one. */
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
    const separatorIndex = value.indexOf(":");
    form.value.locale_wrapper = value.slice(0, separatorIndex);
    form.value.locale_profile_guid = value.slice(separatorIndex + 1);
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
  <BaseModal
    :open="library.editingGame !== null"
    :title="library.editingGame ? `Edit ${library.editingGame.title}` : undefined"
    max-width="420px"
    @close="library.cancelEdit"
  >
    <template v-if="library.editingGame" #body>
      <form class="edit-game-form" @submit.prevent="onSave">
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
            <optgroup
              v-for="[pluginId, profiles] in profilesByPlugin"
              :key="pluginId"
              :label="profiles[0].pluginName"
            >
              <option v-for="profile in profiles" :key="profile.guid" :value="`${pluginId}:${profile.guid}`">
                {{ profile.name }}
              </option>
            </optgroup>
          </select>
          <span v-if="wrapperPlugins.profiles.length === 0" class="hint">
            No profiles found - install and enable a compatibility wrapper plugin in Settings first.
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
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </template>
    <template v-if="library.editingGame" #footer>
      <button type="button" @click="library.cancelEdit">Cancel</button>
      <button type="button" @click="onSave">Save</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.edit-game-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.edit-game-form label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  text-align: left;
}

.edit-game-form input,
.edit-game-form textarea {
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
</style>
