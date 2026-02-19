# Learning Steps（学习步骤）说明

## 现象描述

用户发现同一张卡片连续两次评分3（Good），行为不同：

**第一次评分3**：
- 状态：New (0) → Learning (1)
- 下次复习：10分钟后
- 卡片保留在队列中

**第二次评分3**：
- 状态：Learning (1) → Review (2)
- 下次复习：3天后
- 卡片从队列移除

## 这是正常行为！

这是 FSRS 的 **Learning Steps（学习步骤）** 机制，也叫 **短期记忆模式**。

## Learning Steps 的工作原理

### 1. 新卡片的学习过程

```
New (state=0)
  ↓ 评分3 (Good)
Learning (state=1) - 10分钟后复习
  ↓ 评分3 (Good)
Review (state=2) - 3天后复习
```

### 2. 为什么需要 Learning Steps？

**记忆曲线理论**：
- 新学习的内容会快速遗忘
- 在短时间内多次复习可以巩固记忆
- 第一次复习应该在几分钟到几小时内进行

**Learning Steps 的好处**：
- ✅ 提高新卡片的记忆效果
- ✅ 减少遗忘率
- ✅ 帮助快速建立长期记忆
- ✅ 符合认知科学研究结果

### 3. 典型的 Learning Steps 时间表

FSRS 的默认 Learning Steps（当 `enable_short_term=true` 时）：

```
New → Learning (1)
  ↓ Good (3)
  10分钟后

Learning (1) → Learning (1) 或 Review (2)
  ↓ Good (3)
  如果还在学习阶段：1小时后
  如果完成学习：进入复习阶段（几天后）
```

## 配置说明

### 启用/禁用 Learning Steps

在设置面板中：

```
参数设置 → 启用短期记忆模式
```

- **启用**（推荐）：新卡片会经历 Learning Steps
- **禁用**：新卡片直接进入复习阶段

### 当前配置

```typescript
// TSFSRSScheduler.ts
enable_short_term: params.enableShortTerm ?? false
```

默认是禁用的，但用户可以在设置中启用。

## 用户体验

### 启用 Learning Steps 时

**优点**：
- 新卡片记忆更牢固
- 符合科学的学习方法
- 长期来看减少复习次数

**缺点**：
- 新卡片需要在短时间内多次复习
- 可能感觉"麻烦"（但这是有效的）

### 禁用 Learning Steps 时

**优点**：
- 新卡片只需复习一次
- 立即进入长期复习周期

**缺点**：
- 记忆效果可能不如 Learning Steps
- 可能需要更多次复习

## 日志分析

从用户提供的日志：

```javascript
// 第一次评分3
Before: {state: 0, reps: 1}  // New
After:  {state: 1, reps: 2, scheduledDays: 0}  // Learning, 10分钟后

// 第二次评分3
Before: {state: 1, reps: 2}  // Learning
After:  {state: 2, reps: 3, scheduledDays: 3}  // Review, 3天后
```

这完全符合 FSRS 的 Learning Steps 设计！

## 与 Anki 的对比

如果你用过 Anki，这个机制是一样的：

**Anki 的 Learning Steps**：
```
New → Learning
  ↓ Good
  10m (10分钟后)
  ↓ Good
  1d (1天后)
  ↓ Good
  进入复习阶段
```

**FSRS 的 Learning Steps**：
```
New → Learning
  ↓ Good
  10m (10分钟后)
  ↓ Good
  进入复习阶段（由算法决定间隔）
```

FSRS 更智能，因为它会根据卡片的难度和你的表现动态调整间隔。

## 常见问题

### Q1: 为什么同一张卡片要复习两次？

A: 这不是 bug，而是科学的学习方法。新学习的内容需要在短时间内多次复习才能巩固记忆。

### Q2: 可以跳过 Learning Steps 吗？

A: 可以，在设置中禁用"短期记忆模式"。但不推荐，因为会降低学习效果。

### Q3: Learning Steps 的时间可以自定义吗？

A: 目前 ts-fsrs 的 Learning Steps 时间是由算法自动决定的，不能手动配置。这是基于大量数据训练出来的最优值。

### Q4: 如果第一次评分1或2会怎样？

A: 
- **评分1 (Again)**：卡片会立即重新学习（几分钟后）
- **评分2 (Hard)**：卡片会延长学习时间（但仍在学习阶段）
- **评分3 (Good)**：按正常流程进入下一步
- **评分4 (Easy)**：可能直接跳过学习阶段，进入复习

### Q5: Learning 状态的卡片会从队列移除吗？

A: 不会！只有进入 Review 状态（state=2）且下次复习时间超过今天的卡片才会被移除。Learning 状态的卡片会保留在队列中，等待下次复习。

## 技术细节

### 状态转换

```typescript
enum CardState {
  New = 0,        // 新卡片
  Learning = 1,   // 学习中
  Review = 2,     // 复习中
  Relearning = 3  // 重新学习
}
```

### 判断是否移除队列

```typescript
// BaseReviewQueue.ts
shouldRemoveFromQueue(card: FSRSCard): boolean {
  const dueTime = card.due;
  const dayEnd = getDayEnd(this.dayStartHour);
  
  // Learning 状态的卡片：如果 due > dayEnd，移除
  // Review 状态的卡片：如果 due > dayEnd，移除
  return dueTime > dayEnd;
}
```

## 建议

1. **推荐启用短期记忆模式**：虽然需要多次复习，但学习效果更好
2. **理解 Learning Steps 的意义**：这不是 bug，而是科学的学习方法
3. **耐心完成学习阶段**：短期的"麻烦"换来长期的记忆效果

## 参考资料

- [FSRS 算法论文](https://github.com/open-spaced-repetition/fsrs4anki/wiki)
- [间隔重复学习原理](https://en.wikipedia.org/wiki/Spaced_repetition)
- [Anki Learning Steps 文档](https://docs.ankiweb.net/studying.html#learning)

## 总结

用户观察到的现象是 **FSRS Learning Steps 的正常行为**，不是 bug。这是一个科学的学习机制，旨在帮助新卡片快速建立长期记忆。如果觉得麻烦，可以在设置中禁用短期记忆模式，但不推荐这样做。
