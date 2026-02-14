<template>
  <div class="numeric-range-filter">
    <div class="filter-header">
      <label class="filter-checkbox">
        <input 
          type="checkbox" 
          :checked="enabled"
          @change="handleEnabledChange"
          :aria-label="`启用${label}过滤`"
        />
        <span class="filter-label">{{ label }}</span>
      </label>
    </div>
    
    <div v-if="enabled" class="filter-content">
      <div class="range-inputs">
        <div class="input-group">
          <label class="input-label">最小值</label>
          <input 
            type="number"
            :value="min"
            @input="handleMinInput"
            :min="range.min"
            :max="range.max"
            :step="allowDecimal ? '0.01' : '1'"
            class="range-input"
            :class="{ 'input-error': hasError }"
            :aria-label="`${label}最小值`"
            :aria-describedby="hasError ? `${fieldId}-error` : undefined"
          />
        </div>
        
        <span class="range-separator">-</span>
        
        <div class="input-group">
          <label class="input-label">最大值</label>
          <input 
            type="number"
            :value="max"
            @input="handleMaxInput"
            :min="range.min"
            :max="range.max"
            :step="allowDecimal ? '0.01' : '1'"
            class="range-input"
            :class="{ 'input-error': hasError }"
            :aria-label="`${label}最大值`"
            :aria-describedby="hasError ? `${fieldId}-error` : undefined"
          />
        </div>
      </div>
      
      <div v-if="hasError" :id="`${fieldId}-error`" class="error-message" role="alert">
        {{ error }}
      </div>
      
      <div class="range-hint">
        <span>范围: {{ range.min }} - {{ range.max }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * NumericRangeFilter 组件
 * 
 * 用于显示数值范围过滤条件（最小值-最大值）。
 * 
 * @see .kiro/specs/filter-group-queue-ui/requirements.md - 需求 3.1-3.8, 10.1-10.3
 * @see .kiro/specs/filter-group-queue-ui/design.md - 组件设计
 */

interface Props {
  /** 条件标签 */
  label: string;
  /** 是否启用 */
  enabled: boolean;
  /** 最小值 */
  min: number;
  /** 最大值 */
  max: number;
  /** 数值范围限制 */
  range: { min: number; max: number };
  /** 是否支持小数 */
  allowDecimal?: boolean;
  /** 验证错误信息 */
  error?: string;
}

interface Emits {
  (e: 'update:enabled', value: boolean): void;
  (e: 'update:min', value: number): void;
  (e: 'update:max', value: number): void;
}

const props = withDefaults(defineProps<Props>(), {
  allowDecimal: false,
  error: undefined,
});

const emit = defineEmits<Emits>();

// 生成唯一的字段 ID（用于 aria-describedby）
const fieldId = computed(() => {
  return `numeric-filter-${props.label.toLowerCase().replace(/\s+/g, '-')}`;
});

// 是否有错误
const hasError = computed(() => {
  return props.enabled && !!props.error;
});

/**
 * 处理启用/禁用变化
 */
function handleEnabledChange(event: Event) {
  const target = event.target as HTMLInputElement;
  emit('update:enabled', target.checked);
}

/**
 * 处理最小值输入
 */
function handleMinInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = props.allowDecimal 
    ? parseFloat(target.value) 
    : parseInt(target.value, 10);
  
  if (!isNaN(value)) {
    emit('update:min', value);
  }
}

/**
 * 处理最大值输入
 */
function handleMaxInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = props.allowDecimal 
    ? parseFloat(target.value) 
    : parseInt(target.value, 10);
  
  if (!isNaN(value)) {
    emit('update:max', value);
  }
}
</script>

<style scoped>
.numeric-range-filter {
  padding: 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 8px;
  background: var(--b3-theme-background);
  transition: all 0.15s;
}

.numeric-range-filter:hover {
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

.range-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
  font-size: 14px;
  transition: all 0.15s;
}

.range-input:focus {
  outline: none;
  border-color: var(--b3-theme-primary);
  box-shadow: 0 0 0 2px var(--b3-theme-primary-lightest);
}

.range-input:hover:not(:focus) {
  border-color: var(--b3-theme-primary-light);
}

.range-input.input-error {
  border-color: var(--b3-card-error-color);
}

.range-input.input-error:focus {
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

.range-hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--b3-theme-on-surface-light);
  text-align: center;
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

/* 移除 number input 的默认箭头（可选） */
.range-input::-webkit-outer-spin-button,
.range-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.range-input[type="number"] {
  -moz-appearance: textfield;
}
</style>
