<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = withDefaults(defineProps<{ open: boolean; title?: string; maxWidth?: string }>(), {
  maxWidth: "420px",
});
const emit = defineEmits<{ close: [] }>();

const frameEl = ref<HTMLElement | null>(null);

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(): HTMLElement[] {
  if (!frameEl.value) return [];
  return Array.from(frameEl.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    emit("close");
    return;
  }
  if (e.key !== "Tab") return;

  const elements = focusableElements();
  if (elements.length === 0) return;
  const first = elements[0];
  const last = elements[elements.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      await nextTick();
      focusableElements()[0]?.focus();
      document.addEventListener("keydown", onKeydown);
    } else {
      document.removeEventListener("keydown", onKeydown);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Transition name="modal">
    <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
      <div ref="frameEl" class="modal-frame" :style="{ maxWidth }">
        <div v-if="$slots.header || title" class="modal-header">
          <slot name="header">
            <h2>{{ title }}</h2>
          </slot>
        </div>
        <div class="modal-body">
          <slot name="body" />
        </div>
        <div v-if="$slots.footer" class="modal-footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.modal-frame {
  background: var(--color-mantle);
  color: var(--color-text);
  border-radius: 8px;
  padding: 1.5rem;
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.modal-header h2 {
  font-size: 1rem;
  margin: 0;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.15s ease;
}

.modal-enter-active .modal-frame,
.modal-leave-active .modal-frame {
  transition: transform 0.15s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-frame,
.modal-leave-to .modal-frame {
  transform: scale(0.96) translateY(8px);
}
</style>
