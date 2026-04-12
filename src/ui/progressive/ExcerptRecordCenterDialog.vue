<template>
  <div class="excerpt-record-center">
    <header class="excerpt-record-center__toolbar">
      <div class="excerpt-record-center__filters">
        <label class="excerpt-record-center__filter">
          <span>{{ t('progressiveExcerptRecordStatusFilter', '状态') }}</span>
          <select v-model="statusFilter" class="b3-select fn__block">
            <option value="open">{{ t('progressiveExcerptRecordStatusOpen', '进行中') }}</option>
            <option value="stale">{{ t('progressiveExcerptRecordStatusStale', '已失效') }}</option>
            <option value="archived">{{ t('progressiveExcerptRecordStatusArchived', '已归档') }}</option>
            <option value="all">{{ t('progressiveExcerptRecordStatusAll', '全部') }}</option>
          </select>
        </label>

        <label class="excerpt-record-center__filter">
          <span>{{ t('progressiveExcerptRecordDocFilter', '文档') }}</span>
          <select v-model="docFilter" class="b3-select fn__block">
            <option value="">{{ t('progressiveExcerptRecordDocFilterAll', '全部文档') }}</option>
            <option
              v-for="option in sourceDocOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="excerpt-record-center__filter">
          <span>{{ t('progressiveExcerptRecordTimeFilter', '时间') }}</span>
          <select v-model="timeFilter" class="b3-select fn__block">
            <option value="all">{{ t('progressiveExcerptRecordTimeAll', '全部时间') }}</option>
            <option value="today">{{ t('progressiveExcerptRecordTimeToday', '今天') }}</option>
            <option value="7d">{{ t('progressiveExcerptRecordTime7d', '近 7 天') }}</option>
            <option value="30d">{{ t('progressiveExcerptRecordTime30d', '近 30 天') }}</option>
          </select>
        </label>
      </div>

      <div class="excerpt-record-center__toolbar-actions">
        <button class="b3-button b3-button--cancel" :disabled="loading" @click="emit('refresh')">
          {{ t('refresh', '刷新') }}
        </button>
        <button class="b3-button b3-button--text" @click="emit('close')">
          {{ t('close', '关闭') }}
        </button>
      </div>
    </header>

    <div class="excerpt-record-center__summary">
      <span>{{ t('progressiveExcerptRecordCount', '记录数') }}: {{ filteredRecords.length }}</span>
      <span v-if="loading">{{ t('progressiveExcerptRecordLoading', '正在刷新摘录记录…') }}</span>
    </div>

    <div v-if="filteredRecords.length === 0" class="excerpt-record-center__empty">
      {{ loading
        ? t('progressiveExcerptRecordLoading', '正在刷新摘录记录…')
        : t('progressiveExcerptRecordEmpty', '还没有符合筛选条件的摘录记录') }}
    </div>

    <div v-else class="excerpt-record-center__list">
      <article
        v-for="record in filteredRecords"
        :key="record.recordId"
        class="excerpt-record-center__item"
      >
        <div class="excerpt-record-center__item-header">
          <div class="excerpt-record-center__meta">
            <span class="excerpt-record-center__status" :data-status="record.status">
              {{ renderStatus(record.status) }}
            </span>
            <strong class="excerpt-record-center__title">
              {{ record.sourceDocTitle || record.sourceDocId }}
            </strong>
          </div>
          <time class="excerpt-record-center__time">{{ formatTimestamp(record.createdAt) }}</time>
        </div>

        <p class="excerpt-record-center__text">{{ record.selectedText }}</p>

        <div class="excerpt-record-center__details">
          <span>{{ t('progressiveExcerptRecordSourceBlock', '来源块') }}: {{ record.sourceBlockId }}</span>
          <span>{{ t('progressiveExcerptRecordExcerptEntity', '摘录实体') }}: {{ record.excerptEntityId }}</span>
        </div>

        <div class="excerpt-record-center__actions">
          <button class="b3-button b3-button--cancel" @click="emit('openSource', record.recordId)">
            {{ t('progressiveExcerptRecordOpenSource', '打开原文') }}
          </button>
          <button class="b3-button b3-button--cancel" @click="emit('openExcerpt', record.recordId)">
            {{ t('progressiveExcerptRecordOpenExcerpt', '打开摘录') }}
          </button>
          <button
            v-if="record.status !== 'archived'"
            class="b3-button b3-button--cancel"
            @click="emit('archiveRecord', record.recordId)"
          >
            {{ t('progressiveExcerptRecordArchive', '归档') }}
          </button>
          <button class="b3-button b3-button--text" @click="emit('deleteRecord', record.recordId)">
            {{ t('delete', '删除') }}
          </button>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ExcerptRecord } from '@/application/services/ExcerptRecordService';

type ExcerptRecordCenterItem = ExcerptRecord & {
  sourceDocTitle?: string;
};

const props = defineProps<{
  i18n?: Record<string, string>;
  state?: {
    loading?: boolean;
    records?: ExcerptRecordCenterItem[];
  };
}>();

const emit = defineEmits<{
  refresh: [];
  close: [];
  openSource: [recordId: string];
  openExcerpt: [recordId: string];
  archiveRecord: [recordId: string];
  deleteRecord: [recordId: string];
}>();

const statusFilter = ref<'open' | 'stale' | 'archived' | 'all'>('open');
const docFilter = ref('');
const timeFilter = ref<'all' | 'today' | '7d' | '30d'>('all');

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const records = computed(() => props.state?.records || []);
const loading = computed(() => props.state?.loading === true);

const sourceDocOptions = computed(() => {
  const options = new Map<string, string>();
  for (const record of records.value) {
    options.set(record.sourceDocId, record.sourceDocTitle || record.sourceDocId);
  }
  return Array.from(options.entries())
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([value, label]) => ({ value, label }));
});

const filteredRecords = computed(() => {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const timeLowerBound = (() => {
    switch (timeFilter.value) {
      case 'today':
        return todayStart.getTime();
      case '7d':
        return now - 7 * 24 * 60 * 60 * 1000;
      case '30d':
        return now - 30 * 24 * 60 * 60 * 1000;
      default:
        return 0;
    }
  })();

  return records.value.filter((record) => {
    if (statusFilter.value === 'open' && !(record.status === 'active' || record.status === 'stale')) {
      return false;
    }
    if (statusFilter.value === 'stale' && record.status !== 'stale') {
      return false;
    }
    if (statusFilter.value === 'archived' && record.status !== 'archived') {
      return false;
    }
    if (docFilter.value && record.sourceDocId !== docFilter.value) {
      return false;
    }
    if (timeLowerBound > 0 && record.createdAt < timeLowerBound) {
      return false;
    }
    return true;
  });
});

function renderStatus(status: ExcerptRecord['status']): string {
  switch (status) {
    case 'stale':
      return t('progressiveExcerptRecordStatusStale', '已失效');
    case 'archived':
      return t('progressiveExcerptRecordStatusArchived', '已归档');
    default:
      return t('progressiveExcerptRecordStatusActive', '进行中');
  }
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}
</script>

<style scoped>
.excerpt-record-center {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  padding: 16px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
}

.excerpt-record-center__toolbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.excerpt-record-center__filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  flex: 1;
}

.excerpt-record-center__filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 180px;
}

.excerpt-record-center__toolbar-actions {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.excerpt-record-center__summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.excerpt-record-center__empty {
  display: grid;
  place-items: center;
  min-height: 180px;
  border: 1px dashed var(--b3-border-color);
  border-radius: 12px;
  color: var(--b3-theme-on-surface-light);
}

.excerpt-record-center__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: auto;
}

.excerpt-record-center__item {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--b3-border-color);
  border-radius: 14px;
  background: var(--b3-theme-surface);
}

.excerpt-record-center__item-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.excerpt-record-center__meta {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.excerpt-record-center__status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--b3-theme-background-light);
}

.excerpt-record-center__status[data-status='active'] {
  background: color-mix(in srgb, var(--b3-font-background4) 48%, transparent);
}

.excerpt-record-center__status[data-status='stale'] {
  background: color-mix(in srgb, var(--b3-card-warning-color) 28%, transparent);
}

.excerpt-record-center__status[data-status='archived'] {
  background: color-mix(in srgb, var(--b3-theme-on-surface-light) 18%, transparent);
}

.excerpt-record-center__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.excerpt-record-center__time {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
  white-space: nowrap;
}

.excerpt-record-center__text {
  margin: 0;
  line-height: 1.6;
  white-space: pre-wrap;
}

.excerpt-record-center__details {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
  word-break: break-all;
}

.excerpt-record-center__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 720px) {
  .excerpt-record-center {
    padding: 12px;
  }

  .excerpt-record-center__item-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
