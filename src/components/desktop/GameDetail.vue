<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconArrowLeft, IconInfoCircle, IconPlayerPlay } from "@tabler/icons-vue";
import { useLibraryStore } from "../../stores/library";
import { useTagsStore } from "../../stores/tags";
import { useCollectionsStore } from "../../stores/collections";
import { useWrapperPluginStore, type WrapperProfile } from "../../stores/wrapperPlugins";
import { useImageBrightness } from "../../composables/useImageBrightness";
import type { Game, GameEditFields } from "../../db";

const library = useLibraryStore();
const tags = useTagsStore();
const collections = useCollectionsStore();
const wrapperPlugins = useWrapperPluginStore();

// Guaranteed non-null while this component is rendered - App.vue only mounts it when
// library.viewingGame is set.
const game = computed<Game>(() => library.viewingGame!);

const editing = ref(false);
const error = ref("");
const newTag = ref("");
const newCollection = ref("");

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

function resetForm() {
  form.value = {
    title: game.value.title,
    executable_path: game.value.executable_path,
    platform: game.value.platform ?? "",
    cover_art_url: game.value.cover_art_url ?? "",
    background_art_url: game.value.background_art_url ?? "",
    description: game.value.description ?? "",
    release_date: game.value.release_date ?? "",
    skip_dedup: game.value.skip_dedup,
    locale_profile_guid: game.value.locale_profile_guid ?? "",
    locale_wrapper: game.value.locale_wrapper,
  };
}

// Re-syncs the form whenever the underlying game data changes (e.g. after a save, or
// navigating straight from one game's detail to another without closing the page first).
watch(game, resetForm, { immediate: true });

const profilesByPlugin = computed(() => {
  const groups = new Map<string, WrapperProfile[]>();
  for (const profile of wrapperPlugins.profiles) {
    const list = groups.get(profile.pluginId) ?? [];
    list.push(profile);
    groups.set(profile.pluginId, list);
  }
  return groups;
});

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

// The cover preview (left column, both view and edit mode) tracks the live form value while
// editing - typing a new Cover art URL updates the preview immediately, rather than only
// after saving.
const displayCoverUrl = computed(() => (editing.value ? form.value.cover_art_url : game.value.cover_art_url));

const backgroundArtUrl = computed(() => game.value.background_art_url);
const backdropIsDark = useImageBrightness(backgroundArtUrl);

const gameTags = computed(() => tags.gameTags[game.value.id] ?? []);
const gameCollections = computed(() => collections.gameCollections[game.value.id] ?? []);
const playtimeMinutes = computed(() => Math.round(game.value.total_playtime / 60));
const fetchingMetadata = computed(() => library.fetchingMetadataFor === game.value.id);
const fetchingBackground = computed(() => library.fetchingBackgroundFor === game.value.id);

async function onAddTag() {
  const name = newTag.value.trim();
  if (!name) return;
  await tags.addToGame(game.value, [name]);
  newTag.value = "";
}

async function onAddCollection() {
  const name = newCollection.value.trim();
  if (!name) return;
  await collections.addToGame(game.value, [name]);
  newCollection.value = "";
}

async function onFetchBackgroundArt() {
  await library.fetchBackgroundArt(game.value);
  form.value.background_art_url = game.value.background_art_url ?? "";
}

function startEdit() {
  resetForm();
  error.value = "";
  editing.value = true;
}

function cancelEdit() {
  resetForm();
  editing.value = false;
}

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
  editing.value = false;
}

async function onDelete() {
  const id = game.value.id;
  library.closeDetail();
  await library.deleteGame(id);
}
</script>

<template>
  <div class="game-detail-page">
    <div class="hero">
      <div
        v-if="backgroundArtUrl"
        class="backdrop"
        :style="{ backgroundImage: `url(${backgroundArtUrl})` }"
      />
    </div>

    <div class="game-detail" :class="{ 'dark-backdrop': backdropIsDark }">
      <div class="view">
        <div class="sticky-side">
          <button class="back-button" @click="library.closeDetail()">
            <IconArrowLeft :size="16" :stroke-width="1.75" />
            Back to Library
          </button>

          <div class="cover-wrap">
            <img v-if="displayCoverUrl" class="cover" :src="displayCoverUrl" :alt="game.title" />
            <div v-else class="cover-placeholder">{{ game.title.charAt(0).toUpperCase() }}</div>
          </div>

          <template v-if="!editing">
            <div class="tags" v-if="gameTags.length || gameCollections.length">
              <span class="tag-pill" v-for="tag in gameTags" :key="`t-${tag}`">{{ tag }}</span>
              <span class="tag-pill" v-for="name in gameCollections" :key="`c-${name}`">{{ name }}</span>
            </div>
          </template>
          <template v-else>
            <div class="tags-section">
              <span>Tags</span>
              <div class="tags" v-if="gameTags.length">
                <span class="tag-pill tag" v-for="tag in gameTags" :key="tag">
                  {{ tag }}
                  <button class="tag-remove" @click="tags.removeFromGame(game, tag)">&times;</button>
                </span>
              </div>
              <form class="add-tag-form" @submit.prevent="onAddTag">
                <input v-model="newTag" placeholder="Add tag" />
                <button type="submit">+</button>
              </form>
            </div>
            <div class="tags-section">
              <span>Collections</span>
              <div class="tags" v-if="gameCollections.length">
                <span class="tag-pill tag" v-for="name in gameCollections" :key="name">
                  {{ name }}
                  <button class="tag-remove" @click="collections.removeFromGame(game, name)">&times;</button>
                </span>
              </div>
              <form class="add-tag-form" @submit.prevent="onAddCollection">
                <input v-model="newCollection" placeholder="Add collection" />
                <button type="submit">+</button>
              </form>
            </div>
          </template>
        </div>

        <div class="info">
          <template v-if="!editing">
            <h1>{{ game.title }}</h1>
            <div class="meta">
              <span v-if="game.platform">{{ game.platform }}</span>
              <span v-if="game.release_date">{{ game.release_date }}</span>
              <span>{{ playtimeMinutes }} min played</span>
            </div>
            <p v-if="game.description" class="description">{{ game.description }}</p>
          </template>

          <form v-else class="edit-form" @submit.prevent="onSave">
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
              <small v-if="wrapperPlugins.profiles.length === 0">
                No profiles found - install and enable a compatibility wrapper plugin in Settings first.
              </small>
            </label>
            <p v-if="error" class="error-text">{{ error }}</p>
          </form>
        </div>
      </div>
    </div>

    <div class="action-bar">
      <template v-if="!editing">
        <button class="play" @click="library.launchGame(game)">
          <IconPlayerPlay :size="16" :stroke-width="1.75" />
          Play
        </button>
        <button @click="startEdit">Edit</button>
        <button class="remove" @click="onDelete">Remove</button>
      </template>
      <template v-else>
        <button type="button" @click="cancelEdit">Cancel</button>
        <button type="button" :disabled="fetchingMetadata" @click="library.fetchMetadata(game)">
          <IconInfoCircle :size="16" :stroke-width="1.75" />
          {{ fetchingMetadata ? "Fetching..." : "Fetch Metadata" }}
        </button>
        <button type="button" @click="onSave">Save</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.game-detail-page {
  /* min-height ensures the sticky action bar has genuine room to stick within a short page -
     without this, a game with little content would leave the bar floating mid-page instead of
     pinned to the visible bottom. App.vue's `.content` cancels its own bottom padding while
     this page is active (`.no-bottom-inset`) - a negative margin here can't reach into a
     different element's own padding, so that has to happen on `.content` itself. */
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

/* Fixed-height wrapper - a uniform backdrop area regardless of how tall the page's actual
   content is (a long description/many tags no longer changes the banner's own size the way a
   percentage-of-page-height would have). */
.hero {
  position: relative;
  height: 320px;
  overflow: hidden;
  flex-shrink: 0;
}

/* Background art, faded out top-to-bottom within `.hero`'s fixed box - fully visible at the
   very top, nearly gone by the bottom, rather than a hard edge or a flat dark scrim over the
   whole image. `mask-image` (not `opacity`) - opacity would fade the entire image uniformly;
   a gradient mask fades transparency spatially, top to bottom. */
.backdrop {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center top;
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.05) 100%);
  -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.05) 100%);
}

/* Flips to light text when useImageBrightness.ts samples the background art as dark - cascades
   to every descendant that doesn't set its own color (h1/meta/description), same as the
   default (unset) case already inheriting from --color-text. */
.game-detail.dark-backdrop {
  color: #fff;
}

.game-detail {
  position: relative;
  z-index: 1;
  flex: 1;
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
  padding: 0 var(--space-6);
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: none;
  border: none;
  padding: 0;
  margin-bottom: var(--space-4);
  font-size: 0.85rem;
  cursor: pointer;
  color: inherit;
}

.view {
  display: flex;
  align-items: flex-start;
  gap: var(--space-5);
}

/* Sticky alongside `.info` (below) - stays pinned to the top of the scroll area (back button,
   cover art, tags/collections) while the title/description column scrolls past it, instead of
   scrolling away together the way it did before this pass. */
.sticky-side {
  position: sticky;
  top: 0;
  padding-top: var(--space-5);
  flex-shrink: 0;
  width: 220px;
}

.cover-wrap {
  margin-bottom: var(--space-3);
}

.cover,
.cover-placeholder {
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-md);
}

.cover {
  object-fit: cover;
  display: block;
}

.cover-placeholder {
  background: var(--cover-placeholder-background, var(--color-surface0));
  color: var(--cover-placeholder-color, var(--color-text));
  text-shadow: var(--cover-placeholder-text-shadow, none);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
}

.info {
  flex: 1;
  min-width: 0;
  /* Matches `.sticky-side`'s own top padding so both columns start at the same vertical
     position - neither column's padding lives on a shared ancestor, since `.sticky-side`
     specifically needs its own (an ancestor's padding wouldn't constrain how far it can stick
     upward, but keeping the pattern consistent here anyway rather than splitting it oddly
     between one column's own rule and a shared parent). */
  padding-top: var(--space-5);
}

.info h1 {
  margin: 0 0 var(--space-2);
}

.meta {
  display: flex;
  gap: var(--space-3);
  font-size: 0.85rem;
  opacity: 0.7;
  margin-bottom: var(--space-3);
}

.description {
  margin-bottom: var(--space-3);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: var(--space-4);
}

/* .tag-pill (shared, styles.css) supplies this rule's entire look. */

/* .action-bar (below) is the only actions container now - view mode's Play/Fetch Metadata/
   Edit/Remove buttons live there instead of inline here. */

.edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.edit-form label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  text-align: left;
}

.edit-form input,
.edit-form textarea {
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
  font-size: 0.75rem;
}

.checkbox-label {
  flex-direction: row !important;
  align-items: center;
  gap: var(--space-2) !important;
}

.tags-section {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  text-align: left;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.tag-remove {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.75rem;
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

/* Sticky footer action bar - holds every top-level page action (view mode's Play/Fetch
   Metadata/Edit/Remove, edit mode's Cancel/Save), right-aligned, pinned to the bottom of the
   scroll container so it stays reachable without following the page's own left/right margins.
   `position: sticky` (not `fixed`) - stays anchored to the bottom of `.content` (App.vue's
   scroll container) while `.game-detail-page` is in view, rather than floating over every
   other view too. */
.action-bar {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--color-base);
}

.action-bar button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

/* .error-text (shared, styles.css) supplies this rule's entire look. */
</style>
