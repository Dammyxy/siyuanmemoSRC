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
        class="btn-sync" 
        :disabled="syncStatus.status === 'syncing'"
        @click="handleManualSync"
      >
        {{ t('manualSync', '手动同步') }}
      </button>
      <button 
        class="btn-full-sync" 
        :disabled="syncStatus.status === 'syncing'"
        @click="handleFullSync"
      >
        {{ t('fullSync', '全量同步') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

interface SyncResult {
  success: boolean;
  addedCount: number;
  deletedCount: number;
  skippedCount: number;
  blacklistCleanedCount?: number;
  errorMessage?: string;
}

interface SyncStatus {
  status: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncTime: number;
  lastFullSyncTime: number;
  lastResult?: SyncResult;
  errorMessage?: string;
}

const props = defineProps<{
  hybridSyncService?: any;  // HybridSyncService 实例
  i18n?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'sync', type: 'incremental' | 'full'): void;
}>();

const syncStatus = ref<SyncStatus>({
  status: 'idle',
  lastSyncTime: 0,
  lastFullSyncTime: 0,
});

let statusCheckInterval: NodeJS.Timeout | null = null;

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
 * 更新同步状态
 */
function updateSyncStatus() {
  if (!props.hybridSyncService) {
    syncStatus.value.status = 'idle';
    return;
  }
  
  const status = props.hybridSyncService.getSyncStatus();
  syncStatus.value = {
    ...syncStatus.value,
    ...status,
  };
}

/**
 * 手动同步
 */
async function handleManualSync() {
  if (!props.hybridSyncService) {
    console.warn('[SyncStatusIndicator] HybridSyncService not available');
    return;
  }
  
  try {
    syncStatus.value.status = 'syncing';
    const result = await props.hybridSyncService.incrementalSync();
    
    syncStatus.value = {
      status: result.success ? 'success' : 'error',
      lastSyncTime: Date.now(),
      lastFullSyncTime: syncStatus.value.lastFullSyncTime,
      lastResult: result,
      errorMessage: result.errorMessage,
    };
    
    emit('sync', 'incremental');
  } catch (error) {
    console.error('[SyncStatusIndicator] Manual sync failed:', error);
    syncStatus.value = {
      ...syncStatus.value,
      status: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 全量同步
 */
async function handleFullSync() {
  if (!props.hybridSyncService) {
    console.warn('[SyncStatusIndicator] HybridSyncService not available');
    return;
  }
  
  try {
    syncStatus.value.status = 'syncing';
    const result = await props.hybridSyncService.fullSync();
    
    syncStatus.value = {
      status: result.success ? 'success' : 'error',
      lastSyncTime: syncStatus.value.lastSyncTime,
      lastFullSyncTime: Date.now(),
      lastResult: result,
      errorMessage: result.errorMessage,
    };
    
    emit('sync', 'full');
  } catch (error) {
    console.error('[SyncStatusIndicator] Full sync failed:', error);
    syncStatus.value = {
      ...syncStatus.value,
      status: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 重试同步
 */
async function handleRetry() {
  await handleManualSync();
}

onMounted(() => {
  // 初始化状态
  updateSyncStatus();
  
  // 定期更新状态（每5秒）
  statusCheckInterval = setInterval(() => {
    updateSyncStatus();
  }, 5000);
});

onUnmounted(() => {
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

.btn-sync,
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

.btn-sync:hover,
.btn-full-sync:hover,
.btn-retry:hover {
  background: var(--b3-list-hover);
  border-color: var(--b3-theme-primary);
}

.btn-sync:disabled,
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
