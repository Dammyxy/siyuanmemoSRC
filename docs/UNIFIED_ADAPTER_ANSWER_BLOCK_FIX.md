# 统一适配器答案块修复

## 问题描述

刻意练习队列（FinalDrillQueue）无法显示 Xiuyuan 模板卡的答案块。

## 根本原因

**UnifiedReviewAdapter 没有提取 `answerBlockID`！**

### 对比分析

#### SubsetPracticeAdapter（正常工作）

```typescript
content: {
    type: 'protyle',
    data: String((item as any)?.blockID || ''),
    id: String((item as any)?.blockID || (item as any)?.cardID || 'card'),
    // ✅ 提取 answerBlockID
    answerBlockID: (() => {
        const answerBlockID = String((item as any)?.meta?.answerBlockID || '');
        console.log('[SubsetPracticeAdapter] toUIState - answerBlockID:', {
            itemBlockID: (item as any)?.blockID,
            itemCardID: (item as any)?.cardID,
            hasMeta: !!(item as any)?.meta,
            meta: (item as any)?.meta,
            answerBlockID,
        });
        return answerBlockID;
    })(),
    card: item as any,
}
```

#### UnifiedReviewAdapter（缺失 answerBlockID）

```typescript
content: {
    type: 'protyle',
    data: card.blockId || card.id,
    id: card.blockId || card.id
    // ❌ 没有 answerBlockID！
}
```

### 影响范围

使用 `UnifiedReviewAdapter` 的队列都受影响：
- ❌ **提取练习队列（RetrievalPracticeQueue）** - 使用 `createUnifiedReviewDialog`
- ❌ **刻意练习队列（FinalDrillQueue）** - 使用 `createUnifiedReviewDialog`
- ❌ **渐进学习队列（IncrementalLearningQueue）** - 使用 `createUnifiedReviewDialog`
- ❌ **过滤组队列（FilterGroupQueue）** - 使用 `createUnifiedReviewDialog`
- ❌ **神经漫游队列（NeuralRoamQueue）** - 使用 `createUnifiedReviewDialog`

所有使用 `createUnifiedReviewDialog` 的队列都无法显示 Xiuyuan 模板卡的答案块。

### 其他适配器状态

✅ **已经正确提取 answerBlockID 的适配器**：
1. `SubsetPracticeAdapter` - 有详细的日志记录
2. `RetrievalPracticeAdapter` - 有详细的日志记录
3. `LeechAdapter` - 有提取（简单版本，无日志）
4. `NeuralRoamAdapter` - 有提取（简单版本，无日志）
5. `FinalDrillAdapter` - 有提取（简单版本，无日志）

这些适配器都已经正确提取了 `answerBlockID`，不需要修复。

## 解决方案

在 `UnifiedReviewAdapter.toUIState()` 中添加 `answerBlockID` 提取逻辑：

```typescript
content: {
    type: 'protyle',
    data: card.blockId || card.id,
    id: card.blockId || card.id,
    // 🆕 Xiuyuan 模板卡片：从 meta 中获取答案块 ID
    answerBlockID: (() => {
        const answerBlockID = String((card as any)?.meta?.answerBlockID || '');
        console.log('[UnifiedReviewAdapter] toUIState - answerBlockID:', {
            cardID: card.id,
            blockID: card.blockId,
            hasMeta: !!(card as any)?.meta,
            meta: (card as any)?.meta,
            answerBlockID,
        });
        return answerBlockID;
    })(),
    card: card as any
}
```

## 工作原理

### Xiuyuan 模板卡结构

Xiuyuan 模板卡由两个块组成：
1. **问题块**（blockIDs[0]）- 显示在正面
2. **答案块**（blockIDs[1]）- 显示在背面

### 数据流

1. **创建卡片时**：
   ```typescript
   XiuyuanService.createFromBlocks()
     ↓ 创建 FSRSCard
     ↓ 设置 meta.answerBlockID = blockIDs[1]
   StorageManager.setCard()
     ↓ 保存到内存和文件
   ```

2. **复习时**：
   ```typescript
   UnifiedQueueStrategy.next()
     ↓ 从 FinalDrillQueue 获取卡片
     ↓ 卡片包含 meta.answerBlockID
   UnifiedReviewAdapter.toUIState()
     ↓ 提取 meta.answerBlockID
     ↓ 传递给 ReviewContent.vue
   ReviewContent.vue
     ↓ 使用 answerBlockID 渲染答案块
   ```

### 为什么需要 answerBlockID

ReviewContent.vue 需要知道答案块的 ID 才能：
1. 在点击"显示答案"时加载答案块
2. 隐藏答案块（添加 `hide` 类）
3. 在答案显示后移除 `hide` 类

如果没有 `answerBlockID`，ReviewContent.vue 无法找到答案块，导致答案无法显示。

## 修改文件

- `siyuan-plugin-fsrs/src/strategies/UnifiedReviewAdapter.ts`
  - 在 `content` 对象中添加 `answerBlockID` 字段
  - 从 `card.meta.answerBlockID` 提取值
  - 添加日志记录以便调试

## 测试步骤

1. 编译插件
2. 打开刻意练习队列
3. 复习一张 Xiuyuan 模板卡
4. 点击"显示答案"
5. 检查是否能看到答案块
6. 查看控制台日志，确认 `answerBlockID` 被正确提取

## 预期日志

```
[UnifiedReviewAdapter] toUIState - answerBlockID: {
  cardID: '20260206114036-688y066',
  blockID: '20260206114026-xgfrmu8',
  hasMeta: true,
  meta: Proxy(Object) {
    xiuyuanID: '...',
    answerBlockID: '20260206114030-abc1234'  // ✅ 有值
  },
  answerBlockID: '20260206114030-abc1234'
}
```

## 相关问题

这个问题与之前的 `XIUYUAN_ANSWER_BLOCK_MISSING.md` 相关，但根本原因不同：
- 之前的问题：旧卡片没有 `meta.answerBlockID`（数据问题）
- 这次的问题：`UnifiedReviewAdapter` 没有提取 `meta.answerBlockID`（代码问题）

两个问题都会导致答案块无法显示，但修复方法不同。

## 相关文件

- `siyuan-plugin-fsrs/src/strategies/UnifiedReviewAdapter.ts` - 统一复习适配器
- `siyuan-plugin-fsrs/src/strategies/createUnifiedReviewDialog.ts` - 创建统一复习对话框
- `siyuan-plugin-fsrs/src/ui/review/v2/adapters/SubsetPracticeAdapter.ts` - 子集练习适配器（参考实现）
- `siyuan-plugin-fsrs/XIUYUAN_ANSWER_BLOCK_MISSING.md` - 相关问题文档

## 日期

2026-02-07
