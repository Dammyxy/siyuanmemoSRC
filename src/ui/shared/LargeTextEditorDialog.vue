<template>
  <div v-if="open" class="large-editor">
    <div class="large-editor__backdrop" @click="emit('close')"></div>
    <section class="large-editor__panel" role="dialog" aria-modal="true" :aria-label="title">
      <header class="large-editor__header">
        <strong>{{ title }}</strong>
        <button class="b3-button b3-button--text" type="button" @click="emit('close')">
          {{ closeLabel }}
        </button>
      </header>

      <textarea
        ref="textareaRef"
        class="b3-text-field large-editor__textarea"
        :value="modelValue"
        :readonly="readonly"
        :placeholder="placeholder"
        @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
        @keydown.ctrl.enter.prevent="confirmIfEditable"
        @keydown.meta.enter.prevent="confirmIfEditable"
      ></textarea>

      <footer class="large-editor__footer">
        <span class="large-editor__hint">{{ hint }}</span>
        <div class="large-editor__actions">
          <button class="b3-button b3-button--outline" type="button" @click="emit('close')">
            {{ cancelLabel }}
          </button>
          <button
            v-if="!readonly"
            class="b3-button b3-button--text"
            type="button"
            :disabled="confirmDisabled"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  modelValue: string;
  placeholder?: string;
  readonly?: boolean;
  hint?: string;
  closeLabel?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'confirm'): void;
  (e: 'close'): void;
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

watch(
  () => props.open,
  async (open) => {
    if (!open || props.readonly) {
      return;
    }
    await nextTick();
    textareaRef.value?.focus();
    textareaRef.value?.setSelectionRange(textareaRef.value.value.length, textareaRef.value.value.length);
  },
);

function confirmIfEditable(): void {
  if (props.readonly || props.confirmDisabled) {
    return;
  }
  emit('confirm');
}
</script>

<style scoped>
.large-editor {
  position: fixed;
  inset: 0;
  z-index: 4200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.large-editor__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(37, 29, 20, 0.42);
  backdrop-filter: blur(6px);
}

.large-editor__panel {
  position: relative;
  width: min(900px, calc(100vw - 32px));
  max-height: min(780px, calc(100vh - 32px));
  display: grid;
  gap: 12px;
  padding: 18px;
  border-radius: 20px;
  background: #fffaf2;
  box-shadow: 0 22px 56px rgba(87, 61, 33, 0.2);
}

.large-editor__header,
.large-editor__footer,
.large-editor__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.large-editor__textarea {
  min-height: 420px;
  resize: vertical;
  line-height: 1.64;
}

.large-editor__hint {
  color: #7b6b57;
  font-size: 12px;
  line-height: 1.5;
}
</style>
