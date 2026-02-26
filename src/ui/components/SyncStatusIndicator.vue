<template>
  <div class="sync-status-indicator">
    <!-- 同步状态显示 -->
    <div v-if="syncStatus.status === 'syncing'" class="status syncing">
      <span class="icon">⏳</span>
      <span>{{ t('syncing', '正在同步...') }}</span>
    </div>
    
    <div v-else-if="syncStatus.status === 'success'" class="status success">
      <span class="icon">✅</span>
      <span>{{ t('lastSync', '上次同步') }}：{{ formatTime(syncStatus.lastSyncTime) }}</span>
      <span v-if="syncStatus.lastResult" class="stats">
        | {{ t('added', '新增') }} {{ syncStatus.lastResult.addedCount }} {{ t('cards', '张') }}
        <span v-if="syncStatus.lastResult.deletedCount > 0">
          ，{{ t('deleted', '删除') }} {{ syncStatus.lastResult.deletedCount }} {{ t('cards', '张') }}
        </span>
        <span v-if="syncStatus.lastResult.skippedCount > 0">
          ，{{ t('skipped', '跳过') }} {{ syncStatus.lastResult.skippedCount }} {{ t('cards', '张') }}
        </span>
        <span v-if="syncStatus.lastResult.detectedCount && syncStatus.lastResult.detectedCount > 0">
          ，{{ t('detected', '检测') }} {{ syncStatus.lastResult.detectedCount }} {{ t('cards', '张') }}
        </span>
      </span>
    </div>
    
    <div v-else-if="syncStatus.status === 'error'" class="status error">
      <span class="icon">❌</span>
      <span>{{ t('syncFailed', '同步失败') }}：{{ syncStatus.errorMessage }}</span>
      <button class="btn-retry" @click="handleRetry">{{ t('retry', '重试') }}</button>
    </div>

    <div v-else class="status idle">
      <span class="icon">💤</span>
      <span>{{ t('idle', '空闲') }}</span>
    </div>
    
    <!-- 同步操作按钮 -->
    <div class="sync-actions">
      <button 
        class="btn-sync btn-sync--primary" 
        :disabled="syncStatus.status === 'syncing'"
        @click="handleManualSync"
        :title="t('quickSyncTooltip', '获取新卡片和更新（推荐日常使用）')"
      >
        <span class="btn-icon">🔄</span>
        <span class="btn-text">{{ t('quickSync', '快速同步') }}</span>
      </button>
      <button 
        class="btn-sync btn-sync--secondary" 
        :disabled="syncStatus.status === 'syncing'"
        @click="handleFullSync"
        :title="t('fullSyncTooltip', '完整检查并清理数据（耗时较长，建议每周一次）')"
      >
        <span class="btn-icon">🔁</span>
        <span class="btn-text">{{ t('fullSync', '完整同步') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type {
  HybridSyncEvents,
  SyncProgress,
  SyncResult,
  SyncStatus,
} from '@/application/services/XiuyuanSyncService.types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SyncStatusIndicator');

type SyncStatusSnapshot = {
  status: SyncStatus;
  lastSyncTime: number;
  lastFullSyncTime: number;
};

type SyncServiceLike = {
  getSyncStatus: () => SyncStatusSnapshot;
  incrementalSync: (onProgress?: (progress: SyncProgress) => void) => Promise<SyncResult>;
  fullSync: (onProgress?: (progress: SyncProgress) => void) => Promise<SyncResult>;
  on: <K extends keyof HybridSyncEvents>(
    eventName: K,
    handler: (data: HybridSyncEvents[K]) => void
  ) => void;
  off: <K extends keyof HybridSyncEvents>(
    eventName: K,
    handler: (data: HybridSyncEvents[K]) => void
  ) => void;
};

interface SyncStatusViewModel {
  status: SyncStatus;
  lastSyncTime: number;
  lastFullSyncTime: number;
  lastResult?: SyncResult;
  errorMessage?: string;
}

const props = defineProps<{
  hybridSyncService?: SyncServiceLike;
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'sync', type: 'incremental' | 'full'): void;
}>();

const syncStatus = ref<SyncStatusViewModel>({
  status: 'idle',
  lastSyncTime: 0,
  lastFullSyncTime: 0,
});

let statusCheckInterval: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

/**
 * 格式化时间（相对时间）
 */
function formatTime(timestamp: number): string {
  if (!timestamp) return t('never', '从未');
  
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) {
    return t('justNow', '刚刚');
  } else if (minutes < 60) {
    return `${minutes} ${t('minutesAgo', '分钟前')}`;
  } else if (hours < 24) {
    return `${hours} ${t('hoursAgo', '小时前')}`;
  } else {
    return `${days} ${t('daysAgo', '天前')}`;
  }
}

/**
 * 更新同步状态（仅更新时间戳）
 */
function updateSyncStatus() {
  const syncService = props.hybridSyncService;
  if (!syncService) {
    syncStatus.value.status = 'idle';
    return;
  }
  
  const status = syncService.getSyncStatus();
  syncStatus.value.lastSyncTime = status.lastSyncTime;
  syncStatus.value.lastFullSyncTime = status.lastFullSyncTime;
}

/**
 * 手动同步
 */
async function handleManualSync() {
  const syncService = props.hybridSyncService;
  if (!syncService) {
    logger.warn('[SiYuanMemo][SyncStatusIndicator] HybridSyncService not available');
    return;
  }
  
  try {
    // 使用进度回调
    await syncService.incrementalSync();
    emit('sync', 'incremental');
  } catch (error) {
    logger.error('[SiYuanMemo][SyncStatusIndicator] Manual sync failed:', error);
  }
}

/**
 * 全量同步
 */
async function handleFullSync() {
  const syncService = props.hybridSyncService;
  if (!syncService) {
    logger.warn('[SiYuanMemo][SyncStatusIndicator] HybridSyncService not available');
    return;
  }
  
  try {
    // 使用进度回调
    await syncService.fullSync();
    emit('sync', 'full');
  } catch (error) {
    logger.error('[SiYuanMemo][SyncStatusIndicator] Full sync failed:', error);
  }
}

/**
 * 重试同步
 */
async function handleRetry() {
  await handleManualSync();
}

onMounted(() => {
  const syncService = props.hybridSyncService;
  if (!syncService) return;
  
  // 初始化状态
  updateSyncStatus();
  
  // 🆕 监听同步事件
  const onSyncStart = (data: HybridSyncEvents['syncStart']) => {
    logger.info('[SiYuanMemo][SyncStatusIndicator] Sync started:', data.type);
    syncStatus.value.status = 'syncing';
    syncStatus.value.errorMessage = undefined;
  };
  
  const onSyncSuccess = (data: HybridSyncEvents['syncSuccess']) => {
    logger.info('[SiYuanMemo][SyncStatusIndicator] Sync success:', data);
    syncStatus.value.status = 'success';
    syncStatus.value.lastResult = data.result;
    
    // 更新时间戳
    if (data.type === 'incremental') {
      syncStatus.value.lastSyncTime = data.timestamp;
    } else if (data.type === 'full') {
      syncStatus.value.lastFullSyncTime = data.timestamp;
    }
  };
  
  const onSyncError = (data: HybridSyncEvents['syncError']) => {
    logger.error('[SiYuanMemo][SyncStatusIndicator] Sync error:', data);
    if (!data.willRetry) {
      syncStatus.value.status = 'error';
      syncStatus.value.errorMessage = data.error.message;
    }
  };
  
  // 注册事件监听器
  syncService.on('syncStart', onSyncStart);
  syncService.on('syncSuccess', onSyncSuccess);
  syncService.on('syncError', onSyncError);
  
  // 清理函数
  unsubscribe = () => {
    syncService.off('syncStart', onSyncStart);
    syncService.off('syncSuccess', onSyncSuccess);
    syncService.off('syncError', onSyncError);
  };
  
  // 定期更新时间戳（每5秒，用于显示相对时间）
  statusCheckInterval = setInterval(() => {
    updateSyncStatus();
  }, 5000);
});

onUnmounted(() => {
  // 清理事件监听器
  unsubscribe?.();
  
  // 清理定时器
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
    statusCheckInterval = null;
  }
});
</script>

<style scoped>
.sync-status-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--b3-theme-surface);
  border-radius: 6px;
  font-size: 13px;
}

.status {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.status .icon {
  font-size: 16px;
}

.status.syncing {
  color: var(--b3-theme-primary);
}

.status.success {
  color: var(--b3-theme-on-surface);
}

.status.error {
  color: var(--b3-theme-error);
}

.status.idle {
  color: var(--b3-theme-on-surface-light);
}

.stats {
  color: var(--b3-theme-on-surface-light);
  font-size: 12px;
}

.sync-actions {
  display: flex;
  gap: 8px;
}

.btn-sync {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.btn-icon {
  font-size: 14px;
  line-height: 1;
}

.btn-text {
  font-weight: 500;
}

/* 主要按钮（快速同步） */
.btn-sync--primary {
  background: transparent;
  color: var(--b3-theme-primary);
  border-color: var(--b3-theme-primary);
  border-width: 1.5px;
}

.btn-sync--primary:hover:not(:disabled) {
  background: var(--b3-theme-primary-lighter);
  color: var(--b3-theme-primary);
  border-color: var(--b3-theme-primary);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.btn-sync--primary:active:not(:disabled) {
  transform: translateY(0);
}

/* 次要按钮（完整同步） */
.btn-sync--secondary {
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
  border-color: var(--b3-border-color);
}

.btn-sync--secondary:hover:not(:disabled) {
  background: var(--b3-list-hover);
  border-color: var(--b3-theme-primary);
}

/* 禁用状态 */
.btn-sync:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
}

.btn-full-sync,
.btn-retry {
  padding: 4px 12px;
  border: 1px solid var(--b3-border-color);
  border-radius: 4px;
  background: var(--b3-theme-background);
  color: var(--b3-theme-on-background);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-full-sync:hover {
  background: var(--b3-list-hover);
  border-color: var(--b3-theme-primary);
}

.btn-full-sync:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-retry {
  margin-left: 8px;
  background: var(--b3-theme-error);
  color: white;
  border-color: var(--b3-theme-error);
}

.btn-retry:hover {
  filter: brightness(1.1);
}
</style>
