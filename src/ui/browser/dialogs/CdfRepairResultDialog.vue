<template>
  <section class="browser-cdf-repair-result" data-testid="browser-cdf-repair-result-dialog">
    <header class="browser-cdf-repair-result__header">
      <h3 class="browser-cdf-repair-result__title">{{ viewModel.title }}</h3>
      <p class="browser-cdf-repair-result__status">{{ viewModel.statusLine }}</p>
    </header>

    <div class="browser-cdf-repair-result__summary" aria-label="CDF repair result summary">
      <div
        v-for="item in viewModel.summaryItems"
        :key="item.key"
        class="browser-cdf-repair-result__summary-item"
        :data-kind="item.key"
        data-testid="browser-cdf-repair-summary-item"
      >
        <span class="browser-cdf-repair-result__summary-count">{{ item.count }}</span>
        <span class="browser-cdf-repair-result__summary-label">{{ item.label }}</span>
      </div>
    </div>

    <section class="browser-cdf-repair-result__details">
      <details
        v-for="group in viewModel.detailGroups"
        :key="group.key"
        class="browser-cdf-repair-result__detail-group"
        data-testid="browser-cdf-repair-detail-group"
        open
      >
        <summary class="browser-cdf-repair-result__detail-summary">
          <span>{{ group.title }}</span>
          <span class="browser-cdf-repair-result__detail-summary-count">{{ group.summary }}</span>
          <span
            v-if="group.previewOnly"
            class="browser-cdf-repair-result__detail-preview"
          >
            {{ viewModel.previewOnlyLabel }}
          </span>
        </summary>
        <ul v-if="group.items.length > 0" class="browser-cdf-repair-result__detail-list">
          <li
            v-for="item in group.items"
            :key="item.key"
            class="browser-cdf-repair-result__detail-item"
            :data-kind="item.kind"
          >
            <span class="browser-cdf-repair-result__detail-label">{{ item.label }}</span>
            <span class="browser-cdf-repair-result__detail-text">{{ item.text }}</span>
          </li>
        </ul>
        <p v-else class="browser-cdf-repair-result__empty-detail">{{ viewModel.noDetailsLabel }}</p>
      </details>
      <p
        v-if="viewModel.detailGroups.length === 0"
        class="browser-cdf-repair-result__empty-detail"
      >
        {{ viewModel.noDetailsLabel }}
      </p>
    </section>

    <footer class="browser-cdf-repair-result__actions">
      <button
        v-for="action in viewModel.actions"
        :key="action.id"
        type="button"
        class="b3-button b3-button--text"
        @click="emit(action.id)"
      >
        {{ action.label }}
      </button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import type { BrowserCdfRepairResultViewModel } from '../browserCdfRepairResultPresentation';

defineProps<{
  viewModel: BrowserCdfRepairResultViewModel;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();
</script>

<style scoped>
.browser-cdf-repair-result {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 12px;
  height: 100%;
  min-width: 0;
  padding: 14px;
  color: var(--b3-theme-on-background);
  background: var(--b3-theme-background);
}

.browser-cdf-repair-result__header {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.browser-cdf-repair-result__title {
  margin: 0;
  color: var(--b3-theme-on-background);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
}

.browser-cdf-repair-result__status {
  margin: 0;
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  line-height: 1.45;
}

.browser-cdf-repair-result__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 8px;
}

.browser-cdf-repair-result__summary-item {
  display: grid;
  gap: 2px;
  min-height: 48px;
  padding: 8px 9px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-surface);
}

.browser-cdf-repair-result__summary-count {
  color: var(--b3-theme-primary);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.15;
}

.browser-cdf-repair-result__summary-label,
.browser-cdf-repair-result__detail-label,
.browser-cdf-repair-result__detail-summary-count,
.browser-cdf-repair-result__detail-preview {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
  line-height: 1.45;
}

.browser-cdf-repair-result__details {
  min-height: 0;
  overflow: auto;
}

.browser-cdf-repair-result__detail-group {
  margin-bottom: 8px;
  overflow: hidden;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
}

.browser-cdf-repair-result__detail-summary {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 34px;
  padding: 8px 10px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-background);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
}

.browser-cdf-repair-result__detail-summary span:first-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.browser-cdf-repair-result__detail-summary-count,
.browser-cdf-repair-result__detail-preview {
  flex: 0 0 auto;
  margin-left: auto;
  font-weight: 500;
}

.browser-cdf-repair-result__detail-preview {
  margin-left: 0;
  padding: 1px 6px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-background);
}

.browser-cdf-repair-result__detail-list {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.browser-cdf-repair-result__detail-item {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid color-mix(in srgb, var(--b3-border-color) 72%, transparent);
}

.browser-cdf-repair-result__detail-text,
.browser-cdf-repair-result__empty-detail {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--b3-theme-on-background);
  font-size: 12px;
  line-height: 1.5;
}

.browser-cdf-repair-result__empty-detail {
  margin: 0;
  padding: 10px;
  color: var(--b3-theme-on-surface-light);
}

.browser-cdf-repair-result__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 2px;
}

@media (max-width: 560px) {
  .browser-cdf-repair-result {
    padding: 10px;
  }

  .browser-cdf-repair-result__detail-summary {
    flex-wrap: wrap;
  }

  .browser-cdf-repair-result__detail-summary-count {
    margin-left: 0;
  }

  .browser-cdf-repair-result__detail-item {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
