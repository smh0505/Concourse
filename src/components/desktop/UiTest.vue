<script setup lang="ts">
import { useToastStore } from "../../stores/toasts";

const toasts = useToastStore();

function testActionToast() {
  let id = -1;
  id = toasts.pushAction("Test actionable toast - does this look right?", [
    {
      label: "Confirm",
      onClick: () => {
        toasts.dismiss(id);
        toasts.push("Confirmed!", "success");
      },
    },
    { label: "Dismiss", onClick: () => toasts.dismiss(id) },
  ]);
}

function testInfoToast() {
  toasts.push("This is an info toast.", "info");
}

function testSuccessToast() {
  toasts.push("This is a success toast.", "success");
}

function testErrorToast() {
  toasts.push("This is an error toast.", "error");
}

function testLongMessageToast() {
  toasts.push(
    "This is a much longer toast message, to check wrapping and sizing behavior when the " +
      "text runs well past a single short line.",
    "info",
  );
}
</script>

<template>
  <div class="ui-test settings-panel">
    <h2>UI Test</h2>
    <small>
      Manual triggers for UI states that are hard to reach otherwise (rare toasts, edge-case
      banners, etc.) - not user-facing functionality.
    </small>
    <div class="test-buttons">
      <button type="button" @click="testInfoToast">Info toast</button>
      <button type="button" @click="testSuccessToast">Success toast</button>
      <button type="button" @click="testErrorToast">Error toast</button>
      <button type="button" @click="testLongMessageToast">Long-message toast</button>
      <button type="button" @click="testActionToast">Action toast</button>
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
