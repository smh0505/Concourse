<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  IconCopy,
  IconDeviceTv,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMinus,
  IconSquare,
  IconX,
} from "@tabler/icons-vue";

defineProps<{
  sidebarCollapsed: boolean;
}>();

const emit = defineEmits<{
  toggleSidebar: [];
  bigPicture: [];
}>();

const { t } = useI18n();
const appWindow = getCurrentWindow();
const maximized = ref(false);

async function refreshMaximized() {
  maximized.value = await appWindow.isMaximized();
}

async function onMinimize() {
  await appWindow.minimize();
}

async function onToggleMaximize() {
  await appWindow.toggleMaximize();
  await refreshMaximized();
}

async function onClose() {
  await appWindow.close();
}

onMounted(async () => {
  await refreshMaximized();
  await appWindow.onResized(refreshMaximized);
});
</script>

<template>
  <div class="titlebar" data-tauri-drag-region>
    <div class="titlebar-left">
      <button
        class="titlebar-button sidebar-toggle"
        :title="sidebarCollapsed ? t('titleBar.showSidebar') : t('titleBar.hideSidebar')"
        @click="emit('toggleSidebar')"
      >
        <IconLayoutSidebarLeftExpand v-if="sidebarCollapsed" :size="17" :stroke-width="1.75" />
        <IconLayoutSidebarLeftCollapse v-else :size="17" :stroke-width="1.75" />
      </button>
      <button class="titlebar-button" :title="t('titleBar.bigPictureMode')" @click="emit('bigPicture')">
        <IconDeviceTv :size="17" :stroke-width="1.75" />
      </button>
      <span class="titlebar-title" data-tauri-drag-region>{{ t("titleBar.appName") }}</span>
    </div>
    <div class="titlebar-controls">
      <button class="titlebar-button" :title="t('titleBar.minimize')" @click="onMinimize">
        <IconMinus :size="16" :stroke-width="1.75" />
      </button>
      <button
        class="titlebar-button"
        :title="maximized ? t('titleBar.restore') : t('titleBar.maximize')"
        @click="onToggleMaximize"
      >
        <IconCopy v-if="maximized" :size="15" :stroke-width="1.75" />
        <IconSquare v-else :size="14" :stroke-width="1.75" />
      </button>
      <button class="titlebar-button close" :title="t('titleBar.close')" @click="onClose">
        <IconX :size="16" :stroke-width="1.75" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  flex-shrink: 0;
  background: var(--color-mantle);
  color: var(--color-text);
  -webkit-user-select: none;
  user-select: none;
}

.titlebar-left {
  display: flex;
  align-items: center;
  height: 100%;
}

.titlebar-title {
  margin-left: 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  opacity: 0.85;
}

.titlebar-controls {
  display: flex;
  height: 100%;
}

.titlebar-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;
}

.titlebar-button:hover {
  background: var(--color-surface0);
}

.titlebar-button.close:hover {
  background: var(--color-danger);
  color: var(--color-on-accent);
}
</style>
