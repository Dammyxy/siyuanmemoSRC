# 队列排序稳定性修复

## 问题描述

用户报告：每次打开**提取练习复习界面**时，第一张卡片都不一样，即使在浏览器中应用了排序。

## 问题分析

### 根本原因

1. **排序不稳定**：当多个卡片的 `due` 日期和 `priority` 都相同时（例如所有卡片都是"今天到期"，优先级都是默认值 50），排序结果不确定。

2. **JavaScript 排序特性**：`Array.sort()` 在比较结果为 0 时（即两个元素相等），不保证稳定排序。虽然现代浏览器大多实现了稳定排序，但当底层数据源返回的顺序每次都不同时，最终排序结果也会不一致。

3. **缺少第三排序键**：原有的排序逻辑只有两级：
   - 第一级：按 `due` 日期排序（升序）
   - 第二级：按 `priority` 排序（升序）
   - **缺少第三级**：当前两级都相同时，没有稳定的排序键

### 影响范围

- `RetrievalPracticeQueue`（提取练习队列）
- `IncrementalLearningQueue`（渐进学习队列）
- `FilterGroupQueue`（过滤组队列）

## 解决方案

### 修复内容

在所有动态队列的 `sortByDueDateAndPriority()` 方法中，添加**第三排序键**：卡片 ID。

修复后的排序逻辑：
1. 首先按 `due` 日期排序（升序，越早到期越靠前）
2. 如果 `due` 相同，按 `priority` 排序（升序，优先级越高越靠前）
3. **如果 `priority` 也相同，按卡片 ID 排序（字母顺序，确保稳定排序）**

### 代码变更

#### RetrievalPracticeQueue.ts

```typescript
private sortByDueDateAndPriority(cards: FSRSCard[]): FSRSCard[] {
    return cards.sort((a, b) => {
        // 首先按到期日期排序
        const dateDiff = a.due - b.due;
        if (dateDiff !== 0) {
            return dateDiff;
        }
        
        // 然后按优先级排序（优先级越小越优先）
        const priorityDiff = a.priority - b.priority;
        if (priorityDiff !== 0) {
            return priorityDiff;
        }
        
        // 最后按卡片 ID 排序（确保稳定排序）
        return a.id.localeCompare(b.id);
    });
}
```

#### IncrementalLearningQueue.ts

同样的修复逻辑。

#### FilterGroupQueue.ts

同样的修复逻辑。

## 测试验证

创建了 `QueueSortStability.test.ts` 测试文件，包含以下测试用例：

1. **多次调用一致性测试**：验证多次调用 `getCards()` 返回相同的顺序
2. **相同 due 和 priority 测试**：验证在 due 和 priority 都相同时，按 ID 排序
3. **不同 priority 测试**：验证优先按 priority 排序，然后按 ID 排序
4. **不同 due 测试**：验证优先按 due 排序，然后按 priority，最后按 ID

所有测试用例均通过（6/6）。

## 效果

修复后：
- ✅ 每次打开复习界面，第一张卡片都是相同的（在没有应用自定义排序的情况下）
- ✅ 排序结果完全确定，不会因为底层数据源的返回顺序而变化
- ✅ 保持了原有的排序逻辑（先 due，后 priority），只是添加了第三排序键作为 tiebreaker

## 相关文件

- `siyuan-plugin-fsrs/src/queues/RetrievalPracticeQueue.ts`
- `siyuan-plugin-fsrs/src/queues/IncrementalLearningQueue.ts`
- `siyuan-plugin-fsrs/src/queues/FilterGroupQueue.ts`
- `siyuan-plugin-fsrs/src/queues/__tests__/QueueSortStability.test.ts`

## 注意事项

1. **不影响自定义排序**：当用户在浏览器中应用自定义排序后，`customOrder` 会覆盖默认排序，此修复不影响自定义排序的行为。

2. **向后兼容**：此修复只是添加了第三排序键，不改变原有的排序逻辑，完全向后兼容。

3. **性能影响**：`localeCompare()` 的性能开销很小，对于典型的队列大小（几十到几百张卡片），性能影响可以忽略不计。

## 下一步

用户可以测试验证：
1. 打开提取练习复习界面，记录第一张卡片的 ID
2. 关闭复习界面
3. 再次打开提取练习复习界面
4. 验证第一张卡片的 ID 是否与之前相同

如果用户在浏览器中应用了自定义排序，复习界面应该遵循相同的排序顺序。
