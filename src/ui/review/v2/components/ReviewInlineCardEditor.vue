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
      <section
        class="review-inline-card-editor__content"
        :class="{ 'review-inline-card-editor__content--with-context': showStructuredContext }"
        data-testid="review-structured-content-editor"
      >
        <header class="review-inline-card-editor__content-header">
          <div class="review-inline-card-editor__section-title">{{ contentTitle }}</div>
        </header>

        <div
          v-if="showStructuredContext"
          class="review-inline-card-editor__context"
          data-testid="review-structured-field-context"
        >
          <div
            v-if="relationChips.length > 0"
            class="review-inline-card-editor__chips"
            data-testid="review-structured-relation-chips"
          >
            <span
              v-for="chip in relationChips"
              :key="chip.blockId"
              class="review-inline-card-editor__chip"
              data-testid="review-structured-relation-chip"
              data-readonly="true"
            >
              {{ chip.label }}
            </span>
          </div>
          <span
            v-if="directionKind !== 'unknown'"
            class="review-inline-card-editor__direction"
            data-testid="review-structured-direction"
            data-readonly="true"
          >
            {{ directionLabel }}
          </span>
        </div>

        <ReviewEditableTargetsPanel
          v-if="sourceOpen"
          class="review-inline-card-editor__source"
          :open="sourceOpen"
          :title="sourceTitle"
          :entries="structuredSourceEntries"
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

        <div
          v-else
          class="review-inline-card-editor__content-placeholder"
          data-testid="review-structured-content-placeholder"
        >
          {{ contentPlaceholder }}
        </div>
      </section>

      <details
        v-if="card"
        class="review-inline-card-editor__secondary"
        data-testid="review-inline-card-secondary"
      >
        <summary class="review-inline-card-editor__secondary-summary">
          {{ secondaryTitle }}
        </summary>
        <section
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
      </details>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ReviewEditableTargetsPanel from './ReviewEditableTargetsPanel.vue';
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import type FSRSPlugin from '@/index';
import type { ReviewApplicationService } from '@/application/services/ReviewApplicationService';
import type { QueueReviewSchedulingContext } from '@/types/unified-data-source';
import type { ReviewEditableTargetEditorEntry } from '../reviewCurrentContentEditorRuntime';
import type {
  ReviewStructuredDirectionKind,
  ReviewStructuredFieldModel,
} from '../reviewStructuredFieldModel';

const props = defineProps<{
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
  structuredModel?: ReviewStructuredFieldModel | null;
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

function t(key: string, fallback: string): string {
  const value = props.i18n?.[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

const contentTitle = computed(() => t('reviewStructuredContentTitle', '内容'));
const contentPlaceholder = computed(() => t('reviewStructuredContentNoFields', '当前卡片没有可编辑内容字段'));
const secondaryTitle = computed(() => t('reviewCardAttributeSection', '卡片属性'));
const relationChips = computed(() => props.structuredModel?.relationChips || []);
const directionKind = computed<ReviewStructuredDirectionKind>(() => (
  props.structuredModel?.direction.kind || 'unknown'
));
const structuredSourceEntries = computed<ReviewEditableTargetEditorEntry[]>(() => {
  const fields = props.structuredModel?.mode === 'structured'
    ? [...props.structuredModel.fields]
    : [];
  if (fields.length === 0) {
    return props.sourceEntries;
  }

  return props.sourceEntries.map((entry) => {
    const fieldIndex = fields.findIndex(field => field.origin.blockId === entry.target.blockId);
    if (fieldIndex < 0) {
      return entry;
    }
    const [field] = fields.splice(fieldIndex, 1);
    return {
      ...entry,
      target: {
        ...entry.target,
        title: field.label,
      },
    };
  });
});
const showStructuredContext = computed(() => (
  relationChips.value.length > 0 || directionKind.value !== 'unknown'
));

function resolveDirectionLabel(kind: ReviewStructuredDirectionKind): string {
  if (kind === 'forward') {
    return t('reviewStructuredDirectionForward', '正向');
  }
  if (kind === 'reverse') {
    return t('reviewStructuredDirectionReverse', '反向');
  }
  if (kind === 'both') {
    return t('reviewStructuredDirectionBoth', '双向');
  }
  return '';
}

const directionLabel = computed(() => resolveDirectionLabel(directionKind.value));
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
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  max-height: min(640px, 68vh);
  overflow: auto;
  padding: 10px;
}

.review-inline-card-editor__content {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;
  min-height: min(340px, 48vh);
  min-width: 0;
  overflow: hidden;
}

.review-inline-card-editor__content--with-context {
  grid-template-rows: auto auto minmax(0, 1fr);
}

.review-inline-card-editor__content-header,
.review-inline-card-editor__secondary-summary {
  min-height: 28px;
  color: var(--b3-theme-on-background);
  font-size: 13px;
  font-weight: 600;
}

.review-inline-card-editor__content-header {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--b3-border-color);
}

.review-inline-card-editor__section-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-inline-card-editor__source {
  grid-row: 2;
  min-height: 0;
  margin: 0;
  max-height: none;
}

.review-inline-card-editor__content--with-context .review-inline-card-editor__source {
  grid-row: 3;
}

.review-inline-card-editor__context {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  min-height: 28px;
}

.review-inline-card-editor__chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.review-inline-card-editor__chip,
.review-inline-card-editor__direction {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-height: 22px;
  padding: 2px 7px;
  border: 1px solid var(--b3-border-color);
  border-radius: 999px;
  color: var(--b3-theme-on-surface);
  background: var(--b3-theme-surface);
  font-size: 12px;
  line-height: 1.4;
}

.review-inline-card-editor__chip {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-inline-card-editor__direction {
  flex: 0 0 auto;
  color: var(--b3-theme-on-surface-light);
}

.review-inline-card-editor__content-placeholder {
  grid-row: 2;
  display: flex;
  align-items: center;
  min-height: 132px;
  padding: 12px;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  line-height: 1.5;
  border: 1px dashed var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-surface);
}

.review-inline-card-editor__content--with-context .review-inline-card-editor__content-placeholder {
  grid-row: 3;
}

.review-inline-card-editor__secondary {
  min-width: 0;
  border-top: 1px solid var(--b3-border-color);
}

.review-inline-card-editor__secondary-summary {
  display: flex;
  align-items: center;
  cursor: pointer;
  list-style: none;
}

.review-inline-card-editor__secondary-summary::-webkit-details-marker {
  display: none;
}

.review-inline-card-editor__secondary-summary::before {
  content: '';
  width: 0;
  height: 0;
  margin-right: 8px;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  border-left: 5px solid var(--b3-theme-on-surface-light);
  transition: transform 120ms ease;
}

.review-inline-card-editor__secondary[open] .review-inline-card-editor__secondary-summary::before {
  transform: rotate(90deg);
}

.review-inline-card-editor__metadata {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-surface);
}

.review-inline-card-editor__metadata :deep(.srs-editor) {
  max-height: min(520px, 56vh);
  padding: 10px;
  background: var(--b3-theme-background);
}

@media (max-width: 760px) {
  .review-inline-card-editor__header {
    flex-direction: column;
  }

  .review-inline-card-editor__body {
    max-height: min(680px, 72vh);
  }
}
</style>
