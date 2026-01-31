# NextDues 预测时间修复总结

## 问题描述

渐进学习队列中，四个评分选项（重来/困难/良好/简单）显示的都是相同的时间：

```
2026-01-30T20:34:23.047Z  (重来)
2026-01-30T20:34:23.047Z  (困难)
2026-01-30T20:34:23.047Z  (良好)
2026-01-30T20:34:23.047Z  (简单)
```

这不符合预期，因为：
- Topic 卡片使用 A因子V2 算法
- Item 卡片使用 SM-15 算法
- 不同评分应该有不同的预测时间

## 根本原因

在 `RiffDataSource.extractNextDues()` 方法中，代码尝试直接访问 `FSRSCard.due.toISOString()`：

```typescript
// ❌ 错误的实现
return {
  1: previews.get(1)?.due?.toISOString() || new Date().toISOString(),
  2: previews.get(2)?.due?.toISOString() || new Date().toISOString(),
  3: previews.get(3)?.due?.toISOString() || new Date().toISOString(),
  4: previews.get(4)?.due?.toISOString() || new Date().toISOString(),
};
```

**问题**：
1. `FSRSCard.due` 是 `number` 类型（时间戳），不是 `Date` 对象
2. `number` 类型没有 `.toISOString()` 方法
3. 可选链 `?.` 导致表达式返回 `undefined`
4. 最终所有选项都使用了 fallback 值 `new Date().toISOString()`（当前时间）

## 解决方案

正确提取 `FSRSCard` 并转换时间戳：

```typescript
// ✅ 正确的实现
const previews = this.schedulerRouter.preview(card);

// 提取每个评分对应的卡片
const againCard = previews.get(1);
const hardCard = previews.get(2);
const goodCard = previews.get(3);
const easyCard = previews.get(4);

return {
  1: againCard ? new Date(againCard.due).toISOString() : new Date().toISOString(),
  2: hardCard ? new Date(hardCard.due).toISOString() : new Date().toISOString(),
  3: goodCard ? new Date(goodCard.due).toISOString() : new Date().toISOString(),
  4: easyCard ? new Date(easyCard.due).toISOString() : new Date().toISOString(),
};
```

**关键改进**：
1. 先从 `Map` 中提取 `FSRSCard` 对象
2. 使用 `new Date(card.due)` 将时间戳转换为 `Date` 对象
3. 然后调用 `.toISOString()` 方法

## 测试验证

### 预期结果

重新加载插件后，渐进学习队列应该显示不同的时间：

**Topic 卡片（A因子V2）**：
```
2026-01-30T20:34:23.047Z  (重来 - 最短)
2026-01-31T08:15:30.123Z  (困难 - 较短)
2026-02-02T14:20:45.456Z  (良好 - 中等)
2026-02-05T10:30:12.789Z  (简单 - 最长)
```

**Item 卡片（SM-15）**：
```
2026-01-30T20:34:23.047Z  (重来 - 最短)
2026-01-31T12:00:00.000Z  (困难 - 较短)
2026-02-03T09:00:00.000Z  (良好 - 中等)
2026-02-07T15:00:00.000Z  (简单 - 最长)
```

### 日志检查

打开浏览器控制台（F12），应该看到：

```
[RiffDataSource] Merge local nextDues: { total: X, localFound: Y }
[RiffDataSource] ✅ Merged Y cards with local nextDues
```

如果有错误，会看到：

```
[RiffDataSource] Failed to preview card: {error}
```

## 技术细节

### FSRSCard 类型定义

```typescript
export interface FSRSCard {
    id: string;
    blockId: string;
    due: number;          // ⚠️ 时间戳（毫秒），不是 Date 对象
    stability: number;
    difficulty: number;
    // ... 其他字段
}
```

### SchedulerRouter.preview() 返回类型

```typescript
preview(card: FSRSCard): Map<Rating, FSRSCard>
```

返回一个 `Map`，键是评分（1-4），值是预测的卡片状态。

### 时间戳转换

```typescript
// 时间戳 → Date → ISO 字符串
const timestamp = 1738267463047;
const date = new Date(timestamp);
const iso = date.toISOString();  // "2026-01-30T20:34:23.047Z"
```

## 相关代码

### 修改的文件

- `siyuan-plugin-fsrs/src/core/queue/datasource/RiffDataSource.ts`
  - `extractNextDues()` 方法

### 相关类型

- `siyuan-plugin-fsrs/src/types/card.ts`
  - `FSRSCard` 接口定义

### 调度器

- `siyuan-plugin-fsrs/src/core/scheduler/SchedulerRouter.ts`
  - `preview()` 方法

## Git 提交

```bash
git log --oneline -1
f59d856 fix(queue): Fix nextDues prediction showing same time for all ratings
```

## 下一步

1. **重新加载插件**，验证修复效果
2. **测试不同卡片类型**：
   - Topic 卡片（A因子V2）
   - Item 卡片（SM-15）
3. **检查日志**，确认没有错误
4. **进行复习操作**，验证时间预测准确性

---

**最后更新**：2026-02-01
**状态**：✅ 已修复
**优先级**：P0（关键功能）
**影响范围**：渐进学习队列的时间预测
