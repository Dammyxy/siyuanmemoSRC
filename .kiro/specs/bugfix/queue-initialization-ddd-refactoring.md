# 队列初始化 DDD 架构重构

## 实施完成 ✅

**实施日期**：2024-02-20

### 最终修复：LeechQueue 按需加载

**问题**：LeechQueue 是旧架构的队列，用户从未使用过，但在初始化时被强制加载，导致模块找不到错误。

**根本原因分析**：
1. LeechQueue 标记为 `@deprecated`，属于旧队列架构
2. 使用 `require()` 动态导入在打包后的代码中不工作
3. 在 ApplicationContext 初始化时强制注册，即使用户不需要

**DDD 架构审视**：
- ❌ **违反按需加载原则**：不应该在启动时加载所有功能
- ❌ **违反可选功能原则**：非核心功能应该是可选的
- ❌ **违反延迟初始化原则**：只在真正需要时才创建资源

**正确的 DDD 解决方案**：
1. ✅ 使用静态导入代替 `require()`（避免打包问题）
2. ✅ 从 QueueContext 初始化注册中移除 LeechQueue
3. ✅ 标记 `getLeechQueue()` 为 `@deprecated` 和可选
4. ✅ 只在 DialogManager 需要时才创建 LeechQueue 实例

**修改内容**：
- `ApplicationContext.ts`: 移除 leech 队列的强制注册
- `UnifiedDataSourceManager.ts`: 使用静态导入，延迟创建实例
- `ApplicationContext.ts`: 标记 `getLeechQueue()` 为可选和废弃

---

## 实施摘要

成功完成了队列初始化的 DDD 架构重构，消除了 ApplicationContext 和队列系统之间的循环依赖。

### 关键变更

1. **ApplicationContext 不再直接持有队列实例**
   - 移除了 `retrievalQueue`, `finalDrillQueue`, `leechQueue`, `incrementalQueue`, `subsetQueue` 私有字段
   - 构造函数不再需要队列实例参数

2. **队列访问委托给 UnifiedDataSourceManager**
   - 所有 `getXxxQueue()` 方法现在返回 `IReviewQueue` 接口
   - 队列通过 `UnifiedDataSourceManager.getQueue()` 延迟获取

3. **LeechQueue 特殊处理**
   - 在 `QueueType` 枚举中添加了 `Leech` 类型
   - 在 `UnifiedDataSourceManager` 中特殊处理 LeechQueue（不需要 QueuePersistenceService）

4. **初始化流程优化**
   - 先创建空的 `QueueContext`
   - 创建 `ApplicationContext`（不需要队列实例）
   - 初始化 `QueueFactory`
   - 延迟注册队列到 `QueueContext`

### 架构收益

✅ **消除循环依赖**：ApplicationContext ↔ QueuePersistenceService ↔ UnifiedDataSourceManager  
✅ **符合依赖倒置原则**：依赖抽象（IReviewQueue）而非具体实现  
✅ **单一职责**：ApplicationContext 成为纯粹的服务容器  
✅ **延迟初始化**：队列在需要时才创建  
✅ **易于扩展**：添加新队列类型不需要修改 ApplicationContext  

---

## 问题分析

### 当前架构问题

```
ApplicationContext 构造函数需要：
├── retrievalQueue: RetrievalPracticeQueue
├── finalDrillQueue: FinalDrillQueue
├── incrementalQueue: IncrementalLearningQueue
├── subsetQueue: FilterGroupQueue
└── leechQueue: LeechQueue

但这些队列需要通过：
UnifiedDataSourceManager.getQueue()
└── 需要 QueueFactory
    └── 需要 QueuePersistenceService
        └── 需要 ApplicationContext（循环依赖！）
```

### 违反的 DDD 原则

1. **循环依赖**：ApplicationContext ↔ QueuePersistenceService ↔ UnifiedDataSourceManager
2. **职责不清**：ApplicationContext 既是容器又直接持有队列实例
3. **违反依赖倒置**：高层模块（ApplicationContext）依赖具体实现（具体队列类）
4. **违反单一职责**：ApplicationContext 管理太多具体实例

## DDD 正确设计

### 核心原则

1. **依赖倒置（DIP）**：依赖抽象而非具体实现
2. **接口隔离（ISP）**：客户端不应依赖它不需要的接口
3. **单一职责（SRP）**：每个类只有一个变化的理由
4. **延迟初始化**：只在需要时创建对象

### 重构方案

#### 方案 1：ApplicationContext 不直接持有队列实例（推荐）

```typescript
// ❌ 当前设计
class ApplicationContext {
  private retrievalQueue: RetrievalPracticeQueue;
  private finalDrillQueue: FinalDrillQueue;
  // ...
  
  getRetrievalQueue(): RetrievalPracticeQueue {
    return this.retrievalQueue;
  }
}

// ✅ DDD 设计
class ApplicationContext {
  private unifiedDataSourceManager: UnifiedDataSourceManager;
  
  getRetrievalQueue(): IReviewQueue {
    return this.unifiedDataSourceManager.getQueue(QueueType.RetrievalPractice);
  }
}
```

**优点**：
- 消除循环依赖
- ApplicationContext 不需要在构造时就有队列实例
- 队列通过工厂延迟创建
- 符合依赖倒置原则

**缺点**：
- 需要修改所有调用 `getRetrievalQueue()` 的代码（返回类型从具体类改为接口）

#### 方案 2：引入 QueueRegistry（备选）

```typescript
// 队列注册表（单例）
class QueueRegistry {
  private queues = new Map<QueueType, IReviewQueue>();
  
  register(type: QueueType, queue: IReviewQueue): void {
    this.queues.set(type, queue);
  }
  
  get(type: QueueType): IReviewQueue {
    const queue = this.queues.get(type);
    if (!queue) throw new Error(`Queue not registered: ${type}`);
    return queue;
  }
}

// ApplicationContext 使用注册表
class ApplicationContext {
  private queueRegistry: QueueRegistry;
  
  getRetrievalQueue(): IReviewQueue {
    return this.queueRegistry.get(QueueType.RetrievalPractice);
  }
}
```

**优点**：
- 解耦队列创建和使用
- 可以在任何时候注册队列
- 符合注册表模式

**缺点**：
- 引入新的全局状态
- 增加复杂度

## 实施计划

### 选择方案 1：ApplicationContext 委托给 UnifiedDataSourceManager

这是最符合 DDD 的方案，因为：
1. UnifiedDataSourceManager 本来就是队列的统一访问点
2. 消除了重复的职责
3. 简化了依赖关系

### 步骤 1：修改 ApplicationContext 构造函数

移除具体队列参数，只保留必要的依赖。

### 步骤 2：修改 getter 方法

将 getter 方法委托给 UnifiedDataSourceManager。

### 步骤 3：修改初始化流程

在 ApplicationContext.create() 中：
1. 先创建 UnifiedDataSourceManager（不需要依赖）
2. 创建 ApplicationContext（只需要 UnifiedDataSourceManager）
3. 初始化 QueueFactory（使用 context 的服务）
4. 初始化 QueueContext（延迟注册队列）

### 步骤 4：更新调用代码

确保所有使用队列的代码都能正常工作。

## 详细实施

### 1. 修改 ApplicationContext 接口

```typescript
// src/application/ApplicationContext.ts

interface ApplicationContextServices {
  storageManager: StorageManager;
  schedulerRouter: SchedulerRouter;
  scheduler: SchedulerEngineAdapter;
  rescheduleService: RescheduleService;
  unifiedDataSourceManager: UnifiedDataSourceManager;
  queueContext: QueueContext<QueueItem>;
  // ❌ 移除具体队列实例
  // retrievalQueue: RetrievalPracticeQueue;
  // finalDrillQueue: FinalDrillQueue;
  // leechQueue: LeechQueue;
  // incrementalQueue: IncrementalLearningQueue;
  // subsetQueue: FilterGroupQueue;
  xiuyuanStorage: XiuyuanStorage;
  xiuyuanService: XiuyuanService;
  blockMenuHandler: BlockMenuHandler;
  hybridSyncService?: HybridSyncService;
  transactionWebSocketService?: TransactionWebSocketService;
  fullSyncTimer?: NodeJS.Timeout;
}

class ApplicationContext {
  // ❌ 移除私有字段
  // private retrievalQueue: RetrievalPracticeQueue;
  // private finalDrillQueue: FinalDrillQueue;
  // ...
  
  // ✅ 修改 getter 方法
  getRetrievalQueue(): IReviewQueue {
    return this.unifiedDataSourceManager.getQueue(QueueType.RetrievalPractice);
  }
  
  getFinalDrillQueue(): IReviewQueue {
    return this.unifiedDataSourceManager.getQueue(QueueType.FinalDrill);
  }
  
  getIncrementalQueue(): IReviewQueue {
    return this.unifiedDataSourceManager.getQueue(QueueType.IncrementalLearning);
  }
  
  getSubsetQueue(): IReviewQueue {
    return this.unifiedDataSourceManager.getQueue(QueueType.FilterGroup);
  }
  
  getLeechQueue(): IReviewQueue {
    return this.unifiedDataSourceManager.getQueue(QueueType.Leech);
  }
}
```

### 2. 修改初始化流程

```typescript
// src/application/ApplicationContext.ts

static async create(config: ApplicationConfig): Promise<ApplicationContext> {
  // 1. 初始化存储管理器
  const storageManager = new StorageManager(config.plugin.name);
  await storageManager.init();
  
  // ... 其他初始化 ...
  
  // 7. 初始化统一数据源管理器（不需要依赖）
  const unifiedDataSourceManager = UnifiedDataSourceManager.getInstance();
  
  // 8. 初始化队列上下文（空的，稍后注册）
  const queueContext = new QueueContext<QueueItem>({
    initial: 'retrieval',
    monitors: [],
  });
  
  // 9. 创建 ApplicationContext（不需要队列实例）
  const context = new ApplicationContext(config, {
    storageManager,
    schedulerRouter,
    scheduler,
    rescheduleService,
    unifiedDataSourceManager,
    queueContext,
    xiuyuanStorage: xiuyuanStorageTemp,
    xiuyuanService,
    blockMenuHandler,
  });
  
  // 10. 初始化 UnifiedDataSourceManager 的依赖
  const settingsService = context.getSettingsService();
  const advancedRouter = new AdvancedDataRouter(
    cardApplicationService, 
    storageManager, 
    config.plugin as any, 
    settingsService
  );
  unifiedDataSourceManager.setAdvancedRouter(advancedRouter);
  
  const queuePersistenceService = context.getQueuePersistenceService();
  unifiedDataSourceManager.setQueuePersistence(queuePersistenceService);
  
  // 11. 注册队列到 QueueContext（延迟获取）
  queueContext.register('retrieval', context.getRetrievalQueue() as any);
  queueContext.register('final-drill', context.getFinalDrillQueue() as any);
  queueContext.register('filter-group', context.getSubsetQueue() as any);
  queueContext.register('incremental-learning', context.getIncrementalQueue() as any);
  queueContext.register('leech', context.getLeechQueue() as any);
  
  console.log('[ApplicationContext] ✅ All queues registered');
  
  return context;
}
```

### 3. 处理 LeechQueue 特殊情况

LeechQueue 不是通过 UnifiedDataSourceManager 创建的，需要特殊处理：

```typescript
// 方案 A：将 LeechQueue 也纳入 QueueFactory
class QueueFactory {
  getQueue(type: QueueType): IReviewQueue {
    switch (type) {
      case QueueType.RetrievalPractice:
        return new RetrievalPracticeQueue(/* ... */);
      // ...
      case QueueType.Leech:
        return new LeechQueue(); // ✅ 统一管理
      default:
        throw new Error(`Unknown queue type: ${type}`);
    }
  }
}

// 方案 B：在 UnifiedDataSourceManager 中特殊处理
class UnifiedDataSourceManager {
  private leechQueue: LeechQueue = new LeechQueue();
  
  getQueue(type: QueueType): IReviewQueue {
    if (type === QueueType.Leech) {
      return this.leechQueue;
    }
    return this.queueFactory.getQueue(type);
  }
}
```

推荐方案 A，保持一致性。

## 测试策略

### 单元测试

```typescript
describe('ApplicationContext Queue Access', () => {
  it('should get retrieval queue through UnifiedDataSourceManager', async () => {
    const context = await ApplicationContext.create(mockConfig);
    const queue = context.getRetrievalQueue();
    
    expect(queue).toBeDefined();
    expect(queue).toBeInstanceOf(Object); // IReviewQueue
  });
  
  it('should initialize queues lazily', async () => {
    const context = await ApplicationContext.create(mockConfig);
    
    // 队列应该在第一次访问时创建
    const queue1 = context.getRetrievalQueue();
    const queue2 = context.getRetrievalQueue();
    
    expect(queue1).toBe(queue2); // 应该是同一个实例（缓存）
  });
});
```

### 集成测试

验证整个初始化流程不会出现循环依赖错误。

## 迁移检查清单

- [ ] 修改 ApplicationContext 构造函数签名
- [ ] 移除私有队列字段
- [ ] 修改 getter 方法委托给 UnifiedDataSourceManager
- [ ] 更新 ApplicationContext.create() 初始化流程
- [ ] 处理 LeechQueue 特殊情况
- [ ] 更新 QueueContext 注册逻辑
- [ ] 运行所有测试
- [ ] 更新文档

## 预期收益

1. **消除循环依赖**：ApplicationContext 不再依赖具体队列实例
2. **简化构造函数**：减少参数数量
3. **延迟初始化**：队列在需要时才创建
4. **符合 DDD**：依赖抽象，职责清晰
5. **易于扩展**：添加新队列类型不需要修改 ApplicationContext

## 风险评估

### 低风险
- 返回类型从具体类改为接口（TypeScript 会检查兼容性）
- 延迟初始化（QueueFactory 会缓存实例）

### 需要注意
- 确保所有使用队列的代码都通过 getter 方法访问
- 测试覆盖所有队列类型的访问路径

## 总结

这个重构将：
1. 消除 ApplicationContext 和队列系统之间的循环依赖
2. 使 ApplicationContext 成为纯粹的服务容器
3. 将队列管理职责完全委托给 UnifiedDataSourceManager
4. 符合 DDD 的依赖倒置和单一职责原则

这是一个正确的架构设计，而不是临时的 workaround。
