# Phase 9 Task 6 完成 - CardService DDD 重构

完成时间：2026-02-19

## 任务概述

重构 CardService，使其通过 CardApplicationService 进行所有写操作，符合 DDD 架构原则。

## 实现内容

### 1. 添加 getCardService() 方法

**文件**：`src/services/CardService.ts`

**变更**：
- 添加 `getCardService()` 私有方法
- 优先从 ApplicationContext 获取 CardApplicationService
- 回退到 null（向后兼容）

```typescript
private getCardService(): any | null {
    try {
      if (this.plugin && (this.plugin as any).context) {
        return (this.plugin as any).context.getCardService();
      }
    } catch (error) {
      console.warn('[CardService] Failed to get CardApplicationService:', error);
    }
    return null;
}
```

### 2. 重构查询卡片（行 136）

**之前**：
```typescript
const card = this.storage.getCardByBlockId(bid);
```

**之后**：
```typescript
const cardService = this.getCardService();
let card = null;

if (cardService) {
    // 使用 CardApplicationService（推荐）
    card = cardService.getCardByBlockId(bid);
} else {
    // 回退到直接 storage 访问（向后兼容）
    card = this.storage.getCardByBlockId(bid);
}
```

**改进**：
- 优先使用 CardApplicationService
- 保持向后兼容
- 只读操作，性能无影响

### 3. 重构创建卡片（行 174-178）

**之前**：
```typescript
for (const element of blockElements) {
    // ...
    const card = createDefaultCard(blockId);
    await markBlockAsCard(blockId, card.id, card.priority, 'item');
    this.storage.setCard(card);
    createdCount++;
}

if (createdCount > 0) {
    await this.storage.saveCards();
}
```

**之后**：
```typescript
const cardService = this.getCardService();
const cardsToCreate: any[] = [];

for (const element of blockElements) {
    // ...
    const card = createDefaultCard(blockId);
    await markBlockAsCard(blockId, card.id, card.priority, 'item');
    
    if (cardService) {
        // 收集卡片，稍后批量创建
        cardsToCreate.push(card);
    } else {
        // 回退到直接 storage 访问（向后兼容）
        this.storage.setCard(card);
    }
    
    createdCount++;
}

// 批量创建卡片（使用 CardApplicationService）
if (cardService && cardsToCreate.length > 0) {
    await cardService.batchCreateCardsWithoutEvents(cardsToCreate);
}

if (createdCount > 0) {
    if (cardService) {
        await cardService.saveCards();
    } else {
        await this.storage.saveCards();
    }
}
```

**改进**：
- 使用批量创建方法（性能更好）
- 使用 `batchCreateCardsWithoutEvents`（避免事件循环）
- 保持向后兼容

### 4. 重构删除卡片（行 209-216）

**之前**：
```typescript
for (const element of blockElements) {
    // ...
    await unmarkBlockAsCard(blockId);
    this.storage.removeCard(cardId);
    removedCount++;
}

if (removedCount > 0) {
    await this.storage.saveCards();
}
```

**之后**：
```typescript
const cardService = this.getCardService();
const cardIdsToDelete: string[] = [];

for (const element of blockElements) {
    // ...
    await unmarkBlockAsCard(blockId);
    
    if (cardService) {
        // 收集卡片 ID，稍后批量删除
        cardIdsToDelete.push(cardId);
    } else {
        // 回退到直接 storage 访问（向后兼容）
        this.storage.removeCard(cardId);
    }
    
    removedCount++;
}

// 批量删除卡片（使用 CardApplicationService）
if (cardService && cardIdsToDelete.length > 0) {
    await cardService.batchDeleteCards(cardIdsToDelete);
}

if (removedCount > 0) {
    if (cardService) {
        await cardService.saveCards();
    } else {
        await this.storage.saveCards();
    }
}
```

**改进**：
- 使用批量删除方法（性能更好）
- `batchDeleteCards` 会触发领域事件
- 保持向后兼容

### 5. 添加 @deprecated 标记

**变更**：
```typescript
/**
 * 卡片服务类
 * 负责处理所有与卡片相关的操作
 * 
 * @deprecated 此服务正在逐步迁移到 DDD 架构
 * 建议使用 CardApplicationService 和 ReviewApplicationService
 */
export class CardService {
```

**目的**：
- 提醒开发者此服务正在迁移
- 建议使用新的应用服务

## 架构改进

### 符合 DDD 原则

1. **应用层协调** - 所有写操作通过 CardApplicationService
2. **批量操作** - 使用批量方法提高性能
3. **领域事件** - 删除操作触发领域事件
4. **向后兼容** - 保留直接 storage 访问的回退路径

### 性能优化

1. **批量创建** - `batchCreateCardsWithoutEvents()` 一次性创建多张卡片
2. **批量删除** - `batchDeleteCards()` 一次性删除多张卡片
3. **减少 I/O** - 批量操作减少存储访问次数

### 关键决策

#### 为什么使用 `batchCreateCardsWithoutEvents`？

1. **避免事件循环** - 用户手动创建卡片不需要触发同步
2. **性能考虑** - 批量操作更高效
3. **一致性** - 与 XiuyuanSyncService 保持一致

#### 为什么使用 `batchDeleteCards`？

1. **触发事件** - 删除需要通知其他组件
2. **数据一致性** - 确保所有相关数据被清理
3. **审计日志** - 记录删除操作

## 测试状态

### 编译检查

✅ CardService.ts - 重构相关部分无错误
⚠️ 3 个错误与 `openDrillDialogWithCards` 方法有关（与重构无关）

### 需要的测试

1. ✅ 向后兼容（无 CardApplicationService 时）
2. ⚠️ 需要测试批量创建功能
3. ⚠️ 需要测试批量删除功能

## 影响范围

### 修改的文件

1. `src/services/CardService.ts` - 核心重构

### 不需要修改的文件

- 所有调用 CardService 的代码（接口未变）
- 测试文件（向后兼容）

## 向后兼容性

✅ 完全向后兼容
- CardApplicationService 可选
- 保留直接 storage 访问的回退路径
- 现有代码无需修改

## 剩余问题

### 未解决的直接 storage 访问

CardService 中仍有一些只读操作直接访问 storage：
- `this.storage.getCardByBlockId()` - 查询操作（可接受）

这些只读操作不违反 DDD 原则，可以保留。

### 未来优化

1. 考虑完全废弃 CardService
2. 将所有功能迁移到 CardApplicationService
3. 移除向后兼容代码

## 下一步

### 立即任务

1. ✅ 完成 CardService 重构
2. ⏭️ 重构 AutoCardHandler.ts
3. ⏭️ 重构 ReviewService.ts

### 后续优化

1. 添加集成测试
2. 性能测试（批量操作）
3. 考虑废弃 CardService

## 总结

成功将 CardService 重构为符合 DDD 架构的服务：

1. ✅ 所有写操作通过应用层
2. ✅ 使用批量方法提高性能
3. ✅ 触发领域事件（删除操作）
4. ✅ 保持向后兼容
5. ✅ 添加 @deprecated 标记

CardService 现在符合 DDD 架构原则，为完全迁移到 CardApplicationService 铺平了道路！
