# DDD 架构重构 - 设计文档

## 1. 架构设计

### 1.1 整体架构

采用经典的 DDD 四层架构：

```
┌─────────────────────────────────────────────────────────┐
│                    表现层 (Presentation)                 │
│  - Plugin (index.ts) - 仅作为入口，< 200 行             │
│  - UI Components (Vue)                                   │
│  - Event Handlers                                        │
└────────────────────┬────────────────────────────────────┘
                     │ 调用
┌────────────────────▼────────────────────────────────────┐
│                    应用层 (Application)                  │
│  - ApplicationContext (应用上下文)                       │
│  - UseCases (用例)                                       │
│  - Application Services (应用服务)                       │
│  - UI Managers (UI 管理器)                               │
└────────────────────┬────────────────────────────────────┘
                     │ 编排
┌────────────────────▼────────────────────────────────────┐
│                    领域层 (Domain)                       │
│  - Aggregates (聚合根)                                   │
│  - Entities (实体)                                       │
│  - Value Objects (值对象)                                │
│  - Domain Services (领域服务)                            │
│  - Repository Interfaces (仓储接口)                      │
└────────────────────┬────────────────────────────────────┘
                     │ 依赖
┌────────────────────▼────────────────────────────────────┐
│                    基础设施层 (Infrastructure)           │
│  - Repository Implementations (仓储实现)                 │
│  - External Services (外部服务)                          │
│  - Storage (存储)                                        │
└─────────────────────────────────────────────────────────┘
```

### 1.2 依赖规则

- 依赖方向：表现层 → 应用层 → 领域层 ← 基础设施层
- 领域层不依赖任何外层
- 基础设施层实现领域层定义的接口
- 使用依赖注入实现依赖倒置

## 2. 核心组件设计

### 2.1 ApplicationContext（应用上下文）

**职责**：
- 管理所有服务的生命周期
- 提供依赖注入容器
- 提供统一的服务访问接口

**接口设计**：

```typescript
interface ApplicationConfig {
  plugin: Plugin;
  i18n: Record<string, any>;
}

class ApplicationContext {
  // 核心服务
  private storageManager: StorageManager;
  private schedulerRouter: SchedulerRouter;
  private unifiedDataSourceManager: UnifiedDataSourceManager;
  
  // 应用服务
  private cardService: CardApplicationService;
  private reviewService: ReviewApplicationService;
  private syncService: SyncApplicationService;
  
  // UI 管理器
  private dialogManager: DialogManager;
  private menuManager: MenuManager;
  private tabManager: TabManager;
  
  // 创建上下文
  static async create(config: ApplicationConfig): Promise<ApplicationContext>;
  
  // 获取服务
  getCardService(): CardApplicationService;
  getReviewService(): ReviewApplicationService;
  getSyncService(): SyncApplicationService;
  
  // 获取管理器
  getDialogManager(): DialogManager;
  getMenuManager(): MenuManager;
  getTabManager(): TabManager;
  
  // 获取核心服务（向后兼容）
  getStorage(): StorageManager;
  getScheduler(): SchedulerRouter;
  getUnifiedDataSourceManager(): UnifiedDataSourceManager;
  
  // 生命周期
  async dispose(): Promise<void>;
}
```

**实现要点**：
- 使用工厂方法创建（`static create`）
- 懒加载非关键服务
- 提供向后兼容的访问方法
- 确保资源正确释放

### 2.2 Xiuyuan 聚合根

**职责**：
- 管理卡片生命周期
- 维护业务不变性
- 发布领域事件

**领域模型设计**：

```typescript
// 值对象
class XiuyuanId {
  private constructor(private readonly value: string) {}
  static create(value: string): Result<XiuyuanId>;
  getValue(): string;
}

class CardFace {
  constructor(
    public readonly question: string,
    public readonly answer: string,
    public readonly questionBlockId?: string,
    public readonly answerBlockId?: string
  ) {}
  
  static create(props: CardFaceProps): Result<CardFace>;
}

// 实体
class Card {
  constructor(
    private readonly id: CardId,
    private xiuyuanId: XiuyuanId,
    private faceIndex: number,
    private scheduleInfo: ScheduleInfo,
    private createdAt: Date,
    private updatedAt: Date
  ) {}
  
  // 业务方法
  review(rating: number): Result<void>;
  reschedule(newDue: Date): Result<void>;
}

// 聚合根
class Xiuyuan {
  private constructor(
    private readonly id: XiuyuanId,
    private blockIDs: BlockId[],
    private templateID: TemplateId,
    private faces: CardFace[],
    private priority: Priority,
    private cards: Map<CardId, Card>,
    private meta: Record<string, unknown>,
    private readonly createdAt: Date,
    private updatedAt: Date,
    private domainEvents: DomainEvent[]
  ) {}
  
  // 工厂方法
  static create(props: CreateXiuyuanProps): Result<Xiuyuan>;
  
  // 卡片操作
  createCard(faceIndex: number): Result<Card>;
  deleteCard(cardId: CardId): Result<void>;
  updateCard(cardId: CardId, updates: Partial<Card>): Result<void>;
  
  // 查询
  getCards(): Card[];
  getCard(cardId: CardId): Card | null;
  getBlockIDs(): BlockId[];
  getTemplateID(): TemplateId;
  getFaces(): CardFace[];
  
  // 领域事件
  getDomainEvents(): DomainEvent[];
  clearDomainEvents(): void;
}
```

**业务规则**：
- Xiuyuan 必须至少有一个 BlockId
- Xiuyuan 必须至少有一个 CardFace
- Card 只能属于一个 Xiuyuan
- 删除 Xiuyuan 时必须删除所有关联的 Card

### 2.3 Repository 模式

**职责**：
- 聚合根的持久化
- 数据格式转换
- 多数据源协调

**接口设计**：

```typescript
interface IXiuyuanRepository {
  // 基本 CRUD
  save(xiuyuan: Xiuyuan): Promise<Result<void>>;
  findById(id: XiuyuanId): Promise<Result<Xiuyuan | null>>;
  findByBlockId(blockId: BlockId): Promise<Result<Xiuyuan[]>>;
  findAll(): Promise<Result<Xiuyuan[]>>;
  delete(xiuyuan: Xiuyuan): Promise<Result<void>>;
  
  // 批量操作
  saveMany(xiuyuans: Xiuyuan[]): Promise<Result<void>>;
  deleteMany(xiuyuans: Xiuyuan[]): Promise<Result<void>>;
}
```

**实现设计**：

```typescript
class XiuyuanRepository implements IXiuyuanRepository {
  constructor(
    private storage: XiuyuanStorage,
    private blockAttrService: IBlockAttributeService,
    private riffService: IRiffService
  ) {}
  
  async save(xiuyuan: Xiuyuan): Promise<Result<void>> {
    // 1. 转换为持久化模型
    const persistenceModel = this.toPersistence(xiuyuan);
    
    // 2. 保存到 msgpack
    this.storage.createXiuyuan(persistenceModel);
    await this.storage.save();
    
    // 3. 写入块属性
    await this.blockAttrService.writeAttributes(
      xiuyuan.getBlockIDs()[0],
      xiuyuan
    );
    
    // 4. 同步到 Riff
    await this.riffService.addCard(xiuyuan.getBlockIDs()[0]);
    
    // 5. 发布领域事件
    await this.publishDomainEvents(xiuyuan);
    
    return ok(undefined);
  }
  
  async findById(id: XiuyuanId): Promise<Result<Xiuyuan | null>> {
    const data = this.storage.getXiuyuan(id.getValue());
    if (!data) return ok(null);
    
    return this.toDomain(data);
  }
  
  private toPersistence(xiuyuan: Xiuyuan): IXiuyuan {
    // 领域模型 → 持久化模型
  }
  
  private toDomain(data: IXiuyuan): Result<Xiuyuan> {
    // 持久化模型 → 领域模型
  }
  
  private async publishDomainEvents(xiuyuan: Xiuyuan): Promise<void> {
    const events = xiuyuan.getDomainEvents();
    for (const event of events) {
      await this.eventBus.publish(event);
    }
    xiuyuan.clearDomainEvents();
  }
}
```

### 2.4 UseCase 模式

**职责**：
- 编排领域对象
- 协调多个服务
- 定义事务边界

**设计模式**：

```typescript
// 命令对象
interface CreateCardCommand {
  blockId: string;
  templateId: string;
  faces: Array<{ question: string; answer: string }>;
  priority?: number;
  meta?: Record<string, unknown>;
}

// 用例
class CreateCardUseCase {
  constructor(
    private xiuyuanRepo: IXiuyuanRepository,
    private cardCreationService: CardCreationService
  ) {}
  
  async execute(command: CreateCardCommand): Promise<Result<Card>> {
    // 1. 验证输入
    const validation = this.validate(command);
    if (!validation.ok) return err(validation.error);
    
    // 2. 创建 Xiuyuan 聚合根
    const xiuyuan = Xiuyuan.create({
      blockIDs: [command.blockId],
      templateID: command.templateId,
      faces: command.faces.map(f => CardFace.create(f)),
      priority: command.priority || DEFAULT_PRIORITY,
      meta: command.meta || {}
    });
    
    if (!xiuyuan.ok) return err(xiuyuan.error);
    
    // 3. 创建卡片
    const card = await this.cardCreationService.createCard(
      xiuyuan.value,
      0 // 默认第一个面
    );
    
    if (!card.ok) return err(card.error);
    
    // 4. 持久化
    const saveResult = await this.xiuyuanRepo.save(xiuyuan.value);
    if (!saveResult.ok) return err(saveResult.error);
    
    return ok(card.value);
  }
  
  private validate(command: CreateCardCommand): Result<void> {
    // 验证逻辑
  }
}
```

### 2.5 UI 管理器

**DialogManager 设计**：

```typescript
class DialogManager {
  constructor(
    private context: ApplicationContext,
    private plugin: Plugin
  ) {}
  
  // 注册所有对话框
  registerAll(): void {
    this.registerReviewDialog();
    this.registerBrowserDialog();
    this.registerSettingsDialog();
  }
  
  // 打开对话框
  async openReviewDialog(): Promise<void>;
  async openBrowserDialog(): Promise<void>;
  async openSettingsDialog(defaultTab?: string): Promise<void>;
  
  // 关闭对话框
  closeReviewDialog(): void;
  closeBrowserDialog(): void;
}
```

**MenuManager 设计**：

```typescript
class MenuManager {
  constructor(
    private context: ApplicationContext,
    private plugin: Plugin,
    private i18n: Record<string, any>
  ) {}
  
  // 注册所有菜单
  registerAll(): void {
    this.registerTopBar();
    this.registerBlockMenu();
    this.registerCommands();
  }
  
  // 打开菜单
  openTopBarMenu(ev: MouseEvent): void;
  openBlockMenu(e: any): void;
}
```

**TabManager 设计**：

```typescript
class TabManager {
  constructor(
    private context: ApplicationContext,
    private plugin: Plugin
  ) {}
  
  // 注册所有 Tab
  registerAll(): void {
    this.registerBrowserTab();
    this.registerReviewTab();
  }
  
  // 打开 Tab
  openBrowserTab(): void;
  openReviewTab(options: ReviewTabOptions): void;
}
```

## 3. 数据流设计

### 3.1 创建卡片流程

```
用户点击创建卡片
  ↓
BlockMenuHandler.handleCreateCard()
  ↓
ApplicationContext.getCardService()
  ↓
CardApplicationService.createCard(command)
  ↓
CreateCardUseCase.execute(command)
  ↓
Xiuyuan.create() + Card.create()
  ↓
XiuyuanRepository.save(xiuyuan)
  ↓
[msgpack] + [块属性] + [Riff]
  ↓
发布领域事件
  ↓
UI 更新
```

### 3.2 删除卡片流程

```
用户点击删除卡片
  ↓
BlockMenuHandler.handleDeleteCard()
  ↓
ApplicationContext.getCardService()
  ↓
CardApplicationService.deleteCard(command)
  ↓
DeleteCardUseCase.execute(command)
  ↓
XiuyuanRepository.findById()
  ↓
Xiuyuan.deleteCard(cardId)
  ↓
XiuyuanRepository.save(xiuyuan)
  ↓
[msgpack] + [块属性] + [Riff]
  ↓
发布领域事件
  ↓
UI 更新
```

## 4. 目录结构

```
src/
├── index.ts                          # 插件入口 (< 200 行)
│
├── application/                      # 应用层
│   ├── ApplicationContext.ts         # 应用上下文 ⭐
│   │
│   ├── usecases/                     # 用例
│   │   ├── card/
│   │   │   ├── CreateCardUseCase.ts
│   │   │   ├── DeleteCardUseCase.ts
│   │   │   └── UpdateCardUseCase.ts
│   │   ├── review/
│   │   │   └── ReviewCardUseCase.ts
│   │   └── sync/
│   │       └── SyncCardsUseCase.ts
│   │
│   ├── services/                     # 应用服务
│   │   ├── CardApplicationService.ts
│   │   ├── ReviewApplicationService.ts
│   │   └── SyncApplicationService.ts
│   │
│   └── managers/                     # UI 管理器
│       ├── DialogManager.ts
│       ├── MenuManager.ts
│       └── TabManager.ts
│
├── core/                             # 领域层
│   ├── xiuyuan/
│   │   ├── domain/                   # 领域模型
│   │   │   ├── Xiuyuan.ts            # 聚合根 ⭐
│   │   │   ├── Card.ts               # 实体
│   │   │   ├── CardFace.ts           # 值对象
│   │   │   ├── XiuyuanId.ts          # 值对象
│   │   │   ├── BlockId.ts            # 值对象
│   │   │   ├── TemplateId.ts         # 值对象
│   │   │   ├── Priority.ts           # 值对象
│   │   │   │
│   │   │   ├── services/             # 领域服务
│   │   │   │   ├── CardCreationService.ts
│   │   │   │   └── CardDeletionService.ts
│   │   │   │
│   │   │   └── repositories/         # 仓储接口
│   │   │       └── IXiuyuanRepository.ts
│   │   │
│   │   └── infrastructure/           # 基础设施
│   │       ├── XiuyuanRepository.ts  # 仓储实现 ⭐
│   │       └── XiuyuanStorage.ts     # 持久化（已存在）
│   │
│   ├── review/
│   │   ├── domain/
│   │   │   ├── ReviewSession.ts      # 聚合根
│   │   │   └── services/
│   │   └── infrastructure/
│   │
│   └── scheduler/
│       ├── domain/
│       └── infrastructure/
│
└── infrastructure/                   # 基础设施层
    ├── siyuan/                       # 思源 API 适配器
    │   ├── BlockService.ts
    │   └── RiffService.ts
    └── storage/                      # 存储实现
        └── MessagePackStorage.ts
```

## 5. 技术决策

### 5.1 依赖注入

**决策**：使用简单的依赖注入容器，不引入第三方库

**理由**：
- 项目规模不大，不需要复杂的 DI 框架
- 减少依赖
- 更好的控制

### 5.2 Result 类型

**决策**：使用 Result<T, E> 类型处理错误

**理由**：
- 类型安全
- 强制错误处理
- 避免异常

### 5.3 领域事件

**决策**：使用简单的事件总线

**理由**：
- 解耦模块
- 支持扩展
- 易于测试

### 5.4 值对象

**决策**：使用类而不是类型别名

**理由**：
- 封装验证逻辑
- 类型安全
- 业务语义清晰

## 6. 迁移策略

### 6.1 渐进式迁移

- 新代码使用新架构
- 旧代码逐步迁移
- 新旧代码可共存
- 保持向后兼容

### 6.2 迁移顺序

1. 创建新架构（不影响旧代码）
2. 迁移核心功能（卡片创建/删除）
3. 迁移其他功能
4. 清理旧代码

### 6.3 回滚策略

- 每个 Phase 独立
- 可以随时停止
- 可以回滚到上一个 Phase

## 7. 测试策略

### 7.1 单元测试

**测试对象**：
- 领域模型
- 领域服务
- 用例
- 应用服务

**测试框架**：Vitest

**覆盖率目标**：> 80%

### 7.2 集成测试

**测试对象**：
- Repository 实现
- ApplicationContext
- 端到端流程

### 7.3 手动测试

**测试场景**：
- 创建卡片（所有模板）
- 删除卡片
- 更新卡片
- 复习卡片
- 同步卡片
- 插件加载/卸载

## 8. 性能考虑

### 8.1 懒加载

- 非关键服务懒加载
- UI 组件按需加载

### 8.2 缓存

- Repository 层缓存
- 避免重复查询

### 8.3 批量操作

- 支持批量保存
- 支持批量删除

## 9. 安全考虑

### 9.1 输入验证

- 所有用户输入必须验证
- 使用值对象封装验证逻辑

### 9.2 错误处理

- 使用 Result 类型
- 不暴露内部错误
- 记录错误日志

## 10. 可扩展性

### 10.1 插件机制

- 支持领域事件订阅
- 支持自定义用例

### 10.2 多数据源

- Repository 模式支持多数据源
- 易于添加新数据源

### 10.3 新功能

- 清晰的分层便于添加新功能
- 用例模式支持复杂业务逻辑
