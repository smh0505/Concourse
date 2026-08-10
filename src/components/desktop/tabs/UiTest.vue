<script setup lang="ts">
import { useI18n } from "vue-i18n";

import { useToastStore } from "@/stores/toasts";

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

// Fake-data triggers for the toast strings added when store toasts were translated - lets a
// dev flip locales and click through every real i18n key/param combo without needing to
// actually trigger a slow/flaky app update, plugin scan, or metadata fetch to see it render.
// Button labels go through t() too, same as the section above - verified across all 10
// locales this panel is itself dev-only for.
function testAppUpdateToasts() {
  toasts.push(t("appUpdate.downloading", { version: "9.9.9" }), "info");
  toasts.push(t("appUpdate.updateFailed", { error: "Fake network error" }), "error");
}

function testLibraryToasts() {
  toasts.push(t("library.noMetadataFound", { title: "Fake Game Title" }), "error");
  toasts.push(t("library.noBackgroundArtFound", { title: "Fake Game Title" }), "error");
}

function testMetadataProviderToasts() {
  toasts.push(t("metadataProviders.noProviderEnabled"), "error");
  toasts.push(t("metadataProviders.searchFailed", { name: "FakeProvider" }), "error");
  toasts.push(t("metadataProviders.noMatch", { name: "FakeProvider" }), "info");
  toasts.push(t("metadataProviders.foundMatch", { name: "FakeProvider" }), "success");
  toasts.push(t("metadataProviders.matchesFound", { name: "FakeProvider", count: 3 }), "info");
}

function testPluginInstallToasts() {
  toasts.push(t("pluginInstall.installed"), "success");
  toasts.push(t("pluginInstall.installFailed", { error: "Fake install error" }), "error");
}

function testPluginScanToasts() {
  toasts.push(t("pluginSettings.noPluginsEnabled"), "error");
  toasts.push(t("pluginSettings.scanComplete", { added: 5, merged: 2 }), "success");
  toasts.push(t("pluginSettings.scanFailed", { error: "Fake scan error" }), "error");
  toasts.push(t("pluginSettings.removeThemeFailed", { error: "Fake theme error" }), "error");
}

function testPluginUpdateToasts() {
  toasts.push(t("pluginUpdates.updated", { name: "FakePlugin", version: "2.0.0" }), "success");
  toasts.push(
    t("pluginUpdates.updateFailed", { name: "FakePlugin", error: "Fake update error" }),
    "error",
  );
}
</script>

<template>
  <div class="ui-test settings-panel">
    <h2>{{ t("uiTest.heading") }}</h2>
    <small>
      {{ t("uiTest.description") }}
    </small>
    <h3>{{ t("uiTest.basicToastsHeading") }}</h3>
    <div class="test-buttons">
      <button type="button" @click="testInfoToast">{{ t("uiTest.infoToastButton") }}</button>
      <button type="button" @click="testSuccessToast">{{ t("uiTest.successToastButton") }}</button>
      <button type="button" @click="testErrorToast">{{ t("uiTest.errorToastButton") }}</button>
      <button type="button" @click="testLongMessageToast">
        {{ t("uiTest.longToastButton") }}
      </button>
      <button type="button" @click="testActionToast">{{ t("uiTest.actionToastButton") }}</button>
    </div>

    <h3>{{ t("uiTest.i18nCheckHeading") }}</h3>
    <div class="test-buttons">
      <button type="button" @click="testAppUpdateToasts">{{ t("uiTest.appUpdateToastsButton") }}</button>
      <button type="button" @click="testLibraryToasts">{{ t("uiTest.libraryToastsButton") }}</button>
      <button type="button" @click="testMetadataProviderToasts">
        {{ t("uiTest.metadataProviderToastsButton") }}
      </button>
      <button type="button" @click="testPluginInstallToasts">
        {{ t("uiTest.pluginInstallToastsButton") }}
      </button>
      <button type="button" @click="testPluginScanToasts">{{ t("uiTest.pluginScanToastsButton") }}</button>
      <button type="button" @click="testPluginUpdateToasts">
        {{ t("uiTest.pluginUpdateToastsButton") }}
      </button>
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

.ui-test h3 {
  font-size: 0.9rem;
  margin: var(--space-4) 0 0;
  opacity: 0.8;
}

.test-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
</style>
