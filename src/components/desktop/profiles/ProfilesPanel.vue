<script setup lang="ts">
import { nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  IconDeviceGamepad2,
  IconDownload,
  IconEyeOff,
  IconLock,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-vue";

import { useProfilesStore } from "@/stores/profiles";
import { useToastStore } from "@/stores/toasts";
import { useLibraryStore } from "@/stores/library";
import { games as gameRepo, tags as tagRepo } from "@/db";
import type { Game } from "@/db";
import ProfileCreateForm from "./ProfileCreateForm.vue";

const { t } = useI18n();
const profiles = useProfilesStore();
const toasts = useToastStore();
const library = useLibraryStore();

const creating = ref(false);
const createFormRef = ref<InstanceType<typeof ProfileCreateForm> | null>(null);
const editingId = ref<number | null>(null);
const editingValue = ref("");

// Same single-field, two-stage entry as ProfileCreateForm.vue's PIN field (and
// ProfileSwitcher.vue's unlock form) - the confirmation re-uses this one field, blanked and
// re-labeled, rather than showing a second field alongside it.
const pinEditingId = ref<number | null>(null);
const pinInput = ref("");
const pendingPin = ref("");
const confirmingPin = ref(false);
const pinError = ref("");
const pinInputEl = ref<HTMLInputElement | null>(null);

// Milestone 30 step 3 - kids mode. Only Admin (profile 1) can open this, and only for another
// (non-admin) profile - see ProfilesPanel's template guard below. Loads that target profile's
// own tags (not Admin's) plus its current hide-list, and writes the whole set back on every
// toggle rather than one-at-a-time hide/unhide calls, matching setHiddenTagIds's shape.
const tagEditingId = ref<number | null>(null);
const profileTags = ref<{ id: number; name: string }[]>([]);
const hiddenTagIds = ref<Set<number>>(new Set());

async function startTagEdit(id: number) {
  tagEditingId.value = id;
  [profileTags.value, hiddenTagIds.value] = await Promise.all([
    tagRepo.listWithIds(id),
    tagRepo.getHiddenTagIds(id).then((ids) => new Set(ids)),
  ]);
}

function cancelTagEdit() {
  tagEditingId.value = null;
  profileTags.value = [];
  hiddenTagIds.value = new Set();
}

async function toggleHiddenTag(tagId: number) {
  if (tagEditingId.value === null) return;
  const next = new Set(hiddenTagIds.value);
  if (next.has(tagId)) next.delete(tagId);
  else next.add(tagId);
  hiddenTagIds.value = next;
  await tagRepo.setHiddenTagIds(tagEditingId.value, [...next]);
}

// Milestone 30 step 3 follow-up - Admin's on-demand cross-profile library view, so Admin can
// see what a non-admin profile has added even if it's currently hidden from that profile's own
// view. Diffs the unfiltered list against the profile's own (hidden-tag-filtered) list rather
// than fetching per-game tags, to flag which games are currently hidden.
const libraryViewId = ref<number | null>(null);
const libraryViewGames = ref<(Game & { hidden: boolean })[]>([]);

async function startLibraryView(id: number) {
  libraryViewId.value = id;
  const [all, visible] = await Promise.all([gameRepo.listAllForProfile(id), gameRepo.list(id)]);
  const visibleIds = new Set(visible.map((g) => g.id));
  libraryViewGames.value = all.map((g) => ({ ...g, hidden: !visibleIds.has(g.id) }));
}

function cancelLibraryView() {
  libraryViewId.value = null;
  libraryViewGames.value = [];
}

/** Copies (not moves) into Admin's own library - Admin is always the active profile here,
 *  since only Admin can open this panel at all, so refreshing `library` reflects it right away
 *  without a full reload (unlike ProfilesPanel's own profile-switch action). */
async function migrateToAdmin(gameId: number, title: string) {
  await gameRepo.copyToProfile(gameId, 1);
  await library.refresh();
  toasts.push(t("profiles.migratedGame", { title }), "success");
}

async function onCreateSubmit(name: string, pin: string) {
  try {
    const id = await profiles.createProfile(name);
    if (pin) await profiles.setPin(id, pin);
    createFormRef.value?.reset();
    creating.value = false;
  } catch (e) {
    toasts.push(String(e), "error");
  }
}

function startEdit(id: number, name: string) {
  editingId.value = id;
  editingValue.value = name;
}

function cancelEdit() {
  editingId.value = null;
  editingValue.value = "";
}

async function confirmEdit() {
  const trimmed = editingValue.value.trim();
  if (trimmed && editingId.value !== null) await profiles.renameProfile(editingId.value, trimmed);
  cancelEdit();
}

async function onDelete(id: number) {
  await profiles.deleteProfile(id);
}

async function startPinEdit(id: number) {
  pinEditingId.value = id;
  pinInput.value = "";
  pendingPin.value = "";
  confirmingPin.value = false;
  pinError.value = "";
  await nextTick();
  pinInputEl.value?.focus();
}

function cancelPinEdit() {
  pinEditingId.value = null;
  pinInput.value = "";
  pendingPin.value = "";
  confirmingPin.value = false;
  pinError.value = "";
}

async function onPinSubmit() {
  if (pinEditingId.value === null) return;

  if (!confirmingPin.value) {
    // Stage one done (even if left blank - an empty PIN confirmed empty again means "unset
    // it", not "cancel", see below) - stash what was typed, blank the (same) field, and ask
    // for it again instead of showing a second field alongside the first.
    pendingPin.value = pinInput.value;
    pinInput.value = "";
    confirmingPin.value = true;
    pinError.value = "";
    return;
  }

  if (pinInput.value !== pendingPin.value) {
    // Mismatch - back to a clean step-one field, not a half-filled step-two one.
    confirmingPin.value = false;
    pendingPin.value = "";
    pinInput.value = "";
    pinError.value = t("profiles.pinMismatch");
    return;
  }

  try {
    // Both entries blank and matching means "remove the PIN", the only way to do that now
    // that there's no separate remove button.
    if (pendingPin.value) {
      await profiles.setPin(pinEditingId.value, pendingPin.value);
    } else {
      await profiles.clearPin(pinEditingId.value);
    }
    cancelPinEdit();
  } catch (e) {
    pinError.value = String(e);
  }
}
</script>

<template>
  <div class="profiles-section">
    <div class="section-title-row">
      <h3>{{ t("profiles.title") }}</h3>
      <button
        v-if="!creating"
        type="button"
        class="icon-button"
        :title="t('profiles.addProfile')"
        @click="creating = true"
      >
        <IconPlus :size="15" :stroke-width="1.75" />
      </button>
    </div>
    <small>{{ t("profiles.description") }}</small>

    <ul class="item-list">
      <li v-for="profile in profiles.profiles" :key="profile.id" class="item-row list-row-shell">
        <template v-if="editingId === profile.id">
          <div class="profile-row-content">
            <input
              v-model="editingValue"
              class="edit-input"
              @keyup.enter="confirmEdit"
              @keyup.esc="cancelEdit"
            />
            <small class="form-hint">{{ t("profiles.enterEscHint") }}</small>
          </div>
        </template>
        <template v-else>
          <div class="profile-row-content">
            <div class="row-top">
              <div class="name-row">
                <span class="item-name">{{ profile.name }}</span>
                <span v-if="profile.id === profiles.activeProfileId" class="item-count">
                  {{ t("profiles.active") }}
                </span>
              </div>
              <form
                v-if="pinEditingId === profile.id"
                class="pin-inline-row"
                @submit.prevent="onPinSubmit"
              >
                <input
                  :ref="(el) => (pinInputEl = el as HTMLInputElement | null)"
                  v-model="pinInput"
                  type="password"
                  pattern="[a-zA-Z0-9]*"
                  :title="t('profiles.pinPatternHint')"
                  :placeholder="confirmingPin ? t('profiles.confirmPin') : t('profiles.newPin')"
                  @keyup.esc="cancelPinEdit"
                />
              </form>
              <div v-if="pinEditingId !== profile.id" class="row-controls">
                <button
                  v-if="profile.id !== 1"
                  class="icon-button"
                  :title="t('profiles.rename')"
                  @click="startEdit(profile.id, profile.name)"
                >
                  <IconPencil :size="15" :stroke-width="1.75" />
                </button>
                <button
                  class="icon-button"
                  :title="profile.pin_hash ? t('profiles.changePin') : t('profiles.setPin')"
                  @click="startPinEdit(profile.id)"
                >
                  <IconLock :size="15" :stroke-width="1.75" />
                </button>
                <button
                  v-if="profile.id !== 1 && profiles.isAdmin"
                  class="icon-button"
                  :title="t('profiles.hiddenTags')"
                  @click="tagEditingId === profile.id ? cancelTagEdit() : startTagEdit(profile.id)"
                >
                  <IconEyeOff :size="15" :stroke-width="1.75" />
                </button>
                <button
                  v-if="profile.id !== 1 && profiles.isAdmin"
                  class="icon-button"
                  :title="t('profiles.viewLibrary')"
                  @click="
                    libraryViewId === profile.id ? cancelLibraryView() : startLibraryView(profile.id)
                  "
                >
                  <IconDeviceGamepad2 :size="15" :stroke-width="1.75" />
                </button>
                <button
                  v-if="profile.id !== 1 && profiles.profiles.length > 1"
                  class="icon-button"
                  :title="t('profiles.delete')"
                  @click="onDelete(profile.id)"
                >
                  <IconTrash :size="15" :stroke-width="1.75" />
                </button>
              </div>
            </div>
            <div v-if="pinEditingId === profile.id" class="pin-inline-notice">
              <span v-if="pinError" class="error-text">{{ pinError }}</span>
              <small class="form-hint">{{ t("profiles.enterEscHint") }}</small>
            </div>
            <div v-if="tagEditingId === profile.id" class="tag-hide-panel">
              <small class="form-hint">{{ t("profiles.hiddenTagsHint", { name: profile.name }) }}</small>
              <div v-if="profileTags.length === 0" class="tag-hide-empty">
                {{ t("profiles.noTagsToHide") }}
              </div>
              <label v-for="tag in profileTags" :key="tag.id" class="tag-hide-item">
                <input
                  type="checkbox"
                  :checked="hiddenTagIds.has(tag.id)"
                  @change="toggleHiddenTag(tag.id)"
                />
                <span>{{ tag.name }}</span>
              </label>
            </div>
            <div v-if="libraryViewId === profile.id" class="library-view-panel">
              <small class="form-hint">{{ t("profiles.viewLibraryHint", { name: profile.name }) }}</small>
              <div v-if="libraryViewGames.length === 0" class="tag-hide-empty">
                {{ t("profiles.noGamesAdded") }}
              </div>
              <div v-for="g in libraryViewGames" :key="g.id" class="library-view-item">
                <span class="library-view-title">{{ g.title }}</span>
                <span v-if="g.hidden" class="hidden-badge">{{ t("profiles.hiddenBadge") }}</span>
                <button
                  class="icon-button"
                  :title="t('profiles.migrateToAdmin')"
                  @click="migrateToAdmin(g.id, g.title)"
                >
                  <IconDownload :size="14" :stroke-width="1.75" />
                </button>
              </div>
            </div>
          </div>
        </template>
      </li>
      <li v-if="creating" class="item-row list-row-shell">
        <ProfileCreateForm
          ref="createFormRef"
          layout="horizontal"
          @submit="onCreateSubmit"
          @keyup.esc="creating = false"
        />
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* Reuses AppSettings.vue's .translation-section/PluginSettings.vue's list-row/item-* tokens -
   see those for the shared shell this panel intentionally doesn't redefine. */
.profiles-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

/* Matches AppSettings.vue's other section headings (Quick Launch, Translation) - that scoped
   rule lives in AppSettings.vue itself and can't reach this component's own h3 (only a child
   component's root element inherits a parent's scoped styles), so it's duplicated here. */
.section-title-row h3 {
  font-size: 0.95rem;
  margin: 0;
}

/* Takes over .item-row's usual flex:1 slot, so the inline PIN form below can span the row's
   full width on its own line instead of being squeezed beside the name/buttons. */
.profile-row-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
}

/* Name, the inline PIN field (when active), and the button row all stay aligned on one
   horizontal line - name and PIN field share the available space equally (flex: 1 1 0 each),
   buttons stay a fixed-size trailing group. */
.row-top {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
}

.name-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: 1 1 0;
  min-width: 0;
}

.pin-inline-row {
  flex: 1 1 0;
  min-width: 0;
}

.pin-inline-row input {
  width: 100%;
}

.pin-inline-notice {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.tag-hide-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
  border-radius: var(--radius-2);
  background: var(--surface-2, rgba(0, 0, 0, 0.05));
}

.tag-hide-empty {
  font-size: 0.85rem;
  opacity: 0.7;
}

.tag-hide-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.9rem;
}

/* Reuses .tag-hide-panel's shell tokens rather than redefining them, since it's the same
   inline-panel-under-a-row shape - just a different list content. */
.library-view-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
  border-radius: var(--radius-2);
  background: var(--surface-2, rgba(0, 0, 0, 0.05));
  max-height: 240px;
  overflow-y: auto;
}

.library-view-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.9rem;
}

.library-view-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hidden-badge {
  font-size: 0.75rem;
  opacity: 0.7;
  white-space: nowrap;
}
</style>
