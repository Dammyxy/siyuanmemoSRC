<template>
  <div class="direction-control-panel" :class="{ collapsed: isCollapsed }">
    <div class="panel-header">
      <span class="panel-title">{{ t('directionControl', '漫游方向') }}</span>
      <button
        class="btn-toggle"
        @click="toggleCollapse"
        :title="isCollapsed ? t('expand', '展开') : t('collapse', '收起')"
      >
        <span class="icon">{{ isCollapsed ? '▸' : '▾' }}</span>
      </button>
    </div>

    <div v-show="!isCollapsed" class="panel-content">
      <div class="direction-list">
        <label
          v-for="direction in availableDirections"
          :key="direction"
          class="direction-item"
        >
          <input
            type="checkbox"
            :value="direction"
            :checked="selectedDirectionsSet.has(direction)"
            @change="handleDirectionChange(direction, ($event.target as HTMLInputElement).checked)"
          />
          <span class="direction-label">{{ getDirectionLabel(direction) }}</span>
          <span class="direction-count" v-if="directionCounts[direction]">
            ({{ directionCounts[direction] }})
          </span>
        </label>
      </div>

      <div v-if="showWarning" class="warning-message">
        <span class="warning-icon">!</span>
        <span>{{ t('selectAtLeastOne', '请至少选择一个漫游方向') }}</span>
      </div>

      <div class="panel-actions">
        <button class="btn-select-all" @click="selectAll">
          {{ t('selectAll', '全选') }}
        </button>
        <button class="btn-clear-all" @click="clearAll">
          {{ t('clearAll', '清空') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { AssociationType } from '../types/graph';

const props = defineProps<{
  availableDirections: AssociationType[];
  selectedDirections: Set<AssociationType>;
  collapsed?: boolean;
  directionCounts?: Record<AssociationType, number>;
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'direction-change', directions: Set<AssociationType>): void;
  (e: 'toggle-collapse'): void;
}>();

const isCollapsed = ref(props.collapsed || false);
const selectedDirectionsSet = ref(new Set(props.selectedDirections));
const showWarning = ref(false);

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

function getDirectionLabel(direction: AssociationType): string {
  const labels: Record<AssociationType, string> = {
    [AssociationType.REF_LINK]: t('refLink', '链接关系'),
    [AssociationType.HIERARCHY]: t('hierarchy', '层级关系'),
    [AssociationType.TAG]: t('tag', '标签关系'),
    [AssociationType.SIBLING]: t('sibling', '兄弟块'),
  };
  return labels[direction] || direction;
}

function handleDirectionChange(direction: AssociationType, checked: boolean) {
  const newSet = new Set(selectedDirectionsSet.value);

  if (checked) {
    newSet.add(direction);
    showWarning.value = false;
  } else {
    newSet.delete(direction);

    if (newSet.size === 0) {
      showWarning.value = true;
      return;
    }
  }

  selectedDirectionsSet.value = newSet;
  emit('direction-change', newSet);
}

function selectAll() {
  const newSet = new Set(props.availableDirections);
  selectedDirectionsSet.value = newSet;
  showWarning.value = false;
  emit('direction-change', newSet);
}

function clearAll() {
  const firstDirection = props.availableDirections[0];
  const newSet = new Set([firstDirection]);
  selectedDirectionsSet.value = newSet;
  showWarning.value = false;
  emit('direction-change', newSet);
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value;
  emit('toggle-collapse');
}

watch(
  () => props.selectedDirections,
  (newDirections) => {
    selectedDirectionsSet.value = new Set(newDirections);
  },
  { deep: true }
);

watch(
  () => props.collapsed,
  (newCollapsed) => {
    if (newCollapsed !== undefined) {
      isCollapsed.value = newCollapsed;
    }
  }
);
</script>

<style scoped>
.direction-control-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--b3-theme-on-surface);
}

.panel-title {
  font-weight: 600;
}

.btn-toggle {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--b3-theme-on-surface-light);
}

.panel-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.direction-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
}

.direction-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--b3-theme-on-surface);
}

.direction-count {
  color: var(--b3-theme-on-surface-light);
}

.warning-message {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--b3-theme-error);
}

.panel-actions {
  display: flex;
  gap: 8px;
}

.panel-actions button {
  border: none;
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  background: var(--b3-list-hover);
  color: var(--b3-theme-on-surface);
}

.panel-actions button:hover {
  background: var(--b3-theme-primary-light);
}
</style>
