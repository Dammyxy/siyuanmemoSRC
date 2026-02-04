# FSRSSequencer 实现总结

## 概述

`FSRSSequencer` 是专门为 FSRS 算法设计的队列排序控制器，支持学习步骤（learning steps）和精确的到期时间控制。

## 核心特性

### 1. Due Time Filtering ⭐

**关键差异**：与 `SortedSequencer` 不同，`FSRSSequencer.next()` 只返回 `due <= now` 的卡片。

```typescript
// SortedSequencer - 总是返回第一张卡片
const card = await sortedSequencer.next(); // 立即返回

// FSRSSequencer - 只返回已到期的卡片
const card = await fsrsSequencer.next(); // 如果未到期，返回 null
```

**为什么重要**：FSRS 使用短间隔学习步骤（1m, 5m, 10m），需要精确控制卡片何时出现。

### 2. Learning Steps Support

支持 FSRS 的学习步骤配置：

```typescript
// FSRS 配置
learning_steps: ['1m', '10m']

// 用户点"忘记"（Rating.Again）
card.due = Date.now() + 60000; // 1 分钟后
sequencer.insert(card);

// 1 分钟内
await sequencer.next(); // null（未到期）

// 1 分钟后
await sequencer.next(); // 返回 card
```

### 3. Binary Search Insertion

使用二分查找插入，保持队列有序：
- **时间复杂度**: O(log n) 查找 + O(n) 插入
- **排序键**: 
  1. Due time（主键）- 越早越靠前
  2. Priority（次键）- 越高越靠前
  3. Insertion order（三键）- FIFO

### 4. Helper Methods

```typescript
// 获取到期卡片数量
const dueCount = sequencer.getDueCount();
console.log(`${dueCount} cards due now`);

// 获取下一张卡片的到期时间
const nextDue = sequencer.getNextDueTime();
if (nextDue) {
  const minutesUntilDue = Math.ceil((nextDue - Date.now()) / 60000);
  console.log(`Next card in ${minutesUntilDue} minutes`);
}
```

## 使用场景

### ✅ 适合使用 FSRSSequencer

- 使用 FSRS 算法
- 需要支持学习步骤（1m, 5m, 10m）
- 需要精确控制复习时间
- 需要 `next()` 只返回已到期的卡片

### ❌ 不适合使用 FSRSSequencer

- 使用 SM-15 算法（用 `SortedSequencer`）
- 不需要学习步骤
- 需要失败卡片立即重新进入队列

## 与 SortedSequencer 对比

| 特性 | SortedSequencer | FSRSSequencer |
|------|----------------|---------------|
| **排序方式** | Due time + Priority | Due time + Priority |
| **插入方式** | 二分查找 O(log n) | 二分查找 O(log n) |
| **next() 行为** | 总是返回第一张 | 只返回已到期的 |
| **学习步骤** | ❌ 不优化 | ✅ 优化支持 |
| **适用算法** | SM-15 | FSRS |
| **Due time 检查** | ❌ 无 | ✅ 有 |

## 代码示例

### 基本使用

```typescript
import { FSRSSequencer } from '@/core/queue/sequencers';

const sequencer = new FSRSSequencer<QueueItem>({
  getDueMs: (card) => card.due,
  getPriority: (card) => card.priority ?? 50,
});

// 插入卡片
sequencer.insert(card);

// 获取下一张到期的卡片
const nextCard = await sequencer.next();
```

### 失败卡片重新进入队列

```typescript
// 用户点"忘记"
const card = await sequencer.next();

// FSRS 计算新的 due 时间（1 分钟后）
card.due = Date.now() + 60000;

// 重新插入队列
sequencer.insert(card);

// 1 分钟内不会再出现
await sequencer.next(); // null
```

### 与 DataSource 集成

```typescript
const sequencer = new FSRSSequencer<QueueItem>({
  getDueMs: (card) => card.due,
  getPriority: (card) => card.priority ?? 50,
  initialItems: await dataSource.getAll(),
});

// 注册为 observer
dataSource.addObserver(sequencer);

// 当数据变更时，sequencer 会自动清空缓存
```

## 测试覆盖

✅ **36/36 测试通过**

- ✅ 基本操作（7 tests）
- ✅ Due time 过滤（5 tests）
- ✅ 二分查找插入（3 tests）
- ✅ 优先级支持（3 tests）
- ✅ FSRS 学习步骤（4 tests）
- ✅ Observer 模式（3 tests）
- ✅ 边界情况（8 tests）
- ✅ 集成测试（3 tests）

## 性能

- ✅ 插入 1000 张卡片 < 1 秒
- ✅ `next()` 操作 O(1)
- ✅ `getDueCount()` 操作 O(n) 最坏情况，但通常很快（提前终止）

## 文件位置

- **实现**: `src/core/queue/sequencers/FSRSSequencer.ts`
- **测试**: `src/core/queue/sequencers/FSRSSequencer.test.ts`
- **导出**: `src/core/queue/sequencers/index.ts`

## 下一步

可选的集成工作：

1. **在 RetrievalPracticeQueue 中使用**
   ```typescript
   // 替换 SortedSequencer
   this.sequencer = new FSRSSequencer({
     getDueMs: (card) => CardStorage.getDueTime(card),
     getPriority: (card) => card.priority ?? 50,
   });
   ```

2. **添加配置选项**
   ```typescript
   // 让用户选择使用哪种 Sequencer
   sequencerType: 'sorted' | 'fsrs'
   ```

3. **UI 增强**
   - 显示到期卡片数量
   - 显示下一张卡片的到期时间
   - 显示学习步骤进度

## 总结

`FSRSSequencer` 是为 FSRS 算法量身定制的排序控制器，通过 due time filtering 和 learning steps 支持，提供了精确的复习时间控制。它与 `SortedSequencer` 的核心差异在于 `next()` 方法的行为，使其更适合 FSRS 的学习步骤机制。
