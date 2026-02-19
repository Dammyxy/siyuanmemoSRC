# Learning Steps 清理完成

## 任务概述

删除 BaseReviewQueue 中自己实现的 learning steps 机制，完全使用 ts-fsrs 的 Learning Steps 功能。

## 背景

用户观察到同一张卡片连续两次评分3，行为不同：
- 第一次评分3：10分钟后复习（Learning 状态）
- 第二次评分3：3天后复习（Review 状态）

这是 **FSRS 的 Learning Steps 机制**（短期记忆模式），不是 bug。但在代码审查中发现，我们之前在 `BaseReviewQueue.ts` 中实现了自己的 learning steps 机制，这些代码是**死代码**（从未被调用），因为所有队列都直接使用 SchedulerRouter 调用 ts-fsrs。

## 删除的代码

### 1. BaseReviewQueue.ts 中的方法（约500行）

删除了以下5个 protected 方法：

1. **getLearningStepsConfig()** - 获取 learning steps 配置
2. **convertStepToMs()** - 将时间字符串转换为毫秒
3. **calculateAgainInterval()** - 计算评分1（Again）的间隔
4. **calculateHardInterval()** - 计算评分2（Hard）的间隔
5. **calculateNextDueDateForLowRating()** - 计算低评分的下次到期日期

这些方法从未被调用，因为：
- 所有队列都使用 `handleReviewWithScheduler()` 方法
- 该方法直接调用 SchedulerRouter，不使用这些 learning steps 方法
- ts-fsrs 已经内置了完整的 Learning Steps 机制

### 2. 测试文件

删除了2个测试文件：

1. **BaseReviewQueue.LearningSteps.property.test.ts** - learning steps 属性测试
2. **StaticQueues.LearningSteps.test.ts** - 静态队列 learning steps 测试

### 3. 类型定义和常量

之前已删除（在上一次清理中）：

1. **LearningStepsConfig** 接口
2. **DEFAULT_LEARNING_STEPS_CONFIG** 常量

## 验证结果

### 编译检查

```bash
npm run build
```

✅ 编译成功，无错误

### 引用检查

```bash
# 检查已删除方法的引用
grep -r "calculateNextDueDateForLowRating" --include="*.ts"
grep -r "calculateAgainInterval" --include="*.ts"
grep -r "calculateHardInterval" --include="*.ts"
grep -r "convertStepToMs" --include="*.ts"
grep -r "getLearningStepsConfig" --include="*.ts"
```

✅ 无引用，所有代码已清理干净

## Learning Steps 机制说明

### 现在的实现（ts-fsrs）

所有 Learning Steps 功能由 ts-fsrs 处理：

```typescript
// TSFSRSScheduler.ts
const params = {
  enable_short_term: settings.enableShortTerm ?? false,
  // ... 其他参数
};

const fsrs = new FSRS(params);
const schedulingCards = fsrs.repeat(card, now);
```

### 工作流程

1. 用户评分 → `handleReviewWithScheduler()`
2. → `SchedulerRouter.schedule()`
3. → `TSFSRSScheduler.schedule()`
4. → `fsrs.repeat()` （ts-fsrs 内部处理 Learning Steps）
5. → 返回新的卡片状态和 due 时间

### Learning Steps 行为

**启用短期记忆模式时**（`enableShortTerm: true`）：

```
New (state=0)
  ↓ 评分3 (Good)
Learning (state=1) - 10分钟后复习
  ↓ 评分3 (Good)
Review (state=2) - 3天后复习
```

**禁用短期记忆模式时**（`enableShortTerm: false`）：

```
New (state=0)
  ↓ 评分3 (Good)
Review (state=2) - 直接进入复习阶段
```

## 架构优势

### 删除前的问题

1. **代码重复**：自己实现的 learning steps 与 ts-fsrs 功能重复
2. **死代码**：这些方法从未被调用
3. **维护负担**：需要维护两套 learning steps 逻辑
4. **潜在冲突**：如果未来误用这些方法，会与 ts-fsrs 冲突

### 删除后的优势

1. **单一职责**：Learning Steps 完全由 ts-fsrs 处理
2. **代码简洁**：减少约500行死代码
3. **易于维护**：只需维护 ts-fsrs 集成
4. **功能完整**：ts-fsrs 的 Learning Steps 更科学、更完善

## 相关文档

- [LEARNING_STEPS_EXPLANATION.md](./LEARNING_STEPS_EXPLANATION.md) - Learning Steps 机制详细说明
- [TS_FSRS_INTEGRATION_COMPLETE.md](./TS_FSRS_INTEGRATION_COMPLETE.md) - ts-fsrs 集成文档
- [NAN_DUE_DATE_FIX.md](./NAN_DUE_DATE_FIX.md) - NaN due date 修复

## 总结

成功删除了 BaseReviewQueue 中自己实现的 learning steps 机制（约500行代码 + 2个测试文件），现在完全使用 ts-fsrs 的 Learning Steps 功能。代码更简洁，架构更清晰，维护更容易。

用户观察到的"同一张卡片两次评分3行为不同"是 FSRS Learning Steps 的正常行为，不是 bug。这是科学的学习方法，旨在帮助新卡片快速建立长期记忆。
