<template>
  <div class="mobile-review-launcher">
    <div class="mobile-review-launcher__sheet">
      <header class="mobile-review-launcher__header">
        <div>
          <h3 class="mobile-review-launcher__title">
            {{ t('mobileReviewLauncherTitle', '选择复习队列') }}
          </h3>
          <p class="mobile-review-launcher__hint">
            {{ t('mobileReviewLauncherHint', '点击任意队列立即开始复习') }}
          </p>
        </div>
        <button
          class="b3-button b3-button--text mobile-review-launcher__close"
          type="button"
          @click="emit('close')"
          :title="t('mobileClose', '关闭')"
        >
          <svg><use xlink:href="#iconClose"></use></svg>
        </button>
      </header>

      <div class="mobile-review-launcher__queues">
        <button
          v-for="item in queueItems"
          :key="item.id"
          class="mobile-review-launcher__queue-card b3-button b3-button--cancel"
          type="button"
          @click="emit('openQueue', item.id)"
        >
          <span class="mobile-review-launcher__queue-name">{{ item.label }}</span>
          <span class="mobile-review-launcher__queue-count">{{ item.count }} {{ t('cards', '张') }}</span>
          <span class="mobile-review-launcher__queue-hint">{{ t('mobileDirectStart', '直接开始') }}</span>
        </button>
      </div>

      <footer class="mobile-review-launcher__actions">
        <span class="mobile-review-launcher__tab-state mobile-review-launcher__tab-state--active">
          {{ t('mobileReviewTab', '复习') }}
        </span>
        <button
          class="b3-button b3-button--outline mobile-review-launcher__action"
          type="button"
          @click="emit('openBrowser')"
        >
          {{ t('mobileOpenBrowser', '浏览器') }}
        </button>
        <button
          class="b3-button b3-button--cancel mobile-review-launcher__action"
          type="button"
          @click="emit('close')"
        >
          {{ t('mobileClose', '关闭') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type MobileQueueId =
  | 'retrieval'
  | 'incremental-learning'
  | 'final-drill'
  | 'neural-roam'
  | 'filter-group';

const props = defineProps<{
  i18n?: Record<string, string>;
  counts?: Record<string, number>;
}>();

const emit = defineEmits<{
  (e: 'openQueue', queueId: MobileQueueId): void;
  (e: 'openBrowser'): void;
  (e: 'close'): void;
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function readCount(key: string): number {
  const value = props.counts?.[key];
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

const queueItems = computed(() => [
  {
    id: 'retrieval' as const,
    label: t('mobileQueueRetrieval', '提取练习'),
    count: readCount('retrieval'),
  },
  {
    id: 'incremental-learning' as const,
    label: t('mobileQueueIncremental', '渐进学习'),
    count: readCount('incremental-learning'),
  },
  {
    id: 'final-drill' as const,
    label: t('mobileQueueFinalDrill', '刻意练习'),
    count: readCount('final-drill'),
  },
  {
    id: 'neural-roam' as const,
    label: t('mobileQueueNeural', '神经漫游'),
    count: readCount('neural-roam'),
  },
  {
    id: 'filter-group' as const,
    label: t('mobileQueueFilterGroup', '筛选复习'),
    count: readCount('filter-group'),
  },
]);
</script>

<style scoped>
.mobile-review-launcher {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: stretch;
  justify-content: center;
  background: var(--b3-theme-background);
  z-index: 1;
}

.mobile-review-launcher__sheet {
  width: 100%;
  height: 100%;
  max-height: none;
  background: var(--b3-theme-background);
  border-radius: 0;
  padding: 12px;
  padding-bottom: calc(72px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mobile-review-launcher__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--b3-border-color);
}

.mobile-review-launcher__title {
  margin: 0;
  font-size: 16px;
  line-height: 1.4;
}

.mobile-review-launcher__hint {
  margin: 0;
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.mobile-review-launcher__close {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  padding: 0;
}

.mobile-review-launcher__close svg {
  width: 14px;
  height: 14px;
}

.mobile-review-launcher__queues {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  overflow: auto;
  min-height: 0;
}

.mobile-review-launcher__queue-card {
  width: 100%;
  min-height: 64px;
  justify-content: space-between;
  text-align: left;
  padding: 12px;
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas:
    'name count'
    'hint hint';
  gap: 4px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 8px;
  background: var(--b3-theme-surface);
}

.mobile-review-launcher__queue-card:first-child {
  border-color: var(--b3-theme-primary-lighter);
  background: var(--b3-theme-primary-lightest);
}

.mobile-review-launcher__queue-name {
  grid-area: name;
  font-weight: 500;
}

.mobile-review-launcher__queue-count {
  grid-area: count;
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.mobile-review-launcher__queue-hint {
  grid-area: hint;
  font-size: 12px;
  color: var(--b3-theme-primary);
}

.mobile-review-launcher__actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-columns: 0.9fr 1fr 0.8fr;
  gap: 6px;
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--b3-border-color);
  background: var(--b3-theme-background);
}

.mobile-review-launcher__tab-state,
.mobile-review-launcher__action {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.mobile-review-launcher__tab-state--active {
  border: 1px solid var(--b3-theme-primary-lighter);
  background: var(--b3-theme-primary-lightest);
  color: var(--b3-theme-primary);
  font-weight: 600;
}
</style>
