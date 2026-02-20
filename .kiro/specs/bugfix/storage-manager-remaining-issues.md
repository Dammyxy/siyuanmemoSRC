# StorageManager 剩余问题清单

## 概述

虽然 `RescheduleService` 已经完全迁移到新架构，但还有其他组件仍在使用旧的 `StorageManager`。

## 高优先级问题

### 1. SchedulerRouter ⚠️ 高优先级

**文件**：`src/core/scheduler/SchedulerRouter.ts`

**问题**：
- 构造函数依赖 `StorageManager`
- 使用 `this.storage.setCard()` 和 `this.storage.saveCards()`

**影响**：
- 卡片复习后的状态更新
- 调度器切换功能

**代码位置**：
```typescript
// Line 38
constructor(config: SchedulerRouterConfig, storage: StorageManager) {
    this.storage = storage;
}

// Line 126-127
this.storage.setCard(updatedCard);
await this.storage.saveCards();

// Line 241-242
this.storage.setCard(convertedCard);
await this.storage.saveCards();
```

**修复方案**：
1. 修改构造函数接受 `UnifiedStorageManager` 和 `CardApplicationService`
2. 使用 `cardApplicationService.batchUpdateCardsWithoutEvents()` 更新卡片
3. 更新 `ApplicationContext` 中的创建代码

### 2. XiuyuanSyncService ⚠️ 高优先级

**文件**：`src/application/services/XiuyuanSyncService.ts`

**问题**：
- 使用 `this.storage.getAllCards()`
- 使用 `this.storage.getCardsByBlockId()`
- 使用 `this.storage.getRiffBlacklist()`
- 使用 `this.storage.getCard()`

**影响**：
- Riff 同步功能
- 增量同步
- 全量同步

**代码位置**：
```typescript
// Line 236
const blacklist = this.storage.getRiffBlacklist();

// Line 258
const existingCardWithSameBlock = this.storage.getAllCards()
    .find(c => c.blockId === riffCard.id);

// Line 380
const localCards = this.storage.getAllCards();

// Line 477
const localCards = this.storage.getAllCards();

// Line 541
const blacklist = this.storage.getRiffBlacklist();

// Line 632
const existingCards = this.storage.getCardsByBlockId(blockId);

// Line 1142
const localCard = this.storage.getCard(riffBlock.id);
```

**修复方案**：
1. 注入 `UnifiedStorageManager`
2. 使用 `unifiedStorage.getAllCards()`
3. 使用 `unifiedStorage.getCardsByBlockId()`
4. 使用 `unifiedStorage.getCard()`

### 3. XiuyuanRepository ⚠️ 中优先级

**文件**：`src/core/xiuyuan/infrastructure/XiuyuanRepository.ts`

**问题**：
- 使用 `this.storage.getXiuYuan()`
- 使用 `this.storage.getAllCards()`
- 使用 `this.storage.getCard()`
- 使用 `this.storage.save()`
- 使用 `this.storage.getAllXiuYuans()`

**影响**：
- Xiuyuan 聚合根的持久化
- 卡片的创建和删除

**代码位置**：
```typescript
// Line 70
const existing = this.storage.getXiuYuan(xiuyuanId);

// Line 85
const allStorageCards = this.storage.getAllCards();

// Line 98
const existingCard = this.storage.getCard(card.getId().getValue());

// Line 112
const saveResult = await this.storage.save();

// Line 159
const data = this.storage.getXiuYuan(id.getValue());

// Line 179
const allXiuyuans = this.storage.getAllXiuYuans();

// Line 205
const dataList = this.storage.getAllXiuYuans();
```

**注意**：
- `XiuyuanRepository` 已经依赖 `UnifiedStorageManager`
- 但使用的方法名不一致（`getXiuYuan` vs `getXiuyuan`）
- 需要检查方法名是否正确

## 中优先级问题

### 4. Queue DataSources ⚠️ 中优先级

**文件**：
- `src/core/queue/datasource/StorageDataSource.ts`
- `src/core/queue/datasource/RiffDataSource.ts`
- `src/core/queue/datasource/LocalStorageDataSource.ts`

**问题**：
- 使用 `this.storage.getAllCards()`
- 使用 `this.storage.getCardByBlockId()`
- 使用 `this.storage.getCard()`
- 使用 `this.storage.setCard()`

**影响**：
- 队列数据加载
- 卡片查询

**修复方案**：
1. 注入 `UnifiedStorageManager`
2. 更新所有查询方法

### 5. Queue Strategies ⚠️ 中优先级

**文件**：
- `src/core/queue/strategies/SubsetPracticeStrategy.ts`
- `src/core/queue/strategies/TemporaryDrillStrategy.ts`

**问题**：
- 使用 `this.storage.getCard()`
- 使用 `this.storage.getAllCards()`
- 使用 `this.storage.getCardByBlockId()`

**影响**：
- 练习队列策略
- 卡片元数据获取

**修复方案**：
1. 注入 `UnifiedStorageManager`
2. 更新所有查询方法

### 6. XiuyuanService ⚠️ 中优先级

**文件**：`src/core/xiuyuan/service.ts`

**问题**：
- 使用 `this.storage.getStats()`
- 使用 `this.storage.save()`
- 使用 `this.storage.getTemplate()`
- 使用 `this.storage.getAllTemplates()`
- 使用 `this.storage.getXiuyuan()`
- 使用 `this.storage.getXiuyuansByBlockID()`
- 使用 `this.storage.getMappingByCardID()`
- 使用 `this.storage.getMappingsByXiuyuanID()`
- 使用 `this.storage.getAllXiuyuans()`

**影响**：
- Xiuyuan 模板管理
- Xiuyuan 查询

**注意**：
- `XiuyuanService` 使用的是 `XiuyuanStorage`，不是 `StorageManager`
- 这是正确的，因为模板管理是独立的
- 但需要确认是否有混用

## 低优先级问题

### 7. TransactionObserver ✅ 已废弃

**文件**：`src/core/box/TransactionObserver.ts`

**状态**：已标记为 `@deprecated`，被 `AutoCardHandler` 替代

**问题**：
- 使用 `this.plugin.storage.setCard()`
- 使用 `this.plugin.storage.saveCards()`

**建议**：
- 不需要修复，等待删除

## 修复优先级

### 立即修复（影响核心功能）

1. ✅ **MenuActions** - 已修复
2. 🔄 **SchedulerRouter** - 需要修复（影响卡片复习）
3. 🔄 **XiuyuanSyncService** - 需要修复（影响 Riff 同步）

### 本周修复（影响重要功能）

4. 🔄 **XiuyuanRepository** - 检查方法名
5. 🔄 **Queue DataSources** - 影响队列功能
6. 🔄 **Queue Strategies** - 影响练习策略

### 后续修复（影响次要功能）

7. 🔄 **XiuyuanService** - 确认是否需要修复
8. ⏸️ **TransactionObserver** - 已废弃，不修复

## 修复策略

### 通用修复模式

**之前（使用 StorageManager）**：
```typescript
class SomeService {
    constructor(private storage: StorageManager) {}
    
    someMethod() {
        const card = this.storage.getCard(cardId);
        this.storage.setCard(updatedCard);
        await this.storage.saveCards();
    }
}
```

**之后（使用 UnifiedStorageManager + CardApplicationService）**：
```typescript
class SomeService {
    constructor(
        private unifiedStorage: UnifiedStorageManager,
        private cardApplicationService: CardApplicationService
    ) {}
    
    async someMethod() {
        // 查询
        const card = this.unifiedStorage.getCard(cardId);
        
        // 更新
        await this.cardApplicationService.batchUpdateCardsWithoutEvents([updatedCard]);
    }
}
```

### 注意事项

1. **查询操作**：使用 `UnifiedStorageManager`
   - `getCard()`
   - `getAllCards()`
   - `getCardsByBlockId()`
   - `getCardsByXiuyuanId()`

2. **更新操作**：使用 `CardApplicationService`
   - `batchUpdateCardsWithoutEvents()` - 批量更新（不触发事件）
   - `batchCreateCardsWithoutEvents()` - 批量创建（不触发事件）
   - `batchDeleteCards()` - 批量删除（触发事件）

3. **保存操作**：不需要手动调用
   - `CardApplicationService` 会自动保存
   - 移除所有 `saveCards()` 调用

## 测试计划

### 功能测试

1. **卡片复习**
   - 测试 FSRS 调度
   - 测试 SM-15 调度
   - 测试调度器切换

2. **Riff 同步**
   - 测试增量同步
   - 测试全量同步
   - 测试黑名单功能

3. **队列功能**
   - 测试提取练习队列
   - 测试刻意练习队列
   - 测试渐进学习队列

4. **Xiuyuan 功能**
   - 测试 Xiuyuan 创建
   - 测试 Xiuyuan 删除
   - 测试卡片关联

### 性能测试

1. 批量操作性能
2. 查询性能
3. 内存使用

## 下一步行动

### 今天

- [x] 修复 MenuActions ✅
- [ ] 修复 SchedulerRouter
- [ ] 修复 XiuyuanSyncService

### 本周

- [ ] 修复 XiuyuanRepository
- [ ] 修复 Queue DataSources
- [ ] 修复 Queue Strategies

### 下周

- [ ] 全面测试
- [ ] 性能优化
- [ ] 文档更新
