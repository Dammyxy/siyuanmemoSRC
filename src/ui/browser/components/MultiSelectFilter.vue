<template>
  <div class="multi-select-filter">
    <div class="filter-header">
      <label class="filter-checkbox">
        <input 
          type="checkbox" 
          :checked="enabled"
          @change="handleEnabledChange"
          :aria-label="t('enableFilter', 'Enable {label} filter').replace('{label}', label)"
        />
        <span class="filter-label">{{ label }}</span>
      </label>
    </div>
    
    <div v-if="enabled" class="filter-content">
      <div class="options-list">
        <label 
          v-for="option in options" 
          :key="option.value"
          class="option-checkbox"
        >
          <input 
            type="checkbox" 
            :checked="selected.has(option.value)"
            @change="handleOptionChange(option.value, $event)"
            :aria-label="t('selectOption', 'Select {label}').replace('{label}', option.label)"
          />
          <span class="option-label">{{ option.label }}</span>
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * MultiSelectFilter 组件
 * 
 * 用于显示多选过滤条件（复选框组）。
 * 
 * @see .kiro/specs/filter-group-queue-ui/requirements.md - 需求 5.1-5.4
 * @see .kiro/specs/filter-group-queue-ui/design.md - 组件设计
 */

interface Props {
  /** 条件标签 */
  label: string;
  /** 是否启用 */
  enabled: boolean;
  /** 选项列表 */
  options: Array<{ value: string; label: string }>;
  /** 已选择的值 */
  selected: Set<string>;
}

interface Emits {
  (e: 'update:enabled', value: boolean): void;
  (e: 'update:selected', value: Set<string>): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// i18n helper
function t(key: string, fallback: string): string {
  const i18n = (window as any)?.siyuan?.languages?.flashcard || {};
  return (i18n as any)?.[key] || fallback;
}

/**
 * 处理启用/禁用变化
 */
function handleEnabledChange(event: Event) {
  const target = event.target as HTMLInputElement;
  emit('update:enabled', target.checked);
}

/**
 * 处理选项变化
 */
function handleOptionChange(value: string, event: Event) {
  const target = event.target as HTMLInputElement;
  const newSelected = new Set(props.selected);
  
  if (target.checked) {
    newSelected.add(value);
  } else {
    newSelected.delete(value);
  }
  
  emit('update:selected', newSelected);
}
</script>

<style scoped>
.multi-select-filter {
  padding: 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 8px;
  background: var(--b3-theme-background);
  transition: all 0.15s;
}

.multi-select-filter:hover {
  background: var(--b3-theme-surface);
}

.filter-header {
  margin-bottom: 8px;
}

.filter-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.filter-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.filter-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--b3-theme-on-background);
}

.filter-content {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--b3-border-color);
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.option-checkbox:hover {
  background: var(--b3-theme-surface-lighter, var(--b3-theme-surface));
}

.option-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.option-label {
  font-size: 13px;
  color: var(--b3-theme-on-background);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .options-list {
    gap: 6px;
  }
  
  .option-checkbox {
    padding: 8px;
  }
}
</style>
