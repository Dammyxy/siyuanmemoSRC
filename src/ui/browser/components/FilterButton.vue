<template>
  <button
    v-if="shouldShow"
    class="b3-button b3-button--outline filter-button"
    :class="{ 'filter-button--active': hasActiveFilter }"
    @click="handleClick"
    :title="tooltipText"
  >
    <svg><use xlink:href="#iconFilter"></use></svg>
    <span>{{ buttonText }}</span>
    <span v-if="hasActiveFilter" class="filter-button__badge">{{ filterCount }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CardFilter } from '@/types/unified-data-source';
import { filterService } from '../services/FilterService';

// ============================================================================
// Props & Emits
// ============================================================================

const props = defineProps<{
  // 当前队列类型
  queueType: string;
  // 已应用的过滤条件
  appliedFilter: CardFilter | null;
  // 国际化文本
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'openDialog'): void;
}>();

// ============================================================================
// Computed Properties
// ============================================================================

/**
 * 是否应该显示过滤按钮
 * 需求 1.1, 1.2: 仅在 FilterGroup 队列显示
 */
const shouldShow = computed(() => {
  const result = props.queueType === 'filter-group' || props.queueType === 'FilterGroup';
  console.log('[FilterButton] shouldShow computed:', {
    queueType: props.queueType,
    result,
  });
  return result;
});

/**
 * 是否有活动的过滤条件
 * 需求 1.4, 11.1: 过滤条件已设置时显示视觉指示器
 */
const hasActiveFilter = computed(() => {
  if (!props.appliedFilter) {
    return false;
  }
  
  // 检查是否有任何过滤条件
  return Object.keys(props.appliedFilter).length > 0;
});

/**
 * 过滤条件数量
 */
const filterCount = computed(() => {
  if (!props.appliedFilter) {
    return 0;
  }
  
  return Object.keys(props.appliedFilter).length;
});

/**
 * 按钮文本
 */
const buttonText = computed(() => {
  return t('filter', '设置复习范围');
});

/**
 * Tooltip 文本
 * 需求 11.3: 悬停时显示过滤条件摘要
 */
const tooltipText = computed(() => {
  if (!props.appliedFilter || !hasActiveFilter.value) {
    return t('filterTooltip', '设置过滤条件');
  }
  
  // 需求 11.2, 11.3: 显示过滤摘要
  return filterService.generateSummary(props.appliedFilter);
});

// ============================================================================
// Methods
// ============================================================================

/**
 * 处理按钮点击
 * 需求 1.3: 点击打开过滤对话框
 */
function handleClick() {
  emit('openDialog');
}

/**
 * 国际化辅助函数
 */
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}
</script>

<style scoped>
.filter-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}

.filter-button svg {
  width: 14px;
  height: 14px;
}

/**
 * 需求 1.4, 11.1, 11.4: 过滤已应用时的视觉指示器
 */
.filter-button--active {
  background: var(--b3-theme-primary-lightest);
  border-color: var(--b3-theme-primary);
  color: var(--b3-theme-primary);
}

.filter-button--active:hover {
  background: var(--b3-theme-primary-light);
}

/**
 * 过滤条件数量徽章
 */
.filter-button__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: var(--b3-theme-primary);
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 9px;
  line-height: 1;
}

.filter-button--active .filter-button__badge {
  background: var(--b3-theme-primary);
}
</style>
