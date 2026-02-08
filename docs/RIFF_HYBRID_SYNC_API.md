# HybridSyncService API 文档

## 概述

`HybridSyncService` 是 Riff 混合同步方案的核心服务，负责管理增量同步、全量同步和删除同步。本文档详细说明其 API 接口、使用方法和最佳实践。

## 类定义

```typescript
class HybridSyncService {
  constructor(config: HybridSyncConfig);
  
  // 生命周期方法
  async start(): Promise<void>;
  stop(): void;
  
  // 同步方法
  async incrementalSync(): Promise<SyncResult>;
  async fullSync(): Promise<SyncResult>;
  async deleteSync(cardID: string): Promise<boolean>;
  
  // 状态查询
  getSyncStatus(): SyncStatusInfo;
}
```

## 配置接口

### HybridSyncConfig

混合同步服务的配置接口。

```typescript
interface HybridSyncConfig {
  /** 卡包 ID */
  deckId: string;
  
  /** 存储管理器 */
  storage: StorageManager;
  
  /** 增量同步配置 */
  incrementalSync: {
    /** 是否启用增量同步 */
    enabled: boolean;
    
    /** 触发时机 */
    triggers: Array<'plugin-start' | 'browser-open' | 'review-open'>;
    
    /** 是否使用黑名单过滤 */
    useBlacklist: boolean;
    
    /** 是否自动检测卡片类型（Topic/Item） */
    autoDetectCardType: boolean;
  };
  
  /** 全量同步配置 */
  fullSync: {
    /** 是否启用全量同步 */
    enabled: boolean;
    
    /** 同步间隔（毫秒） */
    interval: number;
    
    /** 是否清理黑名单 */
    cleanupBlacklist: boolean;
  };
  
  /** 删除同步配置 */
  deleteSync: {
    /** 是否启用删除同步 */
    enabled: boolean;
    
    /** 删除失败时是否使用黑名单作为后备 */
    useBlacklistFallback: boolean;
  };
}
```

**示例配置**：

```typescript
const config: HybridSyncConfig = {
  deckId: '20210808180117-czj9bvb',
  storage: storageManager,
  
  incrementalSync: {
    enabled: true,
    triggers: ['plugin-start', 'browser-open', 'review-open'],
    useBlacklist: true,
    autoDetectCardType: true
  },
  
  fullSync: {
    enabled: true,
    interval: 86400000, // 24小时
    cleanupBlacklist: true
  },
  
  deleteSync: {
    enabled: true,
    useBlacklistFallback: true
  }
};
```

### SyncResult

同步操作的结果接口。

```typescript
interface SyncResult {
  /** 是否成功 */
  success: boolean;
  
  /** 新增卡片数量 */
  addedCount: number;
  
  /** 删除卡片数量 */
  deletedCount: number;
  
  /** 跳过卡片数量 */
  skippedCount: number;
  
  /** 清理黑名单数量（仅全量同步） */
  blacklistCleanedCount?: number;
  
  /** 检测卡片类型数量（如果启用自动检测） */
  detectedCount?: number;
  
  /** 错误消息（失败时） */
  errorMessage?: string;
}
```

### SyncStatusInfo

同步状态信息接口。

```typescript
interface SyncStatusInfo {
  /** 当前状态 */
  status: 'idle' | 'syncing' | 'success' | 'error';
  
  /** 上次增量同步时间戳 */
  lastSyncTime: number;
  
  /** 上次全量同步时间戳 */
  lastFullSyncTime: number;
}
```

## 方法详解

### constructor(config: HybridSyncConfig)

创建 HybridSyncService 实例。

**参数**：
- `config`: HybridSyncConfig - 同步服务配置

**示例**：

```typescript
const hybridSyncService = new HybridSyncService({
  deckId: BUILTIN_DECK_ID,
  storage: this.storageManager,
  incrementalSync: {
    enabled: true,
    triggers: ['plugin-start', 'browser-open'],
    useBlacklist: true,
    autoDetectCardType: true
  },
  fullSync: {
    enabled: true,
    interval: 86400000,
    cleanupBlacklist: true
  },
  deleteSync: {
    enabled: true,
    useBlacklistFallback: true
  }
});
```

---

### start(): Promise<void>

启动同步服务。

**功能**：
1. 启动全量同步定时器（如果启用）
2. 执行初始增量同步（如果启用）

**返回值**：Promise<void>

**异常**：不抛出异常，错误会被捕获并记录

**示例**：

```typescript
// 在插件启动时调用
async onload() {
  // 初始化 HybridSyncService
  this.hybridSyncService = new HybridSyncService(config);
  
  // 启动同步服务
  await this.hybridSyncService.start();
  
  console.log('Sync service started');
}
```

**注意事项**：
- 必须在使用其他方法前调用
- 可以安全地多次调用（会先停止旧的定时器）
- 增量同步在后台执行，不阻塞启动流程

---

### stop(): void

停止同步服务。

**功能**：
1. 停止全量同步定时器
2. 清理资源

**返回值**：void

**示例**：

```typescript
// 在插件卸载时调用
onunload() {
  if (this.hybridSyncService) {
    this.hybridSyncService.stop();
    console.log('Sync service stopped');
  }
}
```

**注意事项**：
- 应该在插件卸载时调用
- 停止后可以再次调用 `start()` 重新启动

---

### incrementalSync(): Promise<SyncResult>

执行增量同步。

**功能**：
1. 从 Riff 获取新卡片（since lastSyncTime）
2. 使用黑名单过滤已删除的卡片
3. 只添加本地不存在的卡片（保留本地数据）
4. 自动检测新卡片的类型（如果启用）
5. 更新 lastSyncTime

**返回值**：Promise<SyncResult>

**示例**：

```typescript
// 手动触发增量同步
async function manualSync() {
  const result = await hybridSyncService.incrementalSync();
  
  if (result.success) {
    console.log(`同步成功：新增 ${result.addedCount} 张，跳过 ${result.skippedCount} 张`);
    if (result.detectedCount) {
      console.log(`自动检测 ${result.detectedCount} 张卡片类型`);
    }
  } else {
    console.error(`同步失败：${result.errorMessage}`);
  }
}
```

**自动触发场景**：

```typescript
// 1. 插件启动时
async onload() {
  await this.hybridSyncService.start(); // 自动触发
}

// 2. SRS 浏览器打开时
async openBrowser() {
  if (config.incrementalSync.triggers.includes('browser-open')) {
    // 后台同步，不阻塞 UI
    this.hybridSyncService.incrementalSync().catch(err => {
      console.error('Sync failed:', err);
    });
  }
  
  // 立即显示界面
  this.show();
}

// 3. 复习界面打开时
async openReview() {
  if (config.incrementalSync.triggers.includes('review-open')) {
    this.hybridSyncService.incrementalSync().catch(err => {
      console.error('Sync failed:', err);
    });
  }
  
  this.show();
}
```

**性能**：
- 通常 < 1s
- 不阻塞 UI（异步执行）
- 使用黑名单过滤（O(1) 查找）

**错误处理**：
- 失败时不更新 lastSyncTime
- 返回 `success: false` 和错误消息
- 不影响本地操作

---

### fullSync(): Promise<SyncResult>

执行全量同步。

**功能**：
1. 获取 Riff 和本地的所有卡片 ID
2. 对比差异，执行新增/删除
3. 清理黑名单（移除 Riff 中已不存在的 ID）
4. 自动检测新卡片的类型（如果启用）
5. 更新 lastFullSyncTime

**返回值**：Promise<SyncResult>

**示例**：

```typescript
// 手动触发全量同步
async function fullSyncNow() {
  const result = await hybridSyncService.fullSync();
  
  if (result.success) {
    console.log(`全量同步成功：
      新增 ${result.addedCount} 张
      删除 ${result.deletedCount} 张
      清理黑名单 ${result.blacklistCleanedCount} 个
      检测类型 ${result.detectedCount || 0} 张
    `);
  } else {
    console.error(`全量同步失败：${result.errorMessage}`);
  }
}
```

**自动触发**：

```typescript
// 定时器自动触发（每24小时）
// 在 start() 方法中自动设置
```

**使用场景**：
- 定期维护（每24小时）
- 检测双向删除
- 清理黑名单
- 用户手动触发

**性能**：
- 通常 < 5s
- 后台执行，不阻塞 UI
- 使用 Set 对比（O(n) 复杂度）

**错误处理**：
- 失败时不更新 lastFullSyncTime
- 返回 `success: false` 和错误消息
- 不影响本地数据

---

### deleteSync(cardID: string): Promise<boolean>

执行删除同步。

**功能**：
1. 尝试从 Riff 删除卡片
2. 成功：完成双向删除
3. 失败：加入黑名单（如果启用后备）

**参数**：
- `cardID`: string - 要删除的卡片 ID

**返回值**：Promise<boolean>
- `true`: 删除成功
- `false`: 删除失败（已加入黑名单）

**示例**：

```typescript
// 在 SRS 浏览器中删除卡片
async function deleteCard(cardID: string) {
  // 1. 从本地删除
  this.storage.removeCard(cardID);
  await this.storage.saveCards();
  
  // 2. 删除同步
  const success = await this.hybridSyncService.deleteSync(cardID);
  
  // 3. 显示提示
  if (success) {
    showMessage('已从 Riff 删除', 2000, 'info');
  } else {
    showMessage('删除失败，已加入黑名单', 3000, 'warning');
  }
  
  // 4. 刷新 UI
  await this.loadCards();
}
```

**错误处理**：
- 删除失败时自动加入黑名单（如果启用）
- 不抛出异常
- 返回 false 表示失败

**注意事项**：
- 必须先从本地删除
- 黑名单会在下次全量同步时清理
- 如果禁用删除同步，直接返回 true

---

### getSyncStatus(): SyncStatusInfo

获取当前同步状态。

**返回值**：SyncStatusInfo

**示例**：

```typescript
// 在 UI 中显示同步状态
function updateSyncStatus() {
  const status = hybridSyncService.getSyncStatus();
  
  switch (status.status) {
    case 'idle':
      showStatus('空闲');
      break;
    case 'syncing':
      showStatus('同步中...');
      break;
    case 'success':
      const lastSync = formatTime(status.lastSyncTime);
      showStatus(`上次同步：${lastSync}`);
      break;
    case 'error':
      showStatus('同步失败', 'error');
      break;
  }
}

// 格式化时间
function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}
```

## 完整使用示例

### 插件集成

```typescript
import { Plugin } from 'siyuan';
import { HybridSyncService } from './services/HybridSyncService';
import { StorageManager } from './core/storage/manager';

class FSRSPlugin extends Plugin {
  private hybridSyncService?: HybridSyncService;
  private storageManager: StorageManager;
  
  async onload() {
    // 1. 加载配置
    await this.loadSettings();
    
    // 2. 初始化存储管理器
    this.storageManager = new StorageManager(this);
    await this.storageManager.loadCards();
    
    // 3. 初始化混合同步服务（仅高阶模式）
    if (this.settings.riffIntegration.mode === 'advanced') {
      this.hybridSyncService = new HybridSyncService({
        deckId: BUILTIN_DECK_ID,
        storage: this.storageManager,
        incrementalSync: this.settings.riffIntegration.incrementalSync,
        fullSync: this.settings.riffIntegration.fullSync,
        deleteSync: this.settings.riffIntegration.deleteSync
      });
      
      // 启动同步服务
      await this.hybridSyncService.start();
      console.log('[Plugin] Hybrid sync service started');
    }
  }
  
  async onunload() {
    // 停止同步服务
    if (this.hybridSyncService) {
      this.hybridSyncService.stop();
      console.log('[Plugin] Hybrid sync service stopped');
    }
  }
}
```

### SRS 浏览器集成

```typescript
class SRSBrowser {
  private hybridSyncService?: HybridSyncService;
  private storage: StorageManager;
  
  constructor(
    storage: StorageManager,
    hybridSyncService?: HybridSyncService
  ) {
    this.storage = storage;
    this.hybridSyncService = hybridSyncService;
  }
  
  async open() {
    // 触发增量同步（后台）
    if (this.hybridSyncService) {
      const config = this.hybridSyncService.config;
      if (config.incrementalSync.enabled && 
          config.incrementalSync.triggers.includes('browser-open')) {
        this.hybridSyncService.incrementalSync().catch(err => {
          console.error('[Browser] Sync failed:', err);
        });
      }
    }
    
    // 立即显示界面
    this.show();
    
    // 加载卡片
    await this.loadCards();
  }
  
  async deleteCard(cardID: string) {
    // 1. 从本地删除
    this.storage.removeCard(cardID);
    await this.storage.saveCards();
    
    // 2. 删除同步
    if (this.hybridSyncService) {
      const success = await this.hybridSyncService.deleteSync(cardID);
      
      if (success) {
        showMessage('已从 Riff 删除', 2000, 'info');
      } else {
        showMessage('删除失败，已加入黑名单', 3000, 'warning');
      }
    }
    
    // 3. 刷新列表
    await this.loadCards();
  }
  
  async manualSync() {
    if (!this.hybridSyncService) return;
    
    const result = await this.hybridSyncService.incrementalSync();
    
    if (result.success) {
      showMessage(
        `同步成功：新增 ${result.addedCount} 张，跳过 ${result.skippedCount} 张`,
        3000,
        'info'
      );
      await this.loadCards();
    } else {
      showMessage(`同步失败：${result.errorMessage}`, 3000, 'error');
    }
  }
  
  async fullSync() {
    if (!this.hybridSyncService) return;
    
    const result = await this.hybridSyncService.fullSync();
    
    if (result.success) {
      showMessage(
        `全量同步完成：新增 ${result.addedCount} 张，删除 ${result.deletedCount} 张`,
        3000,
        'info'
      );
      await this.loadCards();
    } else {
      showMessage(`全量同步失败：${result.errorMessage}`, 3000, 'error');
    }
  }
}
```

### 复习界面集成

```typescript
class ReviewUI {
  private hybridSyncService?: HybridSyncService;
  
  constructor(hybridSyncService?: HybridSyncService) {
    this.hybridSyncService = hybridSyncService;
  }
  
  async open() {
    // 触发增量同步（后台）
    if (this.hybridSyncService) {
      const config = this.hybridSyncService.config;
      if (config.incrementalSync.enabled && 
          config.incrementalSync.triggers.includes('review-open')) {
        this.hybridSyncService.incrementalSync().catch(err => {
          console.error('[Review] Sync failed:', err);
        });
      }
    }
    
    // 立即显示界面
    this.show();
    
    // 加载下一张卡片
    await this.loadNextCard();
  }
}
```

## 最佳实践

### 1. 错误处理

```typescript
// ✅ 好：捕获错误，不影响用户体验
async function syncWithErrorHandling() {
  try {
    const result = await hybridSyncService.incrementalSync();
    
    if (result.success) {
      // 处理成功
      updateUI(result);
    } else {
      // 处理失败
      showError(result.errorMessage);
    }
  } catch (error) {
    // 捕获异常
    console.error('Unexpected error:', error);
    showError('同步失败，请稍后重试');
  }
}

// ❌ 不好：不处理错误
async function syncWithoutErrorHandling() {
  const result = await hybridSyncService.incrementalSync();
  updateUI(result); // 可能失败
}
```

### 2. 异步执行

```typescript
// ✅ 好：后台同步，不阻塞 UI
async function openBrowserAsync() {
  // 立即显示 UI
  this.show();
  
  // 后台同步
  this.hybridSyncService?.incrementalSync().catch(err => {
    console.error('Sync failed:', err);
  });
  
  // 加载卡片
  await this.loadCards();
}

// ❌ 不好：等待同步完成
async function openBrowserSync() {
  // 等待同步（阻塞 UI）
  await this.hybridSyncService?.incrementalSync();
  
  // 显示 UI
  this.show();
  await this.loadCards();
}
```

### 3. 配置验证

```typescript
// ✅ 好：验证配置
function createHybridSyncService(config: HybridSyncConfig) {
  // 验证必需字段
  if (!config.deckId) {
    throw new Error('deckId is required');
  }
  if (!config.storage) {
    throw new Error('storage is required');
  }
  
  // 验证间隔
  if (config.fullSync.enabled && config.fullSync.interval < 3600000) {
    console.warn('Full sync interval is too short, using 1 hour');
    config.fullSync.interval = 3600000;
  }
  
  return new HybridSyncService(config);
}
```

### 4. 状态监控

```typescript
// ✅ 好：监控同步状态
class SyncMonitor {
  private service: HybridSyncService;
  private statusCheckInterval: NodeJS.Timeout;
  
  constructor(service: HybridSyncService) {
    this.service = service;
    
    // 每秒检查状态
    this.statusCheckInterval = setInterval(() => {
      this.checkStatus();
    }, 1000);
  }
  
  private checkStatus() {
    const status = this.service.getSyncStatus();
    
    // 更新 UI
    this.updateStatusUI(status);
    
    // 记录日志
    if (status.status === 'error') {
      console.error('[Monitor] Sync error detected');
    }
  }
  
  destroy() {
    clearInterval(this.statusCheckInterval);
  }
}
```

### 5. 性能优化

```typescript
// ✅ 好：避免频繁同步
class SyncThrottler {
  private lastSyncTime = 0;
  private minInterval = 60000; // 最小间隔 1 分钟
  
  async sync(service: HybridSyncService) {
    const now = Date.now();
    
    if (now - this.lastSyncTime < this.minInterval) {
      console.log('[Throttler] Sync skipped (too frequent)');
      return;
    }
    
    this.lastSyncTime = now;
    await service.incrementalSync();
  }
}
```

## 常见问题

### Q: 增量同步和全量同步有什么区别？

**A**: 
- **增量同步**：只获取新卡片，快速（< 1s），适合日常使用
- **全量同步**：对比所有卡片，检测删除，慢（< 5s），适合定期维护

### Q: 什么时候应该手动触发全量同步？

**A**: 
- 怀疑数据不一致时
- 删除了大量卡片后
- 黑名单太大时
- 切换设备后

### Q: 删除同步失败怎么办？

**A**: 
- 卡片会自动加入黑名单
- 下次增量同步不会重新出现
- 下次全量同步会自动清理黑名单
- 可以手动触发全量同步

### Q: 如何禁用自动同步？

**A**: 
```typescript
const config: HybridSyncConfig = {
  incrementalSync: {
    enabled: false, // 禁用增量同步
    triggers: [],
    useBlacklist: true,
    autoDetectCardType: false
  },
  fullSync: {
    enabled: false, // 禁用全量同步
    interval: 86400000,
    cleanupBlacklist: true
  },
  deleteSync: {
    enabled: true, // 保留删除同步
    useBlacklistFallback: true
  }
};
```

### Q: 如何监听同步事件？

**A**: 
目前不支持事件监听，但可以通过轮询 `getSyncStatus()` 实现：

```typescript
setInterval(() => {
  const status = hybridSyncService.getSyncStatus();
  if (status.status === 'success') {
    console.log('Sync completed');
  }
}, 1000);
```

## 参考资料

- [架构文档](./RIFF_HYBRID_SYNC_ARCHITECTURE.md)
- [设计决策文档](./RIFF_HYBRID_SYNC_DESIGN_DECISIONS.md)
- [HybridSyncService 源码](../../src/services/HybridSyncService.ts)
- [需求文档](../../../.kiro/specs/riff-bidirectional-sync/requirements.md)
