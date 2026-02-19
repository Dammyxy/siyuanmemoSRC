# SiYuan Memo Plugin - DDD 架构指南

> 本项目正在进行 DDD（领域驱动设计）架构重构，本文档是所有开发者和 AI 助手的必读指南。

## 🎯 DDD 化目标

### 核心目标

1. **清晰的分层架构**
   - 表现层（UI）→ 应用层 → 领域层 → 基础设施层
   - 依赖方向：外层依赖内层，内层不依赖外层
   - 领域层是核心，包含业务逻辑

2. **符合 DDD 原则**
   - 使用聚合根、实体、值对象
   - 业务逻辑在领域服务中
   - 通过仓储模式访问数据
   - 使用领域事件解耦模块

3. **高质量代码**
   - 单一职责原则
   - 依赖注入
   - 易于测试
   - 向后兼容

## 📐 架构层次

### 1. 表现层（Presentation Layer）

**位置**：`src/ui/`, `src/application/managers/`

**职责**：
- UI 组件和对话框
- 用户交互处理
- 调用应用服务

**规则**：
- ✅ 可以调用应用服务
- ❌ 不能直接访问领域层
- ❌ 不能直接访问基础设施层
- ❌ 不能包含业务逻辑

**示例**：
```typescript
// ✅ 正确：通过应用服务
class MenuManager {
  async openTopBarMenu(ev: MouseEvent): Promise<void> {
    const cardService = this.context.getCardApplicationService();
    const result = await cardService.getDueCards();
    // 使用 result 显示菜单
  }
}

// ❌ 错误：直接访问 Storage
class MenuManager {
  openTopBarMenu(ev: MouseEvent): void {
    const storage = this.context.getStorage();
    const cards = storage.getDueCards(); // 跳过了应用层
  }
}
```

### 2. 应用层（Application Layer）

**位置**：`src/application/`

**职责**：
- 协调用例执行
- 事务管理
- 权限检查
- DTO 转换

**组件**：
- **Commands**：命令对象（写操作）
- **Queries**：查询对象（读操作）
- **UseCases**：用例（业务流程）
- **Services**：应用服务（门面）

**规则**：
- ✅ 可以调用领域服务
- ✅ 可以调用仓储
- ✅ 可以发布领域事件
- ❌ 不能包含业务逻辑（委托给领域层）

**示例**：
```typescript
// ✅ 正确：应用服务协调用例
export class CardApplicationService {
  async getDueCards(query: GetDueCardsQuery): Promise<GetDueCardsQueryResult> {
    return this.getDueCardsQueryHandler.execute(query);
  }
}

// ✅ 正确：查询处理器使用领域服务
export class GetDueCardsQueryHandler {
  async execute(query: GetDueCardsQuery): Promise<GetDueCardsQueryResult> {
    const allCards = this.storageManager.getAllCards();
    const dueCards = this.scheduleService.filterDueCards(allCards, query.now);
    return { cards: dueCards, count: dueCards.length, total: allCards.length };
  }
}
```

### 3. 领域层（Domain Layer）

**位置**：`src/core/xiuyuan/domain/`, `src/core/card/domain/`

**职责**：
- 业务逻辑
- 领域规则
- 领域事件

**组件**：
- **Entities**：实体（有唯一标识）
- **Value Objects**：值对象（不可变）
- **Aggregates**：聚合根（一致性边界）
- **Domain Services**：领域服务（跨实体的业务逻辑）
- **Domain Events**：领域事件（状态变化通知）
- **Repositories**：仓储接口（数据访问抽象）

**规则**：
- ✅ 包含所有业务逻辑
- ✅ 不依赖外层
- ✅ 可以发布领域事件
- ❌ 不能依赖基础设施层
- ❌ 不能依赖应用层

**示例**：
```typescript
// ✅ 正确：领域服务包含业务逻辑
export class CardScheduleService {
  isDue(card: Card, now: Date = new Date()): boolean {
    if (card.state === CardState.Suspended) {
      return false;
    }
    return card.due <= now.getTime();
  }
}

// ✅ 正确：聚合根发布领域事件
export class Xiuyuan {
  deleteCard(cardId: CardId): Result<void> {
    // 业务逻辑
    const result = this.cards.delete(cardId.value);
    
    // 发布领域事件
    this.addDomainEvent(new CardDeletedEvent(cardId.value));
    
    return ok(undefined);
  }
}
```

### 4. 基础设施层（Infrastructure Layer）

**位置**：`src/core/storage/`, `src/core/xiuyuan/infrastructure/`

**职责**：
- 数据持久化
- 外部服务集成
- 技术实现细节

**组件**：
- **Repositories**：仓储实现
- **Storage**：存储管理
- **External Services**：外部服务

**规则**：
- ✅ 实现领域层定义的接口
- ✅ 处理数据转换
- ❌ 不能包含业务逻辑

**示例**：
```typescript
// ✅ 正确：仓储实现数据转换
export class XiuyuanRepository implements IXiuyuanRepository {
  async save(xiuyuan: Xiuyuan): Promise<Result<void>> {
    // 领域模型 → 持久化模型
    const dto = this.toDTO(xiuyuan);
    await this.storage.save(dto);
    return ok(undefined);
  }
}

// ❌ 错误：Storage 包含业务逻辑
export class StorageManager {
  getDueCards(): Card[] {
    // 这是业务逻辑，应该在领域服务中
    return this.cards.filter(card => card.due <= Date.now());
  }
}
```

## 🔄 领域事件机制

### 为什么需要领域事件？

1. **解耦模块**：模块之间通过事件通信，而不是直接调用
2. **扩展性**：新增功能只需订阅事件，不需要修改现有代码
3. **一致性**：确保相关操作的最终一致性
4. **审计**：记录所有重要的状态变化

### 事件流程

```
1. 聚合根执行业务逻辑
   ↓
2. 聚合根添加领域事件到内部列表
   ↓
3. 应用服务保存聚合根
   ↓
4. 应用服务获取领域事件
   ↓
5. 应用服务通过 EventBus 发布事件
   ↓
6. 订阅者接收事件并执行相应逻辑
```

### 事件命名规范

- 使用过去式：`CardCreatedEvent`, `CardDeletedEvent`
- 包含必要信息：事件 ID、发生时间、相关数据
- 不可变：事件一旦创建就不能修改

### 示例

```typescript
// 1. 定义事件
export class CardCreatedEvent extends DomainEvent {
  constructor(
    public readonly cardId: string,
    public readonly xiuyuanId: string
  ) {
    super();
  }
  
  get eventName(): string {
    return 'card.created';
  }
}

// 2. 聚合根发布事件
export class Xiuyuan {
  createCard(template: CardTemplate): Result<Card> {
    const card = Card.create(/* ... */);
    this.cards.set(card.id.value, card);
    
    // 添加领域事件
    this.addDomainEvent(new CardCreatedEvent(card.id.value, this.id.value));
    
    return ok(card);
  }
}

// 3. 应用服务发布事件
export class CreateCardUseCase {
  async execute(command: CreateCardCommand): Promise<Result<Card>> {
    const xiuyuan = await this.repository.findById(command.xiuyuanId);
    const result = xiuyuan.createCard(/* ... */);
    
    await this.repository.save(xiuyuan);
    
    // 发布领域事件
    const events = xiuyuan.getDomainEvents();
    for (const event of events) {
      await this.eventBus.publish(event);
    }
    xiuyuan.clearDomainEvents();
    
    return result;
  }
}

// 4. 订阅事件
eventBus.subscribe('card.created', async (event: CardCreatedEvent) => {
  console.log(`Card ${event.cardId} created`);
  // 执行相关业务逻辑
});
```

## 🚫 废弃代码清理规则

### 标记废弃

使用 `@deprecated` 标记，并说明替代方案：

```typescript
/**
 * @deprecated 使用 CardScheduleService.filterDueCards() 代替
 * 
 * 这个方法包含业务逻辑，应该在领域服务中实现。
 * 
 * @see CardScheduleService.filterDueCards()
 */
getDueCards(): Card[] {
  // 保留实现以保持向后兼容
}
```

### 清理时机

1. **标记废弃**：立即标记，添加文档
2. **迁移调用方**：逐步迁移所有调用方
3. **移除代码**：确认所有调用方迁移完成后移除

### 清理清单

- [ ] `StorageManager.getDueCards()` - 已标记废弃
- [ ] `MenuManager.getDueCount()` - 已标记废弃
- [ ] 其他直接访问 Storage 的代码

## 📝 编码规范

### 命名规范

- **Commands**：`CreateCardCommand`, `DeleteCardCommand`
- **Queries**：`GetDueCardsQuery`, `GetDueCardsQueryResult`
- **UseCases**：`CreateCardUseCase`, `DeleteCardUseCase`
- **Services**：`CardApplicationService`, `CardScheduleService`
- **Events**：`CardCreatedEvent`, `CardDeletedEvent`

### 文件组织

```
src/
├── application/              # 应用层
│   ├── commands/            # 命令对象
│   ├── queries/             # 查询对象
│   ├── usecases/            # 用例
│   ├── services/            # 应用服务
│   └── managers/            # UI 管理器
├── core/                    # 核心层
│   ├── card/               # 卡片领域
│   │   └── domain/
│   │       └── services/   # 领域服务
│   ├── xiuyuan/            # 修缘领域
│   │   ├── domain/         # 领域模型
│   │   │   ├── entities/
│   │   │   ├── value-objects/
│   │   │   ├── services/
│   │   │   ├── events/
│   │   │   └── repositories/
│   │   └── infrastructure/ # 基础设施
│   └── storage/            # 存储
└── ui/                     # 表现层
```

### 测试规范

- **单元测试**：测试单个类的行为
- **集成测试**：测试多个类的协作
- **测试覆盖率**：目标 > 80%

```typescript
// 单元测试示例
describe('CardScheduleService', () => {
  it('应该返回 true 当卡片到期时', () => {
    const service = new CardScheduleService();
    const card = createCard({ due: Date.now() - 1000 });
    expect(service.isDue(card)).toBe(true);
  });
});
```

## 🎯 当前进度

### ✅ 已完成

- [x] 阶段 1：提取 CardScheduleService 领域服务
- [x] 阶段 2：引入 CardApplicationService 查询
- [x] Bug 修复：模块加载错误

### 🔄 进行中

- [ ] 阶段 3：添加领域事件机制
- [ ] 清理废弃代码

### ⏳ 待完成

- [ ] 完善测试覆盖
- [ ] 性能优化
- [ ] 文档完善

## 📚 参考资源

### DDD 核心概念

- **聚合根（Aggregate Root）**：一致性边界，对外暴露的唯一入口
- **实体（Entity）**：有唯一标识的对象
- **值对象（Value Object）**：不可变的对象，通过值比较
- **领域服务（Domain Service）**：跨实体的业务逻辑
- **仓储（Repository）**：数据访问的抽象
- **领域事件（Domain Event）**：状态变化的通知

### 推荐阅读

- 《领域驱动设计》- Eric Evans
- 《实现领域驱动设计》- Vaughn Vernon
- [DDD 参考架构](https://github.com/ddd-crew/ddd-starter-modelling-process)

## 🤝 贡献指南

### 开发新功能

1. **分析需求**：确定属于哪个领域
2. **设计模型**：定义实体、值对象、聚合根
3. **实现领域层**：编写业务逻辑和测试
4. **实现应用层**：创建用例和应用服务
5. **实现表现层**：创建 UI 组件
6. **集成测试**：验证完整流程

### 重构现有代码

1. **识别问题**：找出不符合 DDD 的代码
2. **制定计划**：设计重构方案
3. **渐进式重构**：分阶段实施
4. **保持兼容**：标记废弃，不破坏现有功能
5. **测试验证**：确保功能正常
6. **清理代码**：移除废弃代码

## ⚠️ 常见陷阱

### 1. 贫血模型

❌ **错误**：实体只有 getter/setter，没有业务逻辑
```typescript
class Card {
  private due: number;
  getDue(): number { return this.due; }
  setDue(due: number): void { this.due = due; }
}
```

✅ **正确**：实体包含业务逻辑
```typescript
class Card {
  private due: number;
  
  isDue(now: Date): boolean {
    return this.due <= now.getTime();
  }
  
  reschedule(interval: number): void {
    this.due = Date.now() + interval;
  }
}
```

### 2. 跨层调用

❌ **错误**：表现层直接访问基础设施层
```typescript
class MenuManager {
  openMenu(): void {
    const storage = this.context.getStorage();
    const cards = storage.getDueCards(); // 跳过应用层
  }
}
```

✅ **正确**：通过应用层访问
```typescript
class MenuManager {
  async openMenu(): Promise<void> {
    const cardService = this.context.getCardApplicationService();
    const result = await cardService.getDueCards();
  }
}
```

### 3. 基础设施层包含业务逻辑

❌ **错误**：Storage 包含业务逻辑
```typescript
class StorageManager {
  getDueCards(): Card[] {
    return this.cards.filter(card => 
      card.due <= Date.now() && card.state !== CardState.Suspended
    );
  }
}
```

✅ **正确**：业务逻辑在领域服务中
```typescript
class CardScheduleService {
  filterDueCards(cards: Card[], now: Date): Card[] {
    return cards.filter(card => this.isDue(card, now));
  }
}
```

## 🎉 总结

DDD 不是银弹，但它能帮助我们：
- 更好地理解业务
- 编写更清晰的代码
- 提高系统的可维护性
- 降低技术债务

记住：**领域层是核心，业务逻辑在领域层！**

---

**最后更新**：2026-02-19
**维护者**：SiYuan Memo Team
**状态**：持续更新中
