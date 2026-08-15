<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { IconLock, IconPlus } from "@tabler/icons-vue";

import { useProfilesStore } from "@/stores/profiles";
import { useGamepadNav } from "@/composables/useGamepadNav";
import { suppressMouseActivity, useMouseActivity } from "@/composables/useMouseActivity";
import OnScreenKeyboard from "./OnScreenKeyboard.vue";

/** Milestone 30 - Big Picture's own profile picker, shown instead of the desktop
 *  ProfileSwitcher.vue when auto-launch-into-Big-Picture is on and no profile is active yet
 *  (see App.vue) - real OS fullscreen engages immediately on launch rather than showing the
 *  small windowed picker first. Mirrors BigPictureGrid.vue's shell (gamepad/keyboard grid nav,
 *  mouse-idle cursor hiding) over profile tiles instead of game tiles; PIN entry and profile
 *  creation both go through OnScreenKeyboard.vue since a physical keyboard can't be assumed in
 *  a console-style session (real typing still works too - see that component). */
const { t } = useI18n();
const profiles = useProfilesStore();

const gridRef = ref<HTMLElement | null>(null);
const rootRef = ref<HTMLElement | null>(null);
const columns = ref(1);

/** Real tiles (profiles) plus the trailing "+ New Profile" tile, as one flat nav-able list -
 *  same reasoning as ProfileSwitcher.vue's own grid, just gamepad-navigable here too. */
const tileCount = computed(() => profiles.profiles.length + 1);
const isCreateTileIndex = (index: number) => index === profiles.profiles.length;

function recomputeColumns() {
  const el = gridRef.value;
  if (!el) return;
  const style = getComputedStyle(el);
  columns.value = style.gridTemplateColumns.split(" ").length;
}

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  recomputeColumns();
  resizeObserver = new ResizeObserver(recomputeColumns);
  if (gridRef.value) resizeObserver.observe(gridRef.value);
  rootRef.value?.focus();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

// ---- Unlock (PIN-entry) flow ----
const unlockingId = ref<number | null>(null);
const unlockPin = ref("");
const unlockError = ref("");

async function onTileSelect(index: number) {
  if (isCreateTileIndex(index)) {
    startCreate();
    return;
  }
  const profile = profiles.profiles[index];
  if (!profile) return;
  if (!profile.pin_hash) {
    await profiles.switchTo(profile.id);
    return;
  }
  unlockingId.value = profile.id;
  unlockPin.value = "";
  unlockError.value = "";
}

async function onUnlockConfirm() {
  if (unlockingId.value === null) return;
  const ok = await profiles.verifyPin(unlockingId.value, unlockPin.value);
  if (!ok) {
    unlockError.value = t("profiles.wrongPin");
    unlockPin.value = "";
    return;
  }
  const id = unlockingId.value;
  unlockingId.value = null;
  await profiles.switchTo(id);
}

function onUnlockCancel() {
  unlockingId.value = null;
  unlockPin.value = "";
  unlockError.value = "";
}

// ---- Create-profile flow ----
// A multi-step wizard (name -> optional PIN -> confirm PIN) since OnScreenKeyboard.vue is a
// single-field screen, not the same all-fields-at-once card ProfileCreateForm.vue renders on
// the desktop picker - each step reuses the same keyboard component with a different label/mode.
type CreateStep = "closed" | "name" | "pin" | "confirmPin";
const createStep = ref<CreateStep>("closed");
const createName = ref("");
const createPinInput = ref("");
const createPendingPin = ref("");
const createError = ref("");

function startCreate() {
  createStep.value = "name";
  createName.value = "";
  createPinInput.value = "";
  createPendingPin.value = "";
  createError.value = "";
}

function cancelCreate() {
  createStep.value = "closed";
}

async function onNameConfirm() {
  const trimmed = createName.value.trim();
  if (!trimmed) return;
  createName.value = trimmed;
  createStep.value = "pin";
  createPinInput.value = "";
}

async function finishCreate(pin: string) {
  try {
    const id = await profiles.createProfile(createName.value);
    if (pin) await profiles.setPin(id, pin);
    createStep.value = "closed";
    await profiles.switchTo(id);
  } catch (e) {
    createError.value = String(e);
  }
}

async function onPinConfirm() {
  if (!createPinInput.value) {
    // Empty PIN confirmed - skip the confirm step entirely, same as ProfileCreateForm.vue's
    // own "empty submits immediately" behavior.
    await finishCreate("");
    return;
  }
  createPendingPin.value = createPinInput.value;
  createPinInput.value = "";
  createStep.value = "confirmPin";
}

async function onConfirmPinConfirm() {
  if (createPinInput.value !== createPendingPin.value) {
    createError.value = t("profiles.pinMismatch");
    createStep.value = "pin";
    createPinInput.value = "";
    createPendingPin.value = "";
    return;
  }
  await finishCreate(createPendingPin.value);
}

const keyboardOpen = computed(() => unlockingId.value !== null || createStep.value !== "closed");

// While the keyboard overlay is open, OnScreenKeyboard.vue runs its own useGamepadDirections
// poll concurrently against the same physical gamepad - itemCount:0 already no-ops this grid's
// own move(), but onSelect fires unconditionally on every confirm-button press regardless of
// itemCount, so without this guard a single A-button press would fire both this tile grid's
// onTileSelect AND the keyboard's own activateFocused at once.
const { focusedIndex } = useGamepadNav({
  itemCount: () => (keyboardOpen.value ? 0 : tileCount.value),
  columns: () => columns.value,
  onSelect: (index) => {
    if (!keyboardOpen.value) onTileSelect(index);
  },
});

const mouseActive = useMouseActivity();

function onKeydown(event: KeyboardEvent) {
  if (keyboardOpen.value) return;
  const count = tileCount.value;
  if (count === 0) return;
  const cols = Math.max(1, columns.value);
  const current = Math.min(focusedIndex.value, count - 1);
  const col = current % cols;

  if (event.key === "ArrowUp" && current - cols >= 0) {
    suppressMouseActivity();
    focusedIndex.value = current - cols;
  } else if (event.key === "ArrowDown" && current + cols < count) {
    suppressMouseActivity();
    focusedIndex.value = current + cols;
  } else if (event.key === "ArrowLeft" && col > 0) {
    suppressMouseActivity();
    focusedIndex.value = current - 1;
  } else if (event.key === "ArrowRight" && col < cols - 1 && current + 1 < count) {
    suppressMouseActivity();
    focusedIndex.value = current + 1;
  } else if (event.key === "Enter") {
    onTileSelect(focusedIndex.value);
  } else return;

  event.preventDefault();
}

function onTileHover(index: number) {
  if (mouseActive.value) focusedIndex.value = index;
}

const keyboardRootRef = ref<HTMLElement | null>(null);
watch(keyboardOpen, async (open) => {
  if (open) {
    await nextTick();
    keyboardRootRef.value?.focus();
  } else {
    await nextTick();
    rootRef.value?.focus();
  }
});
</script>

<template>
  <div
    class="big-picture bp-surface"
    :class="{ 'mouse-idle': !mouseActive }"
    ref="rootRef"
    tabindex="0"
    @keydown="onKeydown"
  >
    <div class="backdrop-overlay bp-backdrop-overlay-base" />

    <div class="header">
      <h1>{{ t("profiles.switcherTitle") }}</h1>
    </div>

    <div class="tile-grid" ref="gridRef">
      <button
        v-for="profile in profiles.profiles"
        :key="profile.id"
        type="button"
        class="tile"
        :class="{ 'tile-selected': focusedIndex === profiles.profiles.indexOf(profile) }"
        @click="onTileSelect(profiles.profiles.indexOf(profile))"
        @mouseenter="onTileHover(profiles.profiles.indexOf(profile))"
      >
        <div class="profile-avatar" :class="{ 'bp-cover-focused': focusedIndex === profiles.profiles.indexOf(profile) }">
          {{ profile.name.charAt(0).toUpperCase() }}
          <IconLock v-if="profile.pin_hash" :size="20" :stroke-width="2" class="profile-avatar-lock" />
        </div>
        <div class="tile-name">{{ profile.name }}</div>
      </button>
      <button
        type="button"
        class="tile"
        :class="{ 'tile-selected': focusedIndex === profiles.profiles.length }"
        @click="onTileSelect(profiles.profiles.length)"
        @mouseenter="onTileHover(profiles.profiles.length)"
      >
        <div
          class="profile-avatar profile-avatar-add"
          :class="{ 'bp-cover-focused': focusedIndex === profiles.profiles.length }"
        >
          <IconPlus :size="32" :stroke-width="1.75" />
        </div>
        <div class="tile-name">{{ t("profiles.newProfile") }}</div>
      </button>
    </div>

    <Transition name="keyboard-fade">
      <div v-if="keyboardOpen" class="keyboard-overlay">
        <div ref="keyboardRootRef" class="keyboard-panel" tabindex="-1">
          <template v-if="unlockingId !== null">
            <h2>{{ profiles.profiles.find((p) => p.id === unlockingId)?.name }}</h2>
            <p v-if="unlockError" class="error-text">{{ unlockError }}</p>
            <OnScreenKeyboard v-model="unlockPin" masked @confirm="onUnlockConfirm" @cancel="onUnlockCancel" />
          </template>
          <template v-else-if="createStep === 'name'">
            <h2>{{ t("profiles.newProfileName") }}</h2>
            <OnScreenKeyboard v-model="createName" @confirm="onNameConfirm" @cancel="cancelCreate" />
          </template>
          <template v-else-if="createStep === 'pin'">
            <h2>{{ t("profiles.optionalPin") }}</h2>
            <p v-if="createError" class="error-text">{{ createError }}</p>
            <OnScreenKeyboard v-model="createPinInput" masked @confirm="onPinConfirm" @cancel="cancelCreate" />
          </template>
          <template v-else-if="createStep === 'confirmPin'">
            <h2>{{ t("profiles.confirmPin") }}</h2>
            <OnScreenKeyboard v-model="createPinInput" masked @confirm="onConfirmPinConfirm" @cancel="cancelCreate" />
          </template>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* .bp-surface (shared, styles.css) supplies the fixed dark-fullscreen base. */
.big-picture {
  overflow-y: auto;
  padding: 3rem;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.big-picture::-webkit-scrollbar {
  display: none;
}

.big-picture.mouse-idle {
  cursor: none;
}

/* .bp-backdrop-overlay-base (shared, styles.css) supplies position/inset/z-index. */
.backdrop-overlay {
  background: linear-gradient(180deg, rgba(17, 17, 17, 0.55) 0%, rgba(17, 17, 17, 0.9) 100%);
}

.header {
  position: relative;
  z-index: 2;
  text-align: center;
  margin-bottom: 3rem;
}

.header h1 {
  margin: 0;
  font-size: 2.5rem;
}

.tile-grid {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-6, 2rem);
  justify-items: center;
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
}

.profile-avatar {
  width: 8rem;
  height: 8rem;
  font-size: 3rem;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
  border: 3px solid transparent;
}

/* .bp-cover-focused (shared, styles.css) supplies border-color/box-shadow. */
.profile-avatar.bp-cover-focused {
  transform: scale(1.08);
}

.profile-avatar-add {
  border: 3px dashed rgba(255, 255, 255, 0.3);
}

.tile-name {
  font-size: 1.1rem;
  font-weight: 600;
  text-align: center;
  max-width: 10rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keyboard-overlay {
  position: fixed;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.75);
}

.keyboard-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  outline: none;
}

.keyboard-panel h2 {
  margin: 0;
  font-size: 1.3rem;
}

.keyboard-fade-enter-active,
.keyboard-fade-leave-active {
  transition: opacity 0.15s ease;
}

.keyboard-fade-enter-from,
.keyboard-fade-leave-to {
  opacity: 0;
}
</style>
