<template>
  <div class="browser-hierarchy">
    <div v-for="section in sections" :key="section.id" class="browser-hierarchy__section">
      <div class="browser-hierarchy__section-title">
        {{ section.title }}
      </div>
      <div class="browser-hierarchy__list">
        <div
          v-for="node in section.nodes"
          :key="`${section.id}:${node.kind}:${node.id}`"
          class="browser-hierarchy__row"
          :class="rowClass(node)"
          @click="onClickNode($event, node)"
          @dblclick="onDblClick(node)"
          @contextmenu.prevent="onContextMenu($event, node)"
        >
          <span class="browser-hierarchy__icon">{{ node.icon || '' }}</span>
          <span class="browser-hierarchy__label">{{ node.label }}</span>
          <span class="browser-hierarchy__count">{{ node.count ?? 0 }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { SidebarNode, SidebarSection, SidebarSelection } from './types';

const props = defineProps<{
  sections: SidebarSection[];
  active?: { kind: string; id: string } | null;
}>();

const emit = defineEmits<{
  (e: 'select', selection: SidebarSelection): void;
  (e: 'activate', payload: { node: SidebarNode; selection: SidebarSelection }): void;
  (e: 'dblclick', payload: { node: SidebarNode; selection: SidebarSelection }): void;
  (e: 'contextMenu', payload: { node: SidebarNode; event: MouseEvent; selection: SidebarSelection }): void;
}>();

const selected = ref<SidebarSelection>({ kind: '', ids: [] });
const lastSelectedIndex = ref<number | null>(null);

const selectableOrder = computed(() => {
  const keys: Array<{ kind: string; id: string }> = [];
  for (const section of props.sections || []) {
    for (const node of section.nodes || []) {
      keys.push({ kind: String(node.kind), id: String(node.id) });
    }
  }
  return keys;
});

function rowClass(node: SidebarNode) {
  const kind = String(node.kind);
  const id = String(node.id);
  const isActive = Boolean(props.active && props.active.kind === kind && props.active.id === id);
  const isSelected = selected.value.kind === kind && selected.value.ids.includes(id);
  return {
    'browser-hierarchy__row--active': isActive,
    'browser-hierarchy__row--selected': isSelected,
  };
}

function setSelection(kind: string, ids: string[]) {
  selected.value = { kind, ids };
  emit('select', selected.value);
}

function onClickNode(ev: MouseEvent, node: SidebarNode) {
  const kind = String(node.kind);
  const id = String(node.id);
  const order = selectableOrder.value;
  const idx = order.findIndex((x) => x.kind === kind && x.id === id);
  if (idx === -1) return;

  if (ev.shiftKey && selected.value.kind === kind && lastSelectedIndex.value !== null) {
    const start = Math.min(lastSelectedIndex.value, idx);
    const end = Math.max(lastSelectedIndex.value, idx);
    const ids = order
      .slice(start, end + 1)
      .filter((x) => x.kind === kind)
      .map((x) => x.id);
    setSelection(kind, ids);
  } else if (ev.ctrlKey || ev.metaKey) {
    if (selected.value.kind !== kind) {
      setSelection(kind, [id]);
    } else {
      const set = new Set(selected.value.ids);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      setSelection(kind, Array.from(set));
    }
    lastSelectedIndex.value = idx;
  } else {
    setSelection(kind, [id]);
    lastSelectedIndex.value = idx;
  }

  emit('activate', { node, selection: selected.value });
}

function onDblClick(node: SidebarNode) {
  emit('dblclick', { node, selection: selected.value });
}

function onContextMenu(ev: MouseEvent, node: SidebarNode) {
  const kind = String(node.kind);
  const id = String(node.id);
  if (!(selected.value.kind === kind && selected.value.ids.includes(id))) {
    setSelection(kind, [id]);
  }
  emit('contextMenu', { node, event: ev, selection: selected.value });
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
