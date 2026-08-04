<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useToastStore } from "../../../stores/toasts";

const { t } = useI18n();
const toasts = useToastStore();

function testActionToast() {
  let id = -1;
  id = toasts.pushAction(t("uiTest.actionToastMessage"), [
    {
      label: t("uiTest.confirm"),
      onClick: () => {
        toasts.dismiss(id);
        toasts.push(t("uiTest.confirmedMessage"), "success");
      },
    },
    { label: t("uiTest.dismiss"), onClick: () => toasts.dismiss(id) },
  ]);
}

function testInfoToast() {
  toasts.push(t("uiTest.infoToastMessage"), "info");
}

function testSuccessToast() {
  toasts.push(t("uiTest.successToastMessage"), "success");
}

function testErrorToast() {
  toasts.push(t("uiTest.errorToastMessage"), "error");
}

function testLongMessageToast() {
  toasts.push(t("uiTest.longToastMessage"), "info");
}
</script>

<template>
  <div class="ui-test settings-panel">
    <h2>{{ t("uiTest.heading") }}</h2>
    <small>
      {{ t("uiTest.description") }}
    </small>
    <div class="test-buttons">
      <button type="button" @click="testInfoToast">{{ t("uiTest.infoToastButton") }}</button>
      <button type="button" @click="testSuccessToast">{{ t("uiTest.successToastButton") }}</button>
      <button type="button" @click="testErrorToast">{{ t("uiTest.errorToastButton") }}</button>
      <button type="button" @click="testLongMessageToast">
        {{ t("uiTest.longToastButton") }}
      </button>
      <button type="button" @click="testActionToast">{{ t("uiTest.actionToastButton") }}</button>
    </div>
  </div>
</template>

<style scoped>
.ui-test {
  margin-bottom: var(--space-5);
}

.ui-test small {
  display: block;
}

.test-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
</style>
