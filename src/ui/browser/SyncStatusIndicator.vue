<template>
  <div v-if="showIndicator" class="sync-status-indicator">
    <!-- 同步状态显示 -->
    <div class="sync-status-indicator__status">
      <div v-if="syncStatus === 'syncing'" class="status syncing">
        <span class="icon">⏳</span>
        <span class="text">{{ t('syncing', '正在同步...') }}</span>
        <span v-if="progress" class="progress">{{ progress }}</span>
      </div>
      
      <div v-else-if="syncStatus === 'success'" class="status success">
        <span class="icon">✅</span>
        <span class="text">
          {{ t('lastSync', '上次同步：') }}{{ formatTime(lastSyncTime) }}
        </span>
        <span v-if="lastResult" class="result">
          | {{ t('added', '新增') }} {{ lastResult.addedCount }} {{ t('cards', '张') }}
          <span v-if="lastResult.deletedCount > 0">
            ，{{ t('deleted', '删除') }} {{ lastResult.deletedCount }} {{ t('cards', '张') }}
          </span>
          <span v-if="lastResult.detectedCount && lastResult.detectedCount > 0">
            ，{{ t('detected', '检测') }} {{ lastResult.detectedCount }} {{ t('cards', '张') }}
          </span>
        </span>
      </div>
      
      <div v-else-if="syncStatus === 'error'" class="status error">
        <span class="icon">❌</span>
        <span class="text">{{ t('syncFailed', '同步失败：') }}{{ errorMessage }}</span>
        <button class="retry-btn" @click="handleRetry">
          {{ t('retry', '重试') }}
        </button>
      </div>
      
      <div v-else class="status idle">
        <span class="icon">💤</span>
        <span class="text">{{ t('idle', '未同步') }}</span>
      </div>
    </div>
    
    <!-- 同步操作按钮 -->
    <div class="sync-status-indicator__actions">
      <button 
        class="sync-btn" 
        :disabled="syncStatus === 'syncing'"
        @click="handleManualSync"
        :title="t('manualSyncHint', '手动触发增量同步')"
      >
        <span class="icon">🔄</span>
        {{ t('manualSync', '手动同步') }}
      </button>
      
      <button 
        class="sync-btn full-sync" 
        :disabled="syncStatus === 'syncing'"
        @click="handleFullSync"
        :title="t('fullSyncHint', '手动触发全量同步（检测双向删除）')"
      >
        <span class="icon">🔄</span>
        {{ t('fullSync', '全量同步') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import type { SyncStatus, SyncResult } from '@/services/HybridSyncService';

// Props
const props = defineProps<{
  /** 国际化字典 */
  i18n?: Record<string, string>;
  /** HybridSyncService 实例（如果在高阶模式下） */
  syncService?: any;
  /** 是否显示指示器（仅在高阶模式下显示） */
  show?: boolean;
}>();

// Emits
const emit = defineEmits<{
  (e: 'sync'): void;
  (e: 'fullSync'): void;
  (e: 'retry'): void;
}>();

// State
const syncStatus = ref<SyncStatus>('idle');
const lastSyncTime = ref<number>(0);
const lastFullSyncTime = ref<number>(0);
const lastResult = ref<SyncResult | null>(null);
const errorMessage = ref<string>('');
const progress = ref<string>('');

// Computed
const showIndicator = computed(() => {
  return props.show && props.syncService;
});

// 国际化
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

// 格式化时间
function formatTime(timestamp: number): string {
  if (!timestamp) return t('never', '从未');
  
  const now = Date.now();
  const diff = now - timestamp;
  
  // 小于 1 分钟
  if (diff < 60 * 1000) {
    return t('justNow', '刚刚');
  }
  
  // 小于 1 小时
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes}${t('minutesAgo', '分钟前')}`;
  }
  
  // 小于 24 小时
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours}${t('hoursAgo', '小时前')}`;
  }
  
  // 大于 24 小时
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  return `${days}${t('daysAgo', '天前')}`;
}

// 更新同步状态
function updateSyncStatus() {
  if (!props.syncService) return;
  
  const status = props.syncService.getSyncStatus();
  syncStatus.value = status.status;
  lastSyncTime.value = status.lastSyncTime;
  lastFullSyncTime.value = status.lastFullSyncTime;
}

// 手动同步
async function handleManualSync() {
  if (!props.syncService || syncStatus.value === 'syncing') return;
  
  console.log('[SyncStatusIndicator] Manual sync triggered');
  
  try {
    syncStatus.value = 'syncing';
    progress.value = '';
    errorMessage.value = '';
    
    const result = await props.syncService.incrementalSync();
    lastResult.value = result;
    
    if (result.success) {
      syncStatus.value = 'success';
      lastSyncTime.value = Date.now();
    } else {
      syncStatus.value = 'error';
      errorMessage.value = result.errorMessage || t('unknownError', '未知错误');
    }
    
    emit('sync');
  } catch (error) {
    console.error('[SyncStatusIndicator] Manual sync failed:', error);
    syncStatus.value = 'error';
    errorMessage.value = error instanceof Error ? error.message : t('unknownError', '未知错误');
  }
}

// 全量同步
async function handleFullSync() {
  if (!props.syncService || syncStatus.value === 'syncing') return;
  
  console.log('[SyncStatusIndicator] Full sync triggered');
  
  try {
    syncStatus.value = 'syncing';
    progress.value = '';
    errorMessage.value = '';
    
    const result = await props.syncService.fullSync();
    lastResult.value = result;
    
    if (result.success) {
      syncStatus.value = 'success';
      lastFullSyncTime.value = Date.now();
    } else {
      syncStatus.value = 'error';
      errorMessage.value = result.errorMessage || t('unknownError', '未知错误');
    }
    
    emit('fullSync');
  } catch (error) {
    console.error('[SyncStatusIndicator] Full sync failed:', error);
    syncStatus.value = 'error';
    errorMessage.value = error instanceof Error ? error.message : t('unknownError', '未知错误');
  }
}

// 重试
function handleRetry() {
  console.log('[SyncStatusIndicator] Retry triggered');
  emit('retry');
  handleManualSync();
}

// 定时更新状态
let statusUpdateTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  // 初始更新
  updateSyncStatus();
  
  // 每 5 秒更新一次状态
  statusUpdateTimer = setInterval(() => {
    updateSyncStatus();
  }, 5000);
});

onBeforeUnmount(() => {
  if (statusUpdateTimer) {
    clearInterval(statusUpdateTimer);
    statusUpdateTimer = null;
  }
});
</script>

<style lang="scss" scoped>
.sync-status-indicator {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background-color: var(--b3-theme-surface);
  border-bottom: 1px solid var(--b3-border-color);
  font-size: 13px;
  gap: 16px;
  
  &__status {
    flex: 1;
    min-width: 0;
    
    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      
      .icon {
        font-size: 16px;
        flex-shrink: 0;
      }
      
      .text {
        color: var(--b3-theme-on-surface);
        white-space: nowrap;
      }
      
      .result {
        color: var(--b3-theme-on-surface-light);
        white-space: nowrap;
      }
      
      .progress {
        color: var(--b3-theme-primary);
        font-weight: 500;
      }
      
      &.syncing {
        .icon {
          animation: rotate 1s linear infinite;
        }
      }
      
      &.success {
        .icon {
          color: var(--b3-card-success-color);
        }
      }
      
      &.error {
        .icon {
          color: var(--b3-card-error-color);
        }
        
        .text {
          color: var(--b3-card-error-color);
        }
      }
      
      &.idle {
        .icon {
          opacity: 0.5;
        }
        
        .text {
          opacity: 0.7;
        }
      }
    }
    
    .retry-btn {
      margin-left: 8px;
      padding: 2px 8px;
      font-size: 12px;
      background-color: var(--b3-theme-primary);
      color: var(--b3-theme-on-primary);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: opacity 0.2s;
      
      &:hover {
        opacity: 0.8;
      }
      
      &:active {
        opacity: 0.6;
      }
    }
  }
  
  &__actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
    
    .sync-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 12px;
      font-size: 12px;
      background-color: var(--b3-theme-surface-lighter);
      color: var(--b3-theme-on-surface);
      border: 1px solid var(--b3-border-color);
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
      
      .icon {
        font-size: 14px;
      }
      
      &:hover:not(:disabled) {
        background-color: var(--b3-theme-primary-lightest);
        border-color: var(--b3-theme-primary);
      }
      
      &:active:not(:disabled) {
        transform: scale(0.98);
      }
      
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      &.full-sync {
        background-color: var(--b3-theme-primary-lightest);
        border-color: var(--b3-theme-primary-light);
        
        &:hover:not(:disabled) {
          background-color: var(--b3-theme-primary-light);
          color: var(--b3-theme-on-primary);
        }
      }
    }
  }
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
