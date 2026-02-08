# 旧架构使用情况报告

## 问题总结

**旧架构的 `IncrementalLearningQueue`** 仍在 4 个地方被使用，导致数据污染问题。

## 使用位置

### 1. `src/index.ts`
```typescript
import { IncrementalLearningQueue } from '@/core/queue/strategies/IncrementalLearningQueue';
```

**影响**：插件主入口，可能在初始化时创建旧架构队列实例。

### 2. `src/ui/review/v2/providers/IncrementalLearningProvider.ts`
```typescript
import { IncrementalLearningQueue } from '@/core/queue/strategies/IncrementalLearningQueue';
```

**影响**：复习视图提供者，在复习时使用旧架构队列。

### 3. `src/services/DialogService.ts`
```typescript
import { IncrementalLearningQueue } from '@/core/queue/strategies/IncrementalLearningQueue';
```

**影响**：对话框服务，可能在打开复习对话框时使用旧架构。

### 4. `src/managers/LifecycleManager.ts`
```typescript
import { IncrementalLearningQueue } from '@/core/queue/strategies/IncrementalLearningQueue';
```

**影响**：生命周期管理器，可能在插件启动时初始化旧架构队列。

## 数据污染机制

```
用户操作（复习/浏览）
  ↓
旧架构 IncrementalLearningQueue 被调用
  ↓
从 Riff API 加载数据 → QueueItem 格式（有 deckID）
  ↓
创建本地卡片 → FSRSCard 格式（有 id, blockId）
  ↓
但保留了 deckID 字段！（混合格式）
  ↓
storage.setCard(混合格式卡片)
  ↓
存储缓存被污染
  ↓
新架构读取 → 类型守卫失败 → 报错
```

## 解决方案

### 方案 1：立即停用旧架构（推荐）

将所有 4 个文件中的导入改为新架构：

```typescript
// 旧：
import { IncrementalLearningQueue } from '@/core/queue/strategies/IncrementalLearningQueue';

// 新：
import { IncrementalLearningQueue } from '@/queues/IncrementalLearningQueue';
```

**优点**：
- 彻底解决数据污染问题
- 统一使用新架构
- 避免未来的混淆

**缺点**：
- 需要测试所有受影响的功能
- 可能需要调整代码以适配新 API

### 方案 2：保持类型守卫修复（临时）

保持当前的类型守卫修复，容忍混合格式数据。

**优点**：
- 无需修改现有代码
- 快速修复浏览器报错

**缺点**：
- 数据污染持续发生
- 技术债务累积
- 未来可能出现更多问题

## 建议行动

1. **立即**：使用方案 2（类型守卫修复）解决当前报错
2. **短期**：创建迁移任务，将所有旧架构使用改为新架构
3. **中期**：添加数据清理脚本，移除所有卡片的 `deckID` 字段
4. **长期**：删除旧架构代码，防止未来误用

## 验证清单

- [ ] 检查 `src/index.ts` 中的队列初始化逻辑
- [ ] 检查 `IncrementalLearningProvider` 是否还在使用
- [ ] 检查 `DialogService` 中的队列创建逻辑
- [ ] 检查 `LifecycleManager` 中的队列初始化
- [ ] 搜索所有 `new IncrementalLearningQueue(` 的调用
- [ ] 确认新架构 API 是否兼容旧架构的使用方式

## 相关文档

- [QUEUEITEM_DATA_POLLUTION_ROOT_CAUSE.md](./QUEUEITEM_DATA_POLLUTION_ROOT_CAUSE.md) - 数据污染根本原因
- [REMOVE_LEGACY_FALLBACK_SUMMARY.md](./REMOVE_LEGACY_FALLBACK_SUMMARY.md) - 移除降级逻辑总结
- [INCREMENTAL_LEARNING_DATA_SOURCE_MIGRATION.md](./INCREMENTAL_LEARNING_DATA_SOURCE_MIGRATION.md) - 数据源迁移文档
