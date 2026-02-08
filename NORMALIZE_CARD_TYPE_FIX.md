# normalizeToFSRSCard 卡片类型转换修复

## 问题描述

在打开 SRS 浏览器时，`normalizeToFSRSCard` 函数抛出错误：

```
[normalizeToFSRSCard] Unknown card type at index 41: 
{
  "id":"20230221091621-mef6m9n",
  "blockId":"20230221091621-mef6m9n",
  "due":1770737921000,
  "stability":0,
  "difficulty":0,
  "elapsedDays":0,
  "scheduledDays":0,
  "reps":5,
  "lapses":1,
  "state":3,
  "lastReview":1770161621016,
  "deckID":"20230218211946-2kw8jgx"
}
```

## 根本原因

### 1. 卡片数据格式

这张卡片来自 Riff API，具有以下特征：
- 有 `deckID` 字段（大写 ID）
- 缺少 FSRSCard 的扩展字段：`type`、`priority`、`tags`、`leechCount`、`isLeech`、`skipped`、`createdAt`、`updatedAt`

### 2. 类型检查逻辑

`normalizeToFSRSCard` 的检查顺序：
1. `isQueueItem(card)` - 检查是否是 QueueItem
2. `isFSRSCard(card)` - 检查是否是 FSRSCard
3. `hasAllRequiredFields` - 检查是否有所有必需字段
4. 如果都不满足 → 抛出错误

### 3. 问题所在

这张卡片：
- ✅ 有 `deckID` 字段，应该被识别为 QueueItem
- ❌ 但 `isQueueItem` 检查失败（可能是因为其他字段不匹配）
- ❌ `isFSRSCard` 检查失败（缺少扩展字段）
- ❌ `hasAllRequiredFields` 检查失败（缺少 `type` 等字段）
- ❌ 最终抛出"Unknown card type"错误

## 修复方案

在 `normalizeToFSRSCard` 函数的最后添加降级方案：

```typescript
// ⚠️ 最后的降级方案：如果卡片看起来像 Riff 卡片（有 deckID），尝试转换
if (card && typeof card === 'object' && 'deckID' in card) {
    console.warn(`[normalizeToFSRSCard] Card at index ${i} looks like a Riff card with deckID, attempting conversion:`, card.id);
    try {
        result.push(queueItemToFSRSCard(card));
    } catch (conversionError) {
        const error = `[normalizeToFSRSCard] Failed to convert Riff card at index ${i}: ${conversionError}`;
        errors.push(error);
        console.error(error, card);
    }
} else {
    const error = `[normalizeToFSRSCard] Unknown card type at index ${i}: ${JSON.stringify(card)}`;
    errors.push(error);
    console.error(error);
}
```

## 修复逻辑

### 检查顺序（修复后）

1. `isQueueItem(card)` - 检查是否是 QueueItem
2. `isFSRSCard(card)` - 检查是否是 FSRSCard
3. `hasAllRequiredFields` - 检查是否有所有必需字段
4. **🆕 降级方案**：检查是否有 `deckID` 字段
   - 如果有 → 尝试使用 `queueItemToFSRSCard` 转换
   - 如果转换失败 → 记录错误但不抛出异常
5. 如果都不满足 → 抛出错误

### queueItemToFSRSCard 转换

`queueItemToFSRSCard` 函数会：
1. 提取 Riff 卡片的核心字段
2. 填充缺失的扩展字段（使用默认值）
3. 返回完整的 FSRSCard 对象

```typescript
export function queueItemToFSRSCard(item: QueueItem): FSRSCard {
    return {
        // 核心字段
        id: item.cardID || item.id,
        blockId: item.blockID,
        due: item.due,
        stability: item.stability,
        difficulty: item.difficulty,
        reps: item.reps,
        lapses: item.lapses,
        state: item.state,
        lastReview: item.lastReview,
        elapsedDays: item.elapsedDays,
        scheduledDays: item.scheduledDays,
        
        // 扩展字段（使用默认值）
        priority: 50,
        type: CardType.Item,  // ✅ 默认为 Item 类型
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}
```

## 预期效果

### 修复前
- 遇到缺少 `type` 字段的 Riff 卡片 → 抛出错误
- SRS 浏览器无法打开
- 队列计数刷新失败

### 修复后
- 遇到缺少 `type` 字段的 Riff 卡片 → 使用降级方案转换
- 自动填充缺失的字段（使用默认值）
- SRS 浏览器正常打开
- 队列计数正常显示

## 测试步骤

1. 重新编译插件
2. 打开 SRS 浏览器
3. 查看控制台日志：
   - 应该看到警告：`[normalizeToFSRSCard] Card at index X looks like a Riff card with deckID, attempting conversion`
   - 不应该看到错误：`[normalizeToFSRSCard] Unknown card type`
4. 检查队列计数是否正常显示
5. 检查表格是否正常加载

## 可能的问题

### 问题 1: 转换后的卡片缺少某些字段

**原因**：`queueItemToFSRSCard` 使用默认值填充扩展字段

**影响**：
- `type` 默认为 `Item`（可能不准确）
- `priority` 默认为 50
- `tags` 默认为空数组
- `createdAt` 使用当前时间（不准确）

**解决方案**：
- 后续可以从块属性中读取这些字段
- 或者在数据迁移时补充这些字段

### 问题 2: isQueueItem 检查为什么失败

**需要排查**：
- 查看 `isQueueItem` 函数的实现
- 检查这张卡片为什么没有通过检查
- 可能需要放宽 `isQueueItem` 的检查条件

## 后续优化

1. **改进 isQueueItem 检查**
   - 放宽检查条件，只要有 `deckID` 就认为是 QueueItem
   - 或者添加更多的容错逻辑

2. **数据迁移**
   - 为所有 Riff 卡片补充 `type` 字段
   - 从块属性中读取 `priority`、`tags` 等字段

3. **类型推断**
   - 根据卡片内容自动推断 `type`（Topic/Item）
   - 使用启发式规则（如是否包含 `::`、`?` 等）

## 相关文件

- `siyuan-plugin-fsrs/src/diagnostics/type-guards.ts` - 类型检查和转换逻辑
- `siyuan-plugin-fsrs/src/types/card.ts` - FSRSCard 类型定义
- `siyuan-plugin-fsrs/src/types/queue.ts` - QueueItem 类型定义
