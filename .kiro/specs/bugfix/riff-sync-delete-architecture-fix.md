# Riff 同步删除架构修复

## 问题描述

删除卡片时没有同步删除 Riff 中的闪卡，导致点同步后卡片又回来了。

## 初始方案（有架构问题）

最初的方案是在 `DeleteCardUseCase` 中直接调用 `XiuyuanSyncService.deleteSync()`：

```typescript
// ❌ 有问题的方案
export class DeleteCardUseCase {
  constructor(
    private readonly xiuyuanRepo: IXiuyuanRepository,
    private readonly cardDeletionService: CardDeletionService,
    private readonly eventBus: EventBus,
    private readonly syncService?: XiuyuanSyncService  // ❌ 用例层依赖应用服务层
  ) {}
  
  async execute(command: DeleteCardCommand): Promise<Result<void>> {
    // ...
    await this.xiuyuanRepo.save(xiuyuan);
    
    // ❌ 用例层直接调用应用服务层
    if (this.syncService) {
      await this.syncService.deleteSync(cardId.getValue());
    }
    // ...
  }
}
```

### 架构问题

1. **违反分层架构**：用例层（Application Layer）依赖应用服务层（Application Service Layer）
2. **破坏领域纯粹性**：Riff 是基础设施层的概念，用例层不应该知道它的存在
3. **可选依赖不优雅**：`syncService?` 是可选的，删除逻辑依赖于外部服务是否可用
4. **不符合开闭原则**：如果要添加新的同步目标（如 Anki），需要修改用例代码

## 正确的 DDD 方案：领域事件 + 事件处理器

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                        领域层 (Domain)                        │
│  ┌──────────────┐                                            │
│  │   Xiuyuan    │ ──> 发布 CardDeletedEvent                  │
│  └──────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ 领域事件
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       应用层 (Application)                    │
│  ┌──────────────────┐                                        │
│  │ DeleteCardUseCase│ ──> 发布事件到 EventBus                │
│  └──────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ 事件总线
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    基础设施层 (Infrastructure)                │
│  ┌──────────────────────┐                                    │
│  │ RiffSyncEventHandler │ ──> 监听事件 ──> 调用 Riff API     │
│  └──────────────────────┘                                    │
└─────────────────────────────────────────────────────────────┘
```

### 实现步骤

#### 1. 创建 RiffSyncEventHandler（基础设施层）

```typescript
// src/infrastructure/events/RiffSyncEventHandler.ts
export class RiffSyncEventHandler {
  constructor(
    private readonly eventBus: EventBus,
    private readonly syncService: XiuyuanSyncService
  ) {
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // 监听 CardDeletedEvent
    this.eventBus.subscribe('CardDeleted', async (event: CardDeletedEvent) => {
      await this.handleCardDeleted(event);
    });
  }

  private async handleCardDeleted(event: CardDeletedEvent): Promise<void> {
    try {
      // 调用同步服务删除 Riff 卡片
      await this.syncService.deleteSync(event.cardId);
    } catch (error) {
      console.error(`[RiffSyncEventHandler] Failed to sync card deletion to Riff:`, error);
    }
  }
}
```

#### 2. DeleteCardUseCase 保持纯粹（应用层）

```typescript
// src/application/usecases/card/DeleteCardUseCase.ts
export class DeleteCardUseCase {
  constructor(
    private readonly xiuyuanRepo: IXiuyuanRepository,
    private readonly cardDeletionService: CardDeletionService,
    private readonly eventBus: EventBus  // ✅ 只依赖 EventBus
  ) {}

  async execute(command: DeleteCardCommand): Promise<Result<void>> {
    // ...
    
    // 持久化
    await this.xiuyuanRepo.save(xiuyuan);

    // ✅ 发布领域事件（RiffSyncEventHandler 会监听并处理）
    const events = xiuyuan.getDomainEvents();
    await this.eventBus.publishAll(events);
    xiuyuan.clearDomainEvents();

    return ok(undefined);
  }
}
```

#### 3. 在 ApplicationContext 中注册事件处理器

```typescript
// src/application/ApplicationContext.ts
// 创建 XiuyuanSyncService
const hybridSyncService = new HybridSyncService(...);

// ✅ 注册 RiffSyncEventHandler
const riffSyncEventHandler = new RiffSyncEventHandler(eventBus, hybridSyncService);
```

### 架构优势

#### ✅ 符合 DDD 分层架构

- **领域层**：`Xiuyuan` 发布 `CardDeletedEvent`，不知道 Riff 的存在
- **应用层**：`DeleteCardUseCase` 发布事件到 `EventBus`，不依赖具体的同步实现
- **基础设施层**：`RiffSyncEventHandler` 监听事件并调用 Riff API

#### ✅ 符合开闭原则

- 添加新的同步目标（如 Anki）只需创建新的事件处理器
- 不需要修改领域层或应用层代码

#### ✅ 解耦和可测试性

- 领域层和应用层不依赖基础设施层
- 可以轻松 mock EventBus 进行单元测试
- 可以独立测试 RiffSyncEventHandler

#### ✅ 可插拔性

- 通过注册/注销事件处理器来启用/禁用 Riff 同步
- 不影响核心业务逻辑

## 修复 1：XiuyuanRepository.save() 同步删除卡片

这个修复是符合 DDD 原则的：

```typescript
// 3. 同步卡片状态：保存现有卡片，删除已移除的卡片
const cards = xiuyuan.getCards();
const currentCardIds = new Set(cards.map(card => card.getId().getValue()));

// 3.1 查找需要删除的卡片（存在于 storage 但不在 xiuyuan 中）
const allStorageCards = this.storage.getAllCards();
const cardsToDelete = allStorageCards.filter(
  storageCard => storageCard.xiuyuanID === xiuyuanId && !currentCardIds.has(storageCard.id)
);

// 3.2 删除已移除的卡片
for (const cardToDelete of cardsToDelete) {
  await this.storage.deleteCard(cardToDelete.id);
}

// 3.3 保存/更新当前卡片
for (const card of cards) {
  // ...
}
```

### 为什么符合 DDD？

- ✅ **Repository 职责**：Repository 负责将聚合根的状态同步到持久化层
- ✅ **聚合根一致性**：Xiuyuan 是聚合根，管理 Card 的生命周期
- ✅ **没有破坏封装**：通过 `xiuyuan.getCards()` 获取状态，不直接访问私有字段

## 总结

通过使用**领域事件 + 事件处理器**模式，我们实现了：

1. ✅ **符合 DDD 分层架构**：领域层、应用层、基础设施层职责清晰
2. ✅ **没有引入技术债务**：代码结构清晰，易于维护和扩展
3. ✅ **符合 SOLID 原则**：单一职责、开闭原则、依赖倒置
4. ✅ **高内聚低耦合**：各层之间通过事件解耦
5. ✅ **可测试性强**：可以独立测试各个组件

这是一个教科书级别的 DDD 实现！
