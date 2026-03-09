<template>
  <div class="fsrs-browser-hierarchy" :class="{ 'fsrs-browser-hierarchy--mobile': props.mobileMode }">
    <div class="fsrs-browser-hierarchy__section">
      <div class="fsrs-browser-hierarchy__title">{{ t('queues', 'Queues') }}</div>
      <div class="b3-list b3-list--background">
        <div
          v-for="q in queueItems"
          :key="q.id"
          class="b3-list-item"
          :class="{ 'b3-list-item--focus': queues.active === q.id }"
          @click="emit('selectQueue', q.id)"
        >
          <span class="b3-list-item__text">{{ q.label }}</span>
          <span class="b3-list-item__meta">{{ queues.counts?.[q.id] ?? 0 }}</span>
        </div>
      </div>
    </div>

    <div class="fsrs-browser-hierarchy__section">
      <div class="fsrs-browser-hierarchy__title">{{ t('all', 'All') }}</div>
      <div class="b3-list b3-list--background">
        <div class="b3-list-item" :class="{ 'b3-list-item--focus': props.activeGlobal === '__all__' }" @click="emit('selectGlobal', '__all__')">
          <span class="b3-list-item__text">{{ t('allFlashcards', 'All flashcards') }}</span>
          <span class="b3-list-item__meta">{{ globalStats.total }}</span>
        </div>
        <div class="b3-list-item" :class="{ 'b3-list-item--focus': props.activeGlobal === '__dismissed__' }" @click="emit('selectGlobal', '__dismissed__')">
          <span class="b3-list-item__text">{{ t('filterPresetSuspended', 'Suspended') }}</span>
          <span class="b3-list-item__meta">{{ globalStats.dismissed }}</span>
        </div>
      </div>
    </div>

    <div class="fsrs-browser-hierarchy__section fsrs-browser-hierarchy__section--grow">
      <div class="fsrs-browser-hierarchy__title">{{ t('documents', 'Documents') }}</div>
      <div class="b3-list b3-list--background fsrs-browser-hierarchy__docs-list">
        <div
          v-for="doc in docs"
          :key="doc.id"
          class="b3-list-item"
          @click="emit('selectDoc', doc.id)"
          @contextmenu.prevent="doc.filterable ? emit('filterDoc', doc.id) : undefined"
        >
          <span class="b3-list-item__text">{{ doc.title }}</span>
          <span class="b3-list-item__meta">{{ doc.count }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { BrowserCard } from './types';
import { getDocTree } from './browserService';

const props = defineProps<{
  cards: BrowserCard[];
  queues: { active: string; counts: Record<string, number> };
  mobileMode?: boolean;
  focusedDocIds?: string[] | null;
  globalStats: { total: number; lost: number; dismissed: number };
  activeGlobal?: '__all__' | '__dismissed__' | null;
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'selectQueue', queueId: string): void;
  (e: 'selectDoc', docId: string): void;
  (e: 'filterDoc', docId: string): void;
  (e: 'selectGlobal', type: '__all__' | '__dismissed__'): void;
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const queueItems = computed(() => [
  { id: 'retrieval', label: t('queueExtract', 'Retrieval Practice') },
  { id: 'incremental-learning', label: t('queueIncremental', 'Incremental Learning') },
  { id: 'final-drill', label: t('queueDeliberate', 'Final Drill') },
  { id: 'neural-roam', label: t('queueNeural', 'Neural Roam') },
  { id: 'filter-group', label: t('queueFilterGroup', 'Filter Group') },
]);

type HierarchyDocItem = {
  id: string;
  title: string;
  count: number;
  filterable: boolean;
};

const docs = ref<HierarchyDocItem[]>([]);
const docTitleCache = new Map<string, string>();
let docsRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let loadSeq = 0;
let lastDocIdsSignature = '';
let lastDocCountsSignature = '';

function buildDocCounts(cards: BrowserCard[], focusedDocIds?: string[] | null): Map<string, number> {
  const focusSet =
    Array.isArray(focusedDocIds) && focusedDocIds.length > 0
      ? new Set(focusedDocIds)
      : null;

  const counts = new Map<string, number>();
  for (const card of cards || []) {
    const rootId = String(card.rootId || '');
    if (!rootId) continue;
    if (focusSet && !focusSet.has(rootId)) continue;
    counts.set(rootId, (counts.get(rootId) || 0) + 1);
  }
  return counts;
}

function buildSignatures(counts: Map<string, number>): {
  ids: string[];
  idsSignature: string;
  countsSignature: string;
} {
  const ids = Array.from(counts.keys()).sort();
  return {
    ids,
    idsSignature: ids.join(','),
    countsSignature: ids.map((id) => `${id}:${counts.get(id) || 0}`).join('|'),
  };
}

function scheduleDocsRefresh(delayMs = 80): void {
  if (docsRefreshTimer) {
    clearTimeout(docsRefreshTimer);
    docsRefreshTimer = null;
  }

  docsRefreshTimer = setTimeout(() => {
    docsRefreshTimer = null;
    void refreshDocs();
  }, delayMs);
}

async function refreshDocs(): Promise<void> {
  const counts = buildDocCounts(props.cards || [], props.focusedDocIds);
  if (counts.size === 0) {
    docs.value = [];
    lastDocIdsSignature = '';
    lastDocCountsSignature = '';
    return;
  }

  const { ids, idsSignature, countsSignature } = buildSignatures(counts);
  if (idsSignature === lastDocIdsSignature && countsSignature === lastDocCountsSignature) {
    return;
  }

  const current = ++loadSeq;
  const missingIds = ids.filter((id) => !docTitleCache.has(id));
  if (missingIds.length > 0) {
    const nodes = await getDocTree(missingIds);
    if (current !== loadSeq) return;
    for (const node of nodes) {
      if (node?.id) {
        docTitleCache.set(node.id, node.title || node.id);
      }
    }
  }

  if (current !== loadSeq) {
    return;
  }

  docs.value = ids.map((id) => ({
    id,
    title: docTitleCache.get(id) || id,
    count: counts.get(id) || 0,
    filterable: true,
  }));
  lastDocIdsSignature = idsSignature;
  lastDocCountsSignature = countsSignature;
}

watch(
  [() => props.cards, () => props.focusedDocIds],
  () => {
    scheduleDocsRefresh();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  loadSeq += 1;
  if (docsRefreshTimer) {
    clearTimeout(docsRefreshTimer);
    docsRefreshTimer = null;
  }
});
</script>

<style scoped>
.fsrs-browser-hierarchy {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.fsrs-browser-hierarchy__section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fsrs-browser-hierarchy__section--grow {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.fsrs-browser-hierarchy__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--b3-theme-on-surface);
  padding: 4px 6px;
  flex-shrink: 0;
}

.fsrs-browser-hierarchy__docs-list {
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1;
  min-height: 0;
}

.fsrs-browser-hierarchy__docs-list::-webkit-scrollbar {
  width: 6px;
}

.fsrs-browser-hierarchy__docs-list::-webkit-scrollbar-track {
  background: transparent;
}

.fsrs-browser-hierarchy__docs-list::-webkit-scrollbar-thumb {
  background: var(--b3-theme-surface-light);
  border-radius: 3px;
}

.fsrs-browser-hierarchy__docs-list::-webkit-scrollbar-thumb:hover {
  background: var(--b3-theme-surface);
}

.fsrs-browser-hierarchy__hint {
  padding: 4px 6px;
  font-size: 12px;
}

.fsrs-browser-hierarchy--mobile {
  gap: 8px;
  padding: 6px;
}

.fsrs-browser-hierarchy--mobile .fsrs-browser-hierarchy__section {
  gap: 4px;
}

.fsrs-browser-hierarchy--mobile .fsrs-browser-hierarchy__title {
  font-size: 11px;
  padding: 2px 4px;
}
</style>
