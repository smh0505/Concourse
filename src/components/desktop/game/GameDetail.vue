<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  IconArrowLeft,
  IconDeviceGamepad2,
  IconInfoCircle,
  IconLanguage,
  IconPlayerPlay,
} from "@tabler/icons-vue";
import { siSteam, siGogdotcom, siEpicgames, siEa, siUbisoft } from "simple-icons";
import { marked } from "marked";
import DOMPurify from "dompurify";

import { useLibraryStore } from "@/stores/library";
import { useTagsStore } from "@/stores/tags";
import { useCollectionsStore } from "@/stores/collections";
import { useWrapperPluginStore, type WrapperProfile } from "@/stores/wrapperPlugins";
import { useAppSettingsStore } from "@/stores/appSettings";
import { useTranslationStore } from "@/stores/translation";
import { useToastStore } from "@/stores/toasts";
import { useImageBrightness } from "@/composables/useImageBrightness";
import { DropdownMenu } from "@/components/desktop/common";
import type { Game, GameEditFields } from "@/db";

const { t } = useI18n();
const library = useLibraryStore();
const tags = useTagsStore();
const collections = useCollectionsStore();
const wrapperPlugins = useWrapperPluginStore();
const appSettings = useAppSettingsStore();
const translation = useTranslationStore();
const toasts = useToastStore();

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
  skip_presence: 0,
  pseudo_fullscreen: 0,
  always_on_top: 0,
  remember_window: 0,
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
    skip_presence: game.value.skip_presence,
    pseudo_fullscreen: game.value.pseudo_fullscreen,
    always_on_top: game.value.always_on_top,
    remember_window: game.value.remember_window,
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
const { isDark: backdropIsDark, isReady: backdropReady } = useImageBrightness(backgroundArtUrl);

// Whether the active theme itself is light or dark, from --color-text's own computed
// luminance (dark text -> light theme) - a dark backdrop needs reversing on a light theme, a
// bright one on a dark theme. Read once; nothing lets the theme change while mounted.
function isLightTheme(): boolean {
  const hex = getComputedStyle(document.documentElement).getPropertyValue("--color-text").trim();
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return true;
  const r = parseInt(match[1].slice(0, 2), 16);
  const g = parseInt(match[1].slice(2, 4), 16);
  const b = parseInt(match[1].slice(4, 6), 16);
  // Same ITU-R BT.601 luminance weighting as the backdrop's own brightness check.
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

const themeIsLight = isLightTheme();
// No backdrop, or brightness not resolved yet, must never trigger a reversal - see
// textPending below for how the resolving window is hidden instead.
const wantsReverse = computed(() => {
  if (!backgroundArtUrl.value || !backdropReady.value) return false;
  return themeIsLight ? backdropIsDark.value : !backdropIsDark.value;
});
// Hides title/meta/description while brightness is unresolved, so they don't flash the
// pre-flip color - scoped to .info, not .game-detail, since the sidebar doesn't depend on this.
const textPending = computed(() => !!backgroundArtUrl.value && !backdropReady.value);

// Known platform ids map to a simple-icons brand glyph; anything else (manually-added games,
// unrecognized strings) falls back to a generic icon. Xbox is deliberately not mapped here -
// no vetted simple-icons glyph exists for it, and Microsoft's own brand guidance gates
// software use behind contacting their brand team (stricter than Steam/GOG/Epic/EA/Ubisoft,
// all of which have an established or explicitly-permitted icon) - falls to the generic
// gamepad icon like any other unrecognized platform, rather than risk an unlicensed mark.
type PlatformIcon = { kind: "brand"; path: string; title: string } | { kind: "generic"; title: string };

// One arm per known platform id (the lowercase literal each source plugin's lib.rs hardcodes),
// like a Rust match - default is the `_ => ...` wildcard.
function iconForPlatform(platform: string | null | undefined): PlatformIcon {
  switch (platform?.trim().toLowerCase()) {
    case "steam":
      return { kind: "brand", path: siSteam.path, title: siSteam.title };
    case "gog":
      return { kind: "brand", path: siGogdotcom.path, title: siGogdotcom.title };
    case "epic":
      return { kind: "brand", path: siEpicgames.path, title: siEpicgames.title };
    case "ea":
      return { kind: "brand", path: siEa.path, title: siEa.title };
    case "ubisoft":
      return { kind: "brand", path: siUbisoft.path, title: siUbisoft.title };
    default:
      return { kind: "generic", title: t("gameDetail.unknownPlatform") };
  }
}

// View mode shows the saved game.platform; edit mode shows the in-progress form.platform.
const displayPlatform = computed(() => (editing.value ? form.value.platform : game.value.platform));
const platformIcon = computed(() => iconForPlatform(displayPlatform.value));
const isEpicIcon = computed(() => displayPlatform.value?.trim().toLowerCase() === "epic");
// Epic's trademark guidelines forbid altering their logo's colors - forced to strict
// black/white (never currentColor's arbitrary theme hue), derived the same way
// --color-text-reverse's own direction is.
const epicIconFill = computed(() => (themeIsLight !== wantsReverse.value ? "#000000" : "#ffffff"));

// Pure view toggles over already-persisted translations - don't call the engine themselves.
// Synced from the game's own show_translated_* columns on every game change (incl. first
// mount), so reopening a game shows whatever was last chosen for it specifically.
const showTranslatedTitle = ref(false);
const showTranslatedDescription = ref(false);
// Split per field so only the field actually being translated shows a skeleton.
const translatingTitle = ref(false);
const translatingContent = ref(false);
const translating = computed(() => translatingTitle.value || translatingContent.value);
const translateMenuOpen = ref(false);
watch(
  game,
  (g) => {
    showTranslatedTitle.value = !!g.show_translated_title;
    showTranslatedDescription.value = !!g.show_translated_description;
  },
  { immediate: true },
);

function persistShowTranslated() {
  return library.setShowTranslated(game.value.id, showTranslatedTitle.value, showTranslatedDescription.value);
}

const canTranslate = computed(
  () =>
    translation.engineDownloaded &&
    !!translation.selectedModelId &&
    translation.isDownloaded(translation.selectedModelId),
);

// Dropdown shows one group at a time; wheel/up-down while open pages between groups (skipping
// "translate" when there's no usable model). menuEl gets focus on open so arrow keys land on it
// without a global window listener.
type TranslateMenuGroup = "translate" | "show" | "remove";
const translateMenuGroups = computed<TranslateMenuGroup[]>(() =>
  canTranslate.value ? ["translate", "show", "remove"] : ["show", "remove"],
);
const translateMenuGroupIndex = ref(0);
const translateMenuGroup = computed(() => translateMenuGroups.value[translateMenuGroupIndex.value]);
const menuEl = ref<InstanceType<typeof DropdownMenu> | null>(null);

function openTranslateMenu() {
  translateMenuOpen.value = true;
  translateMenuGroupIndex.value = 0;
  nextTick(() => menuEl.value?.focusPanel());
}

function nextTranslateMenuGroup() {
  translateMenuGroupIndex.value = Math.min(
    translateMenuGroupIndex.value + 1,
    translateMenuGroups.value.length - 1,
  );
}

function prevTranslateMenuGroup() {
  translateMenuGroupIndex.value = Math.max(translateMenuGroupIndex.value - 1, 0);
}

function onTranslateMenuWheel(e: WheelEvent) {
  e.preventDefault();
  if (e.deltaY > 0) nextTranslateMenuGroup();
  else if (e.deltaY < 0) prevTranslateMenuGroup();
}

function onTranslateMenuKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    nextTranslateMenuGroup();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    prevTranslateMenuGroup();
  }
}

// Valid only for the UI locale the translation was made for - see devlog for the shared-column
// edge case (translating title/content under two different locales).
const hasValidTranslatedTitle = computed(
  () => !!game.value.translated_title && game.value.translated_locale === appSettings.locale,
);
const hasValidTranslatedDescription = computed(
  () => !!game.value.translated_description && game.value.translated_locale === appSettings.locale,
);
// Revoke works on any cached translation, even a stale one - raw presence, not locale validity.
const hasCachedTitle = computed(() => !!game.value.translated_title);
const hasCachedDescription = computed(() => !!game.value.translated_description);

async function onTranslateTitleOnly() {
  translateMenuOpen.value = false;
  translatingTitle.value = true;
  try {
    const translatedTitle = await translation.translate(game.value.title, appSettings.locale);
    await library.saveTranslatedTitle(game.value.id, translatedTitle, appSettings.locale);
    showTranslatedTitle.value = true;
    await persistShowTranslated();
  } catch (e) {
    toasts.push(String(e), "error");
  } finally {
    translatingTitle.value = false;
  }
}

async function onTranslateContentOnly() {
  translateMenuOpen.value = false;
  if (!game.value.description) return;
  translatingContent.value = true;
  try {
    const translatedDescription = await translation.translate(game.value.description, appSettings.locale);
    await library.saveTranslatedDescription(game.value.id, translatedDescription, appSettings.locale);
    showTranslatedDescription.value = true;
    await persistShowTranslated();
  } catch (e) {
    toasts.push(String(e), "error");
  } finally {
    translatingContent.value = false;
  }
}

async function onTranslateTitleAndContent() {
  translateMenuOpen.value = false;
  translatingTitle.value = true;
  try {
    const translatedTitle = await translation.translate(game.value.title, appSettings.locale);
    await library.saveTranslatedTitle(game.value.id, translatedTitle, appSettings.locale);
    showTranslatedTitle.value = true;
    await persistShowTranslated();
  } catch (e) {
    toasts.push(String(e), "error");
    return;
  } finally {
    translatingTitle.value = false;
  }
  if (!game.value.description) return;
  translatingContent.value = true;
  try {
    const translatedDescription = await translation.translate(game.value.description, appSettings.locale);
    await library.saveTranslatedDescription(game.value.id, translatedDescription, appSettings.locale);
    showTranslatedDescription.value = true;
    await persistShowTranslated();
  } catch (e) {
    toasts.push(String(e), "error");
  } finally {
    translatingContent.value = false;
  }
}

async function onToggleTitleView() {
  showTranslatedTitle.value = !showTranslatedTitle.value;
  translateMenuOpen.value = false;
  await persistShowTranslated();
}

async function onToggleContentView() {
  showTranslatedDescription.value = !showTranslatedDescription.value;
  translateMenuOpen.value = false;
  await persistShowTranslated();
}

async function onRevokeTitleOnly() {
  translateMenuOpen.value = false;
  await library.revokeTranslatedTitle(game.value.id);
  showTranslatedTitle.value = false;
  await persistShowTranslated();
}

async function onRevokeContentOnly() {
  translateMenuOpen.value = false;
  await library.revokeTranslatedDescription(game.value.id);
  showTranslatedDescription.value = false;
  await persistShowTranslated();
}

async function onRevokeBoth() {
  translateMenuOpen.value = false;
  await library.revokeTranslation(game.value.id);
  showTranslatedTitle.value = false;
  showTranslatedDescription.value = false;
  await persistShowTranslated();
}

async function onToggleBothView() {
  const next = !(showTranslatedTitle.value && showTranslatedDescription.value);
  showTranslatedTitle.value = next;
  showTranslatedDescription.value = next;
  translateMenuOpen.value = false;
  await persistShowTranslated();
}

function toggleTranslateMenu() {
  if (translateMenuOpen.value) {
    translateMenuOpen.value = false;
  } else {
    openTranslateMenu();
  }
}

const displayTitle = computed(() =>
  showTranslatedTitle.value && hasValidTranslatedTitle.value ? game.value.translated_title! : game.value.title,
);

const descriptionHtml = computed(() => {
  const source =
    showTranslatedDescription.value && hasValidTranslatedDescription.value
      ? game.value.translated_description
      : game.value.description;
  return source ? DOMPurify.sanitize(marked.parse(source, { async: false })) : "";
});

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
    error.value = t("gameDetail.titleAndPathRequired");
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
    skip_presence: form.value.skip_presence,
    pseudo_fullscreen: form.value.pseudo_fullscreen,
    always_on_top: form.value.always_on_top,
    remember_window: form.value.remember_window,
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

    <div class="game-detail">
      <div class="view">
        <div class="sticky-side" :class="{ 'reverse-band': wantsReverse }">
          <button class="back-button" @click="library.closeDetail()">
            <IconArrowLeft :size="16" :stroke-width="1.75" />
            {{ t("gameDetail.backToLibrary") }}
          </button>

          <div class="cover-wrap">
            <div v-if="fetchingMetadata" class="cover cover-skeleton">
              <div class="shimmer" />
            </div>
            <img v-else-if="displayCoverUrl" class="cover" :src="displayCoverUrl" :alt="game.title" />
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
              <span>{{ t("gameDetail.tags") }}</span>
              <div class="tags" v-if="gameTags.length">
                <span class="tag-pill tag" v-for="tag in gameTags" :key="tag">
                  {{ tag }}
                  <button class="tag-remove" @click="tags.removeFromGame(game, tag)">&times;</button>
                </span>
              </div>
              <form class="add-tag-form" @submit.prevent="onAddTag">
                <input v-model="newTag" :placeholder="t('gameDetail.addTag')" />
                <button type="submit">+</button>
              </form>
            </div>
            <div class="tags-section">
              <span>{{ t("gameDetail.collections") }}</span>
              <div class="tags" v-if="gameCollections.length">
                <span class="tag-pill tag" v-for="name in gameCollections" :key="name">
                  {{ name }}
                  <button class="tag-remove" @click="collections.removeFromGame(game, name)">&times;</button>
                </span>
              </div>
              <form class="add-tag-form" @submit.prevent="onAddCollection">
                <input v-model="newCollection" :placeholder="t('gameDetail.addCollection')" />
                <button type="submit">+</button>
              </form>
            </div>
          </template>
        </div>

        <div class="info" :class="{ 'reverse-band': wantsReverse }">
          <template v-if="textPending">
            <div class="skeleton-bar skeleton-title"><div class="shimmer" /></div>
            <div class="skeleton-bar skeleton-meta"><div class="shimmer" /></div>
            <div class="skeleton-bar skeleton-desc"><div class="shimmer" /></div>
            <div class="skeleton-bar skeleton-desc"><div class="shimmer" /></div>
            <div class="skeleton-bar skeleton-desc short"><div class="shimmer" /></div>
          </template>
          <template v-else-if="!editing">
            <div v-if="translatingTitle" class="skeleton-bar skeleton-title"><div class="shimmer" /></div>
            <h1 v-else>{{ displayTitle }}</h1>
            <div class="meta">
              <span
                class="platform-tag"
                :class="{ 'text-reverse': wantsReverse }"
                :title="game.platform || t('gameDetail.unknownPlatform')"
              >
                <svg
                  v-if="platformIcon.kind === 'brand'"
                  viewBox="0 0 24 24"
                  class="platform-icon"
                  role="img"
                  :style="isEpicIcon ? { fill: epicIconFill } : undefined"
                >
                  <title>{{ platformIcon.title }}</title>
                  <path :d="platformIcon.path" />
                </svg>
                <IconDeviceGamepad2 v-else class="platform-icon" :title="platformIcon.title" :stroke-width="1.75" />
              </span>
              <span v-if="game.release_date">{{ game.release_date }}</span>
              <span>{{ t("gameDetail.minPlayed", { minutes: playtimeMinutes }) }}</span>
            </div>
            <DropdownMenu
              ref="menuEl"
              v-model:open="translateMenuOpen"
              wrap-class="translate-menu-wrap"
              panel-class="translate-menu"
              @wheel="onTranslateMenuWheel"
              @keydown="onTranslateMenuKeydown"
            >
              <template #trigger>
                <button
                  type="button"
                  class="compact-button translate-button"
                  :disabled="translating"
                  @click="toggleTranslateMenu"
                >
                  <IconLanguage :size="14" :stroke-width="1.75" />
                  {{ translating ? t("gameDetail.translating") : t("gameDetail.translate") }}
                </button>
              </template>
              <Transition name="menu-group" mode="out-in">
                <div :key="translateMenuGroup" class="translate-menu-group">
                  <template v-if="translateMenuGroup === 'translate'">
                    <button type="button" @click="onTranslateTitleOnly">
                      {{ t("gameDetail.translateTitleOnly") }}
                    </button>
                    <button type="button" :disabled="!game.description" @click="onTranslateContentOnly">
                      {{ t("gameDetail.translateContentOnly") }}
                    </button>
                    <button type="button" @click="onTranslateTitleAndContent">
                      {{ t("gameDetail.translateTitleAndContent") }}
                    </button>
                  </template>
                  <template v-else-if="translateMenuGroup === 'show'">
                    <button type="button" :disabled="!hasValidTranslatedTitle" @click="onToggleTitleView">
                      {{
                        showTranslatedTitle
                          ? t("gameDetail.showOriginalTitle")
                          : t("gameDetail.showTranslatedTitle")
                      }}
                    </button>
                    <button type="button" :disabled="!hasValidTranslatedDescription" @click="onToggleContentView">
                      {{
                        showTranslatedDescription
                          ? t("gameDetail.showOriginalContent")
                          : t("gameDetail.showTranslatedContent")
                      }}
                    </button>
                    <button
                      type="button"
                      :disabled="!hasValidTranslatedTitle && !hasValidTranslatedDescription"
                      @click="onToggleBothView"
                    >
                      {{
                        showTranslatedTitle && showTranslatedDescription
                          ? t("gameDetail.showOriginalBoth")
                          : t("gameDetail.showTranslatedBoth")
                      }}
                    </button>
                  </template>
                  <template v-else>
                    <button type="button" :disabled="!hasCachedTitle" @click="onRevokeTitleOnly">
                      {{ t("gameDetail.revokeTitleOnly") }}
                    </button>
                    <button type="button" :disabled="!hasCachedDescription" @click="onRevokeContentOnly">
                      {{ t("gameDetail.revokeContentOnly") }}
                    </button>
                    <button
                      type="button"
                      :disabled="!hasCachedTitle && !hasCachedDescription"
                      @click="onRevokeBoth"
                    >
                      {{ t("gameDetail.revokeBoth") }}
                    </button>
                  </template>
                </div>
              </Transition>
              <div class="translate-menu-dots">
                <span
                  v-for="(group, i) in translateMenuGroups"
                  :key="group"
                  class="translate-menu-dot"
                  :class="{ active: i === translateMenuGroupIndex }"
                />
              </div>
            </DropdownMenu>
            <div v-if="game.description" class="description-wrap">
              <template v-if="translatingContent">
                <div class="skeleton-bar skeleton-desc"><div class="shimmer" /></div>
                <div class="skeleton-bar skeleton-desc"><div class="shimmer" /></div>
                <div class="skeleton-bar skeleton-desc short"><div class="shimmer" /></div>
              </template>
              <div v-else class="description" v-html="descriptionHtml"></div>
            </div>
          </template>

          <form v-else class="edit-form" @submit.prevent="onSave">
            <input v-model="form.title" :placeholder="t('gameDetail.titleLabel')" class="title-input" />
            <div class="field-row">
              <span
                class="platform-field"
                :class="{ 'text-reverse': wantsReverse }"
                :title="form.platform || t('gameDetail.unknownPlatform')"
              >
                <svg
                  v-if="platformIcon.kind === 'brand'"
                  viewBox="0 0 24 24"
                  class="platform-icon"
                  role="img"
                  :style="isEpicIcon ? { fill: epicIconFill } : undefined"
                >
                  <title>{{ platformIcon.title }}</title>
                  <path :d="platformIcon.path" />
                </svg>
                <IconDeviceGamepad2 v-else class="platform-icon" :title="platformIcon.title" :stroke-width="1.75" />
              </span>
              <input v-model="form.executable_path" :placeholder="t('gameDetail.executablePathLabel')" readonly />
            </div>
            <label>
              {{ t("gameDetail.coverArtUrl") }}
              <input v-model="form.cover_art_url" />
            </label>
            <label>
              {{ t("gameDetail.backgroundArtUrl") }}
              <div class="input-with-button">
                <input v-model="form.background_art_url" />
                <button type="button" :disabled="fetchingBackground" @click="onFetchBackgroundArt">
                  {{ fetchingBackground ? "..." : t("gameDetail.fetch") }}
                </button>
              </div>
            </label>
            <label>
              {{ t("gameDetail.releaseDate") }}
              <input v-model="form.release_date" placeholder="YYYY-MM-DD" readonly />
            </label>
            <label>
              {{ t("gameDetail.descriptionLabel") }}
              <textarea v-model="form.description" rows="4"></textarea>
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="form.skip_dedup === 1"
                @change="form.skip_dedup = ($event.target as HTMLInputElement).checked ? 1 : 0"
              />
              {{ t("gameDetail.skipDedup") }}
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="form.skip_presence === 1"
                @change="form.skip_presence = ($event.target as HTMLInputElement).checked ? 1 : 0"
              />
              {{ t("gameDetail.skipPresence") }}
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="form.pseudo_fullscreen === 1"
                @change="form.pseudo_fullscreen = ($event.target as HTMLInputElement).checked ? 1 : 0"
              />
              {{ t("gameDetail.pseudoFullscreen") }}
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="form.always_on_top === 1"
                @change="form.always_on_top = ($event.target as HTMLInputElement).checked ? 1 : 0"
              />
              {{ t("gameDetail.alwaysOnTop") }}
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="form.remember_window === 1"
                @change="form.remember_window = ($event.target as HTMLInputElement).checked ? 1 : 0"
              />
              {{ t("gameDetail.rememberWindow") }}
            </label>
            <label>
              {{ t("gameDetail.wrapperProfile") }}
              <select v-model="wrapperSelection">
                <option value="">{{ t("gameDetail.wrapperNone") }}</option>
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
                {{ t("gameDetail.noWrapperProfiles") }}
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
          {{ t("gameDetail.play") }}
        </button>
        <button @click="startEdit">{{ t("gameDetail.edit") }}</button>
        <button class="remove" @click="onDelete">{{ t("gameDetail.remove") }}</button>
      </template>
      <template v-else>
        <button type="button" @click="cancelEdit">{{ t("common.cancel") }}</button>
        <button type="button" :disabled="fetchingMetadata" @click="library.fetchMetadata(game)">
          <IconInfoCircle :size="16" :stroke-width="1.75" />
          {{ fetchingMetadata ? t("gameDetail.fetching") : t("gameDetail.fetchMetadata") }}
        </button>
        <button type="button" @click="onSave">{{ t("common.save") }}</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.game-detail-page {
  /* min-height, not a fixed height/overflow:hidden - the page scrolls as a whole; .hero below
     stays pinned via its own position:sticky instead. */
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

/* position:sticky keeps this pinned to the top of the scrollport; negative margin-bottom
   equal to its own height reclaims the reserved flow space so .game-detail overlaps it. */
.hero {
  position: sticky;
  top: 0;
  /* 2/3 of viewport height, not a fixed px - scales with window size. margin-bottom must
     match height's negative to reclaim the space. */
  height: calc(100vh * 2 / 3);
  margin-bottom: calc(-100vh * 2 / 3);
  overflow: hidden;
  z-index: 0;
  pointer-events: none;
}

/* mask-image (not opacity) fades transparency spatially top-to-bottom, rather than dimming
   the whole image uniformly. Solid (fully opaque) through the first half of .hero's own
   height, only fading out across the second half - not a continuous taper from the top. */
.backdrop {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center top;
  mask-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 1) 0%,
    rgba(0, 0, 0, 1) 50%,
    rgba(0, 0, 0, 0.05) 100%
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 1) 0%,
    rgba(0, 0, 0, 1) 50%,
    rgba(0, 0, 0, 0.05) 100%
  );
}

/* Flips to --color-text-reverse only within the top 50vh of the viewport (shorter than
   .hero's 2/3vh - its mask already fades to ~5% opacity by its own bottom edge), not the
   whole page - .hero is sticky, so it only ever covers that top slice regardless of scroll.
   background-attachment:fixed anchors the gradient to the viewport (same anchoring .hero's
   sticky achieves), so each line picks up the reversed color only while passing behind the
   backdrop, then reverts - a live per-scroll decision, not one static page-wide choice.
   background-clip:text paints the gradient per-glyph; color:transparent lets it show through.
   Applied per text-bearing element, not .info, since background-clip:text clips to an
   element's own text and .info has no direct text of its own. */
.reverse-band h1,
.reverse-band .meta,
.reverse-band .description,
.reverse-band .edit-form > label,
.reverse-band .edit-form label small,
.reverse-band .edit-form input.title-input {
  background-image: linear-gradient(
    to bottom,
    var(--color-text-reverse) 0,
    var(--color-text-reverse) 50vh,
    var(--color-text) 50vh,
    var(--color-text) 20000px
  );
  /* Offset by TitleBar.vue's 36px height - .content's scrollport starts there, not the
     window's true top edge. */
  background-position: 0 36px;
  background-attachment: fixed;
  background-repeat: no-repeat;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* Title sits at the very top, always within the reversed band when active. */
.reverse-band .edit-form input.title-input {
  caret-color: var(--color-text-reverse);
}

/* Labels inherit the transparent/gradient color above - reset actual form controls (and the
   checkbox row's inline text) back to normal so only the caption/small text reverses. */
.reverse-band .edit-form label input,
.reverse-band .edit-form label textarea,
.reverse-band .edit-form label select,
.reverse-band .edit-form label.checkbox-label {
  color: var(--color-text);
}

/* Shown instead of title/meta/description while the backdrop's brightness is unresolved
   (textPending) - real content would otherwise briefly flash the pre-flip color before
   wantsReverse settles, or the page would need to hide it with no visual feedback at all.
   Roughly sized/spaced to match the content they stand in for, so there's minimal reflow once
   the real elements replace them. */
.skeleton-bar {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--color-surface0);
}

.skeleton-title {
  height: 2.2rem;
  width: 60%;
  margin-bottom: var(--space-2);
}

.skeleton-meta {
  height: 1rem;
  width: 40%;
  margin-bottom: var(--space-3);
}

.skeleton-desc {
  height: 0.9rem;
  width: 100%;
  margin-bottom: 0.5rem;
}

.skeleton-desc.short {
  width: 65%;
}

.game-detail {
  position: relative;
  z-index: 1;
  flex: 1;
  /* Standard wide-content max-width (Bootstrap container-xl/Tailwind max-w-7xl range) - 720px
     cramped this two-column layout on a maximized window. */
  max-width: 1200px;
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

/* .sticky-side is itself sticky - stays pinned near the top for virtually the whole scroll
   range, so a flat color swap is enough here, unlike .info's scroll-following gradient. */
.sticky-side.reverse-band .back-button {
  color: var(--color-text-reverse);
}

.view {
  display: flex;
  align-items: flex-start;
  gap: var(--space-5);
}

/* Sticky alongside `.info` (below) - stays pinned to the top of the scroll area (back button,
   cover art, tags/collections) while the title/description column scrolls past it, instead of
   scrolling away together. */
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

/* Shown in place of the cover image while a metadata fetch is in flight - cover_art_url is one
   of the fields fetchMetadata() can overwrite, same shimmer look as SkeletonCard.vue/
   SkeletonRow.vue's own cover-art placeholders elsewhere in the app. */
.cover-skeleton {
  position: relative;
  overflow: hidden;
  background: var(--color-surface0);
  border: var(--button-border-width) solid var(--color-surface1);
}

/* .shimmer (shared, styles.css) supplies the shimmer effect itself. */

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
     position. */
  padding-top: var(--space-5);
}

.info h1 {
  margin: 0 0 var(--space-2);
}

/* Matches the view page's <h1> instead of the form's boxed input look. `input.title-input`
   (not just the class) - needed to out-specificity styles.css's global input rule, which was
   otherwise winning the font-size cascade. */
.edit-form input.title-input {
  font-size: 2em;
  font-weight: bold;
  margin: 0 0 var(--space-2);
  padding: 0 0 var(--space-1);
  border: none;
  /* Dashed underline is the one "this is editable" cue left, since it's styled like the
     view page's plain <h1> otherwise. */
  border-bottom: 1px dashed var(--color-surface1);
  background: none;
  /* caret-color inherits from color, which the reverse-band rule sets transparent - set
     explicitly so the text cursor stays visible. */
  caret-color: var(--color-text);
}

.meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: 0.95rem;
  opacity: 0.8;
  margin-bottom: var(--space-3);
}

/* Escapes .meta's reverse-band gradient (color:transparent), which would otherwise make the
   icon's currentColor fill vanish - same flat wantsReverse swap as .platform-field. */
.platform-tag {
  color: var(--color-text);
  display: flex;
  align-items: center;
}

/* Sized well above .meta's own line height (unlike the rest of the row's text) so the brand
   glyph actually reads as a logo at a glance, not a barely-visible dot next to the date/playtime. */
.platform-tag .platform-icon {
  width: 1.8em;
  height: 1.8em;
}

.platform-tag.text-reverse {
  color: var(--color-text-reverse);
}

.description {
  margin-bottom: var(--space-3);
}

/* Shell (trigger/panel/backdrop positioning and chrome) comes from DropdownMenu.vue, shared
   with AppSettings.vue's model picker. */
.translate-menu-wrap {
  margin-bottom: var(--space-2);
}

.translate-button {
  margin-bottom: 0;
}

/* :deep() is required here, not a plain scoped selector - the panel div lives inside
   DropdownMenu.vue's own template (not its root, the only element Vue's scoped-CSS child
   exception reaches), so it never carries this component's own scope attribute. */
.translate-menu-wrap :deep(.translate-menu) {
  min-width: 220px;
}

/* One group (translate/show/remove) shown at a time - scrolling (wheel) or ArrowUp/ArrowDown
   while the menu is open pages between groups; see translateMenuGroup/onTranslateMenuWheel/
   onTranslateMenuKeydown. */
.translate-menu-group {
  display: flex;
  flex-direction: column;
}

.translate-menu-group button {
  text-align: left;
  padding: var(--space-2) var(--space-3);
  font-size: 0.85rem;
  border: none;
  background: none;
  cursor: pointer;
  color: inherit;
}

.translate-menu-group button:hover:not(:disabled) {
  background: var(--color-surface0);
}

.translate-menu-group button:disabled {
  opacity: 0.45;
  cursor: default;
}

/* Vertical slide+fade - the same direction regardless of which way the user paged, since
   dwelling on "which way did it come from" would add complexity the dot indicator below
   already covers (it's what actually communicates position). */
.menu-group-enter-active,
.menu-group-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.menu-group-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.menu-group-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.translate-menu-dots {
  display: flex;
  justify-content: center;
  gap: 0.4rem;
  padding: var(--space-2) 0;
  border-top: 1px solid var(--color-surface1);
}

.translate-menu-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-surface1);
  transition:
    background-color 0.15s ease,
    transform 0.15s ease;
}

.translate-menu-dot.active {
  background: var(--color-text);
  transform: scale(1.3);
}

/* Rendered markdown's child elements (marked's HTML output, injected via v-html) aren't
   authored in this template, so scoped CSS won't reach them without :deep(). */
.description :deep(p) {
  margin: 0 0 var(--space-2);
}

.description :deep(ul),
.description :deep(ol) {
  margin: 0 0 var(--space-2);
  padding-left: 1.4em;
}

.description :deep(a) {
  color: inherit;
  text-decoration: underline;
}

.description :deep(code) {
  font-family: monospace;
  background: var(--color-surface0);
  padding: 0.1rem 0.3rem;
  border-radius: var(--radius-sm);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
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

.field-row {
  display: flex;
  gap: var(--space-3);
}

.field-row input {
  flex: 1;
  min-width: 0;
}

.field-row .platform-field {
  flex: none;
  width: max-content;
  display: flex;
  align-items: center;
  font-size: 0.85rem;
  color: var(--color-text);
  padding-left: var(--space-3);
}

/* Same flat swap as .back-button, not the scroll-following gradient - .platform-field
   doesn't scroll independently of the form. Flips the icon too, via currentColor. */
.platform-field.text-reverse {
  color: var(--color-text-reverse);
}

/* currentColor picks up the parent's color rather than simple-icons' hardcoded brand hex,
   so it reads as a monochrome UI glyph consistent with the rest of the form. */
.platform-icon {
  width: 32px;
  height: 32px;
  fill: currentColor;
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
  margin-bottom: var(--space-4);
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
  flex-shrink: 0;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  /* Same treatment as the shared .sticky-header/.filters - --background-sticky (styles.css)
     falls back to --content-background, and background-attachment: fixed anchors it to the same
     viewport coordinates .content itself uses, so it renders as a continuous, aligned extension
     of the real pattern instead of a second copy (see .sticky-header's own comment for why). */
  background: var(--background-sticky);
  background-attachment: fixed;
}

.action-bar button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

/* .error-text (shared, styles.css) supplies this rule's entire look. */
</style>
