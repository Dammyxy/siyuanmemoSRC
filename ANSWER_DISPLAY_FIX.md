# 复习界面答案显示修复

## 问题描述

复习界面无法显示答案，直接显示评分按钮。

## 根本原因

在 `UnifiedReviewAdapter.ts` 中，`showAnswer` 的值没有被正确反转。

### 问题代码

```typescript
actions: {
    showAnswer: context.showAnswer,  // ❌ 错误：没有反转
    grades: uiConfig.showRatingButtons ? [...] : [],
    ...
}
```

### 语义说明

在复习系统中，`showAnswer` 的语义在不同层级有不同的含义：

1. **`context.showAnswer`**（内部状态）：
   - `false`：答案未显示（初始状态）
   - `true`：答案已显示（用户点击"显示答案"后）

2. **`actions.showAnswer`**（UI 状态）：
   - `true`：显示"显示答案"按钮（答案未显示）
   - `false`：不显示"显示答案"按钮，显示评分按钮（答案已显示）

**注意**：这两个状态的语义是**相反**的！

### 正确的转换逻辑

在其他 Adapter（如 `FinalDrillAdapter`、`RetrievalPracticeAdapter`）中，都使用了正确的转换：

```typescript
actions: {
    showAnswer: uiConfig.showRatingButtons ? !context.showAnswer : false,
    grades: context.showAnswer ? grades : [],
    ...
}
```

这里的 `!context.showAnswer` 就是反转操作。

## 修复方案

在 `UnifiedReviewAdapter.ts` 第 92 行，添加 `!` 符号反转 `context.showAnswer`：

```typescript
actions: {
    showAnswer: !context.showAnswer,  // ✅ 修复：反转 context.showAnswer 的值
    grades: uiConfig.showRatingButtons ? [
        { label: '1', value: 1, color: 'red', kb: '1' },
        { label: '2', value: 2, color: 'orange', kb: '2' },
        { label: '3', value: 3, color: 'green', kb: '3' },
        { label: '4', value: 4, color: 'blue', kb: '4' }
    ] : [],
    menu: [],
    toolbar: [],
    cardMeta: {
        blockID: card.blockId || card.id,
        reps: card.reps,
        lapses: card.lapses,
        lastReview: card.lastReview,
        isReviewCard: card.reps > 0
    }
},
```

## 修复后的行为

### 初始状态
- `context.showAnswer = false`（答案未显示）
- `actions.showAnswer = !false = true`（显示"显示答案"按钮）
- 用户看到"显示答案"按钮

### 点击"显示答案"后
- `context.showAnswer = true`（答案已显示）
- `actions.showAnswer = !true = false`（不显示"显示答案"按钮）
- 用户看到评分按钮（1/2/3/4）

## 影响范围

此修复仅影响使用 `UnifiedReviewAdapter` 的复习界面，包括：
- 提取练习队列（Retrieval Practice）
- 刻意练习队列（Final Drill）
- 其他使用统一数据源架构的队列

## 测试验证

1. **重新加载插件**
2. **打开复习界面**（任意队列）
3. **确认初始状态**：应该显示"显示答案"按钮
4. **点击"显示答案"**：应该显示评分按钮（1/2/3/4）
5. **评分后**：下一张卡片应该再次显示"显示答案"按钮

## 编译状态

✅ 编译成功，无错误：
```
dist/index.js   1,668.42 kB │ gzip: 475.04 kB
✓ built in 10.99s
```

## 相关文件

- `siyuan-plugin-fsrs/src/strategies/UnifiedReviewAdapter.ts`（已修复）
- `siyuan-plugin-fsrs/src/ui/review/v2/ReviewContent.vue`（UI 组件，无需修改）
- `siyuan-plugin-fsrs/src/ui/review/v2/useReviewSession.ts`（状态管理，无需修改）

## 为什么之前没有发现这个问题？

这个 bug 可能一直存在于 `UnifiedReviewAdapter` 中，但之前可能：
1. 没有使用 `UnifiedReviewAdapter`（使用的是其他 Adapter）
2. 或者这个 Adapter 是最近才添加的
3. 或者之前的测试没有覆盖到这个场景

## 预防措施

建议在所有 Adapter 中统一 `showAnswer` 的转换逻辑，避免类似问题：

```typescript
// 标准模式：反转 context.showAnswer
showAnswer: !context.showAnswer

// 或者根据 uiConfig 决定
showAnswer: uiConfig.showRatingButtons ? !context.showAnswer : false
```

## 总结

这是一个简单的逻辑错误：忘记反转 `context.showAnswer` 的值。修复后，复习界面应该能正常显示"显示答案"按钮，并在点击后显示评分按钮。
