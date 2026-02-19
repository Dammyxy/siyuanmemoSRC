# Phase 9 Task 4.2 完成 - XiuyuanSyncService DDD 重构

完成时间：2026-02-19

## 任务概述

重构 XiuyuanSyncService，使其符合 DDD 架构原则，通过 CardApplicationService 进行所有写操作。

## 实现内容

### 1. 修改 XiuyuanSyncService 构造函数

**文件**：`src/services/XiuyuanSyncService.ts`

**变更**：
- 添加可选的 `CardApplicationServiceLike` 参数
- 定义 `CardApplicationServiceLike` 接口，包含批量操作方法
- 保持向后兼容（参数可选）

```typescript
interface CardApplicationServiceLike {
    batchCreateCardsWithoutEvents(cards: any[]): Promise<...>;
    batchUpdateCardsWithoutEvents(cards: any[]): Promise<...>;
    batchDeleteCards(cardIds: string[]): Promise<...>;
    saveCards(): Promise<void>;
}

constructor(
    config: HybridSyncConfig, 
    cardApplicationService?: CardApplicationServiceLike
) {
    // ...
    this.cardApplicationService = cardApplicationService;
}
```

### 2. 重构增量同步（incrementalSync）

**变更位置**：

#### 2.1 卡片创建（行 179）
```typescript
// 之前：直接 storage 访问
this.storage.setCard(fsrsCard);

// 之后：通过 CardApplicationService
if (this.cardApplicationService) {
    await this.cardApplicationService.batchCreateCardsWithoutEvents([fsrsCard]);
} else {
    this.storage.setCard(fsrsCard);  // 向后兼容
}
```

#### 2.2 卡片更新（行 230）
```typescript
// 之前：直接 storage 访问
localCard.updatedAt = Date.now();
this.storage.setCard(localCard);

// 之后：通过 CardApplicationService
if (this.cardApplicationService) {
    await this.cardApplicationService.batchUpdateCardsWithoutEvents([localCard]);
} else {
    this.storage.setCard(localCard);
}
```

#### 2.3 卡片删除（行 254）
```typescript
// 之前：直接 storage 访问
for (const card of cardsToDelete) {
    this.storage.removeCard(card.id);
    deletedCount++;
}

// 之后：通过 CardApplicationService
if (this.cardApplicationService) {
    const cardIds = cardsToDelete.map(c => c.id);
    const result = await this.cardApplicationService.batchDeleteCards(cardIds);
    if (result.ok) {
        deletedCount = result.value.deletedCount;
    }
} else {
    for (const card of cardsToDelete) {
        this.storage.removeCard(card.id);
        deletedCount++;
    }
}
```

#### 2.4 保存操作（行 260）
```typescript
// 之前：直接 storage 访问
await this.storage.saveCards();

// 之后：通过 CardApplicationService
if (this.cardApplicationService) {
    await this.cardApplicationService.saveCards();
} else {
    await this.storage.saveCards();
}
```

### 3. 重构全量同步（fullSync）

**变更位置**：

#### 3.1 卡片添加（行 330）
```typescript
// 之前：逐个调用 syncRiffCardToLocal
for (const riffCard of riffCards) {
    const localCard = this.storage.getCard(riffCard.id);
    if (!localCard) {
        await this.syncRiffCardToLocal(riffCard);
        addedCount++;
    }
}

// 之后：批量创建
const cardsToAdd: any[] = [];
for (const riffCard of riffCards) {
    const localCard = this.storage.getCard(riffCard.id);
    if (!localCard) {
        const fsrsCard = await this.convertRiffCardToFSRSCard(riffCard);
        cardsToAdd.push(fsrsCard);
    }
}

if (cardsToAdd.length > 0) {
    if (this.cardApplicationService) {
        const result = await this.cardApplicationService.batchCreateCardsWithoutEvents(cardsToAdd);
        if (result.ok) {
            addedCount = result.value.createdCount;
        }
    } else {
        for (const card of cardsToAdd) {
            this.storage.setCard(card);
            addedCount++;
        }
    }
}
```

#### 3.2 卡片删除（行 345）
```typescript
// 之前：直接 storage 访问
for (const card of toDelete) {
    this.storage.removeCard(card.id);
}

// 之后：通过 CardApplicationService
let deletedCount = 0;
if (toDelete.length > 0) {
    if (this.cardApplicationService) {
        const cardIds = toDelete.map(c => c.id);
        const result = await this.cardApplicationService.batchDeleteCards(cardIds);
        if (result.ok) {
            deletedCount = result.value.deletedCount;
        }
    } else {
        for (const card of toDelete) {
            this.storage.removeCard(card.id);
            deletedCount++;
        }
    }
}
```

#### 3.3 保存操作（行 370）
```typescript
// 之前：直接 storage 访问
await this.storage.saveCards();

// 之后：通过 CardApplicationService
if (this.cardApplicationService) {
    await this.cardApplicationService.saveCards();
} else {
    await this.storage.saveCards();
}
```

### 4. 重构 syncRiffCardToLocal 方法

**变更位置**：

#### 4.1 Xiuyuan 卡片更新（行 420）
```typescript
// 之前：逐个更新
for (const card of existingCards) {
    // 更新字段...
    this.storage.setCard(card);
}

// 之后：批量更新
const cardsToUpdate: any[] = [];
for (const card of existingCards) {
    // 更新字段...
    cardsToUpdate.push(card);
}

if (this.cardApplicationService) {
    await this.cardApplicationService.batchUpdateCardsWithoutEvents(cardsToUpdate);
} else {
    for (const card of cardsToUpdate) {
        this.storage.setCard(card);
    }
}
```

#### 4.2 普通卡片创建（行 430）
```typescript
// 之前：直接 storage 访问
const fsrsCard = await this.convertRiffCardToFSRSCard(riffCard);
this.storage.setCard(fsrsCard);

// 之后：通过 CardApplicationService
const fsrsCard = await this.convertRiffCardToFSRSCard(riffCard);
if (this.cardApplicationService) {
    await this.cardApplicationService.batchCreateCardsWithoutEvents([fsrsCard]);
} else {
    this.storage.setCard(fsrsCard);
}
```

### 5. 更新 ApplicationContext

**文件**：`src/application/ApplicationContext.ts`

**变更**：

#### 5.1 修复 CardApplicationService 构造函数
```typescript
// 添加缺失的参数
const { CardScheduleService } = require('@/core/card/domain/services/CardScheduleService');
const scheduleService = new CardScheduleService();

return new CardApplicationService(
    createCardUseCase,
    deleteCardUseCase,
    updateCardUseCase,
    storageManager,      // ✅ 添加
    scheduleService      // ✅ 添加
);
```

#### 5.2 延迟注入 CardApplicationService
```typescript
// 创建 HybridSyncService 时不传 CardApplicationService
hybridSyncService = new HybridSyncService({
    deckId: riff.BUILTIN_DECK_ID,
    storage: storageManager,
    // ...
});

// 在 context 创建后注入
if (hybridSyncService) {
    const cardService = context.getCardService();
    (hybridSyncService as any).cardApplicationService = cardService;
    
    // 启动同步服务
    await hybridSyncService.start();
    
    // 启动全量同步定时器
    if (riffConfig && riffConfig.fullSync.enabled) {
        fullSyncTimer = setInterval(
            () => hybridSyncService!.fullSync(),
            riffConfig.fullSync.interval
        );
    }
}
```

## 架构改进

### 符合 DDD 原则

1. **应用层协调** - 所有写操作通过 CardApplicationService
2. **领域事件** - 删除操作触发领域事件（通过 batchDeleteCards）
3. **批量操作** - 使用 `batchXxxWithoutEvents` 避免同步循环
4. **向后兼容** - 保留直接 storage 访问的回退路径

### 关键决策

#### 为什么使用 `WithoutEvents` 方法？

1. **避免同步循环**
   - 同步服务从 Riff 获取数据
   - 如果触发事件，可能导致再次同步
   - 使用 WithoutEvents 方法避免循环

2. **性能考虑**
   - 批量操作更高效
   - 减少事件触发次数

3. **删除操作例外**
   - `batchDeleteCards()` 触发事件
   - 因为删除需要通知其他组件

#### 只读操作保留 storage

以下操作保留直接 storage 访问（只读）：
- `this.storage.getCard()` - 查询卡片
- `this.storage.getAllCards()` - 查询所有卡片
- `this.storage.getRiffBlacklist()` - 查询黑名单

**原因**：
- 只读操作不违反 DDD 原则
- 避免过度抽象
- 性能更好

## 测试状态

### 编译检查

✅ XiuyuanSyncService.ts - 无诊断错误
✅ ApplicationContext.ts - 重构相关部分无错误

### 需要的测试

1. ✅ 单元测试已存在（向后兼容路径）
2. ⚠️ 需要添加集成测试（使用 CardApplicationService）
3. ⚠️ 需要测试批量操作性能

## 影响范围

### 修改的文件

1. `src/services/XiuyuanSyncService.ts` - 核心重构
2. `src/application/ApplicationContext.ts` - 依赖注入

### 不需要修改的文件

- 所有测试文件（向后兼容）
- 其他服务（隔离变更）

## 向后兼容性

✅ 完全向后兼容
- CardApplicationService 参数可选
- 保留直接 storage 访问的回退路径
- 现有测试无需修改

## 下一步

### 立即任务

1. ✅ 完成 XiuyuanSyncService 重构
2. ⏭️ 重构 DeckDataSource（已完成）
3. ⏭️ 重构其他直接 storage 访问的地方

### 后续优化

1. 添加集成测试（使用 CardApplicationService）
2. 性能测试（批量操作 vs 单个操作）
3. 考虑移除向后兼容代码（下一个主版本）

## 总结

成功将 XiuyuanSyncService 重构为符合 DDD 架构的服务：

1. ✅ 所有写操作通过应用层
2. ✅ 使用批量方法提高性能
3. ✅ 避免同步循环（WithoutEvents）
4. ✅ 保持向后兼容
5. ✅ 为统一卡片类型铺路

重构完成，XiuyuanSyncService 现在完全符合 DDD 架构原则！
