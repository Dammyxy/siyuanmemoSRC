# SchedulerRouter 诊断指南

## 问题描述

渐进学习队列中，四个评分选项显示相同的时间，怀疑 SchedulerRouter 实现有问题。

## 诊断步骤

### 1. 检查 SchedulerRouter 是否正确初始化

打开浏览器控制台（F12），查找以下日志：

```
[FSRS] ✅ SchedulerRouter initialized
```

如果没有看到，说明 SchedulerRouter 未初始化。

### 2. 检查卡片类型是否正确

在控制台中运行以下代码：

```javascript
// 获取当前卡片
const card = window.siyuan.storage.getCard('YOUR_CARD_ID');
console.log('Card type:', card?.type);
console.log('Scheduler type:', card?.schedulerType);
```

**预期结果**：
- Topic 卡片：`type: 'topic'`, `schedulerType: 'a-factor-v2'`
- Item 卡片：`type: 'item'`, `schedulerType: 'sm15'`

**如果 type 为 undefined**：
- 卡片类型未正确检测
- 需要重新创建卡片或运行类型检测

### 3. 检查 SchedulerRouter.preview() 是否正常工作

在控制台中运行：

```javascript
// 获取 SchedulerRouter
const router = window.siyuan.schedulerRouter;

// 获取卡片
const card = window.siyuan.storage.getCard('YOUR_CARD_ID');

// 预览所有评分
const previews = router.preview(card);

// 查看结果
console.log('Preview results:');
for (const [rating, previewCard] of previews.entries()) {
    console.log(`Rating ${rating}:`, new Date(previewCard.due).toISOString());
}
```

**预期结果**：
```
Rating 1: 2026-01-30T20:34:23.047Z  (最短)
Rating 2: 2026-01-31T08:15:30.123Z  (较短)
Rating 3: 2026-02-02T14:20:45.456Z  (中等)
Rating 4: 2026-02-05T10:30:12.789Z  (最长)
```

**如果所有时间相同**：
- SchedulerRouter 可能选择了错误的调度器
- 或者调度器的 preview() 方法有问题

### 4. 检查调度器选择逻辑

在控制台中运行：

```javascript
const router = window.siyuan.schedulerRouter;
const card = window.siyuan.storage.getCard('YOUR_CARD_ID');

// 检查选择的调度器类型
const schedulerType = router.getSchedulerType(card);
console.log('Selected scheduler:', schedulerType);

// 检查卡片类型
console.log('Card type:', card?.type);
console.log('Card schedulerType:', card?.schedulerType);
```

**预期结果**：
- Topic 卡片 → `a-factor-v2`
- Item 卡片 → `sm15` 或 `fsrs-v5`（取决于配置）

### 5. 检查 IncrementalLearningQueue 是否调用了 _recalculateNextDues()

查找以下日志：

```
[IncrementalLearningQueue] Riff cards loaded: { ... }
[IncrementalLearningQueue] ✅ Recalculated nextDues for X cards
```

**如果没有看到第二条日志**：
- `_recalculateNextDues()` 未被调用
- 可能是 `schedulerRouter` 或 `storage` 未传递

### 6. 检查卡片的 nextDues 字段

在控制台中运行：

```javascript
// 获取队列中的卡片
const queue = window.siyuan.incrementalQueue;
const items = queue.getAllItems();

// 查看第一张卡片的 nextDues
const firstItem = items[0];
console.log('NextDues:', firstItem?.nextDues);
```

**预期结果**：
```javascript
{
  1: "2026-01-30T20:34:23.047Z",
  2: "2026-01-31T08:15:30.123Z",
  3: "2026-02-02T14:20:45.456Z",
  4: "2026-02-05T10:30:12.789Z"
}
```

**如果所有时间相同**：
- `_recalculateNextDues()` 未正确执行
- 或者 SchedulerRouter.preview() 返回了相同的时间

## 常见问题和解决方案

### 问题 1：卡片类型为 undefined

**原因**：卡片创建时未检测类型

**解决方案**：
1. 检查块属性 `custom-fsrs-card-type`
2. 如果没有，运行类型检测：
   ```javascript
   const blockId = 'YOUR_BLOCK_ID';
   const type = await window.siyuan.detectCardType(blockId);
   console.log('Detected type:', type);
   ```

### 问题 2：SchedulerRouter 选择了错误的调度器

**原因**：
- 卡片类型未正确设置
- 或者配置的默认调度器不是 SM-15

**解决方案**：
1. 检查插件设置中的默认调度器
2. 确认 Topic 卡片的 `type` 字段为 `'topic'`
3. 确认 Item 卡片的 `type` 字段为 `'item'`

### 问题 3：preview() 返回相同的时间

**原因**：
- 调度器的 preview() 方法实现有问题
- 或者卡片状态不正确（如 reps=0, state=New）

**解决方案**：
1. 检查卡片状态：
   ```javascript
   const card = window.siyuan.storage.getCard('YOUR_CARD_ID');
   console.log('Card state:', {
       reps: card.reps,
       state: card.state,
       due: new Date(card.due).toISOString(),
       aFactor: card.aFactor,
       schedulerMeta: card.schedulerMeta
   });
   ```

2. 如果是新卡片（reps=0），首次复习后应该有不同的时间

### 问题 4：_recalculateNextDues() 未被调用

**原因**：
- `schedulerRouter` 或 `storage` 未传递给 IncrementalLearningQueue
- 或者条件判断失败

**解决方案**：
1. 检查 IncrementalLearningQueue 的初始化：
   ```javascript
   const queue = window.siyuan.incrementalQueue;
   console.log('Has schedulerRouter:', !!queue.schedulerRouter);
   console.log('Has storage:', !!queue.storage);
   ```

2. 如果为 false，检查 `index.ts` 中的初始化代码

## 完整诊断脚本

将以下代码粘贴到浏览器控制台：

```javascript
// ========== SchedulerRouter 完整诊断脚本 ==========

console.log('=== SchedulerRouter Diagnostic ===');

// 1. 检查 SchedulerRouter
const router = window.siyuan?.schedulerRouter;
console.log('1. SchedulerRouter exists:', !!router);

if (!router) {
    console.error('❌ SchedulerRouter not found!');
} else {
    console.log('✅ SchedulerRouter initialized');
}

// 2. 检查 IncrementalLearningQueue
const queue = window.siyuan?.incrementalQueue;
console.log('2. IncrementalLearningQueue exists:', !!queue);

if (queue) {
    console.log('   - Has schedulerRouter:', !!queue.schedulerRouter);
    console.log('   - Has storage:', !!queue.storage);
    
    const items = queue.getAllItems();
    console.log('   - Queue size:', items.length);
    
    if (items.length > 0) {
        const firstItem = items[0];
        console.log('   - First item nextDues:', firstItem?.nextDues);
    }
}

// 3. 检查存储的卡片
const storage = window.siyuan?.storage;
if (storage) {
    const cards = storage.getAllCards();
    console.log('3. Total cards in storage:', cards.length);
    
    if (cards.length > 0) {
        const sampleCard = cards[0];
        console.log('   - Sample card:', {
            id: sampleCard.id,
            type: sampleCard.type,
            schedulerType: sampleCard.schedulerType,
            reps: sampleCard.reps,
            state: sampleCard.state,
        });
        
        // 测试 preview
        if (router) {
            try {
                const previews = router.preview(sampleCard);
                console.log('   - Preview results:');
                for (const [rating, card] of previews.entries()) {
                    console.log(`     Rating ${rating}:`, new Date(card.due).toISOString());
                }
            } catch (error) {
                console.error('   - Preview failed:', error);
            }
        }
    }
}

console.log('=== Diagnostic Complete ===');
```

## 预期输出

正常情况下应该看到：

```
=== SchedulerRouter Diagnostic ===
1. SchedulerRouter exists: true
✅ SchedulerRouter initialized
2. IncrementalLearningQueue exists: true
   - Has schedulerRouter: true
   - Has storage: true
   - Queue size: 10
   - First item nextDues: {1: "...", 2: "...", 3: "...", 4: "..."}
3. Total cards in storage: 50
   - Sample card: {id: "...", type: "item", schedulerType: "sm15", ...}
   - Preview results:
     Rating 1: 2026-01-30T20:34:23.047Z
     Rating 2: 2026-01-31T08:15:30.123Z
     Rating 3: 2026-02-02T14:20:45.456Z
     Rating 4: 2026-02-05T10:30:12.789Z
=== Diagnostic Complete ===
```

## 下一步

根据诊断结果：

1. **如果 SchedulerRouter 不存在** → 检查插件初始化代码
2. **如果卡片类型为 undefined** → 运行类型检测
3. **如果 preview() 返回相同时间** → 检查调度器实现
4. **如果 _recalculateNextDues() 未调用** → 检查参数传递

---

**最后更新**：2026-02-01
**状态**：诊断工具
**优先级**：P0（问题排查）
