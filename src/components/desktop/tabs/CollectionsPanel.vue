<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { IconCheck, IconPencil, IconTrash, IconX } from "@tabler/icons-vue";
import { useCollectionsStore } from "../../../stores/collections";
import { useNamedItemManager } from "../../../composables/useNamedItemManager";

const { t } = useI18n();
const collections = useCollectionsStore();
const manager = useNamedItemManager({
  create: collections.create,
  rename: collections.rename,
  delete: collections.remove,
  getUsageCounts: collections.getUsageCounts,
});
</script>

<template>
  <div class="panel settings-panel">
    <div class="sticky-header">
      <h2>{{ t("collections.title") }}</h2>
      <small>
        {{ t("collections.description") }}
      </small>
      <form class="add-form" @submit.prevent="manager.onCreate">
        <input v-model="manager.newName" :placeholder="t('collections.newNamePlaceholder')" />
        <button type="submit">{{ t("collections.addCollection") }}</button>
      </form>
    </div>

    <ul v-if="collections.allCollections.length" class="item-list">
      <li v-for="name in collections.allCollections" :key="name" class="item-row list-row-shell">
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
          <span class="item-count">{{ t("collections.gamesCount", { count: manager.counts[name] ?? 0 }) }}</span>
          <div class="row-controls">
            <button class="icon-button" :title="t('collections.rename')" @click="manager.startEdit(name)">
              <IconPencil :size="15" :stroke-width="1.75" />
            </button>
            <button class="icon-button" :title="t('common.delete')" @click="manager.onDelete(name)">
              <IconTrash :size="15" :stroke-width="1.75" />
            </button>
          </div>
        </template>
      </li>
    </ul>
    <p v-else class="empty">{{ t("collections.empty") }}</p>
  </div>
</template>
