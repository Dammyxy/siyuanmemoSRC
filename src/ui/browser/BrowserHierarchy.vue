<template>
  <BrowserSidebar
    :sections="sections"
    :active="{ kind: 'queue', id: props.queues?.active || '' }"
    @activate="handleActivate"
    @dblclick="handleDblClick"
    @contextMenu="handleContextMenu"
    @select="handleSelectionChange"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BrowserCard } from './types';
import { getDocTree } from './browserService';
import BrowserSidebar from './sidebar/BrowserSidebar.vue';
import type { SidebarNode, SidebarSection, SidebarSelection } from './sidebar/types';

const props = defineProps<{
  cards: BrowserCard[];
  queues: { active: string; counts: Record<string, number> };
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'selectQueue', queueId: string): void;
  (e: 'selectDoc', docId: string): void;
  (e: 'filterDoc', docId: string): void;
  (e: 'contextMenu', payload: { kind: string; id: string; event: MouseEvent }): void;
  (e: 'selectionChange', payload: { kind: string; ids: string[] }): void;
}>();

const t = (key: string, fallback: string) => (props.i18n?.[key] as string) || fallback;

const queueNodes = computed(() => {
  const counts = props.queues?.counts || {};
  return [
    {
      id: 'final-drill',
      kind: 'queue',
      icon: '🎯',
      label: t('queueDeliberate', 'Deliberate Practice'),
      count: counts['final-drill'] || 0,
    },
    {
      id: 'neural-wandering',
      kind: 'queue',
      icon: '🌪️',
      label: t('queueNeural', 'Neural Wandering'),
      count: counts['neural-wandering'] || 0,
    },
    {
      id: 'filter-group',
      kind: 'queue',
      icon: '🔍',
      label: t('queueFilterGroup', 'Filter Group'),
      count: counts['filter-group'] || 0,
    },
  ];
});

const docs = ref<Array<{ id: string; title: string; count: number }>>([]);

watch(
  () => props.cards,
  async () => {
    const rootIds = Array.from(
      new Set((props.cards || []).map((c) => c.rootId).filter(Boolean) as string[]),
    );
    const docNodes = await getDocTree(rootIds);
    const countMap = new Map<string, number>();
    for (const c of props.cards || []) {
      const id = c.rootId;
      if (!id) continue;
      countMap.set(id, (countMap.get(id) || 0) + 1);
    }
    docs.value = docNodes
      .map((d) => ({ id: d.id, title: d.title, count: countMap.get(d.id) || 0 }))
      .sort((a, b) => b.count - a.count);
  },
  { immediate: true },
);

const sections = computed<SidebarSection[]>(() => {
  const queueSection: SidebarSection = {
    id: 'queues',
    title: t('hierarchyQueues', 'Queues'),
    nodes: (queueNodes.value || []).map((q: any) => ({
      id: String(q.id),
      kind: 'queue',
      label: String(q.label),
      icon: String(q.icon || ''),
      count: Number(q.count) || 0,
    })),
  };
  const docSection: SidebarSection = {
    id: 'library',
    title: t('hierarchyLibrary', 'Library'),
    nodes: (docs.value || []).map((d) => ({
      id: d.id,
      kind: 'doc',
      label: d.title,
      icon: '📄',
      count: d.count,
    })),
  };
  return [queueSection, docSection];
});

function handleSelectionChange(selection: SidebarSelection) {
  emit('selectionChange', selection);
}

function handleActivate(payload: { node: SidebarNode; selection: SidebarSelection }) {
  const kind = String(payload.node.kind);
  const id = String(payload.node.id);
  if (kind === 'queue') emit('selectQueue', id);
  if (kind === 'doc') emit('selectDoc', id);
}

function handleDblClick(payload: { node: SidebarNode; selection: SidebarSelection }) {
  const kind = String(payload.node.kind);
  if (kind !== 'doc') return;
  emit('filterDoc', String(payload.node.id));
}

function handleContextMenu(payload: { node: SidebarNode; event: MouseEvent; selection: SidebarSelection }) {
  emit('contextMenu', { kind: String(payload.node.kind), id: String(payload.node.id), event: payload.event });
}
</script>

<style scoped>
.browser-hierarchy {
  height: 100%;
  overflow: auto;
  padding: 8px;
  border-right: 1px solid var(--b3-border-color);
  background: var(--b3-theme-background);
}

.browser-hierarchy__section + .browser-hierarchy__section {
  margin-top: 12px;
}

.browser-hierarchy__section-title {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
  padding: 6px 6px;
}

.browser-hierarchy__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.browser-hierarchy__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
}

.browser-hierarchy__row:hover {
  background: var(--b3-list-hover);
}

.browser-hierarchy__row--active {
  background: var(--b3-list-hover);
  outline: 1px solid var(--b3-theme-primary-light);
}

.browser-hierarchy__row--selected {
  background: var(--b3-list-hover);
  outline: 1px solid var(--b3-theme-primary);
}

.browser-hierarchy__icon {
  width: 18px;
  text-align: center;
}

.browser-hierarchy__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browser-hierarchy__count {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}
</style>
