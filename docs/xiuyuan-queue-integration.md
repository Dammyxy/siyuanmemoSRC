# Xiuyuan 模板卡与队列系统集成

## 问题描述

当用户尝试将 Xiuyuan 模板卡添加到刻意练习队列时，出现了以下问题：

1. **只添加了一张卡片**：虽然选择了3张模板卡，但只有一张被添加到队列
2. **卡片获取失败**：添加后立即获取卡片时报错 "Card not found"

## 根本原因

### 1. 卡片ID vs 块ID的混淆

Xiuyuan 模板卡的特点是：
- **一个块对应多张卡片**：例如列表模板卡，一个父列表项可以生成3张独立的卡片
- **每张卡片有独立的ID**：格式为 `xy_card_xy_{xiuyuanId}_{ruleIndex}_{timestamp}_{random}`
- **所有卡片共享同一个 blockId**：用于定位源块

问题出在卡片浏览器和队列系统的集成代码中：

```typescript
// ❌ 错误：使用 blockID 添加卡片
await queue.addCard(item.blockID, 'manual');

// ✅ 正确：使用 cardID 添加卡片
await queue.addCard(item.cardID, 'manual');
```

当使用 `blockID` 时：
- 3张模板卡的 `blockID` 都是 `20260215204543-csvp9z3`
- 队列认为是重复添加，只保留第一张
- 后续获取时使用 `blockID` 作为卡片ID，导致找不到卡片

### 2. 收集卡片时只获取第一张

在 `ReviewEntryBase.collectCardsFromElements` 方法中：

```typescript
// ❌ 错误：只返回第一张匹配的卡片
const card = this.deps.storage.getCardByBlockId(blockId);

// ✅ 正确：返回所有匹配的卡片
const cards = this.deps.storage.getCardsByBlockId(blockId);
```

## 解决方案

### 1. 修复队列添加逻辑

修改 `MenuActions.addToQueue` 函数，确保使用 `cardID` 而不是 `blockID`：

**文件**: `src/ui/browser/datasource/MenuActions.ts`

```typescript
// 刻意练习队列
if (queueType === 'final-drill') {
  if (queue?.addCard) {
    let added = 0;
    for (const item of filteredItems) {
      try {
        // 🔧 修复：使用 cardID 而不是 blockID
        await queue.addCard(item.cardID, 'manual');
        added++;
      } catch (err) {
        console.error(`[MenuActions] 添加卡片失败: ${item.cardID}`, err);
      }
    }
    return { added, message: `已加入 ${added} 张卡片到刻意练习队列` };
  }
}

// 渐进学习和筛选复习队列
if (queueType === 'incremental' || queueType === 'filter-group') {
  if (queue?.addCard) {
    let added = 0;
    for (const item of items) {
      try {
        // 🔧 修复：使用 cardID 而不是 blockID
        await queue.addCard(item.cardID, 'manual');
        added++;
      } catch (err) {
        console.error(`[MenuActions] 添加卡片失败: ${item.cardID}`, err);
      }
    }
    return { added, message: `已加入 ${added} 张卡片到队列` };
  }
}
```

### 2. 修复卡片收集逻辑

修改 `ReviewEntryBase.collectCardsFromElements` 方法，支持一个块对应多张卡片：

**文件**: `src/services/ReviewEntryBase.ts`

```typescript
protected collectCardsFromElements(blockElements: HTMLElement[]): FSRSCard[] {
  const seen = new Set<string>();
  const result: FSRSCard[] = [];
  const roots = blockElements.map((el) => 
    (el.closest('[data-node-id]') as HTMLElement) || el
  );

  for (const root of roots) {
    const nodes = [
      root, 
      ...Array.from(root.querySelectorAll<HTMLElement>('[data-node-id]'))
    ];
    
    for (const node of nodes) {
      const blockId = node.getAttribute('data-node-id');
      if (!blockId || seen.has(blockId)) {
        continue;
      }
      seen.add(blockId);
      
      // 🔧 修复：使用 getCardsByBlockId 获取所有卡片
      const cards = this.deps.storage.getCardsByBlockId(blockId);
      for (const card of cards) {
        if (this.filterCard(card)) {
          result.push(card);
        }
      }
    }
  }
  
  return result;
}
```

### 3. 优化队列错误处理

修改 `FinalDrillQueue.getCards` 方法，更优雅地处理卡片不存在的情况：

**文件**: `src/queues/FinalDrillQueue.ts`

```typescript
public async getCards(): Promise<FSRSCard[]> {
  try {
    await this.cleanupExpiredAutoFailed();
    
    const cards: FSRSCard[] = [];
    const cardsToRemove: string[] = [];
    
    for (const entry of this.entries.values()) {
      try {
        // 使用 silent 选项避免记录错误日志
        const card = await this.manager.getCard(entry.cardId, { silent: true });
        cards.push(card);
      } catch (error) {
        // 如果卡片不存在，标记为待移除
        console.warn(`[FinalDrillQueue] Card ${entry.cardId} not found, removing from queue`);
        cardsToRemove.push(entry.cardId);
      }
    }
    
    // 批量移除不存在的卡片
    for (const cardId of cardsToRemove) {
      this.entries.delete(cardId);
    }
    
    // 持久化（如果有卡片被移除）
    if (cardsToRemove.length > 0) {
      await this.persistEntries();
    }
    
    // ... 后续的洗牌逻辑
  }
}
```

## 测试验证

创建了专门的测试文件来验证模板卡支持：

**文件**: `src/queues/__tests__/FinalDrillQueue.TemplateCard.test.ts`

测试用例：
1. ✅ 应该能够添加模板卡到队列（3张卡片）
2. ✅ 应该能够处理卡片不存在的情况
3. ✅ 应该能够处理部分卡片不存在的情况

## 架构原则

### cardID vs blockID 的使用规则

1. **队列操作使用 cardID**：
   - `queue.addCard(cardID, source)`
   - `queue.removeCard(cardID)`
   - `queue.reviewCard(cardID, rating)`

2. **块操作使用 blockID**：
   - 神经漫游的种子块：`neuralQueue.addCard(blockID, 'manual')`
   - 块级别的操作（如打开块、标记块）

3. **存储查询**：
   - `storage.getCard(cardID)` - 获取单张卡片
   - `storage.getCardByBlockId(blockID)` - 获取第一张匹配的卡片
   - `storage.getCardsByBlockId(blockID)` - 获取所有匹配的卡片（支持模板卡）

### Xiuyuan 模板卡的数据结构

```typescript
interface XiuyuanCard extends FSRSCard {
  id: string;        // 独立的卡片ID：xy_card_xy_{xiuyuanId}_{ruleIndex}_{timestamp}_{random}
  blockId: string;   // 共享的块ID：20260215204543-csvp9z3
  meta: {
    xiuyuanID: string;      // Xiuyuan ID
    templateID: string;     // 模板ID
    ruleIndex: number;      // 规则索引（0, 1, 2...）
    frontFields: string[];  // 正面字段
    backFields: string[];   // 背面字段
    fieldMapping: Record<string, string>;  // 字段映射
    frontBlockIDs: string[];  // 正面块ID列表
    backBlockIDs: string[];   // 背面块ID列表
  };
}
```

## 影响范围

修改影响以下队列：
- ✅ 刻意练习队列（FinalDrillQueue）
- ✅ 渐进学习队列（IncrementalLearningQueue）
- ✅ 筛选复习队列（FilterGroupQueue）
- ✅ 提取练习队列（RetrievalPracticeQueue）- 已经正确使用 cardID
- ⚠️ 神经漫游队列（NeuralRoamQueue）- 使用 blockID 是正确的（基于块的种子系统）

## 总结

通过这次修复，系统现在能够正确处理 Xiuyuan 模板卡：

1. **正确识别多张卡片**：一个块可以对应多张独立的卡片
2. **正确添加到队列**：使用 cardID 而不是 blockID
3. **正确获取卡片**：使用 getCardsByBlockId 获取所有相关卡片
4. **优雅的错误处理**：自动清理不存在的卡片，避免错误日志污染

这些修改确保了 Xiuyuan 模板卡系统与队列系统的完美集成，为用户提供了流畅的使用体验。
