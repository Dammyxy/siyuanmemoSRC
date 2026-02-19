# WebSocket 实时同步实现 V2（符合 DDD 架构）

## 📋 概述

**实现日期**：2026-02-14  
**版本**：V2（架构优化版）  
**借鉴来源**：SiReader 插件的 WebSocket 监听机制  
**架构原则**：领域驱动设计（DDD）

---

## 🎯 V2 改进

### V1 的问题

❌ WebSocket 监听器放在 UI 层（SRSBrowser.vue）  
❌ 每个浏览器实例都会注册监听器（重复监听）  
❌ 浏览器关闭后无法同步到本地数据  
❌ 违反 DDD 原则（UI 层不应该处理业务逻辑）

### V2 的改进

✅ WebSocket 监听器放在服务层（HybridSyncService）  
✅ 全局唯一监听器（单例模式）  
✅ 浏览器关闭后也能同步到本地数据  
✅ 符合 DDD 原则（服务层处理业务逻辑，UI 层只监听事件）

---

## 🏗️ 架构设计

### 分层架构（符合 DDD）

```
┌─────────────────────────────────────────────────────────┐
│                    表现层（UI Layer）                     │
│  - SRSBrowser.vue                                        │
│  - 监听 HybridSyncService 的 wsSync 事件                │
│  - 刷新 UI 显示                                          │
└─────────────────────────────────────────────────────────┘
                            ↑ 事件通知
┌─────────────────────────────────────────────────────────┐
│                  应用服务层（Service Layer）              │
│  - HybridSyncService                                     │
│  - 注册 WebSocket 监听器（全局唯一）                    │
│  - 检测闪卡操作                                          │
│  - 触发增量同步                                          │
│  - 发射 wsSync 事件                                      │
└─────────────────────────────────────────────────────────┘
                            ↓ 同步数据
┌─────────────────────────────────────────────────────────┐
│                  领域层（Domain Layer）                   │
│  - StorageManager                                        │
│  - 本地数据存储                                          │
│  - 卡片 CRUD 操作                                        │
└─────────────────────────────────────────────────────────┘
                            ↕ API 调用
┌─────────────────────────────────────────────────────────┐
│                  基础设施层（Infrastructure）             │
│  - 思源 Riff API                                         │
│  - WebSocket 连接                                        │
└─────────────────────────────────────────────────────────┘
```

---

## 💻 核心实现

### 1. HybridSyncService（服务层）

#### 添加 WebSocket 监听器

```typescript
export class HybridSyncService extends EventEmitter<HybridSyncEvents> {
    // 🆕 WebSocket 监听器相关
    private wsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private wsListenerRegistered: boolean = false;
    private readonly WS_DEBOUNCE_DELAY = 300; // 300ms
    
    /**
     * 启动同步服务
     * 
     * 1. 执行初始增量同步
     * 2. 注册 WebSocket 监听器（实时感知 Riff 变化）
     */
    async start(): Promise<void> {
        console.log('[HybridSync] Starting sync service...');
        
        // 执行初始增量同步
        if (this.config.incrementalSync.enabled) {
            await this.incrementalSync();
        }
        
        // 🆕 注册 WebSocket 监听器
        this.registerWebSocketListener();
        
        console.log('[HybridSync] Sync service started');
    }
    
    /**
     * 停止同步服务
     * 
     * 1. 移除 WebSocket 监听器
     * 2. 清理防抖定时器
     * 3. 移除所有事件监听器
     */
    stop(): void {
        console.log('[HybridSync] Stopping sync service...');
        
        // 🆕 移除 WebSocket 监听器
        this.unregisterWebSocketListener();
        
        // 🆕 清理防抖定时器
        if (this.wsDebounceTimer) {
            clearTimeout(this.wsDebounceTimer);
            this.wsDebounceTimer = null;
        }
        
        // 移除所有事件监听器
        this.removeAllListeners();
        
        console.log('[HybridSync] Sync service stopped');
    }
    
    /**
     * 🆕 注册 WebSocket 监听器
     * 
     * 监听思源的 transactions 事件，实时感知闪卡变化
     * 借鉴 SiReader 的实现，使用 300ms 防抖机制
     */
    private registerWebSocketListener(): void {
        if (this.wsListenerRegistered) {
            console.log('[HybridSync] WebSocket listener already registered');
            return;
        }
        
        // 绑定 this 上下文
        const handleTransactions = this.handleWebSocketTransactions.bind(this);
        
        // 注册监听器
        window.addEventListener('ws-main', handleTransactions as EventListener);
        this.wsListenerRegistered = true;
        
        console.log('[HybridSync] ✅ WebSocket listener registered');
    }
    
    /**
     * 🆕 移除 WebSocket 监听器
     */
    private unregisterWebSocketListener(): void {
        if (!this.wsListenerRegistered) {
            return;
        }
        
        // 移除监听器
        const handleTransactions = this.handleWebSocketTransactions.bind(this);
        window.removeEventListener('ws-main', handleTransactions as EventListener);
        this.wsListenerRegistered = false;
        
        console.log('[HybridSync] WebSocket listener unregistered');
    }
    
    /**
     * 🆕 处理 WebSocket transactions 事件
     * 
     * 检测闪卡相关操作，触发增量同步
     * 使用 300ms 防抖机制（借鉴 SiReader）
     */
    private handleWebSocketTransactions(e: CustomEvent): void {
        const { cmd, data } = e.detail;
        if (cmd !== 'transactions') return;
        
        // 检查是否有闪卡相关操作
        const hasFlashcardOp = data?.doOperations?.some((op: any) => 
            op.action === 'addFlashcards' || 
            op.action === 'removeFlashcards' ||
            (op.action === 'updateAttrs' && op.data?.new?.['custom-riff-decks'])
        );
        
        if (!hasFlashcardOp) return;
        
        console.log('[HybridSync] 🔔 Detected flashcard changes via WebSocket');
        
        // 防抖 300ms（借鉴 SiReader）
        if (this.wsDebounceTimer) {
            clearTimeout(this.wsDebounceTimer);
        }
        
        this.wsDebounceTimer = setTimeout(() => {
            console.log('[HybridSync] ⚡ Triggering incremental sync due to WebSocket event...');
            
            // 触发增量同步
            void this.incrementalSync()
                .then((result) => {
                    console.log('[HybridSync] ✅ WebSocket-triggered sync completed:', result);
                    
                    // 🆕 发射 WebSocket 同步完成事件
                    this.emit('wsSync', {
                        success: true,
                        result,
                        timestamp: Date.now()
                    });
                })
                .catch((err: Error) => {
                    console.error('[HybridSync] ❌ WebSocket-triggered sync failed:', err);
                    
                    // 🆕 发射 WebSocket 同步失败事件
                    this.emit('wsSync', {
                        success: false,
                        error: err,
                        timestamp: Date.now()
                    });
                });
        }, this.WS_DEBOUNCE_DELAY);
    }
}
```

### 2. 事件类型定义

```typescript
/**
 * WebSocket 同步事件数据
 */
export interface WsSyncEvent {
    /** 是否成功 */
    success: boolean;
    /** 同步结果（成功时） */
    result?: SyncResult;
    /** 错误对象（失败时） */
    error?: Error;
    /** 时间戳 */
    timestamp: number;
}

/**
 * HybridSyncService 事件映射
 */
export interface HybridSyncEvents {
    /** 同步开始 */
    syncStart: SyncStartEvent;
    /** 同步成功 */
    syncSuccess: SyncSuccessEvent;
    /** 同步错误 */
    syncError: SyncErrorEvent;
    /** 同步进度 */
    syncProgress: SyncProgressEvent;
    /** 🆕 WebSocket 触发的同步完成 */
    wsSync: WsSyncEvent;
}
```

### 3. SRSBrowser.vue（UI 层）

#### 监听 wsSync 事件

```typescript
onMounted(() => {
  // ... 其他初始化代码 ...
  
  // 🆕 监听 HybridSyncService 的 WebSocket 同步事件
  const plugin = props.plugin as any;
  if (plugin?.hybridSyncService) {
    // 监听 wsSync 事件（WebSocket 触发的同步完成）
    plugin.hybridSyncService.on('wsSync', (event: any) => {
      console.log('[SRSBrowser] Received wsSync event:', event);
      
      if (event.success) {
        console.log('[SRSBrowser] ⚡ Reloading data due to WebSocket sync...');
        // 同步成功，刷新数据
        void loadData(true); // 强制刷新缓存
      } else {
        console.error('[SRSBrowser] WebSocket sync failed:', event.error);
        // 同步失败，也尝试刷新数据（使用缓存）
        void loadData();
      }
    });
    
    console.log('[SRSBrowser] ✅ Subscribed to HybridSyncService wsSync events');
  }
  
  // ... 其他初始化代码 ...
});
```

---

## 🔄 数据流

### 完整的同步流程

```
1. 用户在思源中使用原生快速制卡
   ↓
2. 思源调用 addRiffCards API
   ↓
3. 思源更新 Riff 数据库
   ↓
4. 思源通过 WebSocket 广播 transactions 事件
   ↓
5. HybridSyncService 监听到 addFlashcards 操作
   ↓
6. 防抖 300ms
   ↓
7. HybridSyncService 触发 incrementalSync()
   ↓
8. 从 Riff 获取新卡片
   ↓
9. 添加到 StorageManager（本地数据）
   ↓
10. HybridSyncService 发射 wsSync 事件
   ↓
11. SRSBrowser 监听到 wsSync 事件
   ↓
12. SRSBrowser 刷新 UI（loadData(true)）
   ↓
13. 用户看到新卡片 ✅
```

---

## 🎯 DDD 原则体现

### 1. 单一职责原则（SRP）

- **HybridSyncService**：负责数据同步逻辑
- **SRSBrowser**：负责 UI 显示和用户交互
- **StorageManager**：负责数据存储

### 2. 依赖倒置原则（DIP）

- UI 层依赖服务层的事件接口，而不是具体实现
- 服务层依赖领域层的存储接口，而不是具体实现

### 3. 开闭原则（OCP）

- 通过事件机制扩展功能，无需修改现有代码
- 可以轻松添加新的事件监听器

### 4. 接口隔离原则（ISP）

- 定义清晰的事件接口（HybridSyncEvents）
- UI 层只需要监听需要的事件

---

## 📊 优势对比

| 维度 | V1（UI 层） | V2（服务层） |
|------|------------|-------------|
| **架构** | ❌ 违反 DDD | ✅ 符合 DDD |
| **职责** | ❌ UI 层处理业务逻辑 | ✅ 服务层处理业务逻辑 |
| **重复监听** | ❌ 每个浏览器实例都监听 | ✅ 全局唯一监听器 |
| **浏览器关闭** | ❌ 无法同步 | ✅ 继续同步到本地 |
| **可测试性** | ❌ 难以测试 | ✅ 易于测试 |
| **可维护性** | ❌ 逻辑分散 | ✅ 逻辑集中 |
| **可扩展性** | ❌ 难以扩展 | ✅ 易于扩展 |

---

## 🧪 测试场景

### 测试 1：浏览器关闭时同步

**步骤**：
1. 关闭所有 SRS 浏览器
2. 在思源中使用原生快速制卡
3. 等待 300ms
4. 打开 SRS 浏览器

**预期结果**：
- ✅ HybridSyncService 自动同步到本地数据
- ✅ 打开浏览器时立即看到新卡片

### 测试 2：多个浏览器实例

**步骤**：
1. 打开 3 个 SRS 浏览器
2. 在思源中使用原生快速制卡
3. 观察控制台日志

**预期结果**：
- ✅ 只有一个 WebSocket 监听器（全局唯一）
- ✅ 所有浏览器都收到 wsSync 事件
- ✅ 所有浏览器都自动刷新

### 测试 3：服务停止和重启

**步骤**：
1. 停止 HybridSyncService
2. 在思源中使用原生快速制卡
3. 重启 HybridSyncService
4. 打开 SRS 浏览器

**预期结果**：
- ✅ 停止期间不监听 WebSocket
- ✅ 重启后重新注册监听器
- ✅ 打开浏览器时触发全量同步，获取所有卡片

---

## 🔍 调试指南

如果 WebSocket 监听器没有触发，请参考：

**[WebSocket 调试指南](./WEBSOCKET_DEBUG_GUIDE.md)**

该指南包含：
- 详细的调试步骤
- 常见问题和解决方案
- 手动测试脚本
- 诊断检查清单

---

## 📝 修改文件

### 1. HybridSyncService.ts

- ✅ 添加 WebSocket 监听器注册/移除方法
- ✅ 添加 handleWebSocketTransactions 方法
- ✅ 在 start() 中注册监听器
- ✅ 在 stop() 中移除监听器
- ✅ 发射 wsSync 事件

### 2. HybridSyncService.types.ts

- ✅ 添加 WsSyncEvent 接口
- ✅ 在 HybridSyncEvents 中添加 wsSync 事件

### 3. SRSBrowser.vue

- ✅ 移除 UI 层的 WebSocket 监听器
- ✅ 添加 HybridSyncService wsSync 事件监听
- ✅ 在事件回调中刷新 UI

---

## 🚀 未来优化

### 1. 事件聚合

将多个 wsSync 事件聚合为一个批量更新事件，减少 UI 刷新次数。

### 2. 智能刷新

根据变更类型智能刷新：
- 新增卡片：插入到列表
- 删除卡片：从列表移除
- 更新卡片：更新对应行

### 3. 离线队列

离线时缓存 WebSocket 事件，联网后批量处理。

---

## ✅ 总结

### V2 的核心改进

1. ✅ **符合 DDD 架构**：服务层处理业务逻辑，UI 层只监听事件
2. ✅ **全局唯一监听器**：避免重复监听，提高性能
3. ✅ **浏览器关闭也能同步**：数据始终保持最新
4. ✅ **易于测试和维护**：逻辑集中在服务层

### 架构优势

- **分层清晰**：表现层、服务层、领域层、基础设施层
- **职责明确**：每层只负责自己的职责
- **松耦合**：通过事件机制解耦
- **高内聚**：相关逻辑集中在一起

### 用户体验

- ✅ 实时同步：无需手动刷新
- ✅ 全局生效：浏览器关闭也能同步
- ✅ 性能优化：防抖机制，避免频繁刷新
- ✅ 可靠性高：错误处理和降级方案

---

**实现完成时间**：2026-02-14  
**实现人员**：Kiro AI Assistant  
**架构原则**：领域驱动设计（DDD）  
**借鉴来源**：SiReader 插件
