# Phase 9 Task 4.2 计划 - 重构 XiuyuanSyncService

创建时间：2026-02-19

## 问题分析

### 当前架构问题

XiuyuanSyncService 直接访问 `this.storage`，违反 DDD 架构原则：

1. **绕过应用层** - 直接访问基础设施层
2. **无领域事件** - 卡片创建/更新/删除不触发事件
3. **难以测试** - 紧耦合 StorageManager
4. **职责混乱** - 同步服务不应该直接操作存储

### 直接 storage 访问位置

根据代码审查，发现以下位置：

#### 增量同步（incrementalSync）
- 行 148：`this.storage.getRiffBlacklist()` - 获取黑名单
- 行 165：`this.storage.getCard()` - 检查卡片是否存在
- 行 169：`this.storage.getAllCards()` - 查找重复卡片
- 行 179：`this.storage.setCard()` - 添加新卡片
- 行 254：`this.storage.removeCard()` - 删除卡片
- 行 260：`this.storage.saveCards()` - 保存所有卡片

#### 全量同步（fullSync）
- 行 320：`this.storage.getAllCards()` - 获取所有本地卡片
- 行 330：`this.storage.getCard()` - 检查卡片是否存在
- 行 345：`this.storage.removeCard()` - 删除卡片
- 行 355：`this.storage.getRiffBlacklist()` - 获取黑名单
- 行 360：`this.storage.removeFromRiffBlacklist()` - 清理黑名单
- 行 370：`this.storage.saveCards()` - 保存所有卡片

#### 删除同步（deleteSync）
- 无直接 storage 访问（通过 Riff API）

#### 辅助方法（syncRiffCardToLocal）
- 行 420：`this.storage.getCardsByBlockId()` - 获取卡片
- 行 430：`this.storage.setCard()` - 更新卡片

## 重构方案

### 方案 A：注入 CardApplicationService（推荐）⭐

**优点**：
- 符合 DDD 架构
- 触发领域事件
- 易于测试

**实现**：
```typescript
export class XiuyuanSyncService extends EventEmitter<HybridSyncEvents> {
  private storage: StorageManager;  // 保留用于只读操作
  private cardApplicationService: CardApplicationService;  // ✅ 新增

  constructor(
    config: HybridSyncConfig,
    cardApplicationService: CardApplicationService  // ✅ 注入
  ) {
    this.storage = config.storage;
    this.cardApplicationService = cardApplicationService;
  }
}
```

**使用批量方法**：
- `batchCreateCardsWithoutEvents()` - 创建新卡片（不触发事件，避免同步循环）
- `batchUpdateCardsWithoutEvents()` - 更新现有卡片
- `batchDeleteCards()` - 删除卡片（触发事件）

### 方案 B：创建 SyncApplicationService

**优点**：
- 更清晰的职责分离
- 专门处理同步逻辑

**缺点**：
- 需要额外的服务层
- 增加复杂度

**暂不采用**：当前 CardApplicationService 已经足够

## 重构步骤

### 步骤 1：修改构造函数 ✅

```typescript
constructor(
  config: HybridSyncConfig,
  cardApplicationService?: CardApplicationServiceLike  // ✅ 可选注入
) {
  this.storage = config.storage;
  this.cardApplicationService = cardApplicationService;
}
```

### 步骤 2：重构增量同步

**创建卡片**（行 179）：
```typescript
// 之前
this.storage.setCard(fsrsCard);

// 之后
if (this.cardApplicationService) {
  await this.cardApplicationService.batchCreateCardsWithoutEvents([fsrsCard]);
} else {
  this.storage.setCard(fsrsCard);  // 向后兼容
}
```

**更新卡片**（行 230）：
```typescript
// 之前
localCard.priority = newPriority;
this.storage.setCard(localCard);

// 之后
if (this.cardApplicationService) {
  await this.cardApplicationService.batchUpdateCardsWithoutEvents([localCard]);
} else {
  this.storage.setCard(localCard);  // 向后兼容
}
```

**删除卡片**（行 254）：
```typescript
// 之前
this.storage.removeCard(card.id);

// 之后
if (this.cardApplicationService) {
  await this.cardApplicationService.batchDeleteCards(cardIds);
} else {
  for (const id of cardIds) {
    this.storage.removeCard(id);  // 向后兼容
  }
}
```

**保存卡片**（行 260）：
```typescript
// 之前
await this.storage.saveCards();

// 之后
if (this.cardApplicationService) {
  await this.cardApplicationService.saveCards();
} else {
  await this.storage.saveCards();  // 向后兼容
}
```

### 步骤 3：重构全量同步

类似的模式，使用批量方法。

### 步骤 4：更新创建 XiuyuanSyncService 的地方

在 ApplicationContext 或 index.ts 中：
```typescript
const xiuyuanSyncService = new XiuyuanSyncService(
  config,
  context.getCardApplicationService()  // ✅ 传递服务
);
```

## 关键决策

### 为什么使用 `batchXxxWithoutEvents`？

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

### 只读操作保留 storage

以下操作保留直接 storage 访问（只读）：
- `this.storage.getCard()` - 查询卡片
- `this.storage.getAllCards()` - 查询所有卡片
- `this.storage.getRiffBlacklist()` - 查询黑名单

**原因**：
- 只读操作不违反 DDD 原则
- 避免过度抽象
- 性能更好

## 测试策略

### 单元测试

```typescript
describe('XiuyuanSyncService', () => {
  it('should use CardApplicationService for creating cards', async () => {
    const mockCardService = {
      batchCreateCardsWithoutEvents: jest.fn()
    };
    
    const syncService = new XiuyuanSyncService(config, mockCardService);
    await syncService.incrementalSync();
    
    expect(mockCardService.batchCreateCardsWithoutEvents).toHaveBeenCalled();
  });
});
```

### 集成测试

1. 测试增量同步创建新卡片
2. 测试全量同步更新现有卡片
3. 测试删除同步触发事件
4. 测试向后兼容（不传 CardApplicationService）

## 风险评估

### 高风险

1. **同步循环** - 如果使用了触发事件的方法
   - 缓解：使用 WithoutEvents 方法

2. **数据丢失** - 批量操作失败
   - 缓解：保留向后兼容路径

### 中风险

3. **性能下降** - 批量操作可能更慢
   - 缓解：批量操作应该更快

### 低风险

4. **向后兼容** - 旧代码可能依赖直接 storage 访问
   - 缓解：保留回退路径

## 预期成果

1. ✅ 符合 DDD 架构
2. ✅ 所有写操作通过应用层
3. ✅ 保持向后兼容
4. ✅ 易于测试
5. ✅ 为统一卡片类型铺路

## 时间估计

- 步骤 1：修改构造函数（10 分钟）
- 步骤 2：重构增量同步（30 分钟）
- 步骤 3：重构全量同步（30 分钟）
- 步骤 4：更新调用方（10 分钟）
- 测试验证（20 分钟）

**总计**：约 1.5-2 小时
