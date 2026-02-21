# 优先级持久化问题修复总结

## 问题描述

用户报告：在浏览器的"全部闪卡"视图中修改优先级时，数值会临时变化，但刷新后又恢复原值。而在队列视图中修改优先级可以正常持久化。

## 根本原因

### 1. 旧架构遗留代码

`browserService.ts` 中的 `batchSetPriority` 函数使用了未定义的 `storageManager` 变量：

```typescript
// src/ui/browser/browserService.ts (第 1153 行)
const card = storageManager.getCardByBlockId(blockId);  // ❌ storageManager 未定义
```

这个变量：
- ❌ 没有被声明
- ❌ 没有被导入
- ❌ 没有被初始化
- ❌ 是旧架构的遗留代码

### 2. 调用链问题

```
DeckDataSource.executeAction('set-priority')
  ↓
batchSetBlockPriority()
  ↓
batchSetPriority()
  ↓
storageManager.getCardByBlockId()  ❌ 未定义，无法执行
storageManager.setCard()           ❌ 无法执行
storageManager.saveCards()         ❌ 无法执行
```

### 3. 队列视图为什么能工作

队列 DataSource（如 `FinalDrillDataSource`）直接使用新架构：

```typescript
// 正确的实现
const card = await this.manager.getCard(row.fsrsCardId || row.id);  // ✅ UnifiedDataSourceManager
card.priority = priority;
await this.manager.updateCard(card);  // ✅ 正确持久化
```

---

## 修复方案

### 已实施的修复

#### 1. 修改 DeckDataSource 的 set-priority 逻辑 ✅

**文件**: `src/ui/browser/datasource/DeckDataSource.ts`

**修改内容**:

```typescript
if (actionId === 'set-priority') {
  const priority = Math.max(0, Math.min(100, Math.floor(Number(context?.priority ?? 50))));
  
  // ✅ 使用新架构：直接通过 UnifiedDataSourceManager 更新所有卡片
  console.log(`[SiYuanMemo][DeckDataSource] Setting priority to ${priority} for ${selectedRows.length} cards`);
  
  for (const card of selectedRows) {
    try {
      // 获取 FSRSCard
      const fsrsCard = await this.manager.getCard(card.fsrsCardId || card.id);
      
      if (fsrsCard) {
        // 更新优先级
        fsrsCard.priority = priority;
        
        // 持久化到存储
        await this.manager.updateCard(fsrsCard);
        
        // 更新内存中的值（用于 UI 显示）
        card.priority = priority;
        
        console.log(`[SiYuanMemo][DeckDataSource] ✅ Updated priority for card: ${card.id}`);
      } else {
        console.warn(`[SiYuanMemo][DeckDataSource] Card not found: ${card.id}`);
      }
    } catch (err) {
      console.error(`[SiYuanMemo][DeckDataSource] Failed to update priority for card ${card.id}:`, err);
    }
  }
  
  return { updated: selectedRows, skipped: [] };
}
```

**关键改进**:
- ✅ 移除了对 `batchSetBlockPriority` 的调用
- ✅ 直接使用 `this.manager.getCard()` 和 `this.manager.updateCard()`
- ✅ 与队列 DataSource 的实现模式一致
- ✅ 符合 DDD 架构原则

#### 2. 移除不必要的导入 ✅

**文件**: `src/ui/browser/datasource/DeckDataSource.ts`

移除了对 `batchSetBlockPriority` 的导入：

```typescript
// 修改前
import {
  BASE_ACTIONS,
  buildAddToQueueAction,
  batchSetBlockPriority,  // ❌ 移除
  adjustTime,
  addToQueue,
} from './MenuActions';

// 修改后
import {
  BASE_ACTIONS,
  buildAddToQueueAction,
  adjustTime,
  addToQueue,
} from './MenuActions';
```

#### 3. 标记旧函数为废弃 ✅

**文件**: `src/ui/browser/datasource/MenuActions.ts`

```typescript
/**
 * 批量设置优先级（用于 DeckDataSource，直接设置块属性）
 * 支持普通卡片（块属性）和修缘卡片（FSRSCard.meta）
 * 
 * @deprecated 此函数依赖有问题的 batchSetPriority，应该直接使用 UnifiedDataSourceManager
 * @see DeckDataSource.executeAction 中的 set-priority 实现（正确的模式）
 */
export async function batchSetBlockPriority(...)
```

**文件**: `src/ui/browser/browserService.ts`

```typescript
/**
 * 批量设置优先级
 * 
 * @deprecated 此函数使用未定义的 storageManager，无法正常工作
 * 应该使用 UnifiedDataSourceManager.getCard() 和 updateCard() 代替
 * @see DeckDataSource.executeAction 中的 set-priority 实现（正确的模式）
 */
export async function batchSetPriority(...)
```

---

## 测试验证

### 测试用例 1: 全部闪卡视图修改优先级 ⏳

1. 打开浏览器，切换到"全部闪卡"视图
2. 选择一张卡片，右键菜单选择"设置优先级"
3. 输入新的优先级值（如 80）
4. 确认修改
5. 刷新浏览器
6. **预期**: 优先级仍然是 80 ✅

### 测试用例 2: 批量修改优先级 ⏳

1. 打开浏览器，切换到"全部闪卡"视图
2. 选择多张卡片（Ctrl+点击）
3. 右键菜单选择"设置优先级"
4. 输入新的优先级值（如 70）
5. 确认修改
6. 刷新浏览器
7. **预期**: 所有选中的卡片优先级都是 70 ✅

### 测试用例 3: 与队列视图行为一致性 ⏳

1. 在"全部闪卡"视图中修改一张卡片的优先级为 85
2. 切换到"刻意练习"队列视图
3. 找到同一张卡片
4. **预期**: 优先级显示为 85 ✅
5. 在队列视图中修改优先级为 90
6. 切换回"全部闪卡"视图
7. **预期**: 优先级显示为 90 ✅

---

## 架构改进

### 修复前（旧架构）

```
DeckDataSource
  ↓
batchSetBlockPriority()
  ↓
batchSetPriority()
  ↓
storageManager (未定义) ❌
```

### 修复后（新架构）

```
DeckDataSource
  ↓
manager.getCard()        ✅ UnifiedDataSourceManager
  ↓
manager.updateCard()     ✅ 正确持久化
```

### 与队列 DataSource 保持一致

```
FinalDrillDataSource     DeckDataSource
       ↓                       ↓
manager.getCard()        manager.getCard()
       ↓                       ↓
manager.updateCard()     manager.updateCard()
```

---

## 剩余工作

### 1. BlockIdsDataSource 的优先级设置 ⏳

`BlockIdsDataSource` 仍然使用 `batchSetBlockPriority` 作为降级方案：

```typescript
// src/ui/browser/datasource/BlockIdsDataSource.ts (第 117 行)
if (actionId === 'set-priority') {
  const p = Math.max(0, Math.min(100, Math.floor(Number(context?.priority ?? 50))));

  // 如果队列支持，使用队列的 setPriority
  if (queue) {
    await setPriority(queue, selectedRows, p);  // ✅ 这个是好的
  } else {
    // 降级到直接设置块属性
    await batchSetBlockPriority(selectedRows, p);  // ❌ 这个有问题
  }
  return;
}
```

**建议修复**:

```typescript
if (actionId === 'set-priority') {
  const p = Math.max(0, Math.min(100, Math.floor(Number(context?.priority ?? 50))));

  // 如果队列支持，使用队列的 setPriority
  if (queue) {
    await setPriority(queue, selectedRows, p);
  } else {
    // ✅ 降级到使用 UnifiedDataSourceManager（需要注入 manager）
    // 或者直接抛出错误，因为 BlockIdsDataSource 应该总是有队列支持
    console.error('[BlockIdsDataSource] Queue not available for set-priority');
    throw new Error('Queue not available for priority setting');
  }
  return;
}
```

### 2. 完全移除旧函数 ⏳

在确认没有其他地方使用后，可以完全删除：
- `batchSetPriority` (browserService.ts)
- `batchSetBlockPriority` (MenuActions.ts)

### 3. 添加单元测试 ⏳

为 DeckDataSource 的 set-priority 操作添加单元测试：

```typescript
describe('DeckDataSource', () => {
  describe('set-priority', () => {
    it('should update card priority via UnifiedDataSourceManager', async () => {
      // 测试逻辑
    });
    
    it('should handle multiple cards', async () => {
      // 测试逻辑
    });
    
    it('should update UI after priority change', async () => {
      // 测试逻辑
    });
  });
});
```

---

## 影响范围

### 修改的文件

1. ✅ `src/ui/browser/datasource/DeckDataSource.ts` - 修改 set-priority 逻辑
2. ✅ `src/ui/browser/datasource/MenuActions.ts` - 标记 batchSetBlockPriority 为废弃
3. ✅ `src/ui/browser/browserService.ts` - 标记 batchSetPriority 为废弃

### 未修改的文件

1. ⏳ `src/ui/browser/datasource/BlockIdsDataSource.ts` - 仍使用 batchSetBlockPriority（需要后续修复）

### 不受影响的文件

所有队列 DataSource 都已经使用正确的新架构：
- ✅ `FinalDrillDataSource.ts`
- ✅ `RetrievalDataSource.ts`
- ✅ `FilterGroupDataSource.ts`
- ✅ `IncrementalLearningDataSource.ts`

---

## 技术债务清理

### 已清理

1. ✅ DeckDataSource 不再依赖旧架构的 `batchSetBlockPriority`
2. ✅ 标记了旧函数为废弃，防止新代码使用
3. ✅ 添加了文档说明正确的实现模式

### 待清理

1. ⏳ BlockIdsDataSource 的降级逻辑
2. ⏳ 完全删除 `batchSetPriority` 和 `batchSetBlockPriority`
3. ⏳ 移除所有对 `storageManager` 的引用

---

## 性能考虑

### 当前实现

逐个更新卡片：

```typescript
for (const card of selectedRows) {
  const fsrsCard = await this.manager.getCard(card.id);
  fsrsCard.priority = priority;
  await this.manager.updateCard(fsrsCard);
}
```

### 潜在优化

如果性能成为问题，可以在 `UnifiedDataSourceManager` 中添加批量更新方法：

```typescript
// 未来优化
async batchUpdateCards(updates: Array<{ id: string; priority: number }>): Promise<void> {
  // 批量更新逻辑
}
```

但目前的实现应该足够快，因为：
1. 大多数情况下只修改少量卡片
2. `UnifiedDataSourceManager` 内部可能已经有缓存优化
3. 逐个更新提供了更好的错误处理和日志记录

---

## 总结

### 问题根源

- ❌ `browserService.ts` 使用未定义的 `storageManager`
- ❌ 旧架构遗留代码导致优先级无法持久化
- ❌ DeckDataSource 与队列 DataSource 实现不一致

### 解决方案

- ✅ 将 DeckDataSource 迁移到新架构
- ✅ 直接使用 `UnifiedDataSourceManager`
- ✅ 移除对 `batchSetBlockPriority` 的依赖
- ✅ 标记旧函数为废弃

### 预期效果

- ✅ "全部闪卡"视图的优先级修改能够正常持久化
- ✅ 与队列视图的行为一致
- ✅ 代码库更清晰，易于维护
- ✅ 符合 DDD 架构原则

### 后续工作

1. ⏳ 修复 BlockIdsDataSource 的降级逻辑
2. ⏳ 完全删除旧架构函数
3. ⏳ 添加单元测试
4. ⏳ 用户验证测试

---

## 相关文档

- `.kiro/specs/bugfix/fix-deck-priority-persistence.md` - 详细修复方案
- `.kiro/specs/bugfix/data-source-investigation.md` - 数据源调查报告
- `.kiro/specs/bugfix/remove-storage-manager-complete.md` - StorageManager 废弃文档

---

## 日期

2026-02-21

## 状态

✅ Phase 1 完成 - DeckDataSource 已修复
⏳ Phase 2 待完成 - 清理旧架构代码
⏳ Phase 3 待完成 - 统一所有 DataSource 实现
