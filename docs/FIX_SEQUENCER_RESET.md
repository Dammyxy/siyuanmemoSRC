# 修复：Sequencer 重置逻辑

## 问题描述

提取练习队列在评分后，卡片一直是同一张，没有切换到下一张。

## 根本原因

`PrioritySequencer` 在第一次调用 `next()` 时会加载所有卡片到 `this.items` 数组，后续调用直接从数组中取出（使用 `shift()`）。

当 `BaseCompositeQueue.onFeedback()` 调用 `dataSource.remove()` 移除卡片后，`PrioritySequencer` 的 `items` 数组中仍然有这些卡片，导致下次调用 `next()` 时返回的仍然是刚才评分的卡片。

## 解决方案

### 步骤 1：在 PrioritySequencer 中添加 reset() 方法

```typescript
/**
 * 🆕 重置 sequencer，清空 items 数组并重新加载
 * 用于支持 ProviderBackedQueueStrategy 的重新加载逻辑
 */
reset(): void {
  this.loaded = false;
  this.items.length = 0;
}
```

### 步骤 2：在 BaseCompositeQueue.onFeedback() 中调用 reset()

```typescript
async onFeedback(currentItem, feedback) {
  if (feedback.action === 'rate') {
    // ... 评分逻辑

    // 🆕 重置 sequencer，以便重新加载队列
    if (typeof (this.sequencer as any)?.reset === 'function') {
      (this.sequencer as any).reset();
    }
  }
}
```

## 工作原理

1. 用户评分后，`BaseCompositeQueue.onFeedback()` 根据卡片状态决定是否从 `dataSource` 中移除
2. 调用 `sequencer.reset()` 清空 `PrioritySequencer` 的 `items` 数组
3. `ProviderBackedQueueStrategy` 重新加载队列时，`PrioritySequencer` 的 `loaded` 标志已经是 `false`
4. 下次调用 `next()` 时，`PrioritySequencer` 会重新调用 `fetchAll()` 加载卡片
5. `fetchAll()` 调用 `hybridSource.getAll()`，返回更新后的 buffer（已经移除了应该移除的卡片）

## 测试步骤

1. 重新编译：`npm run build`
2. 在提取练习队列中测试评分 1
3. **预期**：卡片保留在队列中，但切换到下一张卡片

## 相关文件

- `siyuan-plugin-fsrs/src/core/queue/sequencers/PrioritySequencer.ts` - 添加 reset() 方法
- `siyuan-plugin-fsrs/src/core/queue/composite/BaseCompositeQueue.ts` - 调用 reset()
- `siyuan-plugin-fsrs/src/core/queue/strategies/RetrievalPracticeQueue.ts` - RetrievalHybridDataSource

## 相关文档

- `FIX_CARD_REMOVAL_LOGIC.md` - 卡片移除逻辑修复
- `FIX_PRIORITY_SEQUENCER_RELOAD.md` - PrioritySequencer 重新加载问题分析
- `DEBUG_CARD_REMOVAL.md` - 调试指南
