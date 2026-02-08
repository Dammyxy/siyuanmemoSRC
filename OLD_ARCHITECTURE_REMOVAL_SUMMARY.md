# 旧架构移除总结

## 完成的工作

已成功将所有使用旧架构 `IncrementalLearningQueue` 的代码迁移到新架构。

### 修改的文件

1. **`src/index.ts`**
   - ✅ 导入改为新架构：`import { IncrementalLearningQueue } from '@/queues/IncrementalLearningQueue'`
   - ✅ 添加 `QueueType` 导入
   - ✅ 修改初始化逻辑：通过 `UnifiedDataSourceManager.getQueue()` 获取队列实例
   - ✅ 移除旧的构造函数调用

2. **`src/services/DialogService.ts`**
   - ✅ 导入改为新架构：`import { IncrementalLearningQueue } from '@/queues/IncrementalLearningQueue'`
   - ✅ 类型定义更新（`DialogServiceDependencies` 接口）
   - ℹ️ 使用方式无需修改（只是传递队列实例）

3. **`src/ui/review/v2/providers/IncrementalLearningProvider.ts`**
   - ✅ 导入改为新架构
   - ✅ 添加 `UnifiedDataSourceManager` 和 `QueueType` 导入
   - ✅ 修改构造函数：通过 `UnifiedDataSourceManager.getQueue()` 获取队列实例
   - ✅ 修改 `getDueCards()`：使用 `getCards()` 替代 `getAllItems()`
   - ✅ 修改 `reviewCard()`：使用 `handleReview()` 替代 `onFeedback()`
   - ✅ 修改 `skipReviewCard()`：移除 `onFeedback()` 调用（新架构无此方法）
   - ✅ 修改 `getStats()`：基于本地数据计算，替代 `queue.getStats()`

4. **`src/managers/LifecycleManager.ts`**
   - ✅ 导入改为新架构
   - ℹ️ 此文件已废弃，不再使用，只更新导入以保持代码一致性

## API 差异对照

### 旧架构 API
```typescript
// 构造函数
new IncrementalLearningQueue({
  storage: StorageManager,
  scheduler: SchedulerEngineAdapter,
  schedulerRouter: SchedulerRouter,
  config: { enableRiffSync: boolean }
})

// 方法
queue.getAllItems(): Promise<QueueItem[]>
queue.onFeedback(card, { action, rating }): Promise<void>
queue.getStats(): Promise<Stats>
```

### 新架构 API
```typescript
// 获取实例（通过 UnifiedDataSourceManager）
const manager = UnifiedDataSourceManager.getInstance();
const queue = manager.getQueue(QueueType.IncrementalLearning);

// 方法
queue.getCards(): Promise<FSRSCard[]>
queue.handleReview(cardId, rating): Promise<void>
queue.addCard(card): Promise<void>
queue.removeCard(cardId): Promise<void>
```

## 关键变化

1. **实例化方式**
   - 旧：直接 `new IncrementalLearningQueue(options)`
   - 新：通过 `UnifiedDataSourceManager.getQueue(QueueType.IncrementalLearningQueue)`

2. **数据格式**
   - 旧：`QueueItem` 格式（有 `cardID`, `blockID`, `deckID` 等字段）
   - 新：`FSRSCard` 格式（有 `id`, `blockId`, `due` 等字段）

3. **方法名称**
   - 旧：`getAllItems()`, `onFeedback()`, `getStats()`
   - 新：`getCards()`, `handleReview()`, 无 `getStats()`

4. **依赖注入**
   - 旧：需要传入 `storage`, `scheduler`, `schedulerRouter`
   - 新：只需要 `UnifiedDataSourceManager`（内部管理所有依赖）

## 下一步工作

### 1. 删除旧架构代码（推荐）

```bash
# 删除旧架构文件
rm siyuan-plugin-fsrs/src/core/queue/strategies/IncrementalLearningQueue.ts
```

### 2. 清理存储数据

创建迁移脚本，移除所有卡片的 `deckID` 字段：

```typescript
// 伪代码
const cards = storage.getAllCards();
for (const card of cards) {
  if ('deckID' in card) {
    delete (card as any).deckID;
    storage.setCard(card);
  }
}
await storage.saveCards();
```

### 3. 测试验证

- [ ] 测试渐进学习队列的浏览器视图
- [ ] 测试渐进学习队列的复习功能
- [ ] 测试卡片添加/删除功能
- [ ] 测试评分功能
- [ ] 验证不再出现 `[normalizeToFSRSCard] Unknown card type` 错误

## 影响范围

### 已修复
- ✅ 浏览器视图加载渐进学习队列
- ✅ 复习对话框使用渐进学习队列
- ✅ 数据类型转换（通过类型守卫）

### 需要验证
- ⚠️ 渐进学习队列的所有功能是否正常
- ⚠️ 是否还有其他地方使用旧架构（测试文件除外）
- ⚠️ 存储数据是否需要清理

## 相关文档

- [QUEUEITEM_DATA_POLLUTION_ROOT_CAUSE.md](./QUEUEITEM_DATA_POLLUTION_ROOT_CAUSE.md) - 数据污染根本原因
- [OLD_ARCHITECTURE_USAGE_REPORT.md](./OLD_ARCHITECTURE_USAGE_REPORT.md) - 旧架构使用情况报告
- [INCREMENTAL_LEARNING_DATA_SOURCE_MIGRATION.md](./INCREMENTAL_LEARNING_DATA_SOURCE_MIGRATION.md) - 数据源迁移文档
