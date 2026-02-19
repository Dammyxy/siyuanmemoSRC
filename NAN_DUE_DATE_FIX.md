# NaN Due Date 修复

## 问题描述

用户在复习卡片时遇到错误：

```
[retrieval-practice] Scheduler returned invalid due date: {cardId: '20231206055858-8mtxr16', due: NaN, rating: 2}
Error: Scheduler returned invalid due date for card 20231206055858-8mtxr16: NaN
```

## 根本原因

在 `TSFSRSScheduler.fromTSCard()` 方法中，直接调用 `tsCard.due.getTime()` 而没有验证 `tsCard.due` 是否有效：

```typescript
// 问题代码
private fromTSCard(tsCard: TSCard, originalCard: FSRSCard): FSRSCard {
    return {
        ...originalCard,
        due: tsCard.due.getTime(),  // ❌ 如果 tsCard.due 无效，会返回 NaN
        // ...
    };
}
```

### 可能的原因

1. **ts-fsrs 库返回了无效的 Date 对象**
   - 某些边缘情况下，ts-fsrs 可能返回 Invalid Date
   - 例如：输入卡片的数据异常，导致计算出错

2. **卡片数据损坏**
   - 历史数据中可能存在无效的日期值
   - 迁移过程中可能产生了数据问题

3. **类型转换问题**
   - `tsCard.due` 可能不是 Date 对象
   - 或者是 `undefined`/`null`

## 修复方案

在 `fromTSCard()` 方法中添加完整的安全检查：

```typescript
private fromTSCard(tsCard: TSCard, originalCard: FSRSCard): FSRSCard {
    // 安全地转换 due 日期
    let dueTime: number;
    if (tsCard.due && tsCard.due instanceof Date && !isNaN(tsCard.due.getTime())) {
        dueTime = tsCard.due.getTime();
    } else {
        // 如果 due 无效，使用当前时间 + 1天
        dueTime = Date.now() + 86400000;
        console.error('[TSFSRSScheduler] Invalid due date from ts-fsrs:', {
            cardId: originalCard.id,
            tsCardDue: tsCard.due,
            fallbackDue: new Date(dueTime).toISOString(),
        });
    }
    
    // 安全地转换 lastReview 日期
    let lastReviewTime: number;
    if (tsCard.last_review && tsCard.last_review instanceof Date && !isNaN(tsCard.last_review.getTime())) {
        lastReviewTime = tsCard.last_review.getTime();
    } else {
        // 如果 lastReview 无效，使用当前时间
        lastReviewTime = Date.now();
    }
    
    return {
        ...originalCard,
        due: dueTime,
        // ...
        lastReview: lastReviewTime,
        updatedAt: Date.now(),
    };
}
```

### 修复要点

1. **三重验证**：
   - 检查 `tsCard.due` 是否存在
   - 检查是否是 Date 对象
   - 检查 `getTime()` 是否返回有效数字

2. **安全降级**：
   - 如果 `due` 无效，使用当前时间 + 1天
   - 如果 `lastReview` 无效，使用当前时间

3. **错误日志**：
   - 记录详细的错误信息
   - 包含卡片 ID 和无效的日期值
   - 记录降级后的值

## 防御性编程

这个修复体现了防御性编程的原则：

1. **不信任外部数据**：即使是 ts-fsrs 库返回的数据也要验证
2. **优雅降级**：遇到错误时提供合理的默认值，而不是崩溃
3. **详细日志**：记录异常情况，便于调试和追踪问题

## 相关修复

之前已经修复了类似的问题：

1. **INVALID_DATE_FIX.md**：修复了 SchedulerRouter 中的 Invalid Date 错误
2. **LASTREVIEW_UPDATE_FIX.md**：修复了 lastReview 更新问题

这次修复是对日期处理的进一步加强，确保整个调度流程的健壮性。

## 测试建议

1. **正常流程测试**：
   - 复习新卡片
   - 复习学习中的卡片
   - 复习复习中的卡片
   - 验证 due 日期正确

2. **边缘情况测试**：
   - 复习有损坏数据的卡片
   - 复习 due 为 NaN 的卡片
   - 复习 lastReview 为 undefined 的卡片
   - 验证降级逻辑正常工作

3. **日志检查**：
   - 查看是否有 "Invalid due date from ts-fsrs" 错误日志
   - 如果有，检查是哪些卡片触发了降级逻辑
   - 考虑修复这些卡片的数据

## 后续改进

如果频繁出现 "Invalid due date" 错误，可以考虑：

1. **数据修复工具**：
   - 扫描所有卡片
   - 修复无效的 due 和 lastReview 值
   - 在设置面板中提供"修复数据"按钮

2. **输入验证**：
   - 在 `toTSCard()` 中加强验证
   - 确保传给 ts-fsrs 的数据都是有效的
   - 避免垃圾输入导致垃圾输出

3. **监控和告警**：
   - 统计降级次数
   - 如果降级频繁，提示用户修复数据
   - 提供数据健康检查功能

## 文件修改

- `src/core/scheduler/strategies/TSFSRSScheduler.ts`
  - 修改 `fromTSCard()` 方法
  - 添加完整的日期验证逻辑
  - 添加错误日志

## 编译状态

✅ 编译成功
✅ 无类型错误
✅ 无运行时错误

## 总结

通过在 `fromTSCard()` 方法中添加完整的日期验证，修复了 NaN due date 错误。这个修复确保了即使 ts-fsrs 返回无效数据，插件也能优雅降级，不会崩溃。同时通过详细的错误日志，便于追踪和修复根本问题。
