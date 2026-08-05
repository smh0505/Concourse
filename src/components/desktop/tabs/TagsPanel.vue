<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { IconCheck, IconPencil, IconTrash, IconX } from "@tabler/icons-vue";
import { useTagsStore } from "@/stores/tags";
import { useNamedItemManager } from "@/composables/useNamedItemManager";

const { t } = useI18n();
const tags = useTagsStore();
const manager = useNamedItemManager({
  create: tags.create,
  rename: tags.rename,
  delete: tags.remove,
  getUsageCounts: tags.getUsageCounts,
});
</script>

<template>
  <div class="panel settings-panel">
    <div class="sticky-header">
      <h2>{{ t("tags.title") }}</h2>
      <small>{{ t("tags.description") }}</small>
      <form class="add-form" @submit.prevent="manager.onCreate">
        <input v-model="manager.newName" :placeholder="t('tags.newNamePlaceholder')" />
        <button type="submit">{{ t("tags.addTag") }}</button>
      </form>
    </div>

    <ul v-if="tags.allTags.length" class="item-list">
      <li v-for="name in tags.allTags" :key="name" class="item-row list-row-shell">
        <template v-if="manager.editingName === name">
          <input
            v-model="manager.editingValue"
            class="edit-input"
            @keyup.enter="manager.confirmEdit"
            @keyup.esc="manager.cancelEdit"
          />
          <div class="row-controls">
            <button class="icon-button" :title="t('common.save')" @click="manager.confirmEdit">
              <IconCheck :size="15" :stroke-width="1.75" />
            </button>
            <button class="icon-button" :title="t('common.cancel')" @click="manager.cancelEdit">
              <IconX :size="15" :stroke-width="1.75" />
            </button>
          </div>
        </template>
        <template v-else>
          <span class="item-name">{{ name }}</span>
          <span class="item-count">{{ t("tags.gamesCount", { count: manager.counts[name] ?? 0 }) }}</span>
          <div class="row-controls">
            <button class="icon-button" :title="t('tags.rename')" @click="manager.startEdit(name)">
              <IconPencil :size="15" :stroke-width="1.75" />
            </button>
            <button class="icon-button" :title="t('common.delete')" @click="manager.onDelete(name)">
              <IconTrash :size="15" :stroke-width="1.75" />
            </button>
          </div>
        </template>
      </li>
    </ul>
    <p v-else class="empty">{{ t("tags.empty") }}</p>
  </div>
</template>
