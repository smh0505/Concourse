<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import { useLibraryStore } from "@/stores/library";
import BaseModal from "@/components/desktop/common/BaseModal.vue";

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
const library = useLibraryStore();

const title = ref("");
const executablePath = ref("");
const error = ref("");

async function onSubmit() {
  if (!title.value.trim() || !executablePath.value.trim()) {
    error.value = t("addGame.validationError");
    return;
  }
  error.value = "";
  await library.addGame(title.value.trim(), executablePath.value.trim());
  title.value = "";
  executablePath.value = "";
  emit("close");
}
</script>

<template>
  <BaseModal :open="open" :title="t('addGame.title')" max-width="380px" @close="emit('close')">
    <template #body>
      <form class="add-game-form" @submit.prevent="onSubmit">
        <label>
          {{ t("addGame.titleLabel") }}
          <input v-model="title" :placeholder="t('addGame.titleLabel')" />
        </label>
        <label>
          {{ t("addGame.executablePathLabel") }}
          <input v-model="executablePath" :placeholder="t('addGame.executablePathLabel')" />
        </label>
      </form>
      <p v-if="error" class="error-text">{{ error }}</p>
    </template>
    <template #footer>
      <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
      <button type="button" @click="onSubmit">{{ t("addGame.submit") }}</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.add-game-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.add-game-form label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  text-align: left;
}

/* .error-text (shared, styles.css) supplies this rule's entire look. */
</style>
