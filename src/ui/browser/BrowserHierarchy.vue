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

    <!-- ✅ 新增：【全部】区 -->
    <div class="fsrs-browser-hierarchy__section">
      <div class="fsrs-browser-hierarchy__title">{{ t('all', '全部') }}</div>
      <div class="b3-list b3-list--background">
        <div
          class="b3-list-item"
          @click="emit('selectGlobal', '__all__')"
        >
          <span class="b3-list-item__text">{{ t('allFlashcards', '全部闪卡') }}</span>
          <span class="b3-list-item__meta">{{ globalStats.total }}</span>
        </div>
        <div
          class="b3-list-item"
          @click="emit('selectGlobal', '__lost__')"
        >
          <span class="b3-list-item__text">{{ t('lostFlashcards', '丢失/关闭闪卡') }}</span>
          <span class="b3-list-item__meta">{{ globalStats.lost }}</span>
        </div>
      </div>
    </div>

    <div class="fsrs-browser-hierarchy__section fsrs-browser-hierarchy__section--grow">
      <div class="fsrs-browser-hierarchy__title">{{ t('documents', '文档') }}</div>
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
import { computed, ref, watchEffect } from 'vue';
import type { BrowserCard } from './types';
import { getDocTree } from './browserService';

const props = defineProps<{
  cards: BrowserCard[];
  queues: { active: string; counts: Record<string, number> };
  focusedDocIds?: string[] | null;  // ✅ 四重筛选：聚焦的文档 ID 列表
  globalStats: { total: number; lost: number };  // ✅ 全局统计（【全部】区使用）
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'selectQueue', queueId: string): void;
  (e: 'selectDoc', docId: string): void;
  (e: 'filterDoc', docId: string): void;
  (e: 'selectGlobal', type: '__all__' | '__lost__'): void;  // ✅ 新增：【全部】区事件
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const queueItems = computed(() => [
  { id: 'retrieval', label: t('queueExtract', 'Retrieval Practice') },
  { id: 'incremental-learning', label: t('queueIncremental', 'Incremental Learning') },
  { id: 'final-drill', label: t('queueDeliberate', '刻意练习') },
  { id: 'neural-roam', label: t('queueNeural', '神经漫游') },
  { id: 'filter-group', label: t('queueFilterGroup', '筛选复习') },
]);

const docs = ref<Array<{ id: string; title: string; count: number; filterable: boolean }>>([]);
let loadSeq = 0;

watchEffect(() => {
  const cards = props.cards || [];

  // ✅ 四重筛选：队列聚焦文档
  // 如果有聚焦的文档列表，只统计和加载这些文档
  const focusedIds = props.focusedDocIds;
  
  // ✅ 调试日志：记录接收到的数据
  console.log('[SiYuanMemo][BrowserHierarchy] 🔍 watchEffect triggered:', {
    cardsCount: cards.length,
    focusedIds,
    sampleCards: cards.slice(0, 3).map(c => ({ blockId: c.blockId, rootId: c.rootId })),
  });
  
  const filteredCards = focusedIds
    ? cards.filter(c => focusedIds.includes(c.rootId || ''))
    : cards;
  
  console.log('[SiYuanMemo][BrowserHierarchy] 🔍 After filtering:', {
    filteredCardsCount: filteredCards.length,
    sampleFiltered: filteredCards.slice(0, 3).map(c => ({ blockId: c.blockId, rootId: c.rootId })),
  });

  // 计算文档统计
  const counts = new Map<string, number>();
  for (const c of filteredCards) {
    const rid = String(c.rootId || '');
    if (!rid) continue;
    counts.set(rid, (counts.get(rid) || 0) + 1);
  }
  const ids = Array.from(counts.keys());
  const current = ++loadSeq;
  
  console.log('[SiYuanMemo][BrowserHierarchy] 🔍 Document IDs to load:', {
    idsCount: ids.length,
    ids,
    counts: Object.fromEntries(counts),
  });

  void (async () => {
    const nodes = await getDocTree(ids);
    if (current !== loadSeq) return;
    
    console.log('[SiYuanMemo][BrowserHierarchy] 🔍 getDocTree returned:', {
      nodesCount: nodes.length,
      nodes: nodes.map(n => ({ id: n.id, title: n.title })),
    });
    
    // ✅ 只包含普通文档，"全部闪卡"和"丢失/关闭闪卡"已移至【全部】区
    docs.value = nodes.map((n) => ({
      id: n.id,
      title: n.title,
      count: counts.get(n.id) || 0,
      filterable: true
    }));
    
    console.log('[SiYuanMemo][BrowserHierarchy] ✅ docs.value updated:', {
      docsCount: docs.value.length,
      docs: docs.value,
    });
  })();
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
  min-height: 0;  /* ✅ 允许 flex 子元素缩小 */
  display: flex;
  flex-direction: column;
}

.fsrs-browser-hierarchy__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--b3-theme-on-surface);
  padding: 4px 6px;
  flex-shrink: 0;  /* ✅ 防止标题被压缩 */
}

.fsrs-browser-hierarchy__docs-list {
  overflow-y: auto;  /* ✅ 添加垂直滚动条 */
  overflow-x: hidden;
  flex: 1;  /* ✅ 填充剩余空间 */
  min-height: 0;  /* ✅ 允许缩小 */
}

/* ✅ 自定义滚动条样式（Webkit 浏览器） */
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
</style>
