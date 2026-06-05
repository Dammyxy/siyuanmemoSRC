<template>
  <section
    v-if="open"
    class="review-editable-targets-panel"
    aria-live="polite"
    data-testid="review-editable-targets-panel"
  >
    <header class="review-editable-targets-panel__header">
      <div class="review-editable-targets-panel__title">{{ title }}</div>
      <div class="review-editable-targets-panel__actions">
        <button class="b3-button b3-button--outline" type="button" :disabled="readonly" @click="emit('close')">
          {{ cancelLabel }}
        </button>
        <button
          class="b3-button b3-button--text"
          type="button"
          :disabled="confirmDisabled"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </header>

    <div class="review-editable-targets-panel__body">
      <label
        v-for="entry in entries"
        :key="entry.target.id"
        class="review-editable-targets-panel__target"
      >
        <span class="review-editable-targets-panel__target-header">
          <span class="review-editable-targets-panel__target-title">{{ entry.target.title }}</span>
          <span v-if="entry.value !== entry.originalValue" class="review-editable-targets-panel__dirty">
            {{ dirtyLabel }}
          </span>
        </span>
        <textarea
          class="b3-text-field review-editable-targets-panel__textarea"
          :value="entry.value"
          :readonly="readonly"
          :placeholder="placeholder"
          @input="emit('update-target', entry.target.id, ($event.target as HTMLTextAreaElement).value)"
          @keydown.ctrl.enter.prevent="confirmIfEditable"
          @keydown.meta.enter.prevent="confirmIfEditable"
        ></textarea>
        <span
          v-if="entry.saveError"
          class="review-editable-targets-panel__error"
          role="alert"
        >
          {{ entry.saveError }}
        </span>
        <div
          v-if="entry.conflict"
          class="review-editable-targets-panel__conflict"
          data-testid="review-editable-target-conflict"
        >
          <div class="review-editable-targets-panel__conflict-message">
            {{ entry.conflict.message }}
          </div>
          <div class="review-editable-targets-panel__conflict-actions">
            <button
              class="b3-button b3-button--outline"
              type="button"
              :disabled="readonly"
              @click="emit('resolve-conflict', entry.target.id, 'source-latest')"
            >
              {{ sourceLatestConflictLabel }}
            </button>
            <button
              class="b3-button b3-button--text"
              type="button"
              :disabled="readonly"
              @click="emit('resolve-conflict', entry.target.id, 'draft-overwrite')"
            >
              {{ draftOverwriteConflictLabel }}
            </button>
          </div>
        </div>
      </label>
    </div>

    <footer class="review-editable-targets-panel__footer">
      {{ hint }}
    </footer>
  </section>
</template>

<script setup lang="ts">
import type { ReviewEditableTargetEditorEntry } from '../reviewCurrentContentEditorRuntime';

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  entries: ReviewEditableTargetEditorEntry[];
  readonly?: boolean;
  confirmDisabled?: boolean;
  hint?: string;
  placeholder?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  dirtyLabel?: string;
  sourceLatestConflictLabel?: string;
  draftOverwriteConflictLabel?: string;
}>(), {
  readonly: false,
  confirmDisabled: false,
  hint: '',
  placeholder: '',
  cancelLabel: '取消',
  confirmLabel: '保存',
  dirtyLabel: '已修改',
  sourceLatestConflictLabel: '使用源文档最新',
  draftOverwriteConflictLabel: '保留我的草稿',
});

const emit = defineEmits<{
  (e: 'update-target', targetId: string, value: string): void;
  (e: 'resolve-conflict', targetId: string, resolution: 'source-latest' | 'draft-overwrite'): void;
  (e: 'confirm'): void;
  (e: 'close'): void;
}>();

function confirmIfEditable(): void {
  if (props.readonly || props.confirmDisabled) {
    return;
  }
  emit('confirm');
}
</script>

<style scoped>
.review-editable-targets-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 10px;
  margin: 8px 12px 12px;
  padding: 12px;
  max-height: min(420px, 46vh);
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
}

.review-editable-targets-panel__header,
.review-editable-targets-panel__actions,
.review-editable-targets-panel__target-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.review-editable-targets-panel__header {
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--b3-border-color);
}

.review-editable-targets-panel__title {
  min-width: 0;
  color: var(--b3-theme-on-background);
  font-size: 13px;
  font-weight: 600;
}

.review-editable-targets-panel__actions {
  flex: 0 0 auto;
}

.review-editable-targets-panel__body {
  display: grid;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
}

.review-editable-targets-panel__target {
  display: grid;
  gap: 6px;
}

.review-editable-targets-panel__target-header {
  justify-content: space-between;
  min-height: 20px;
}

.review-editable-targets-panel__target-title {
  overflow: hidden;
  color: var(--b3-theme-on-background);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-editable-targets-panel__dirty {
  color: var(--b3-theme-primary);
  font-size: 11px;
}

.review-editable-targets-panel__error {
  color: var(--b3-theme-error);
  font-size: 11px;
  line-height: 1.45;
}

.review-editable-targets-panel__conflict {
  display: grid;
  gap: 8px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--b3-theme-error) 36%, var(--b3-border-color));
  border-radius: 6px;
  background: color-mix(in srgb, var(--b3-theme-error) 6%, var(--b3-theme-background));
}

.review-editable-targets-panel__conflict-message {
  color: var(--b3-theme-on-background);
  font-size: 12px;
  line-height: 1.45;
}

.review-editable-targets-panel__conflict-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.review-editable-targets-panel__textarea {
  min-height: 132px;
  max-height: 240px;
  resize: vertical;
  line-height: 1.55;
}

.review-editable-targets-panel__footer {
  padding-top: 4px;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  line-height: 1.5;
}

@media (max-width: 640px) {
  .review-editable-targets-panel {
    max-height: min(360px, 42vh);
  }

  .review-editable-targets-panel__textarea {
    min-height: 112px;
  }
}
</style>
