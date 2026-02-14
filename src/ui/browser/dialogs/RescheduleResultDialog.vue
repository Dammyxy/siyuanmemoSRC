<template>
  <div class="reschedule-result-dialog">
    <div class="dialog__content">
      <!-- 成功状态 -->
      <div v-if="result.success" class="result-success">
        <div class="result-icon">✅</div>
        <h3 class="result-title">操作成功</h3>
        <p class="result-message">{{ operationName }}操作已完成</p>
      </div>
      
      <!-- 失败状态 -->
      <div v-else class="result-error">
        <div class="result-icon">❌</div>
        <h3 class="result-title">操作失败</h3>
        <p class="result-message">{{ result.errorMessage || '操作过程中发生错误' }}</p>
      </div>
      
      <!-- 统计信息 -->
      <div class="result-stats">
        <div class="stat-item stat-item--success">
          <span class="stat-label">成功更新</span>
          <span class="stat-value">{{ result.updated || 0 }}</span>
          <span class="stat-unit">张卡片</span>
        </div>
        
        <div v-if="result.skipped !== undefined" class="stat-item stat-item--warning">
          <span class="stat-label">跳过</span>
          <span class="stat-value">{{ result.skipped }}</span>
          <span class="stat-unit">张卡片</span>
        </div>
        
        <div v-if="result.unchanged !== undefined" class="stat-item stat-item--info">
          <span class="stat-label">保持不变</span>
          <span class="stat-value">{{ result.unchanged }}</span>
          <span class="stat-unit">张卡片</span>
        </div>
        
        <div v-if="result.overdueHandled !== undefined" class="stat-item stat-item--info">
          <span class="stat-label">过期处理</span>
          <span class="stat-value">{{ result.overdueHandled }}</span>
          <span class="stat-unit">张卡片</span>
        </div>
        
        <div v-if="result.averageCardsPerDay !== undefined" class="stat-item stat-item--info">
          <span class="stat-label">平均每天</span>
          <span class="stat-value">{{ result.averageCardsPerDay.toFixed(1) }}</span>
          <span class="stat-unit">张卡片</span>
        </div>
      </div>
      
      <!-- 跳过原因详情 -->
      <div v-if="result.skippedReasons && Object.keys(result.skippedReasons).length > 0" class="skip-reasons">
        <h4 class="section-title">跳过原因统计</h4>
        <div class="reason-list">
          <div 
            v-for="(count, reason) in result.skippedReasons" 
            :key="reason"
            class="reason-item"
          >
            <span class="reason-label">{{ formatSkipReason(reason) }}</span>
            <span class="reason-count">{{ count }} 张</span>
          </div>
        </div>
      </div>
      
      <!-- 错误详情 -->
      <div v-if="result.errors && result.errors.length > 0" class="error-details">
        <h4 class="section-title">错误详情</h4>
        <div class="error-list">
          <div 
            v-for="(error, index) in result.errors" 
            :key="index"
            class="error-item"
          >
            {{ error }}
          </div>
        </div>
      </div>
    </div>
    
    <div class="dialog__actions">
      <button class="b3-button b3-button--text" @click="handleClose">
        关闭
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PostponeResult, AdvanceResult, SpreadResult } from '@/types/reschedule';

const props = defineProps<{
  operationType: 'postpone' | 'advance' | 'spread' | 'dilute';
  result: (PostponeResult | AdvanceResult | SpreadResult) & {
    success: boolean;
    errorMessage?: string;
  };
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const operationName = computed(() => {
  switch (props.operationType) {
    case 'postpone':
      return '推迟';
    case 'advance':
      return '提前';
    case 'spread':
      return '分散';
    case 'dilute':
      return '稀释';
    default:
      return '重新调度';
  }
});

function formatSkipReason(reason: string): string {
  const reasonMap: Record<string, string> = {
    'priority': '优先级过高',
    'interval': '间隔过长',
    'retrievability': '记忆强度过高',
    'aFactor': 'A-Factor 过低',
    'postponeCount': '推迟次数过多',
    'shortInterval': '间隔过短'
  };
  
  return reasonMap[reason] || reason;
}

function handleClose() {
  emit('close');
}
</script>

<style scoped>
.reschedule-result-dialog {
  padding: 20px;
  min-width: 400px;
}

.result-success,
.result-error {
  text-align: center;
  margin-bottom: 24px;
}

.result-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.result-title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--b3-theme-on-background);
}

.result-message {
  margin: 0;
  font-size: 14px;
  color: var(--b3-theme-on-surface-light);
}

.result-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  border-radius: 8px;
  background: var(--b3-theme-surface);
}

.stat-item--success {
  background: var(--b3-card-success-background);
  border: 1px solid var(--b3-card-success-color);
}

.stat-item--warning {
  background: var(--b3-card-warning-background);
  border: 1px solid var(--b3-card-warning-color);
}

.stat-item--info {
  background: var(--b3-card-info-background);
  border: 1px solid var(--b3-card-info-color);
}

.stat-label {
  font-size: 12px;
  color: var(--b3-theme-on-surface-light);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--b3-theme-on-background);
  margin-bottom: 2px;
}

.stat-unit {
  font-size: 11px;
  color: var(--b3-theme-on-surface-light);
}

.skip-reasons,
.error-details {
  margin-bottom: 20px;
  padding: 16px;
  background: var(--b3-theme-surface);
  border-radius: 8px;
}

.section-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--b3-theme-on-background);
}

.reason-list,
.error-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reason-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--b3-theme-background);
  border-radius: 6px;
  font-size: 13px;
}

.reason-label {
  color: var(--b3-theme-on-background);
}

.reason-count {
  font-weight: 600;
  color: var(--b3-theme-primary);
}

.error-item {
  padding: 8px 12px;
  background: var(--b3-card-error-background);
  color: var(--b3-card-error-color);
  border-radius: 6px;
  font-size: 13px;
  border-left: 3px solid var(--b3-card-error-color);
}

.dialog__actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
  border-top: 1px solid var(--b3-border-color);
}
</style>
