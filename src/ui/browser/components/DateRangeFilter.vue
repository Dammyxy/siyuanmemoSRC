<template>
  <div class="date-range-filter">
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
      <div class="range-inputs">
        <div class="input-group">
          <label class="input-label">{{ t('minDateLabel', 'Minimum Date') }}</label>
          <input 
            type="date"
            :value="formatDateForInput(minDate)"
            @input="handleMinDateInput"
            class="date-input"
            :class="{ 'input-error': hasError }"
            :aria-label="t('minDate', '{label} minimum date').replace('{label}', label)"
            :aria-describedby="hasError ? `${fieldId}-error` : undefined"
          />
        </div>
        
        <span class="range-separator">-</span>
        
        <div class="input-group">
          <label class="input-label">{{ t('maxDateLabel', 'Maximum Date') }}</label>
          <input 
            type="date"
            :value="formatDateForInput(maxDate)"
            @input="handleMaxDateInput"
            class="date-input"
            :class="{ 'input-error': hasError }"
            :aria-label="t('maxDate', '{label} maximum date').replace('{label}', label)"
            :aria-describedby="hasError ? `${fieldId}-error` : undefined"
          />
        </div>
      </div>
      
      <div v-if="hasError" :id="`${fieldId}-error`" class="error-message" role="alert">
        {{ error }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * DateRangeFilter 组件
 * 
 * 用于显示日期范围过滤条件（最小日期-最大日期）。
 * 
 * @see .kiro/specs/filter-group-queue-ui/requirements.md - 需求 4.1-4.4
 * @see .kiro/specs/filter-group-queue-ui/design.md - 组件设计
 */

interface Props {
  /** 条件标签 */
  label: string;
  /** 是否启用 */
  enabled: boolean;
  /** 最小日期 */
  minDate: Date;
  /** 最大日期 */
  maxDate: Date;
  /** 验证错误信息 */
  error?: string;
}

interface Emits {
  (e: 'update:enabled', value: boolean): void;
  (e: 'update:minDate', value: Date): void;
  (e: 'update:maxDate', value: Date): void;
}

const props = withDefaults(defineProps<Props>(), {
  error: undefined,
});

const emit = defineEmits<Emits>();

// i18n helper
function t(key: string, fallback: string): string {
  const i18n = (window as any)?.siyuan?.languages?.flashcard || {};
  return (i18n as any)?.[key] || fallback;
}

// 生成唯一的字段 ID（用于 aria-describedby）
const fieldId = computed(() => {
  return `date-filter-${props.label.toLowerCase().replace(/\s+/g, '-')}`;
});

// 是否有错误
const hasError = computed(() => {
  return props.enabled && !!props.error;
});

/**
 * 格式化日期为 input[type="date"] 所需的格式 (YYYY-MM-DD)
 */
function formatDateForInput(date: Date): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return '';
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * 解析 input[type="date"] 的值为 Date 对象
 */
function parseDateFromInput(value: string): Date | null {
  if (!value) {
    return null;
  }
  
  const date = new Date(value);
  
  // 验证日期是否有效
  if (isNaN(date.getTime())) {
    return null;
  }
  
  return date;
}

/**
 * 处理启用/禁用变化
 */
function handleEnabledChange(event: Event) {
  const target = event.target as HTMLInputElement;
  emit('update:enabled', target.checked);
}

/**
 * 处理最小日期输入
 */
function handleMinDateInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const date = parseDateFromInput(target.value);
  
  if (date) {
    emit('update:minDate', date);
  }
}

/**
 * 处理最大日期输入
 */
function handleMaxDateInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const date = parseDateFromInput(target.value);
  
  if (date) {
    emit('update:maxDate', date);
  }
}
</script>

<style scoped>
.date-range-filter {
  padding: 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 8px;
  background: var(--b3-theme-background);
  transition: all 0.15s;
}

.date-range-filter:hover {
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

.range-inputs {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.input-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-label {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
}

.date-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
  font-size: 14px;
  transition: all 0.15s;
}

.date-input:focus {
  outline: none;
  border-color: var(--b3-theme-primary);
  box-shadow: 0 0 0 2px var(--b3-theme-primary-lightest);
}

.date-input:hover:not(:focus) {
  border-color: var(--b3-theme-primary-light);
}

.date-input.input-error {
  border-color: var(--b3-card-error-color);
}

.date-input.input-error:focus {
  box-shadow: 0 0 0 2px var(--b3-card-error-color-light, rgba(244, 67, 54, 0.2));
}

.range-separator {
  padding-bottom: 8px;
  font-size: 16px;
  color: var(--b3-theme-on-surface-light);
}

.error-message {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--b3-card-error-color-light, rgba(244, 67, 54, 0.1));
  border-left: 3px solid var(--b3-card-error-color);
  border-radius: 4px;
  font-size: 12px;
  color: var(--b3-card-error-color);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .range-inputs {
    flex-direction: column;
    gap: 8px;
  }
  
  .range-separator {
    display: none;
  }
}

/* 日期输入框样式优化 */
.date-input::-webkit-calendar-picker-indicator {
  cursor: pointer;
  filter: var(--b3-theme-on-background);
}

.date-input::-webkit-datetime-edit {
  padding: 0;
}
</style>
