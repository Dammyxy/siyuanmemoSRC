<template>
  <section class="review-cdf-relation-preview" data-testid="review-cdf-relation-preview-dialog">
    <div class="review-cdf-relation-preview__summary" aria-label="Relation change summary">
      <div
        v-for="item in visibleSummary"
        :key="item.key"
        class="review-cdf-relation-preview__summary-item"
        :data-kind="item.key"
      >
        <span class="review-cdf-relation-preview__summary-count">{{ item.count }}</span>
        <span class="review-cdf-relation-preview__summary-label">{{ item.label }}</span>
      </div>
    </div>

    <div class="review-cdf-relation-preview__impact">
      <div class="review-cdf-relation-preview__impact-row">
        <span class="review-cdf-relation-preview__impact-label">{{ currentImpactLabel }}</span>
        <span class="review-cdf-relation-preview__impact-value">{{ currentImpact }}</span>
      </div>
      <div class="review-cdf-relation-preview__impact-row">
        <span class="review-cdf-relation-preview__impact-label">{{ sessionImpactLabel }}</span>
        <span class="review-cdf-relation-preview__impact-value">{{ sessionImpact }}</span>
      </div>
    </div>

    <details class="review-cdf-relation-preview__details">
      <summary>{{ detailsLabel }}</summary>
      <ul v-if="details.length > 0" class="review-cdf-relation-preview__detail-list">
        <li
          v-for="(detail, index) in details"
          :key="`${detail.kind}-${index}`"
          class="review-cdf-relation-preview__detail-item"
        >
          <span class="review-cdf-relation-preview__detail-kind">{{ detail.kind }}</span>
          <span class="review-cdf-relation-preview__detail-text">{{ detail.text }}</span>
        </li>
      </ul>
      <p v-else class="review-cdf-relation-preview__empty-detail">{{ noDetailsLabel }}</p>
    </details>

    <footer class="review-cdf-relation-preview__actions">
      <button class="b3-button b3-button--cancel" type="button" @click="emit('cancel')">
        {{ cancelLabel }}
      </button>
      <button class="b3-button b3-button--text" type="button" @click="emit('confirm')">
        {{ confirmLabel }}
      </button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface ReviewCdfRelationPreviewSummaryItem {
  key: string;
  label: string;
  count: number;
}

interface ReviewCdfRelationPreviewDetailItem {
  kind: string;
  text: string;
}

const props = withDefaults(defineProps<{
  summary: ReviewCdfRelationPreviewSummaryItem[];
  currentImpact: string;
  sessionImpact: string;
  details: ReviewCdfRelationPreviewDetailItem[];
  currentImpactLabel?: string;
  sessionImpactLabel?: string;
  detailsLabel?: string;
  noDetailsLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}>(), {
  currentImpactLabel: 'Current card',
  sessionImpactLabel: 'Session',
  detailsLabel: 'Details',
  noDetailsLabel: 'No details',
  confirmLabel: 'Save',
  cancelLabel: 'Cancel',
});

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const visibleSummary = computed(() => props.summary.filter(item => item.count > 0));
</script>

<style scoped>
.review-cdf-relation-preview {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 12px;
  height: 100%;
  padding: 12px;
  color: var(--b3-theme-on-background);
  background: var(--b3-theme-background);
}

.review-cdf-relation-preview__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: 8px;
}

.review-cdf-relation-preview__summary-item {
  display: grid;
  gap: 2px;
  min-height: 54px;
  padding: 8px 10px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-surface);
}

.review-cdf-relation-preview__summary-count {
  color: var(--b3-theme-primary);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

.review-cdf-relation-preview__summary-label,
.review-cdf-relation-preview__impact-label,
.review-cdf-relation-preview__detail-kind {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  line-height: 1.45;
}

.review-cdf-relation-preview__impact {
  display: grid;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: color-mix(in srgb, var(--b3-theme-surface) 76%, var(--b3-theme-background) 24%);
}

.review-cdf-relation-preview__impact-row {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.review-cdf-relation-preview__impact-value,
.review-cdf-relation-preview__detail-text,
.review-cdf-relation-preview__empty-detail {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--b3-theme-on-background);
  font-size: 12px;
  line-height: 1.5;
}

.review-cdf-relation-preview__details {
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
}

.review-cdf-relation-preview__details summary {
  position: sticky;
  top: 0;
  padding: 8px 10px;
  border-bottom: 1px solid var(--b3-border-color);
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-background);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.review-cdf-relation-preview__detail-list {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.review-cdf-relation-preview__detail-item {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--b3-border-color) 72%, transparent);
}

.review-cdf-relation-preview__detail-item:last-child {
  border-bottom: none;
}

.review-cdf-relation-preview__empty-detail {
  margin: 0;
  padding: 10px;
  color: var(--b3-theme-on-surface-light);
}

.review-cdf-relation-preview__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

@media (max-width: 560px) {
  .review-cdf-relation-preview__impact-row,
  .review-cdf-relation-preview__detail-item {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
