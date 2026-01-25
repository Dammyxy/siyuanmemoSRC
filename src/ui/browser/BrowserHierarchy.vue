<template>
  <div class="fsrs-browser-hierarchy">
    <div class="fsrs-browser-hierarchy__section">
      <div class="fsrs-browser-hierarchy__title">{{ t('queues', '队列') }}</div>
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
      <div class="fsrs-browser-hierarchy__title">{{ t('documents', '文档') }}</div>
      <div class="b3-list b3-list--background">
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
      <div class="fsrs-browser-hierarchy__hint ft__secondary">
        {{ t('hierarchyHint', '右键文档：按 doc:xxx 筛选') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import type { BrowserCard } from './types';
import { getDocTree } from './browserService';

const props = defineProps<{
  cards: BrowserCard[];
  queues: { active: string; counts: Record<string, number> };
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'selectQueue', queueId: string): void;
  (e: 'selectDoc', docId: string): void;
  (e: 'filterDoc', docId: string): void;
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const queueItems = computed(() => [
  { id: 'final-drill', label: t('queueDeliberate', '刻意练习') },
  { id: 'neural-roam', label: t('queueNeural', '神经漫游') },
  { id: 'filter-group', label: t('queueFilterGroup', '筛选复习') },
]);

const docs = ref<Array<{ id: string; title: string; count: number; filterable: boolean }>>([]);
let loadSeq = 0;

watchEffect(() => {
  const cards = props.cards || [];
  const counts = new Map<string, number>();
  for (const c of cards) {
    const rid = String((c as any)?.rootId || '');
    if (!rid) continue;
    counts.set(rid, (counts.get(rid) || 0) + 1);
  }
  const ids = Array.from(counts.keys());
  const current = ++loadSeq;
  void (async () => {
    const nodes = await getDocTree(ids);
    if (current !== loadSeq) return;
    const total = cards.length;
    const lost = cards.filter((c) => !String((c as any)?.rootId || '')).length;
    docs.value = [
      { id: '__all__', title: t('allFlashcards', '全部闪卡'), count: total, filterable: false },
      { id: '__lost__', title: t('lostFlashcards', '丢失/关闭闪卡'), count: lost, filterable: false },
      ...nodes.map((n) => ({ id: n.id, title: n.title, count: counts.get(n.id) || 0, filterable: true })),
    ];
  })();
});
</script>

<style scoped>
.fsrs-browser-hierarchy {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fsrs-browser-hierarchy__section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fsrs-browser-hierarchy__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--b3-theme-on-surface);
  padding: 4px 6px;
}

.fsrs-browser-hierarchy__hint {
  padding: 4px 6px;
  font-size: 12px;
}
</style>
