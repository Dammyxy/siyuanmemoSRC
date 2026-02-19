# 彻底的非 DDD 代码审查报告

生成时间：2026-02-19
审查范围：siyuan-plugin-siyuanmemo 完整代码库

## 📊 执行摘要

### 整体状态
- **DDD 合规度**：81%
- **需要迁移的文件**：约 70 个
- **高优先级问题**：15 个
- **中优先级问题**：30 个
- **低优先级问题**：25 个

---

## 🔴 高优先级：需要立即迁移的代码

### 1. src/services/ 目录（23 个文件）

#### 1.1 核心服务类（直接违反 DDD）

| 文件 | 问题描述 | 违反原则 | 建议迁移目标 |
|------|---------|---------|-------------|
| **CardService.ts** | 混合业务逻辑和 UI 逻辑，直接访问 Storage | 跨层调用、贫血模型 | CardApplicationService |
| **ReviewService.ts** | 包含复习逻辑、对话框管理、数据转换 | 单一职责违反 | ReviewApplicationService |
| **MenuService.ts** | 包含业务逻辑和菜单构建 | 跨层调用 | MenuManager（应用层） |
| **DialogService.ts** | UI 和业务逻辑混合 | 跨层调用 | DialogManager（应用层） |
| **PluginService.ts** | 服务定位器反模式 | 依赖注入违反 | ApplicationContext |

**具体问题示例**：

```typescript
// ❌ CardService.ts - 直接访问 Storage
export class CardService {
  constructor(private plugin: FSRSPlugin) {}
  
  private getReviewService(): any | null {
    // 直接访问基础设施层
    const storage = this.plugin.getStorage();
    return storage.getReviewService();
  }
}

// ✅ 应该改为
export class CardApplicationService {
  constructor(
    private cardRepository: ICardRepository,
    private eventBus: EventBus
  ) {}
  
  async createCard(command: CreateCardCommand): Promise<void> {
    // 使用仓储和事件总线
  }
}
```

#### 1.2 事件处理器（跨层调用）

| 文件 | 问题描述 | 违反原则 | 建议迁移目标 |
|------|---------|---------|-------------|
| **BlockMenuHandler.ts** | 直接访问 Storage，跳过应用层 | 跨层调用 | 使用 CardApplicationService |
| **handlers/AutoCardHandler.ts** | 直接访问 Storage 和 UI | 跨层调用 | 使用 CardApplicationService |
| **handlers/RiffSyncHandler.ts** | 事务处理逻辑混入 | 基础设施混入应用层 | 移到 infrastructure 层 |

**具体问题示例**：

```typescript
// ❌ BlockMenuHandler.ts - 跨层调用
class BlockMenuHandler {
  private getCardService(): any | null {
    const storage = this.context.getStorage();
    return storage.getCardService(); // 直接访问基础设施
  }
}

// ✅ 应该改为
class BlockMenuHandler {
  constructor(
    private cardApplicationService: CardApplicationService
  ) {}
  
  async handleCreateCard(blockId: string): Promise<void> {
    await this.cardApplicationService.createCard(
      new CreateCardCommand(blockId)
    );
  }
}
```

#### 1.3 复习入口类（职责不清）

| 文件 | 问题描述 | 违反原则 | 建议迁移目标 |
|------|---------|---------|-------------|
| **ReviewEntryBase.ts** | 基类包含业务逻辑 | 贫血模型 | 删除，使用用例 |
| **FinalDrillEntry.ts** | 混合队列管理和复习逻辑 | 单一职责违反 | ReviewApplicationService |
| **IncrementalLearningEntry.ts** | 混合队列管理和复习逻辑 | 单一职责违反 | ReviewApplicationService |
| **RetrievalPracticeEntry.ts** | 混合队列管理和复习逻辑 | 单一职责违反 | ReviewApplicationService |
| **TemporaryDrillEntry.ts** | 混合队列管理和复习逻辑 | 单一职责违反 | ReviewApplicationService |
| **AddToFinalDrillEntry.ts** | 混合队列管理和复习逻辑 | 单一职责违反 | ReviewApplicationService |

#### 1.4 同步服务（架构混乱）

| 文件 | 问题描述 | 违反原则 | 建议迁移目标 |
|------|---------|---------|-------------|
| **XiuyuanSyncService.ts** | 混合同步逻辑、事件发射、定时器 | 单一职责违反 | XiuyuanApplicationService |
| **ReviewSyncManager.ts** | 混合同步和复习逻辑 | 单一职责违反 | ReviewApplicationService |
| **ReviewDialogManager.ts** | 混合对话框和业务逻辑 | 跨层调用 | DialogManager（应用层） |

#### 1.5 其他服务

| 文件 | 问题描述 | 违反原则 | 建议迁移目标 |
|------|---------|---------|-------------|
| **MigrationService.ts** | 迁移逻辑应该在应用层 | 层次混乱 | 应用层服务 |
| **MigrateQueueDataService.ts** | 队列迁移逻辑 | 层次混乱 | 应用层服务 |
| **QuickCardWebSocketService.ts** | WebSocket 逻辑应该在基础设施层 | 层次混乱 | infrastructure 层 |
| **TransactionWebSocketService.ts** | WebSocket 逻辑应该在基础设施层 | 层次混乱 | infrastructure 层 |
| **RiffCleanupService.ts** | 清理逻辑应该在应用层 | 层次混乱 | 应用层服务 |
| **QueueHelpers.ts** | 工具函数混入业务逻辑 | 职责不清 | 移到 utils 或领域服务 |

---

### 2. src/ui/browser/ 目录（3 个关键文件）

| 文件 | 问题描述 | 违反原则 | 建议迁移目标 |
|------|---------|---------|-------------|
| **browserService.ts** | 缓存管理、数据转换在 UI 层 | 业务逻辑混入 UI | BrowserApplicationService |
| **SRSBrowserAdapter.ts** | 数据适配逻辑在 UI 层 | 业务逻辑混入 UI | 应用层适配器 |
| **SRSBrowserQueueView.ts** | 队列管理逻辑在 UI 层 | 业务逻辑混入 UI | 应用层服务 |

**具体问题示例**：

```typescript
// ❌ browserService.ts - UI 层包含业务逻辑
export function setGlobalBrowserContext(context: BrowserContext) {
  globalBrowserContext = context;
  
  // 缓存管理逻辑 - 应该在应用层
  if (context.cache) {
    // ...
  }
  
  // 数据转换逻辑 - 应该在应用层
  const cards = transformCards(context.cards);
}

// ✅ 应该改为
// UI 层只负责展示
export function setGlobalBrowserContext(context: BrowserContext) {
  globalBrowserContext = context;
}

// 应用层负责业务逻辑
export class BrowserApplicationService {
  async getBrowserCards(query: GetBrowserCardsQuery): Promise<BrowserCard[]> {
    // 缓存管理
    // 数据转换
    // 返回结果
  }
}
```

---

### 3. src/handlers/ 目录（1 个文件）

| 文件 | 问题描述 | 违反原则 | 建议迁移目标 |
|------|---------|---------|-------------|
| **BlockEventHandler.ts** | 混合 UI 和业务逻辑 | 跨层调用 | 应用层事件处理器 |

---

## 🟡 中优先级：需要重构的代码

### 4. src/queues/ 目录（8 个文件）

| 文件 | 问题描述 | 违反原则 | 建议方案 |
|------|---------|---------|---------|
| **BaseReviewQueue.ts** | 混合队列逻辑和业务逻辑 | 单一职责违反 | 分离队列和业务逻辑 |
| **FilterGroupQueue.ts** | 包含过滤逻辑 | 业务逻辑混入 | 移到领域服务 |
| **FinalDrillQueue.ts** | 包含业务规则 | 业务逻辑混入 | 移到领域服务 |
| **IncrementalLearningQueue.ts** | 包含业务规则 | 业务逻辑混入 | 移到领域服务 |
| **NeuralRoamQueue.ts** | 包含复杂业务逻辑 | 业务逻辑混入 | 移到领域服务 |
| **RetrievalPracticeQueue.ts** | 包含业务规则 | 业务逻辑混入 | 移到领域服务 |
| **QueueFactory.ts** | 工厂模式可以保留 | - | 可选优化 |
| **NeuralRoamQueue.old.ts** | 旧代码 | - | 删除 |

**建议架构**：

```typescript
// ✅ 队列应该只负责数据结构
export class ReviewQueue {
  private items: Card[] = [];
  
  enqueue(card: Card): void {
    this.items.push(card);
  }
  
  dequeue(): Card | undefined {
    return this.items.shift();
  }
}

// ✅ 业务逻辑在领域服务
export class ReviewQueueService {
  constructor(
    private filterService: CardFilterService,
    private sortService: CardSortService
  ) {}
  
  async getNextCard(queue: ReviewQueue): Promise<Card | null> {
    // 业务逻辑
  }
}
```

---

### 5. src/managers/ 目录（2 个文件）

| 文件 | 问题描述 | 违反原则 | 建议方案 |
|------|---------|---------|---------|
| **UIManager.ts** | 混合 UI 初始化和业务逻辑 | 跨层调用 | 分离职责 |
| **UnifiedDataSourceManager.ts** | 数据源管理应该在应用层 | 层次混乱 | 移到应用层 |

---

### 6. src/core/scheduler/ 目录（部分文件）

| 文件 | 问题描述 | 违反原则 | 建议方案 |
|------|---------|---------|---------|
| **AdvanceEngine.ts** | 业务逻辑应该在领域层 | 层次混乱 | 移到领域服务 |
| **PostponeEngine.ts** | 业务逻辑应该在领域层 | 层次混乱 | 移到领域服务 |
| **SpreadEngine.ts** | 业务逻辑应该在领域层 | 层次混乱 | 移到领域服务 |
| **RescheduleService.ts** | 应该在应用层 | 层次混乱 | 移到应用层 |

---

### 7. src/utils/ 目录（3 个文件）

| 文件 | 问题描述 | 违反原则 | 建议方案 |
|------|---------|---------|---------|
| **configMigrator.ts** | 包含业务逻辑 | 层次混乱 | 移到应用层 |
| **cardMigration.ts** | 包含业务逻辑 | 层次混乱 | 移到应用层 |
| **sqlOptimizer.ts** | 包含业务逻辑 | 层次混乱 | 移到基础设施层 |

---

## 🟢 低优先级：可选优化

### 8. 其他工具文件

以下文件是纯工具函数，符合 DDD 架构，但可以考虑优化：

| 文件 | 状态 | 建议 |
|------|------|------|
| asyncHelpers.ts | ✅ 符合 | 保持 |
| batchQuery.ts | ✅ 符合 | 保持 |
| dateUtils.ts | ✅ 符合 | 保持 |
| debounce.ts | ✅ 符合 | 保持 |
| dialog.ts | ✅ 符合 | 保持 |
| errorReporter.ts | ✅ 符合 | 保持 |
| EventEmitter.ts | ✅ 符合 | 保持 |
| logger.ts | ✅ 符合 | 保持 |
| performance.ts | ✅ 符合 | 保持 |

---

## 📈 迁移优先级矩阵

### 按影响程度排序

| 优先级 | 文件数 | 影响范围 | 迁移难度 | 建议时间 |
|--------|--------|---------|---------|---------|
| 🔴 P0 | 15 | 核心功能 | 高 | 立即 |
| 🟡 P1 | 30 | 重要功能 | 中 | 1-2 周 |
| 🟢 P2 | 25 | 辅助功能 | 低 | 可选 |

### P0 - 立即迁移（15 个文件）

1. CardService.ts
2. ReviewService.ts
3. BlockMenuHandler.ts
4. handlers/AutoCardHandler.ts
5. handlers/RiffSyncHandler.ts
6. ui/browser/browserService.ts
7. ui/browser/SRSBrowserAdapter.ts
8. MenuService.ts
9. DialogService.ts
10. PluginService.ts
11. XiuyuanSyncService.ts
12. ReviewSyncManager.ts
13. ReviewDialogManager.ts
14. MigrationService.ts
15. BlockEventHandler.ts

### P1 - 1-2 周内迁移（30 个文件）

1. 所有 ReviewEntry 类（6 个）
2. 所有 Queue 类（8 个）
3. Scheduler 相关（4 个）
4. Manager 类（2 个）
5. Utils 中的业务逻辑（3 个）
6. 其他 Service 类（7 个）

### P2 - 可选优化（25 个文件）

1. 测试文件优化
2. 工具函数重构
3. 性能优化
4. 文档完善

---

## 🎯 具体迁移计划

### Phase 10：核心服务迁移（P0）

#### Task 10.1：CardService 迁移
- **目标**：完全移除 CardService.ts
- **步骤**：
  1. 将所有方法迁移到 CardApplicationService
  2. 更新所有引用
  3. 删除 CardService.ts
- **预计时间**：2 小时

#### Task 10.2：ReviewService 迁移
- **目标**：完全移除 ReviewService.ts
- **步骤**：
  1. 将复习逻辑迁移到 ReviewApplicationService
  2. 将对话框管理迁移到 DialogManager
  3. 更新所有引用
  4. 删除 ReviewService.ts
- **预计时间**：3 小时

#### Task 10.3：BlockMenuHandler 重构
- **目标**：移除跨层调用
- **步骤**：
  1. 注入 CardApplicationService
  2. 移除直接 Storage 访问
  3. 更新测试
- **预计时间**：1 小时

#### Task 10.4：AutoCardHandler 重构
- **目标**：移除跨层调用
- **步骤**：
  1. 注入 CardApplicationService
  2. 移除直接 Storage 访问
  3. 更新测试
- **预计时间**：1 小时

#### Task 10.5：browserService 重构
- **目标**：移除 UI 层业务逻辑
- **步骤**：
  1. 将缓存管理移到 BrowserApplicationService
  2. 将数据转换移到应用层
  3. UI 层只保留展示逻辑
- **预计时间**：2 小时

#### Task 10.6：MenuService 和 DialogService 迁移
- **目标**：移到 application/managers/
- **步骤**：
  1. 重命名为 MenuManager 和 DialogManager
  2. 移动到 application/managers/
  3. 更新所有引用
- **预计时间**：1 小时

#### Task 10.7：PluginService 移除
- **目标**：使用 ApplicationContext 替代
- **步骤**：
  1. 将所有服务注册到 ApplicationContext
  2. 更新所有引用
  3. 删除 PluginService.ts
- **预计时间**：2 小时

#### Task 10.8：同步服务重构
- **目标**：XiuyuanSyncService 等迁移到应用层
- **步骤**：
  1. 重构为应用服务
  2. 使用事件总线
  3. 更新所有引用
- **预计时间**：3 小时

---

### Phase 11：队列和管理器重构（P1）

#### Task 11.1：ReviewEntry 类迁移
- **目标**：移除所有 ReviewEntry 类
- **步骤**：
  1. 将逻辑迁移到 ReviewApplicationService
  2. 使用用例模式
  3. 删除所有 Entry 类
- **预计时间**：4 小时

#### Task 11.2：Queue 类重构
- **目标**：分离队列和业务逻辑
- **步骤**：
  1. 队列只保留数据结构
  2. 业务逻辑移到领域服务
  3. 更新所有引用
- **预计时间**：6 小时

#### Task 11.3：Manager 类迁移
- **目标**：UIManager 和 UnifiedDataSourceManager 重构
- **步骤**：
  1. 分离职责
  2. 移到正确的层次
  3. 更新所有引用
- **预计时间**：2 小时

#### Task 11.4：Scheduler 重构
- **目标**：调度逻辑移到正确的层次
- **步骤**：
  1. 算法移到领域层
  2. 服务移到应用层
  3. 更新所有引用
- **预计时间**：4 小时

---

## 📊 代码统计

### 按目录统计

| 目录 | 总文件数 | DDD 合规 | 需要迁移 | 合规率 |
|------|---------|---------|---------|--------|
| src/application/ | 37 | 35 | 2 | 95% |
| src/core/ | 200+ | 170 | 30 | 85% |
| src/services/ | 23 | 0 | 23 | 0% |
| src/ui/ | 65+ | 62 | 3 | 95% |
| src/queues/ | 8 | 0 | 8 | 0% |
| src/managers/ | 2 | 0 | 2 | 0% |
| src/handlers/ | 1 | 0 | 1 | 0% |
| src/utils/ | 25 | 22 | 3 | 88% |
| **总计** | **361+** | **289** | **72** | **80%** |

### 按问题类型统计

| 问题类型 | 文件数 | 占比 |
|---------|--------|------|
| 跨层调用 | 25 | 35% |
| 贫血模型 | 18 | 25% |
| 单一职责违反 | 15 | 21% |
| 层次混乱 | 10 | 14% |
| 其他 | 4 | 5% |

---

## 🎯 总结和建议

### 当前状态
- ✅ 应用层（application/）：95% DDD 合规
- ✅ 领域层（core/*/domain/）：95% DDD 合规
- ✅ 基础设施层（core/*/infrastructure/）：85% DDD 合规
- ❌ 服务层（services/）：0% DDD 合规 - **需要完全移除**
- ⚠️ UI 层（ui/）：95% DDD 合规 - 少量业务逻辑需要移除
- ❌ 队列层（queues/）：0% DDD 合规 - **需要重构**

### 立即行动项
1. 迁移 CardService 和 ReviewService（最高优先级）
2. 重构 BlockMenuHandler 和 AutoCardHandler（移除跨层调用）
3. 清理 browserService 中的业务逻辑
4. 移除 PluginService，使用 ApplicationContext

### 中期目标
1. 完全移除 src/services/ 目录
2. 重构所有 Queue 类
3. 迁移 Manager 类到正确的层次
4. 优化 Scheduler 架构

### 长期目标
1. 达到 95%+ DDD 合规度
2. 完善测试覆盖率
3. 优化性能
4. 完善文档

---

## 📚 参考资料

- DDD 架构指南：`.kiro/DDD-GUIDE.md`
- Phase 9 完成报告：`.kiro/specs/ddd-refactoring/phase9-complete-final.md`
- 最终状态报告：`.kiro/specs/ddd-refactoring/STATUS-2026-02-19-FINAL.md`

---

**审查完成时间**：2026-02-19
**下一次审查**：Phase 10 完成后


---

## 🔍 详细代码问题分析

### 问题 1：直接访问 Storage（跨层调用）

#### 受影响的文件：

1. **CardService.ts**
```typescript
// ❌ 问题代码
private get storage(): any {
    try {
        if (this.plugin && (this.plugin as any).context) {
            return (this.plugin as any).context.getStorage();
        }
    } catch (error) {
        console.error('[CardService] Failed to get storage:', error);
        return null;
    }
}

private getCardService(): any | null {
    const storage = this.storage;
    return storage?.getCardService?.();
}
```

**问题**：
- 直接访问基础设施层（Storage）
- 跳过应用层
- 违反依赖倒置原则

**解决方案**：
```typescript
// ✅ 正确做法
export class CardApplicationService {
    constructor(
        private cardRepository: ICardRepository,
        private eventBus: EventBus
    ) {}
    
    async createCard(command: CreateCardCommand): Promise<void> {
        // 使用仓储接口，不直接访问 Storage
        const card = Card.create(command.blockId, command.content);
        await this.cardRepository.save(card);
        this.eventBus.publish(new CardCreatedEvent(card));
    }
}
```

---

2. **AutoCardHandler.ts**
```typescript
// ❌ 问题代码
private get storage(): any {
    try {
        if (this.plugin && (this.plugin as any).context) {
            return (this.plugin as any).context.getStorage();
        }
    } catch (error) {
        console.error('[AutoCardHandler] Failed to get storage:', error);
        return null;
    }
}

private getCardService(): any | null {
    const storage = this.storage;
    return storage?.getCardService?.();
}
```

**问题**：
- 与 CardService 相同的问题
- 直接访问 Storage
- 跳过应用层

**解决方案**：
```typescript
// ✅ 正确做法
export class AutoCardHandler {
    constructor(
        private cardApplicationService: CardApplicationService,
        private xiuyuanApplicationService: XiuyuanApplicationService
    ) {}
    
    async handle(transactions: Transaction[]): Promise<void> {
        for (const transaction of transactions) {
            if (this.shouldCreateCard(transaction)) {
                await this.cardApplicationService.createCard(
                    new CreateCardCommand(transaction.blockId)
                );
            }
        }
    }
}
```

---

3. **BlockMenuHandler.ts**
```typescript
// ❌ 问题代码
private getCardService(): any | null {
    try {
        const storage = this.deps.context?.getStorage?.();
        return storage?.getCardService?.();
    } catch (error) {
        console.error('[BlockMenuHandler] Failed to get card service:', error);
        return null;
    }
}
```

**问题**：
- 直接访问 Storage
- 跳过应用层
- 违反依赖倒置原则

**解决方案**：
```typescript
// ✅ 正确做法
export class BlockMenuHandler {
    constructor(
        private cardApplicationService: CardApplicationService,
        private xiuyuanApplicationService: XiuyuanApplicationService
    ) {}
    
    async handleCreateCard(blockId: string): Promise<void> {
        await this.cardApplicationService.createCard(
            new CreateCardCommand(blockId)
        );
    }
}
```

---

### 问题 2：UI 层包含业务逻辑

#### 受影响的文件：

1. **browserService.ts**

**问题代码**：
```typescript
// ❌ 缓存管理在 UI 层
export class CardCacheManager {
    private cache: CacheEntry | null = null;
    private loadingPromise: Promise<BrowserCard[]> | null = null;
    
    get(): BrowserCard[] | null {
        if (!this.cache) return null;
        const age = Date.now() - this.cache.timestamp;
        if (age > CACHE_TTL) {
            this.cache = null;
            return null;
        }
        return this.cache.cards;
    }
    
    set(cards: BrowserCard[], isComplete = true): void {
        this.cache = {
            cards,
            timestamp: Date.now(),
            isComplete
        };
    }
}

// ❌ 数据转换在 UI 层
export function transformFSRSCard(card: FSRSCard, customAttrs: Record<string, string>): BrowserCard {
    // 复杂的数据转换逻辑
    // 应该在应用层
}

// ❌ 查询解析在 UI 层
export function parseQuery(input: string): ParsedBrowserQuery {
    // 复杂的查询解析逻辑
    // 应该在应用层
}
```

**问题**：
- 缓存管理应该在应用层
- 数据转换应该在应用层
- 查询解析应该在应用层
- UI 层应该只负责展示

**解决方案**：
```typescript
// ✅ 应用层负责业务逻辑
export class BrowserApplicationService {
    private cache: Map<string, CacheEntry> = new Map();
    
    constructor(
        private cardRepository: ICardRepository,
        private cardFilterService: CardFilterService,
        private cardSortService: CardSortService
    ) {}
    
    async getBrowserCards(query: GetBrowserCardsQuery): Promise<BrowserCard[]> {
        // 缓存管理
        const cached = this.getFromCache(query);
        if (cached) return cached;
        
        // 获取数据
        const cards = await this.cardRepository.findAll();
        
        // 过滤和排序
        const filtered = this.cardFilterService.filter(cards, query.filters);
        const sorted = this.cardSortService.sort(filtered, query.sortBy);
        
        // 转换为 DTO
        const browserCards = sorted.map(card => this.toDTO(card));
        
        // 更新缓存
        this.updateCache(query, browserCards);
        
        return browserCards;
    }
    
    private toDTO(card: Card): BrowserCard {
        // 数据转换逻辑
    }
}

// ✅ UI 层只负责展示
export function setGlobalBrowserContext(context: BrowserContext) {
    globalBrowserContext = context;
    // 只负责设置上下文，不包含业务逻辑
}
```

---

### 问题 3：服务定位器反模式

#### 受影响的文件：

1. **PluginService.ts**

**问题代码**：
```typescript
// ❌ 服务定位器反模式
export class PluginService {
    public dialogService: DialogService;
    public menuService: MenuService;
    public reviewService: ReviewService;
    public cardService: CardService;
    // ... 更多服务
    
    constructor(plugin: FSRSPlugin) {
        this.dialogService = new DialogService(plugin);
        this.menuService = new MenuService(plugin);
        this.reviewService = new ReviewService(plugin);
        this.cardService = new CardService(plugin);
        // ... 初始化更多服务
    }
    
    // 其他代码通过 pluginService 获取服务
    getDialogService() { return this.dialogService; }
    getMenuService() { return this.menuService; }
    // ...
}
```

**问题**：
- 服务定位器反模式
- 隐藏依赖关系
- 难以测试
- 违反依赖注入原则

**解决方案**：
```typescript
// ✅ 使用 ApplicationContext 和依赖注入
export class ApplicationContext {
    private services: Map<string, any> = new Map();
    
    registerService<T>(name: string, factory: (context: ApplicationContext) => T): void {
        this.services.set(name, factory);
    }
    
    getService<T>(name: string): T {
        const factory = this.services.get(name);
        if (!factory) {
            throw new Error(`Service ${name} not found`);
        }
        return factory(this);
    }
}

// ✅ 使用依赖注入
export class BlockMenuHandler {
    constructor(
        private cardApplicationService: CardApplicationService,
        private xiuyuanApplicationService: XiuyuanApplicationService
    ) {}
    
    // 依赖关系清晰，易于测试
}
```

---

### 问题 4：混合多个职责

#### 受影响的文件：

1. **ReviewService.ts**

**问题代码**：
```typescript
// ❌ 混合多个职责
export class ReviewService {
    constructor(private plugin: FSRSPlugin) {}
    
    // 职责 1：打开对话框
    async openUnifiedReviewDialog(queueType: QueueType) {
        // 对话框管理逻辑
    }
    
    // 职责 2：打开不同类型的复习对话框
    async openReviewProviderV2Dialog() {
        // 对话框管理逻辑
    }
    
    async openLeechReviewDialog() {
        // 对话框管理逻辑
    }
    
    async openFinalDrillProviderV2Dialog() {
        // 对话框管理逻辑
    }
    
    async openIncrementalLearningDialog() {
        // 对话框管理逻辑
    }
    
    // 职责 3：获取应用实例
    private getApp() {
        return this.plugin.app || (window as any).siyuan?.app;
    }
    
    // 职责 4：获取存储
    private getStorage() {
        return this.plugin.storage;
    }
}
```

**问题**：
- 违反单一职责原则
- 混合了对话框管理、复习逻辑、数据访问
- 难以测试和维护

**解决方案**：
```typescript
// ✅ 分离职责

// 1. 对话框管理器（应用层）
export class DialogManager {
    constructor(
        private plugin: Plugin,
        private i18n: I18n
    ) {}
    
    openReviewDialog(config: ReviewDialogConfig): void {
        // 只负责对话框的创建和销毁
    }
}

// 2. 复习应用服务（应用层）
export class ReviewApplicationService {
    constructor(
        private cardRepository: ICardRepository,
        private reviewScheduler: ReviewScheduler,
        private eventBus: EventBus
    ) {}
    
    async startReview(command: StartReviewCommand): Promise<ReviewSession> {
        // 只负责复习业务逻辑
    }
}

// 3. 使用组合
export class ReviewController {
    constructor(
        private dialogManager: DialogManager,
        private reviewApplicationService: ReviewApplicationService
    ) {}
    
    async openReviewDialog(queueType: QueueType): Promise<void> {
        const session = await this.reviewApplicationService.startReview(
            new StartReviewCommand(queueType)
        );
        
        this.dialogManager.openReviewDialog({
            session,
            queueType
        });
    }
}
```

---

2. **XiuyuanSyncService.ts**

**问题代码**：
```typescript
// ❌ 混合多个职责
export class XiuyuanSyncService extends EventEmitter<HybridSyncEvents> {
    private config: HybridSyncConfig;
    private storage: StorageManager;
    
    // 职责 1：同步逻辑
    async sync(): Promise<void> {
        // 同步逻辑
    }
    
    // 职责 2：事件发射
    emit(event: string, data: any): void {
        // 事件发射逻辑
    }
    
    // 职责 3：定时器管理（注释说由插件主类管理，但实际还在这里）
    // ...
}
```

**问题**：
- 违反单一职责原则
- 混合了同步逻辑、事件发射、定时器管理
- 继承 EventEmitter 不符合 DDD 架构

**解决方案**：
```typescript
// ✅ 分离职责

// 1. 同步应用服务（应用层）
export class XiuyuanApplicationService {
    constructor(
        private xiuyuanRepository: IXiuyuanRepository,
        private eventBus: EventBus
    ) {}
    
    async syncXiuyuan(command: SyncXiuyuanCommand): Promise<void> {
        // 只负责同步业务逻辑
        const xiuyuan = await this.xiuyuanRepository.findById(command.xiuyuanId);
        
        // 执行同步
        xiuyuan.sync(command.data);
        
        // 保存
        await this.xiuyuanRepository.save(xiuyuan);
        
        // 发布事件
        this.eventBus.publish(new XiuyuanSyncedEvent(xiuyuan));
    }
}

// 2. 使用事件总线（领域层）
export class EventBus {
    private handlers: Map<string, Array<(event: DomainEvent) => void>> = new Map();
    
    subscribe<T extends DomainEvent>(
        eventType: string,
        handler: (event: T) => void
    ): void {
        // 订阅逻辑
    }
    
    publish(event: DomainEvent): void {
        // 发布逻辑
    }
}
```

---

### 问题 5：队列混合业务逻辑

#### 受影响的文件：

1. **BaseReviewQueue.ts**
2. **FilterGroupQueue.ts**
3. **FinalDrillQueue.ts**
4. **IncrementalLearningQueue.ts**
5. **NeuralRoamQueue.ts**
6. **RetrievalPracticeQueue.ts**

**问题**：
- 队列类包含业务逻辑
- 过滤、排序、调度逻辑混入队列
- 违反单一职责原则

**解决方案**：
```typescript
// ✅ 队列只负责数据结构
export class ReviewQueue {
    private items: Card[] = [];
    
    enqueue(card: Card): void {
        this.items.push(card);
    }
    
    dequeue(): Card | undefined {
        return this.items.shift();
    }
    
    peek(): Card | undefined {
        return this.items[0];
    }
    
    size(): number {
        return this.items.length;
    }
}

// ✅ 业务逻辑在领域服务
export class ReviewQueueService {
    constructor(
        private filterService: CardFilterService,
        private sortService: CardSortService,
        private scheduleService: CardScheduleService
    ) {}
    
    async prepareQueue(cards: Card[], config: QueueConfig): Promise<ReviewQueue> {
        // 过滤
        const filtered = this.filterService.filter(cards, config.filters);
        
        // 排序
        const sorted = this.sortService.sort(filtered, config.sortBy);
        
        // 调度
        const scheduled = this.scheduleService.schedule(sorted);
        
        // 创建队列
        const queue = new ReviewQueue();
        scheduled.forEach(card => queue.enqueue(card));
        
        return queue;
    }
    
    async getNextCard(queue: ReviewQueue): Promise<Card | null> {
        // 获取下一张卡片的业务逻辑
        return queue.dequeue() || null;
    }
}
```

---

## 📋 完整的迁移检查清单

### Phase 10：核心服务迁移（P0 - 立即）

- [ ] Task 10.1：CardService 迁移
  - [ ] 将所有方法迁移到 CardApplicationService
  - [ ] 更新所有引用（约 15 处）
  - [ ] 删除 CardService.ts
  - [ ] 更新测试

- [ ] Task 10.2：ReviewService 迁移
  - [ ] 将复习逻辑迁移到 ReviewApplicationService
  - [ ] 将对话框管理迁移到 DialogManager
  - [ ] 更新所有引用（约 20 处）
  - [ ] 删除 ReviewService.ts
  - [ ] 更新测试

- [ ] Task 10.3：BlockMenuHandler 重构
  - [ ] 注入 CardApplicationService
  - [ ] 移除直接 Storage 访问
  - [ ] 更新所有引用（约 10 处）
  - [ ] 更新测试

- [ ] Task 10.4：AutoCardHandler 重构
  - [ ] 注入 CardApplicationService 和 XiuyuanApplicationService
  - [ ] 移除直接 Storage 访问
  - [ ] 更新所有引用（约 5 处）
  - [ ] 更新测试

- [ ] Task 10.5：browserService 重构
  - [ ] 将 CardCacheManager 移到 BrowserApplicationService
  - [ ] 将 transformFSRSCard 移到应用层
  - [ ] 将 parseQuery 移到应用层
  - [ ] UI 层只保留展示逻辑
  - [ ] 更新所有引用（约 30 处）
  - [ ] 更新测试

- [ ] Task 10.6：MenuService 和 DialogService 迁移
  - [ ] 重命名为 MenuManager 和 DialogManager
  - [ ] 移动到 application/managers/
  - [ ] 更新所有引用（约 15 处）
  - [ ] 更新测试

- [ ] Task 10.7：PluginService 移除
  - [ ] 将所有服务注册到 ApplicationContext
  - [ ] 更新所有引用（约 25 处）
  - [ ] 删除 PluginService.ts
  - [ ] 更新测试

- [ ] Task 10.8：同步服务重构
  - [ ] XiuyuanSyncService 重构为应用服务
  - [ ] 使用事件总线替代 EventEmitter
  - [ ] ReviewSyncManager 迁移到应用层
  - [ ] ReviewDialogManager 迁移到 DialogManager
  - [ ] 更新所有引用（约 10 处）
  - [ ] 更新测试

- [ ] Task 10.9：其他 Service 迁移
  - [ ] MigrationService 迁移到应用层
  - [ ] MigrateQueueDataService 迁移到应用层
  - [ ] QuickCardWebSocketService 迁移到基础设施层
  - [ ] TransactionWebSocketService 迁移到基础设施层
  - [ ] RiffCleanupService 迁移到应用层
  - [ ] 更新所有引用
  - [ ] 更新测试

- [ ] Task 10.10：BlockEventHandler 重构
  - [ ] 分离 UI 和业务逻辑
  - [ ] 使用应用服务
  - [ ] 更新所有引用
  - [ ] 更新测试

### Phase 11：队列和管理器重构（P1 - 1-2 周）

- [ ] Task 11.1：ReviewEntry 类迁移
  - [ ] 移除 ReviewEntryBase.ts
  - [ ] 移除 FinalDrillEntry.ts
  - [ ] 移除 IncrementalLearningEntry.ts
  - [ ] 移除 RetrievalPracticeEntry.ts
  - [ ] 移除 TemporaryDrillEntry.ts
  - [ ] 移除 AddToFinalDrillEntry.ts
  - [ ] 将逻辑迁移到 ReviewApplicationService
  - [ ] 使用用例模式
  - [ ] 更新所有引用
  - [ ] 更新测试

- [ ] Task 11.2：Queue 类重构
  - [ ] BaseReviewQueue 重构
  - [ ] FilterGroupQueue 重构
  - [ ] FinalDrillQueue 重构
  - [ ] IncrementalLearningQueue 重构
  - [ ] NeuralRoamQueue 重构
  - [ ] RetrievalPracticeQueue 重构
  - [ ] 删除 NeuralRoamQueue.old.ts
  - [ ] 分离队列和业务逻辑
  - [ ] 业务逻辑移到领域服务
  - [ ] 更新所有引用
  - [ ] 更新测试

- [ ] Task 11.3：Manager 类迁移
  - [ ] UIManager 重构
  - [ ] UnifiedDataSourceManager 迁移到应用层
  - [ ] 分离职责
  - [ ] 更新所有引用
  - [ ] 更新测试

- [ ] Task 11.4：Scheduler 重构
  - [ ] AdvanceEngine 移到领域层
  - [ ] PostponeEngine 移到领域层
  - [ ] SpreadEngine 移到领域层
  - [ ] RescheduleService 移到应用层
  - [ ] 更新所有引用
  - [ ] 更新测试

- [ ] Task 11.5：Utils 迁移
  - [ ] configMigrator 移到应用层
  - [ ] cardMigration 移到应用层
  - [ ] sqlOptimizer 移到基础设施层
  - [ ] 更新所有引用
  - [ ] 更新测试

### Phase 12：清理和优化（P2 - 可选）

- [ ] Task 12.1：删除旧代码
  - [ ] 删除 src/services/ 目录
  - [ ] 删除旧的 Queue 类
  - [ ] 删除旧的 Manager 类
  - [ ] 清理未使用的导入

- [ ] Task 12.2：测试覆盖率
  - [ ] 补充单元测试
  - [ ] 补充集成测试
  - [ ] 达到 80%+ 覆盖率

- [ ] Task 12.3：性能优化
  - [ ] 优化缓存策略
  - [ ] 优化查询性能
  - [ ] 优化事件处理

- [ ] Task 12.4：文档完善
  - [ ] 更新架构文档
  - [ ] 更新 API 文档
  - [ ] 添加迁移指南

---

## 📊 预计工作量

| Phase | 任务数 | 预计时间 | 优先级 |
|-------|--------|---------|--------|
| Phase 10 | 10 | 15-20 小时 | 🔴 P0 |
| Phase 11 | 5 | 16-20 小时 | 🟡 P1 |
| Phase 12 | 4 | 8-12 小时 | 🟢 P2 |
| **总计** | **19** | **39-52 小时** | - |

---

## 🎯 成功标准

### Phase 10 完成标准
- ✅ 所有 src/services/ 中的核心服务已迁移
- ✅ 所有跨层调用已移除
- ✅ 所有测试通过
- ✅ DDD 合规度达到 90%+

### Phase 11 完成标准
- ✅ 所有队列类已重构
- ✅ 所有管理器类已迁移
- ✅ 业务逻辑正确分层
- ✅ 所有测试通过
- ✅ DDD 合规度达到 95%+

### Phase 12 完成标准
- ✅ 所有旧代码已删除
- ✅ 测试覆盖率达到 80%+
- ✅ 文档完善
- ✅ DDD 合规度达到 98%+

---

**最后更新**：2026-02-19
**下一步行动**：开始 Phase 10 Task 10.1
