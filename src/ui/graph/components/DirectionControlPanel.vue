<template>
  <div class="direction-control-panel" :class="{ collapsed: isCollapsed }">
    <!-- 面板头部 -->
    <div class="panel-header">
      <span class="panel-title">{{ t('directionControl', '漫游方向') }}</span>
      <button class="btn-toggle" @click="toggleCollapse" :title="isCollapsed ? t('expand', '展开') : t('collapse', '收起')">
        <span class="icon">{{ isCollapsed ? '▶' : '▼' }}</span>
      </button>
    </div>
    
    <!-- 面板内容 -->
    <div v-show="!isCollapsed" class="panel-content">
      <!-- 方向选择列表 -->
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
      
      <!-- 警告提示 -->
      <div v-if="showWarning" class="warning-message">
        <span class="warning-icon">⚠️</span>
        <span>{{ t('selectAtLeastOne', '请至少选择一个漫游方向') }}</span>
      </div>
      
      <!-- 操作按钮 -->
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
import { ref, computed, watch } from 'vue';
import { AssociationType } from '../types/graph';

/**
 * Props 定义
 */
const props = defineProps<{
  /** 可用的方向列表 */
  availableDirections: AssociationType[];
  /** 已选中的方向集合 */
  selectedDirections: Set<AssociationType>;
  /** 是否折叠 */
  collapsed?: boolean;
  /** 每个方向的候选节点数量 */
  directionCounts?: Record<AssociationType, number>;
  /** 国际化文本 */
  i18n?: Record<string, string>;
}>();

/**
 * Emits 定义
 */
const emit = defineEmits<{
  (e: 'direction-change', directions: Set<AssociationType>): void;
  (e: 'toggle-collapse'): void;
}>();

// ========================================================================
// 响应式状态
// ========================================================================

/** 内部折叠状态 */
const isCollapsed = ref(props.collapsed || false);

/** 选中的方向集合（内部状态） */
const selectedDirectionsSet = ref(new Set(props.selectedDirections));

/** 是否显示警告 */
const showWarning = ref(false);

// ========================================================================
// 计算属性
// ========================================================================

/** 是否所有方向都已选中 */
const allSelected = computed(() => {
  return props.availableDirections.every(d => selectedDirectionsSet.value.has(d));
});

// ========================================================================
// 辅助函数
// ========================================================================

/**
 * 国际化文本
 */
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

/**
 * 获取方向的中文标签
 */
function getDirectionLabel(direction: AssociationType): string {
  const labels: Record<AssociationType, string> = {
    [AssociationType.REF_LINK]: t('refLink', '链接关系'),
    [AssociationType.HIERARCHY]: t('hierarchy', '层级关系'),
    [AssociationType.TAG]: t('tag', '标签关系'),
    [AssociationType.SIBLING]: t('sibling', '兄弟块'),
  };
  return labels[direction] || direction;
}

/**
 * 处理方向选择变化
 */
function handleDirectionChange(direction: AssociationType, checked: boolean) {
  const newSet = new Set(selectedDirectionsSet.value);
  
  if (checked) {
    newSet.add(direction);
    showWarning.value = false;
  } else {
    newSet.delete(direction);
    
    // 验证：至少保留一个方向
    if (newSet.size === 0) {
      showWarning.value = true;
      // 不允许取消最后一个选项
      return;
    }
  }
  
  selectedDirectionsSet.value = newSet;
  emit('direction-change', newSet);
}

/**
 * 全选
 */
function selectAll() {
  const newSet = new Set(props.availableDirections);
  selectedDirectionsSet.value = newSet;
  showWarning.value = false;
  emit('direction-change', newSet);
}

/**
 * 清空（保留一个默认选项）
 */
function clearAll() {
  // 保留第一个方向，避免完全清空
  const firstDirection = props.availableDirections[0];
  const newSet = new Set([firstDirection]);
  selectedDirectionsSet.value = newSet;
  showWarning.value = false;
  emit('direction-change', newSet);
}

/**
 * 切换折叠状态
 */
function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value;
  emit('toggle-collapse');
}

// ========================================================================
// 监听 Props 变化
// ========================================================================

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
  background: var(--b3-theme-surface);
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.direction-control-panel.collapsed {
  max-height: 40px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--b3-theme-background);
  border-bottom: 1px solid var(--b3-border-color);
  cursor: pointer;
  user-select: none;
}

.panel-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--b3-theme-on-background);
}

.btn-toggle {
  padding: 4px;
  border: none;
  background: transparent;
  color: var(--b3-theme-on-background);
  cursor: pointer;
  transition: transform 0.2s;
}

.btn-toggle:hover {
  background: var(--b3-list-hover);
  border-radius: 4px;
}

.btn-toggle .icon {
  font-size: 12px;
}

.panel-content {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.direction-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.direction-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.direction-item:hover {
  background: var(--b3-list-hover);
}

.direction-item input[type="checkbox"] {
  cursor: pointer;
}

.direction-label {
  flex: 1;
  font-size: 13px;
  color: var(--b3-theme-on-surface);
}

.direction-count {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.warning-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(var(--b3-theme-error-rgb), 0.1);
  border: 1px solid var(--b3-theme-error);
  border-radius: 4px;
  font-size: 12px;
  color: var(--b3-theme-error);
}

.warning-icon {
  font-size: 16px;
}

.panel-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--b3-border-color);
}

.btn-select-all,
.btn-clear-all {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-select-all:hover,
.btn-clear-all:hover {
  background: var(--b3-list-hover);
  border-color: var(--b3-theme-primary);
}
</style>
