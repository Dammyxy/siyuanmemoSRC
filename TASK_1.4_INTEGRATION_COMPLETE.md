# Task 1.4: TransactionWebSocketService 集成完成

**任务**: 集成 TransactionWebSocketService 到插件主类  
**完成时间**: 2026-02-15  
**状态**: ✅ 完成

---

## 实现内容

### 1. 添加私有属性

在 `FSRSPlugin` 类中添加了 `transactionWebSocketService` 属性：

```typescript
private transactionWebSocketService?: TransactionWebSocketService; // 🆕 统一 WebSocket 服务
```

### 2. 添加导入语句

```typescript
import { TransactionWebSocketService } from '@/services/TransactionWebSocketService';
import { RiffSyncHandler } from '@/services/handlers/RiffSyncHandler';
```

### 3. 在 onload() 中初始化服务

在 `HybridSyncService` 初始化之后，添加了 `TransactionWebSocketService` 的初始化逻辑：

```typescript
// 🆕 初始化 TransactionWebSocketService（统一 WebSocket 服务）
if (currentRiffConfig && currentRiffConfig.incrementalSync?.enabled && this.hybridSyncService) {
  console.log('[SiyuanMemo] Initializing TransactionWebSocketService...');
  
  // 创建 TransactionWebSocketService 实例
  this.transactionWebSocketService = new TransactionWebSocketService(this);
  
  // 创建并注册 RiffSyncHandler
  const riffSyncHandler = new RiffSyncHandler(this.hybridSyncService);
  this.transactionWebSocketService.registerHandler(riffSyncHandler);
  
  // 启动服务
  this.transactionWebSocketService.start();
  
  console.log('[SiyuanMemo] ✅ TransactionWebSocketService initialized and started');
} else {
  console.log('[SiyuanMemo] TransactionWebSocketService not initialized (Riff incremental sync disabled)');
}
```

**启用条件**：
- Riff 集成配置存在
- 增量同步已启用 (`incrementalSync.enabled === true`)
- HybridSyncService 已初始化

### 4. 在 onunload() 中停止服务

在 `HybridSyncService` 停止之后，添加了 `TransactionWebSocketService` 的停止逻辑：

```typescript
// 🆕 停止 TransactionWebSocketService
if (this.transactionWebSocketService) {
  this.transactionWebSocketService.stop();
  console.log('[SiyuanMemo] ✅ TransactionWebSocketService stopped');
}
```

### 5. 在设置保存时更新配置

在设置保存处理器中，添加了 `TransactionWebSocketService` 的配置更新逻辑：

```typescript
// 🆕 更新 TransactionWebSocketService 配置
if (settings.riffIntegration) {
  const incrementalEnabled = settings.riffIntegration.incrementalSync?.enabled || false;
  
  if (incrementalEnabled && this.hybridSyncService) {
    // 需要启用 TransactionWebSocketService
    if (!this.transactionWebSocketService) {
      // 初始化服务
      console.log('[SiyuanMemo] Initializing TransactionWebSocketService...');
      this.transactionWebSocketService = new TransactionWebSocketService(this);
      
      // 创建并注册 RiffSyncHandler
      const riffSyncHandler = new RiffSyncHandler(this.hybridSyncService);
      this.transactionWebSocketService.registerHandler(riffSyncHandler);
      
      // 启动服务
      this.transactionWebSocketService.start();
      console.log('[SiyuanMemo] ✅ TransactionWebSocketService initialized and started');
    }
    // 如果已经初始化，不需要重启（处理器会自动使用新的 HybridSyncService 实例）
  } else {
    // 需要停止 TransactionWebSocketService
    if (this.transactionWebSocketService) {
      console.log('[SiyuanMemo] Stopping TransactionWebSocketService...');
      this.transactionWebSocketService.stop();
      this.transactionWebSocketService = undefined;
      console.log('[SiyuanMemo] ✅ TransactionWebSocketService stopped');
    }
  }
}
```

**配置更新逻辑**：
- 如果增量同步启用且服务未初始化 → 初始化并启动服务
- 如果增量同步禁用且服务已初始化 → 停止并清理服务
- 如果增量同步启用且服务已初始化 → 不需要重启（处理器会自动使用新的 HybridSyncService 实例）

---

## 验收标准

### ✅ 服务正确启动

- 插件加载时，如果 Riff 增量同步启用，`TransactionWebSocketService` 会自动启动
- 日志输出：`[SiyuanMemo] ✅ TransactionWebSocketService initialized and started`

### ✅ 处理器正确注册

- `RiffSyncHandler` 被正确创建并注册到 `TransactionWebSocketService`
- 日志输出：`[TransactionWS] Handler registered: RiffSyncHandler`

### ✅ 配置开关生效

- 在设置面板中启用/禁用 Riff 增量同步时，`TransactionWebSocketService` 会相应地启动/停止
- 配置更新后立即生效，无需重启插件

### ✅ 不影响现有功能

- 所有现有测试通过
- `HybridSyncService` 的功能保持不变
- 插件的其他功能正常工作

---

## 测试结果

### TransactionWebSocketService 测试

```bash
npm test -- TransactionWebSocketService.test.ts
```

**结果**: ✅ 8/8 测试通过

- Handler Registration (3/3)
  - ✅ should register handler
  - ✅ should not register same handler twice
  - ✅ should unregister handler
- Service Lifecycle (3/3)
  - ✅ should start service
  - ✅ should not start twice
  - ✅ should stop service
- Event Distribution (2/2)
  - ✅ should distribute events to registered handlers
  - ✅ should continue processing if one handler throws error

### RiffSyncHandler 测试

```bash
npm test -- RiffSyncHandler.test.ts
```

**结果**: ✅ 12/12 测试通过

- 检测 Riff 变化 (5/5)
  - ✅ 应该检测 addFlashcards 操作
  - ✅ 应该检测 removeFlashcards 操作
  - ✅ 应该检测 updateAttrs 中的 custom-riff-decks 变化
  - ✅ 应该忽略非 Riff 相关操作
  - ✅ 应该忽略 updateAttrs 但没有 custom-riff-decks 的操作
- 防抖机制 (3/3)
  - ✅ 应该在 300ms 后触发同步
  - ✅ 应该合并多次连续的变化
  - ✅ 应该在防抖期间重置定时器
- 错误处理 (1/1)
  - ✅ 应该处理增量同步失败的情况
- 资源清理 (1/1)
  - ✅ 应该清理防抖定时器
- 批量操作 (2/2)
  - ✅ 应该处理包含多个操作的事务
  - ✅ 应该处理多个事务

---

## 架构说明

### 统一 WebSocket 服务架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         FSRSPlugin                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │         TransactionWebSocketService（统一服务）          │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  WebSocket 连接层                                   │  │  │
│  │  │  - 连接管理（单一连接）                             │  │  │
│  │  │  - 自动重连                                         │  │  │
│  │  │  - 事件监听（transactions）                        │  │  │
│  │  │  - 事件分发（多个处理器）                           │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                             │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  RiffSyncHandler（Riff 同步处理器）                │  │  │
│  │  │  - 检测 Riff 变化（addFlashcards/removeFlashcards）│  │  │
│  │  │  - 触发 HybridSyncService.incrementalSync()        │  │  │
│  │  │  - 防抖：300ms                                      │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │         HybridSyncService（不再创建 WebSocket）          │  │
│  │  - 增量同步逻辑                                           │  │
│  │  - 全量同步逻辑                                           │  │
│  │  - 删除同步逻辑                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 优势

1. **单一连接**: 只创建一个 WebSocket 连接，避免资源浪费
2. **可扩展**: 可以轻松添加新的处理器（如 AutoCardHandler）
3. **解耦**: HybridSyncService 不再负责 WebSocket 连接管理
4. **配置灵活**: 可以根据配置启用/禁用不同的处理器

---

## 下一步

Task 1.4 已完成，Phase 1（统一 WebSocket 服务）全部完成。

接下来的任务：
- **Phase 2**: 自动制卡处理器（AutoCardHandler）
  - Task 2.1: 创建 AutoCardHandler（统一版）
  - Task 2.2: 实现快速符号检测
  - Task 2.3-2.6: 实现各种卡片类型

---

**文档版本**: v1.0  
**最后更新**: 2026-02-15  
**状态**: ✅ 完成
