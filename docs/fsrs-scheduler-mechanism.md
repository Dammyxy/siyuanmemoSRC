# FSRS 调度器工作机制详解

## 概述

FSRS (Free Spaced Repetition Scheduler) 调度器是思源笔记间隔重复插件的核心组件，负责计算卡片的复习间隔、确定到期卡片、以及根据用户反馈更新卡片状态。本文档详细解释了调度器的工作机制和整个复习流程。

## 核心架构

### 1. 三层架构设计

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   UI 层         │    │  业务逻辑层      │    │  核心调度层      │
│  (ReviewView)   │◄──►│ (QueueStrategy) │◄──►│ (RiffScheduler) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              ▲                        ▲
                              │                        │
                              ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │  队列管理器      │    │  Riff API       │
                       │ (QueueContext)  │    │ (思源后端)      │
                       └─────────────────┘    └─────────────────┘
```

### 2. 关键组件

- **IQueueStrategy**: 队列策略接口，定义了 next() 和 onFeedback() 方法
- **IScheduler**: 调度器接口，负责计算卡片状态
- **RiffScheduler**: 实际调用思源后端 API 的调度器
- **Riff API**: 思源后端提供的闪卡管理接口

## 调度器工作流程

### 1. 卡片获取与到期判断

#### 获取到期卡片
```typescript
// 在 RetrievalPracticeQueue 中
async ensureLoaded(): Promise<void> {
  const data = await this.api.getRiffDueCards(this.deckID);
  // 思源后端根据 FSRS 算法判断哪些卡片已到期
}
```

#### 到期判断逻辑
- **思源后端**: 在 Go 语言实现的 riff 模块中，FSRS 调度器通过比较当前时间和卡片的 `due` 字段来判断是否到期
- **FSRS 算法**: 根据遗忘曲线公式 `R(t) = (1 + t / (9 * S))^(-1)` 计算卡片的到期时间
- **状态管理**: 卡片状态包括 New(0)、Learning(1)、Review(2)、Relearning(3)

### 2. 复习流程

#### 卡片展示
1. `next()` 方法从队列中取出下一张待复习卡片
2. 队列使用 PrioritySequencer 按优先级排序
3. 优先级高的卡片优先展示

#### 用户反馈处理
```typescript
// 在 RetrievalPracticeQueue 中
async onFeedback(
  currentItem: QueueItem | null,
  feedback: QueueFeedback,
): Promise<void> {
  if (feedback.action === 'rate') {
    const rating = feedback.rating; // 1=Again, 2=Hard, 3=Good, 4=Easy
    await this.scheduler.schedule(card, rating); // 调用调度器
  }
}
```

#### 调度器执行
```typescript
// RiffScheduler 实现
this.scheduler = new RiffScheduler(async (card, grade) => {
  await this.api.reviewRiffCard(card.deckID, card.cardID, grade, reviewedCards);
  return card;
});
```

### 3. FSRS 算法核心公式

#### 状态转换
- **新卡片 (New)**: 首次复习后转为 Learning 状态
- **学习中 (Learning)**: 继续复习直到转为 Review 状态
- **复习中 (Review)**: 根据用户评分调整间隔
- **重学中 (Relearning)**: 忘记后回到 Relearning 状态

#### 间隔计算
```typescript
// 遗忘后稳定性 (Again/重学)
S' = w[11] * D^(-w[12]) * ((S + 1)^w[13] - 1) * exp((1 - R) * w[14])

// 记住后稳定性 (Hard/Good/Easy)
S' = S * (exp(w[8]) * (11 - D) * S^(-w[9]) * (exp((1 - R) * w[10]) - 1) * hardPenalty * easyBonus + 1)

// 下次复习间隔
I = (S / 9) * (requestRetention^(-1) - 1)
```

## 不同队列类型的调度行为

### 1. 提取练习 (RetrievalPracticeQueue)
- **调度器**: RiffScheduler (调用 reviewRiffCard API)
- **行为**: 更新卡片的 SRS 数据，改变下次复习时间
- **用途**: 标准的 FSRS 复习

### 2. 刻意练习 (FinalDrillQueue)
- **调度器**: NullScheduler (不更新 SRS 数据)
- **行为**: 仅从队列中移除，不调用任何 API
- **用途**: 临时练习，不影响正常复习计划

### 3. 难点攻坚 (LeechQueue)
- **调度器**: LeechScheduler (基于 RiffScheduler 的增强)
- **行为**: 检测遗忘次数过多的卡片，可选择暂停或标记
- **用途**: 管理特别困难的卡片

### 4. 筛选复习 (FilterGroupQueue)
- **调度器**: 可配置 (FSRS 或 Null)
- **行为**: 根据配置决定是否更新 SRS 数据
- **用途**: 按条件筛选的子集复习

## 数据流向

### 1. 读取路径
```
思源后端 riff 模块 → getRiffDueCards API → RetrievalPracticeQueue → UI 展示
```

### 2. 写入路径
```
用户评分 → onFeedback → RiffScheduler → reviewRiffCard API → 思源后端 riff 模块 → 更新卡片状态
```

## 关键决策点

### 1. 调度器选择
- **何时调用 API**: 在 `onFeedback` 时，根据队列类型决定是否调用 `reviewRiffCard`
- **状态更新**: 只有使用 RiffScheduler 的队列才会更新卡片的 SRS 状态

### 2. 到期判断
- **服务端判断**: 思源后端 riff 模块负责判断卡片是否到期
- **客户端排序**: 客户端负责按优先级等条件排序展示

### 3. 数据一致性
- **乐观更新**: 采用乐观移除策略，先从队列移除再调用 API
- **错误处理**: API 调用失败不影响队列推进，但会影响 SRS 状态更新

## 总结

FSRS 调度器的工作机制是客户端-服务端协同工作的结果：

1. **思源后端 riff 模块**负责核心的 FSRS 算法计算和到期判断
2. **客户端插件**负责队列管理、UI 展示和用户交互
3. **RiffScheduler**作为桥梁，将用户反馈传递给后端进行状态更新
4. **不同队列类型**通过选择不同的调度器实现不同的复习策略

这种设计既保证了算法的一致性，又提供了灵活的队列管理能力。