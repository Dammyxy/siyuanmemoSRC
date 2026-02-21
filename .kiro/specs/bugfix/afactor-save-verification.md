# A-Factor 保存验证

## 问题描述

用户反馈：在【编辑SRS数据】对话框中，所有 Topic 卡片的 A-Factor 都显示为 "-"。

## 已完成的修复

1. ✅ **创建时初始化**：`XiuyuanSyncService.convertRiffCardToFSRSCard()` 为 Topic 卡片初始化 aFactor
2. ✅ **验证范围修复**：`Xiuyuan.updateAFactor()` 扩大验证范围到 1.0-6.5
3. ✅ **UI 读取逻辑**：`SrsEditorDialog.loadMeta()` 改进 aFactor 读取逻辑

## 数据流分析

### 评分后 A-Factor 更新流程

```
用户评分
  ↓
BaseCompositeQueue.onFeedback(item, { action: 'rate', rating })
  ↓
scheduler.schedule(item, rating)  // RiffScheduler
  ↓
SchedulerRouter.route(card, rating)
  ↓
ImprovedTopicScheduler.review(card, rating)
  ↓
返回 updatedCard（包含新的 aFactor）
  ↓
cardApplicationService.batchUpdateCardsWithoutEvents([updatedCard])
  ↓
storage.setCard(updatedCard)
  ↓
storage.saveCards()
  ↓
数据持久化到 storage.json
```

### 显示 A-Factor 流程

```
打开【编辑SRS数据】对话框
  ↓
SrsEditorDialog.loadMeta()
  ↓
props.plugin?.storage.getCardByBlockId(blockId)
  ↓
读取 card.aFactor
  ↓
显示在 UI 上
```

## 潜在问题

### 问题 1：BaseCompositeQueue 没有使用 scheduler.schedule() 的返回值 ❌

**位置**：`src/core/queue/composite/BaseCompositeQueue.ts:149`

**当前代码**：
```typescript
// Apply scheduling algorithm with error handling
try {
  await this.scheduler.schedule(item, rating);  // ❌ 没有使用返回值
} catch (error) {
  console.error('[BaseCompositeQueue] Scheduler failed:', error);
  // Continue with queue operations even if scheduler fails
}
```

**问题**：
- `scheduler.schedule()` 返回更新后的卡片，但 `BaseCompositeQueue` 没有使用这个返回值
- 但是，`RiffScheduler` 内部调用了 `SchedulerRouter.route()`，后者会保存卡片

**结论**：这不是问题，因为 `SchedulerRouter.route()` 内部已经保存了卡片。

### 问题 2：storage.getCardByBlockId() 可能返回旧数据 ⚠️

**位置**：`src/ui/srs/SrsEditorDialog.vue:253`

**当前代码**：
```typescript
const card = props.plugin?.storage.getCardByBlockId(blockId);
```

**潜在问题**：
- 如果 `storage.getCardByBlockId()` 使用了缓存，可能返回旧数据
- 需要验证 `storage.setCard()` 后，`getCardByBlockId()` 是否立即返回新数据

### 问题 3：aFactor 初始化时机 ⚠️

**位置**：`src/application/services/XiuyuanSyncService.ts:1145`

**当前代码**：
```typescript
const xiuyuanResult = Xiuyuan.create({
    // ...
    meta: {
        schedulerType: 'fsrs-v6',
        cardType,
        cardTypeMarker,
        // 为 Topic 卡片初始化 A-Factor（1.2-6.0）
        ...(cardType === 'topic' ? { aFactor: initializeAFactor(priorityValue) } : {})
    }
});
```

**潜在问题**：
- `Xiuyuan.meta.aFactor` 初始化了，但 `FSRSCard.aFactor` 是否也初始化了？
- 需要验证 `Card.create()` 时是否从 `Xiuyuan.meta.aFactor` 复制到 `FSRSCard.aFactor`

## 验证步骤

### 步骤 1：验证创建时 aFactor 初始化

1. 创建一个新的 Topic 卡片
2. 检查 `storage.json` 中的卡片数据
3. 验证 `aFactor` 字段是否存在且值在 1.2-6.0 范围内

### 步骤 2：验证评分后 aFactor 更新

1. 对一个 Topic 卡片进行评分（Good 或 Easy）
2. 检查 `storage.json` 中的卡片数据
3. 验证 `aFactor` 字段是否更新

### 步骤 3：验证 UI 显示

1. 打开【编辑SRS数据】对话框
2. 检查 A-Factor 字段是否显示正确的数值
3. 如果显示 "-"，检查控制台日志

## 调试建议

### 添加日志

在以下位置添加日志：

1. **ImprovedTopicScheduler.review()**
   ```typescript
   console.log('[ImprovedTopicScheduler] Updated aFactor:', {
     cardId: card.id,
     oldAFactor: card.aFactor,
     newAFactor: updatedCard.aFactor
   });
   ```

2. **SchedulerRouter.route()**
   ```typescript
   console.log('[SchedulerRouter] Before save:', {
     cardId: updatedCard.id,
     aFactor: updatedCard.aFactor
   });
   ```

3. **CardApplicationService.batchUpdateCardsWithoutEvents()**
   ```typescript
   console.log('[CardApplicationService] Saving card:', {
     cardId: card.id,
     aFactor: card.aFactor
   });
   ```

4. **SrsEditorDialog.loadMeta()**
   ```typescript
   console.log('[SrsEditorDialog] Loaded card:', {
     cardId: card.id,
     cardType: card.type,
     aFactor: card.aFactor
   });
   ```

## 下一步行动

1. ⏳ 添加调试日志
2. ⏳ 创建测试卡片并验证
3. ⏳ 检查 storage.json 文件
4. ⏳ 根据日志定位问题

