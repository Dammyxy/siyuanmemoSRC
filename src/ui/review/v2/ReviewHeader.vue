<template>
  <div class="fsrs-review-v2-header">
    <div class="fsrs-review-v2-header__left">
      <div class="fsrs-review-v2-header__stats" :title="header.stats.queueName">
        <span class="fsrs-review-v2-header__label">{{ header.stats.label }}</span>
        <span class="fn__space"></span>
        <span class="fsrs-review-v2-header__count">
          <span class="ft__primary">{{ header.stats.current }}</span>
          <span class="ft__secondary">/</span>
          <span class="ft__secondary">{{ header.stats.total }}</span>
        </span>
      </div>
    </div>

    <div class="fsrs-review-v2-header__right">
      <div class="fsrs-review-v2-header__breadcrumbs">
        <button
          v-for="(b, idx) in header.breadcrumbs"
          :key="`${idx}-${b.text}`"
          class="b3-button b3-button--small b3-button--text"
          type="button"
          @click="handleBreadcrumbClick(b)"
        >
          <span v-if="b.icon" :class="`b3-button__icon ${b.icon}`"></span>
          <span class="b3-button__text">{{ b.text }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ReviewUIState } from './types';

const props = defineProps<{
  header: ReviewUIState['header'];
}>();

const emit = defineEmits<{
  (e: 'action', actionId: string): void;
  (e: 'context', contextId: string): void;
}>();

function handleBreadcrumbClick(b: ReviewUIState['header']['breadcrumbs'][number]) {
  const action = String(b.action || '');
  if (action) {
    emit('action', action);
    return;
  }
  const id = String(b.id || '');
  if (id) emit('context', id);
}
</script>

<style scoped>
.fsrs-review-v2-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--b3-border-color);
}

.fsrs-review-v2-header__stats {
  display: flex;
  align-items: baseline;
  white-space: nowrap;
}

.fsrs-review-v2-header__label {
  font-weight: 600;
}

.fsrs-review-v2-header__breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}
</style>

