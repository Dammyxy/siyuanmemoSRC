# QueueItem 数据污染根本原因分析

## 问题现象

浏览器加载渐进学习队列时报错：
```
[normalizeToFSRSCard] Unknown card type at index 0: {
  "id": "20260203222457-raq2sfs",
  "blockId": "20260203222457-raq2sfs",
  "due": ...,
  "stability": 0,
  "deckID": "..."
}
```

卡片同时具有：
- `deckID` 字段（QueueItem 特征）
- `id` 和 `blockId` 字段（FSRSCard 特征）
- 缺少 `cardID` 和 `blockID` 字段（QueueItem 必需字段）

## 根本原因

### 1. 旧架构仍在运行

**旧架构的 `IncrementalLearningQueue`**（位于 `src/core/queue/strategies/IncrementalLearningQueue.ts`）仍在使用，并且它：

1. **从 Riff API 加载数据**，转换为 `QueueItem` 格式（带 `deckID` 字段）
2. **创建本地卡片时**，使用 FSRSCard 格式但**没有清理 QueueItem 字段**
3. **调用 `storage.setCard()`** 将混合格式的数据写入存储

### 2. 数据污染路径

```
旧架构 IncrementalLearningQueue
  ↓
从 Riff API 加载 → QueueItem 格式（有 deckID）
  ↓
创建本地卡片 → FSRSCard 格式（有 id, blockId）
  ↓
但保留了 deckID 字段！
  ↓
storage.setCard(混合格式卡片)
  ↓
存储缓存被污染
  ↓
新架构读取 → 类型守卫失败
```

### 3. 具体代码位置

**旧架构创建卡片**（`src/core/queue/strategies/IncrementalLearningQueue.ts:780-810`）：

```typescript
// 🆕 如果卡片不存在，创建默认的 FSRSCard
if (!localCard) {
  const now = Date.now();
  localCard = {
    id: cardID,           // ✅ FSRSCard 字段
    blockId: blockID,     // ✅ FSRSCard 字段
    due: now,
    stability: 0,
    // ... 其他 FSRSCard 字段
  };
  
  // ❌ 问题：这个 localCard 可能来自 riffBuffer 中的 QueueItem
  // riffBuffer 中的 item 有 deckID 字段
  // 如果 localCard 是从 item 复制的，会保留 deckID
  
  this.storage.setCard(localCard);  // ❌ 写入混合格式
}
```

**旧架构的 riffBuffer**（`src/core/queue/strategies/IncrementalLearningQueue.ts:187`）：

```typescript
private riffBuffer: QueueItem[] = [];  // ❌ 存储 QueueItem 格式
```

## 为什么类型守卫失败

原来的 `isQueueItem()` 检查：
```typescript
'deckID' in obj &&  // ✅ 通过（有 deckID）
(
  ('cardID' in obj) ||  // ❌ 失败（没有 cardID）
  ('blockID' in obj) || // ❌ 失败（没有 blockID）
  ('cardId' in obj) ||  // ❌ 失败（没有 cardId）
  ('blockId' in obj)    // ✅ 通过（有 blockId）
)
```

但是！`blockId` 是 FSRSCard 的字段，不是 QueueItem 的字段！

所以卡片既不是完整的 QueueItem（缺少 cardID/blockID），也不是完整的 FSRSCard（多了 deckID）。

## 解决方案

### 短期修复（已完成）

更新 `isQueueItem()` 类型守卫，支持 `id` 字段作为 `cardID` 的替代：

```typescript
export function isQueueItem(obj: any): obj is QueueItem {
    return (
        obj &&
        typeof obj === 'object' &&
        'deckID' in obj &&
        obj.deckID !== undefined &&
        obj.deckID !== null &&
        (
            ('cardID' in obj && obj.cardID !== undefined && obj.cardID !== null) ||
            ('blockID' in obj && obj.blockID !== undefined && obj.blockID !== null) ||
            ('cardId' in obj && obj.cardId !== undefined && obj.cardId !== null) ||
            ('blockId' in obj && obj.blockId !== undefined && obj.blockId !== null) ||
            ('id' in obj && obj.id !== undefined && obj.id !== null)  // 🆕 支持 id 字段
        )
    );
}
```

这样，混合格式的卡片会被识别为 QueueItem，然后通过 `queueItemToFSRSCard()` 转换为纯 FSRSCard。

### 长期修复（建议）

1. **完全移除旧架构**
   - 删除 `src/core/queue/strategies/IncrementalLearningQueue.ts`
   - 确保所有代码都使用新架构 `src/queues/IncrementalLearningQueue.ts`

2. **清理存储数据**
   - 创建迁移脚本，清理所有卡片的 `deckID` 字段
   - 确保存储中只有纯 FSRSCard 格式

3. **添加数据验证**
   - 在 `storage.setCard()` 中添加验证，拒绝混合格式
   - 在 `storage.getAllCards()` 中添加清理逻辑

## 影响范围

所有使用旧架构 `IncrementalLearningQueue` 的地方都可能产生污染数据：

1. ✅ 浏览器视图（已通过类型守卫修复）
2. ⚠️ 存储数据（需要清理）
3. ⚠️ 其他队列（如果共享存储）

## 验证方法

1. 检查存储中的卡片是否有 `deckID` 字段：
   ```typescript
   const cards = storage.getAllCards();
   const polluted = cards.filter(c => 'deckID' in c);
   console.log('Polluted cards:', polluted.length);
   ```

2. 检查是否还有代码使用旧架构：
   ```bash
   grep -r "from.*core/queue/strategies/IncrementalLearningQueue" src/
   ```

## 总结

- **根本原因**：旧架构和新架构并存，旧架构写入混合格式数据
- **短期修复**：更新类型守卫，容忍混合格式
- **长期修复**：移除旧架构，清理存储数据
- **教训**：迁移时要确保旧代码完全停用，避免数据污染
