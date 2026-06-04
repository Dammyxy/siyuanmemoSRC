<template>
  <section
    v-if="open"
    class="review-inline-card-editor"
    data-testid="review-inline-card-editor"
  >
    <header class="review-inline-card-editor__header">
      <div>
        <h3 class="review-inline-card-editor__title">{{ title }}</h3>
        <p class="review-inline-card-editor__hint">{{ hint }}</p>
      </div>
      <button
        type="button"
        class="b3-button b3-button--outline"
        data-action="close-inline-card-editor"
        @click="emit('close')"
      >
        {{ closeLabel }}
      </button>
    </header>

    <div class="review-inline-card-editor__body">
      <ReviewEditableTargetsPanel
        v-if="sourceOpen"
        class="review-inline-card-editor__source"
        :open="sourceOpen"
        :title="sourceTitle"
        :entries="sourceEntries"
        :readonly="sourceReadonly"
        :placeholder="sourcePlaceholder"
        :hint="sourceHint"
        :confirm-label="saveLabel"
        :confirm-disabled="sourceConfirmDisabled"
        :cancel-label="cancelLabel"
        @update-target="(targetId, value) => emit('update-source-target', targetId, value)"
        @confirm="emit('confirm-source')"
        @close="emit('close')"
      />

      <section
        v-if="card"
        class="review-inline-card-editor__metadata"
        data-testid="review-inline-card-metadata"
      >
        <SrsEditorDialog
          :card="card"
          :deck-id="deckId"
          :i18n="i18n"
          :plugin="plugin"
          :review-service="reviewService"
          :scheduling-context="schedulingContext"
          @scheduled="(payload) => emit('scheduled', payload)"
          @dismissed="(payload) => emit('dismissed', payload)"
        />
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import ReviewEditableTargetsPanel from './ReviewEditableTargetsPanel.vue';
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import type FSRSPlugin from '@/index';
import type { ReviewApplicationService } from '@/application/services/ReviewApplicationService';
import type { QueueReviewSchedulingContext } from '@/types/unified-data-source';
import type { ReviewEditableTargetEditorEntry } from '../reviewCurrentContentEditorRuntime';

defineProps<{
  open: boolean;
  title: string;
  hint: string;
  card: { id?: string; blockId?: string; deckId?: string } | null;
  deckId?: string;
  i18n?: Record<string, string>;
  plugin?: FSRSPlugin;
  reviewService?: ReviewApplicationService | null;
  schedulingContext?: QueueReviewSchedulingContext | null;
  sourceOpen: boolean;
  sourceTitle: string;
  sourceEntries: ReviewEditableTargetEditorEntry[];
  sourceReadonly: boolean;
  sourcePlaceholder: string;
  sourceHint: string;
  sourceConfirmDisabled: boolean;
  cancelLabel: string;
  saveLabel: string;
  closeLabel: string;
}>();

const emit = defineEmits<{
  (e: 'update-source-target', targetId: string, value: string): void;
  (e: 'confirm-source'): void;
  (e: 'close'): void;
  (e: 'scheduled', payload: unknown): void;
  (e: 'dismissed', payload: unknown): void;
}>();
</script>

<style scoped>
.review-inline-card-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin: 8px 12px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
}

.review-inline-card-editor__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--b3-border-color);
}

.review-inline-card-editor__title,
.review-inline-card-editor__hint {
  margin: 0;
}

.review-inline-card-editor__title {
  color: var(--b3-theme-on-background);
  font-size: 13px;
  font-weight: 600;
}

.review-inline-card-editor__hint {
  margin-top: 4px;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  line-height: 1.45;
}

.review-inline-card-editor__body {
  display: grid;
  grid-template-columns: minmax(260px, 0.95fr) minmax(320px, 1.25fr);
  gap: 10px;
  min-height: 0;
  max-height: min(640px, 68vh);
  overflow: hidden;
  padding: 10px;
}

.review-inline-card-editor__source {
  min-height: 0;
  margin: 0;
  max-height: none;
}

.review-inline-card-editor__metadata {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-surface);
}

.review-inline-card-editor__metadata:only-child {
  grid-column: 1 / -1;
}

.review-inline-card-editor__metadata :deep(.srs-editor) {
  height: 100%;
  padding: 10px;
  background: var(--b3-theme-background);
}

@media (max-width: 760px) {
  .review-inline-card-editor__header {
    flex-direction: column;
  }

  .review-inline-card-editor__body {
    grid-template-columns: 1fr;
    max-height: min(680px, 72vh);
  }
}
</style>
