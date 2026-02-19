# DDD 架构长期改进计划

## 概述

本文档记录了当前架构中需要改进的方面，以及长期的重构计划。这些改进将使架构更加符合 DDD 原则，但不是紧急任务，可以在后续迭代中逐步实施。

## 当前状态评估

### ✅ 已经做得好的方面

1. **依赖方向正确**
   - 应用层 → 领域层 → 基础设施层
   - 通过 ApplicationContext 统一管理服务

2. **层次边界清晰**
   - MenuManager 属于应用层
   - 没有直接访问领域层实现细节

3. **使用已有的查询方法**
   - 避免重复实现业务逻辑

4. **依赖注入**
   - MenuManager 通过构造函数注入 DialogManager
   - 符合依赖注入原则

### ⚠️ 需要改进的方面

#### 1. Storage 职责过重

**当前问题**：
```typescript
// StorageManager.ts
getDueCards(): Card[] {
  const now = Date.now();
  return this.getAllCards().filter(card => {
    // 包含业务逻辑：判断卡片是否到期
    return card.due <= now && card.state !== CardState.Suspended;
  });
}
```

**问题分析**：
- `getDueCards()` 包含业务逻辑（判断卡片是否到期）
- StorageManager 应该只负责数据存储和检索
- 业务逻辑应该在领域服务中

**DDD 原则**：
- 基础设施层（StorageManager）不应包含业务逻辑
- 业务逻辑应该在领域层（Domain Service）

#### 2. 跳过应用服务层

**当前问题**：
```typescript
// MenuManager.ts
private getDueCount(): number {
  const storage = this.context.getStorage();
  return storage.getDueCards().length;  // 直接访问 Storage
}
```

**问题分析**：
- MenuManager（应用层）直接访问 StorageManager（基础设施层）
- 跳过了应用服务层（CardApplicationService）
- 违反了分层架构原则

**理想架构**：
```
MenuManager (应用层)
    ↓
CardApplicationService (应用服务层)
    ↓
CardScheduleService (领域服务层)
    ↓
ICardRepository (仓储接口)
    ↓
StorageManager (基础设施层)
```

#### 3. 缺少领域事件

**当前问题**：
- 卡片状态变化时没有发布事件
- 其他模块无法感知卡片状态变化
- 难以实现解耦的业务逻辑

**DDD 原则**：
- 领域事件是 DDD 的核心概念
- 用于解耦不同聚合根之间的依赖
- 实现最终一致性

## 长期改进方案

### 阶段 1：提取 CardScheduleService 领域服务（2-3 小时）

#### 目标
将卡片调度相关的业务逻辑从 StorageManager 提取到领域服务。

#### 实施步骤

**1.1 创建 CardScheduleService**

```typescript
// src/core/card/domain/services/CardScheduleService.ts

/**
 * CardScheduleService - 卡片调度领域服务
 * 
 * 职责：
 * - 判断卡片是否到期
 * - 计算到期卡片数量
 * - 获取到期卡片列表
 */
export class CardScheduleService {
  /**
   * 判断卡片是否到期
   */
  isDue(card: Card, now: Date = new Date()): boolean {
    if (card.state === CardState.Suspended) {
      return false;
    }
    return card.due <= now.getTime();
  }
  
  /**
   * 过滤到期卡片
   */
  filterDueCards(cards: Card[], now: Date = new Date()): Card[] {
    return cards.filter(card => this.isDue(card, now));
  }
  
  /**
   * 计算到期卡片数量
   */
  countDueCards(cards: Card[]): number {
    return this.filterDueCards(cards).length;
  }
}
```

**1.2 更新 StorageManager**

```typescript
// src/services/StorageManager.ts

/**
 * 获取所有到期的卡片
 * 
 * @deprecated 使用 CardScheduleService.filterDueCards() 代替
 */
getDueCards(): Card[] {
  // 保留向后兼容，但标记为废弃
  const now = Date.now();
  return this.getAllCards().filter(card => {
    return card.due <= now && card.state !== CardState.Suspended;
  });
}
```

**1.3 编写单元测试**

```typescript
// src/core/card/domain/services/__tests__/CardScheduleService.test.ts

describe('CardScheduleService', () => {
  let service: CardScheduleService;
  
  beforeEach(() => {
    service = new CardScheduleService();
  });
  
  describe('isDue', () => {
    it('应该返回 true 当卡片到期时', () => {
      const card = createCard({ due: Date.now() - 1000 });
      expect(service.isDue(card)).toBe(true);
    });
    
    it('应该返回 false 当卡片未到期时', () => {
      const card = createCard({ due: Date.now() + 1000 });
      expect(service.isDue(card)).toBe(false);
    });
    
    it('应该返回 false 当卡片被暂停时', () => {
      const card = createCard({ 
        due: Date.now() - 1000,
        state: CardState.Suspended 
      });
      expect(service.isDue(card)).toBe(false);
    });
  });
  
  describe('filterDueCards', () => {
    it('应该只返回到期的卡片', () => {
      const cards = [
        createCard({ id: '1', due: Date.now() - 1000 }),
        createCard({ id: '2', due: Date.now() + 1000 }),
        createCard({ id: '3', due: Date.now() - 2000 }),
      ];
      
      const dueCards = service.filterDueCards(cards);
      expect(dueCards).toHaveLength(2);
      expect(dueCards.map(c => c.id)).toEqual(['1', '3']);
    });
  });
  
  describe('countDueCards', () => {
    it('应该返回正确的到期卡片数量', () => {
      const cards = [
        createCard({ due: Date.now() - 1000 }),
        createCard({ due: Date.now() + 1000 }),
        createCard({ due: Date.now() - 2000 }),
      ];
      
      expect(service.countDueCards(cards)).toBe(2);
    });
  });
});
```

### 阶段 2：引入 CardApplicationService（2-3 小时）

#### 目标
创建应用服务层，封装卡片查询相关的用例。

#### 实施步骤

**2.1 创建查询命令**

```typescript
// src/application/queries/card/GetDueCardsQuery.ts

/**
 * GetDueCardsQuery - 获取到期卡片查询
 */
export interface GetDueCardsQuery {
  /**
   * 当前时间（可选，用于测试）
   */
  now?: Date;
}

/**
 * GetDueCardsQueryResult - 查询结果
 */
export interface GetDueCardsQueryResult {
  /**
   * 到期卡片列表
   */
  cards: Card[];
  
  /**
   * 到期卡片数量
   */
  count: number;
  
  /**
   * 总卡片数量
   */
  total: number;
}
```

**2.2 创建查询处理器**

```typescript
// src/application/queries/card/GetDueCardsQueryHandler.ts

/**
 * GetDueCardsQueryHandler - 获取到期卡片查询处理器
 */
export class GetDueCardsQueryHandler {
  constructor(
    private storageManager: StorageManager,
    private scheduleService: CardScheduleService
  ) {}
  
  /**
   * 执行查询
   */
  async execute(query: GetDueCardsQuery): Promise<GetDueCardsQueryResult> {
    const allCards = this.storageManager.getAllCards();
    const dueCards = this.scheduleService.filterDueCards(
      allCards, 
      query.now || new Date()
    );
    
    return {
      cards: dueCards,
      count: dueCards.length,
      total: allCards.length,
    };
  }
}
```

**2.3 扩展 CardApplicationService**

```typescript
// src/application/services/CardApplicationService.ts

export class CardApplicationService {
  private getDueCardsQueryHandler: GetDueCardsQueryHandler;
  
  constructor(
    // ... 现有依赖
    private scheduleService: CardScheduleService
  ) {
    // ... 现有初始化
    
    this.getDueCardsQueryHandler = new GetDueCardsQueryHandler(
      this.storageManager,
      this.scheduleService
    );
  }
  
  /**
   * 获取到期卡片
   */
  async getDueCards(query: GetDueCardsQuery = {}): Promise<GetDueCardsQueryResult> {
    return this.getDueCardsQueryHandler.execute(query);
  }
  
  /**
   * 获取到期卡片数量
   */
  async getDueCount(): Promise<number> {
    const result = await this.getDueCards();
    return result.count;
  }
}
```

**2.4 更新 MenuManager**

```typescript
// src/application/managers/MenuManager.ts

export class MenuManager {
  constructor(
    private context: ApplicationContext,
    private plugin: Plugin,
    private i18n: Record<string, any>,
    private dialogManager: DialogManager
  ) {}
  
  /**
   * 打开顶栏菜单
   */
  async openTopBarMenu(ev: MouseEvent): Promise<void> {
    const menu = new Menu('fsrs-topbar-menu');
    
    // 通过应用服务获取统计信息
    const cardService = this.context.getCardApplicationService();
    const dueResult = await cardService.getDueCards();
    
    // ... 构建菜单项
    
    // 统计信息
    menu.addItem({
      icon: 'iconInfo',
      label: `${this.i18n?.dueCountLabel || 'Due'}: ${dueResult.count} / ${this.i18n?.totalCountLabel || 'Total'}: ${dueResult.total}`,
      type: 'readonly',
    });
    
    // 打开菜单
    // ...
  }
  
  /**
   * 获取到期卡片数量
   * 
   * @deprecated 使用 CardApplicationService.getDueCount() 代替
   */
  private getDueCount(): number {
    // 保留向后兼容
    const storage = this.context.getStorage();
    return storage.getDueCards().length;
  }
}
```

**2.5 编写测试**

```typescript
// src/application/queries/card/__tests__/GetDueCardsQueryHandler.test.ts

describe('GetDueCardsQueryHandler', () => {
  let handler: GetDueCardsQueryHandler;
  let mockStorage: StorageManager;
  let scheduleService: CardScheduleService;
  
  beforeEach(() => {
    mockStorage = {
      getAllCards: vi.fn(),
    } as any;
    
    scheduleService = new CardScheduleService();
    handler = new GetDueCardsQueryHandler(mockStorage, scheduleService);
  });
  
  it('应该返回到期卡片和统计信息', async () => {
    const cards = [
      createCard({ id: '1', due: Date.now() - 1000 }),
      createCard({ id: '2', due: Date.now() + 1000 }),
      createCard({ id: '3', due: Date.now() - 2000 }),
    ];
    
    mockStorage.getAllCards.mockReturnValue(cards);
    
    const result = await handler.execute({});
    
    expect(result.count).toBe(2);
    expect(result.total).toBe(3);
    expect(result.cards).toHaveLength(2);
  });
});
```

### 阶段 3：添加领域事件机制（3-4 小时）

#### 目标
实现领域事件的发布和订阅机制，解耦不同模块之间的依赖。

#### 实施步骤

**3.1 创建领域事件基类**

```typescript
// src/core/shared/domain/events/DomainEvent.ts

/**
 * DomainEvent - 领域事件基类
 */
export abstract class DomainEvent {
  /**
   * 事件发生时间
   */
  public readonly occurredOn: Date;
  
  /**
   * 事件 ID
   */
  public readonly eventId: string;
  
  constructor() {
    this.occurredOn = new Date();
    this.eventId = crypto.randomUUID();
  }
  
  /**
   * 事件名称
   */
  abstract get eventName(): string;
}
```

**3.2 创建卡片相关事件**

```typescript
// src/core/card/domain/events/CardReviewedEvent.ts

/**
 * CardReviewedEvent - 卡片复习事件
 */
export class CardReviewedEvent extends DomainEvent {
  constructor(
    public readonly cardId: string,
    public readonly rating: number,
    public readonly nextDue: Date
  ) {
    super();
  }
  
  get eventName(): string {
    return 'card.reviewed';
  }
}

// src/core/card/domain/events/CardCreatedEvent.ts

/**
 * CardCreatedEvent - 卡片创建事件
 */
export class CardCreatedEvent extends DomainEvent {
  constructor(
    public readonly cardId: string,
    public readonly blockId: string
  ) {
    super();
  }
  
  get eventName(): string {
    return 'card.created';
  }
}

// src/core/card/domain/events/CardDeletedEvent.ts

/**
 * CardDeletedEvent - 卡片删除事件
 */
export class CardDeletedEvent extends DomainEvent {
  constructor(
    public readonly cardId: string
  ) {
    super();
  }
  
  get eventName(): string {
    return 'card.deleted';
  }
}
```

**3.3 创建事件总线**

```typescript
// src/core/shared/domain/events/EventBus.ts

/**
 * EventHandler - 事件处理器
 */
export type EventHandler<T extends DomainEvent> = (event: T) => void | Promise<void>;

/**
 * EventBus - 事件总线
 */
export class EventBus {
  private handlers: Map<string, EventHandler<any>[]> = new Map();
  
  /**
   * 订阅事件
   */
  subscribe<T extends DomainEvent>(
    eventName: string,
    handler: EventHandler<T>
  ): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName)!.push(handler);
  }
  
  /**
   * 发布事件
   */
  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventName) || [];
    
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`[EventBus] Error handling event ${event.eventName}:`, error);
      }
    }
  }
  
  /**
   * 取消订阅
   */
  unsubscribe(eventName: string, handler: EventHandler<any>): void {
    const handlers = this.handlers.get(eventName);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }
}
```

**3.4 在聚合根中发布事件**

```typescript
// src/core/card/domain/Card.ts

export class Card {
  private domainEvents: DomainEvent[] = [];
  
  /**
   * 复习卡片
   */
  review(rating: number, scheduler: IScheduler): void {
    // 执行复习逻辑
    const result = scheduler.schedule(this, rating);
    this.applyScheduleResult(result);
    
    // 发布领域事件
    this.addDomainEvent(new CardReviewedEvent(
      this.id,
      rating,
      new Date(this.due)
    ));
  }
  
  /**
   * 添加领域事件
   */
  private addDomainEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }
  
  /**
   * 获取领域事件
   */
  getDomainEvents(): DomainEvent[] {
    return [...this.domainEvents];
  }
  
  /**
   * 清除领域事件
   */
  clearDomainEvents(): void {
    this.domainEvents = [];
  }
}
```

**3.5 在应用服务中发布事件**

```typescript
// src/application/usecases/card/ReviewCardUseCase.ts

export class ReviewCardUseCase {
  constructor(
    private repository: ICardRepository,
    private eventBus: EventBus
  ) {}
  
  async execute(command: ReviewCardCommand): Promise<void> {
    // 获取卡片
    const card = await this.repository.findById(command.cardId);
    
    // 执行复习
    card.review(command.rating, this.scheduler);
    
    // 保存卡片
    await this.repository.save(card);
    
    // 发布领域事件
    const events = card.getDomainEvents();
    for (const event of events) {
      await this.eventBus.publish(event);
    }
    card.clearDomainEvents();
  }
}
```

**3.6 订阅事件**

```typescript
// src/application/ApplicationContext.ts

static async create(config: ApplicationConfig): Promise<ApplicationContext> {
  // ... 创建服务
  
  const eventBus = new EventBus();
  
  // 订阅卡片复习事件
  eventBus.subscribe('card.reviewed', async (event: CardReviewedEvent) => {
    console.log(`[EventBus] Card ${event.cardId} reviewed, next due: ${event.nextDue}`);
    // 可以在这里触发其他业务逻辑，如统计、通知等
  });
  
  // 订阅卡片创建事件
  eventBus.subscribe('card.created', async (event: CardCreatedEvent) => {
    console.log(`[EventBus] Card ${event.cardId} created for block ${event.blockId}`);
  });
  
  // ... 创建 ApplicationContext
}
```

## 实施优先级

### 高优先级（建议在 1-2 个月内完成）

1. **阶段 1：提取 CardScheduleService**
   - 影响：中等
   - 复杂度：低
   - 收益：提高代码可测试性和可维护性

### 中优先级（建议在 2-4 个月内完成）

2. **阶段 2：引入 CardApplicationService**
   - 影响：高
   - 复杂度：中等
   - 收益：完善分层架构，符合 DDD 原则

### 低优先级（建议在 4-6 个月内完成）

3. **阶段 3：添加领域事件机制**
   - 影响：高
   - 复杂度：高
   - 收益：解耦模块依赖，提高系统扩展性

## 向后兼容策略

### 渐进式重构

1. **保留旧接口**
   - 标记为 `@deprecated`
   - 在文档中说明替代方案
   - 保持功能正常工作

2. **并行运行**
   - 新旧代码同时存在
   - 逐步迁移调用方
   - 确保测试覆盖

3. **最终移除**
   - 在所有调用方迁移完成后
   - 移除废弃的代码
   - 更新文档

### 示例

```typescript
// 旧接口（保留向后兼容）
/**
 * @deprecated 使用 CardApplicationService.getDueCount() 代替
 */
getDueCount(): number {
  return this.storage.getDueCards().length;
}

// 新接口
async getDueCountNew(): Promise<number> {
  const cardService = this.context.getCardApplicationService();
  return cardService.getDueCount();
}
```

## 测试策略

### 单元测试

- 为每个新的领域服务编写单元测试
- 测试覆盖率 > 80%
- 使用 mock 隔离依赖

### 集成测试

- 测试应用服务的完整流程
- 验证事件发布和订阅
- 测试向后兼容性

### 端到端测试

- 测试 UI 交互
- 验证业务流程
- 确保用户体验不受影响

## 文档更新

### 需要更新的文档

1. **架构设计文档**
   - 更新分层架构图
   - 添加领域事件说明

2. **开发指南**
   - 添加领域服务使用示例
   - 添加事件发布订阅示例

3. **API 文档**
   - 标记废弃的接口
   - 添加新接口说明

## 总结

这个长期改进计划旨在使架构更加符合 DDD 原则，但不会破坏现有功能。通过渐进式重构和向后兼容策略，我们可以在保持系统稳定的同时，逐步提升代码质量和可维护性。

### 关键原则

1. **务实优先**：当前的实现已经可以工作，不需要立即重构
2. **渐进式改进**：分阶段实施，每个阶段都有明确的目标和收益
3. **向后兼容**：保持旧接口可用，给调用方足够的迁移时间
4. **测试驱动**：每个改进都要有充分的测试覆盖
5. **文档同步**：及时更新文档，帮助团队理解新架构

### 下一步行动

1. 阅读并理解本文档
2. 根据项目优先级选择实施阶段
3. 创建具体的实施任务
4. 开始第一阶段的重构
