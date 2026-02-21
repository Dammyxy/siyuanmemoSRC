# A-Factor 显示修复总结

## 问题描述

用户反馈：在【编辑SRS数据】对话框中，所有 Topic 卡片的 A-Factor 都显示为 "-"。

## 根本原因分析

### 1. 创建时未初始化 aFactor ✅ 已修复

**位置**：`src/application/services/XiuyuanSyncService.ts` - `convertRiffCardToFSRSCard()`

**问题**：
```typescript
// ❌ 旧代码：创建 Xiuyuan 时 meta 中没有 aFactor
const xiuyuanResult = Xiuyuan.create({
    // ...
    meta: {
        schedulerType: 'fsrs-v6'
    }
});
```

**修复**：
```typescript
// ✅ 新代码：为 Topic 卡片初始化 aFactor
const xiuyuanResult = Xiuyuan.create({
    // ...
    meta: {
        schedulerType: 'fsrs-v6',
        cardType,
        cardTypeMarker,
        // 为 Topic 卡片初始化 A-Factor（1.2-6.0）
        ...(cardType === 'topic' ? { aFactor: initializeAFactor(priorityValue) } : {})
    }
});
```

### 2. 验证范围不匹配 ✅ 已修复

**位置**：`src/core/xiuyuan/domain/Xiuyuan.ts` - `updateAFactor()`

**问题**：
- `initializeAFactor()` 生成的 A-Factor 范围：1.2-6.0
- `updateAFactor()` 的验证范围：1.0-3.0
- 导致大部分 A-Factor 值（3.0-6.0）被拒绝

**修复**：
```typescript
// ❌ 旧代码
updateAFactor(aFactor: number): Result<void> {
    if (aFactor < 1.0 || aFactor > 3.0) {
        return err(new Error(`Invalid A-Factor: ${aFactor}. Must be between 1.0 and 3.0`));
    }
    // ...
}

// ✅ 新代码
updateAFactor(aFactor: number): Result<void> {
    // SuperMemo A-Factor 范围：1.2-6.0
    if (aFactor < 1.0 || aFactor > 6.5) {
        return err(new Error(`Invalid A-Factor: ${aFactor}. Must be between 1.0 and 6.5`));
    }
    // ...
}
```

### 3. UI 读取逻辑改进 ✅ 已修复

**位置**：`src/ui/srs/SrsEditorDialog.vue` - `loadMeta()`

**问题**：
```typescript
// ❌ 旧代码：当 aFactor 为 0 时会被跳过
if (card?.type === CardType.Topic && card?.aFactor) {
    aFactorText.value = card.aFactor.toFixed(2);
}
```

**修复**：
```typescript
// ✅ 新代码：更严格的数字检查
if (card?.type === CardType.Topic) {
    if (card.aFactor !== undefined && card.aFactor !== null && !isNaN(card.aFactor)) {
        aFactorText.value = card.aFactor.toFixed(2);
    } else {
        aFactorText.value = '-';
    }
}
```

### 4. 转换时未复制 aFactor ✅ 已修复（关键修复）

**位置**：`src/core/xiuyuan/infrastructure/XiuyuanRepository.ts` - `cardToFSRSCard()`

**问题**：
```typescript
// ❌ 旧代码：将 Card 转换为 FSRSCard 时，没有复制 Xiuyuan.meta.aFactor
return {
    id: card.getId().getValue(),
    // ...
    priority: xiuyuan.getPriority().getValue(),
    // ❌ 缺少 aFactor 字段
    tags: [],
    // ...
};
```

**修复**：
```typescript
// ✅ 新代码：从 Xiuyuan.meta 复制 aFactor 到 FSRSCard
return {
    id: card.getId().getValue(),
    // ...
    priority: xiuyuan.getPriority().getValue(),
    
    // 🔧 修复：A-Factor（从 Xiuyuan.meta 复制到 FSRSCard）
    aFactor: meta.aFactor,
    
    tags: [],
    // ...
};
```

**这是根本原因**：
- `Xiuyuan.meta.aFactor` 被正确初始化了（步骤 1）
- 但在转换为 `FSRSCard` 时，这个值没有被复制过去
- 导致 `storage.getCardByBlockId()` 返回的卡片没有 `aFactor` 字段
- 最终 UI 显示为 "-"

## 数据流分析

### A-Factor 的生命周期

```
1. 创建卡片
   ↓
   initializeAFactor(priority) → 1.2-6.0
   ↓
   Xiuyuan.meta.aFactor ← 初始值
   ↓
2. 评分复习
   ↓
   ImprovedTopicScheduler.schedule()
   ↓
   FSRSCard.aFactor ← 更新值
   ↓
   需要同步到 Xiuyuan.meta.aFactor ⚠️
   ↓
3. 显示
   ↓
   SrsEditorDialog 读取 FSRSCard.aFactor
```

### 存储位置

1. **Xiuyuan.meta.aFactor**（聚合根元数据）
   - 用途：持久化存储
   - 更新：通过 `Xiuyuan.updateAFactor()` 方法

2. **FSRSCard.aFactor**（卡片数据）
   - 用途：调度器计算
   - 更新：通过 `ImprovedTopicScheduler.schedule()` 方法

### ⚠️ 潜在问题：评分后同步

**问题**：评分后 `FSRSCard.aFactor` 更新了，但可能没有同步到 `Xiuyuan.meta.aFactor`

**需要验证**：
1. 评分后保存逻辑是否调用 `Xiuyuan.updateAFactor()`
2. 或者 SrsEditorDialog 是否直接读取 `FSRSCard.aFactor`

**建议**：
- 如果 SrsEditorDialog 读取的是 `FSRSCard.aFactor`，则无需同步
- 如果读取的是 `Xiuyuan.meta.aFactor`，则需要在评分后同步

## 修改文件列表

1. ✅ `src/application/services/XiuyuanSyncService.ts`
   - 在 `convertRiffCardToFSRSCard()` 中初始化 aFactor

2. ✅ `src/core/xiuyuan/domain/Xiuyuan.ts`
   - 扩大 `updateAFactor()` 的验证范围

3. ✅ `src/ui/srs/SrsEditorDialog.vue`
   - 改进 aFactor 读取逻辑
   - 在核心状态概览区域显示 A-Factor
   - 在元数据区域显示 A-Factor

4. ✅ `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts` **（关键修复）**
   - 在 `cardToFSRSCard()` 中添加 `aFactor: meta.aFactor`
   - 确保 `Xiuyuan.meta.aFactor` 被复制到 `FSRSCard.aFactor`

## 测试建议

1. **创建新 Topic 卡片**
   - 验证 aFactor 是否正确初始化（1.2-6.0）
   - 验证【编辑SRS数据】中能否显示

2. **评分 Topic 卡片**
   - 验证 aFactor 是否更新
   - 验证【编辑SRS数据】中显示的是否为最新值

3. **边界值测试**
   - 优先级 0 → aFactor 1.2
   - 优先级 50 → aFactor 3.6
   - 优先级 100 → aFactor 6.0

## 相关代码

### initializeAFactor 函数

```typescript
// src/core/card-builder/detectCardType.ts
export function initializeAFactor(priority: number): number {
    // 优先级 0-100 → A-Factor 1.2-6.0
    // 公式：aFactor = 1.2 + (priority / 100) * 4.8
    const aFactor = 1.2 + (priority / 100) * 4.8;
    return Math.round(aFactor * 100) / 100; // 保留两位小数
}
```

### ImprovedTopicScheduler 更新逻辑

```typescript
// src/core/scheduler/strategies/ImprovedTopicScheduler.ts
private _handleSubsequentReview(card: FSRSCard, rating: Rating, nowMs: number): FSRSCard {
    const aFactor = card.aFactor ?? 2.5;
    // ...
    let newAFactor = aFactor;
    if (rating !== Rating.Again) {
        newAFactor = this._updateAFactor(card, rating, newInterval, nowMs);
    }
    
    return {
        ...card,
        aFactor: newAFactor,  // ← 更新 FSRSCard.aFactor
        // ...
    };
}
```

## 后续工作

1. ✅ 验证评分后 aFactor 同步逻辑（已确认：`SchedulerRouter.route()` 会保存更新后的卡片）
2. ⏳ 添加单元测试
3. ⏳ 添加集成测试
4. ⏳ 更新用户文档

## 测试验证

### 验证步骤

1. **创建新 Topic 卡片**
   - 创建一个新的 Topic 卡片
   - 打开【编辑SRS数据】对话框
   - 验证 A-Factor 是否显示正确的初始值（1.2-6.0）

2. **评分 Topic 卡片**
   - 对 Topic 卡片进行评分（Good 或 Easy）
   - 打开【编辑SRS数据】对话框
   - 验证 A-Factor 是否更新

3. **边界值测试**
   - 优先级 0 → aFactor 1.2
   - 优先级 50 → aFactor 3.6
   - 优先级 100 → aFactor 6.0

### 预期结果

- 所有 Topic 卡片的 A-Factor 都应该显示正确的数值
- 不再显示 "-"

## 参考资料

- SuperMemo A-Factor 范围：1.2-6.0
- 优先级映射公式：`aFactor = 1.2 + (priority / 100) * 4.8`
- ImprovedTopicScheduler 动态更新 A-Factor
