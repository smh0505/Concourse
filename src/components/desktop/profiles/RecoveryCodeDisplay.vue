<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { IconCheck, IconCopy } from "@tabler/icons-vue";

const props = defineProps<{ code: string }>();
const emit = defineEmits<{ continue: [] }>();

const { t } = useI18n();

const confirmed = ref(false);
const copied = ref(false);

async function copyCode() {
  await navigator.clipboard.writeText(props.code);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}
</script>

<template>
  <div class="recovery-display">
    <p class="recovery-intro">{{ t("profiles.recoveryCodeIntro") }}</p>
    <div class="recovery-code-row">
      <code class="recovery-code">{{ code }}</code>
      <button type="button" class="icon-button" :title="t('profiles.copyCode')" @click="copyCode">
        <IconCheck v-if="copied" :size="16" :stroke-width="1.75" />
        <IconCopy v-else :size="16" :stroke-width="1.75" />
      </button>
    </div>
    <p class="recovery-warning">{{ t("profiles.recoveryCodeWarning") }}</p>
    <label class="recovery-confirm">
      <input v-model="confirmed" type="checkbox" />
      {{ t("profiles.recoveryCodeConfirm") }}
    </label>
    <button type="button" :disabled="!confirmed" @click="emit('continue')">
      {{ t("common.continue") }}
    </button>
  </div>
</template>

<style scoped>
.recovery-display {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-width: 24rem;
}

.recovery-intro {
  margin: 0;
}

.recovery-code-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.recovery-code {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-surface0);
  font-size: 1.1rem;
  letter-spacing: 0.05em;
  text-align: center;
  user-select: all;
}

.recovery-warning {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.8;
}

.recovery-confirm {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.9rem;
}
</style>
