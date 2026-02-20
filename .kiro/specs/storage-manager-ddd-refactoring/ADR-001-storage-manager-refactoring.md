# ADR-001: StorageManager DDD 重构

## 状态

已接受 (Accepted)

## 日期

2024-01-XX

## 背景

原有的 StorageManager 类承担了过多职责，违反了单一职责原则（SRP）。它同时负责：

1. 卡片数据存储和管理
2. 插件设置管理
3. Riff 集成配置管理
4. 队列数据持久化
5. 复习日志管理
6. Riff 黑名单管理
7. 文件读写操作

这种设计导致了以下问题：

- **高耦合**：所有功能都依赖于 StorageManager，难以独立测试和修改
- **职责不清**：一个类承担多个不相关的职责，违反 DDD 原则
- **难以维护**：修改一个功能可能影响其他功能
- **测试困难**：需要模拟整个 StorageManager 才能测试单个功能
- **扩展性差**：添加新功能需要修改核心类

## 决策

我们决定按照 DDD（领域驱动设计）原则将 StorageManager 重构为多个专职服务：

### 1. 采用 DDD 分层架构

```
┌─────────────────────────────────────────┐
│         Presentation Layer              │  UI 组件、对话框
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Application Layer               │  应用服务、用例协调
│  - SettingsService                      │
│  - ReviewLogService                     │
│  - RiffBlacklistService                 │
│  - ApplicationContext (DI)              │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Domain Layer                    │  领域对象、业务逻辑
│  - Queue Objects (自治)                 │
│  - Card Domain                          │
│  - XiuYuan Domain                       │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Infrastructure Layer            │  技术实现、持久化
│  - FileService                          │
│  - QueuePersistenceService              │
│  - UnifiedStorageManager                │
└─────────────────────────────────────────┘
```

### 2. 创建专职服务

**基础设施层服务**：

- **FileService**：统一的文件读写接口，封装 SiYuan Plugin API
- **QueuePersistenceService**：通用键值存储，提供简单的 get/set 接口
- **UnifiedStorageManager**：卡片和 XiuYuan 存储（已存在）

**应用层服务**：

- **SettingsService**：管理插件设置和 Riff 集成配置
- **ReviewLogService**：管理复习和重新调度日志
- **RiffBlacklistService**：管理 Riff 黑名单

### 3. 队列自治原则

队列领域对象（RetrievalPracticeQueue、FinalDrillQueue 等）：

- 通过构造函数注入 QueuePersistenceService
- 自己管理内存状态和业务逻辑
- 使用唯一键名（如 "retrievalPracticeQueue"）持久化数据
- 不直接依赖 StorageManager

### 4. 通用键值存储方案

QueuePersistenceService 采用方案 A（通用键值存储）：

- 提供简单的 get/set 接口
- 不需要知道队列的具体结构
- 队列自己决定数据格式和序列化方式
- 所有队列数据存储在单一文件 `queues.msgpack`

### 5. 完全重写策略

- 删除旧的 StorageManager 类
- 创建新的专职服务类
- 修改所有调用 StorageManager 的代码
- 使用 UnifiedStorageManager 作为核心卡片存储
- 不需要保持向后兼容性（只有测试数据）
- 不需要执行数据迁移

### 6. 依赖注入

使用 ApplicationContext 作为 DI 容器：

- 注册所有服务的工厂方法
- 提供类型安全的服务访问
- 管理服务的生命周期
- 支持延迟初始化

## 后果

### 正面影响

1. **职责清晰**：每个服务只负责一个明确的领域
2. **低耦合**：服务之间通过接口通信，易于替换和测试
3. **易于测试**：可以独立测试每个服务，不需要模拟整个系统
4. **易于维护**：修改一个服务不会影响其他服务
5. **易于扩展**：添加新功能只需创建新服务
6. **符合 DDD**：清晰的分层架构，领域对象自治
7. **类型安全**：使用 TypeScript 接口定义服务契约

### 负面影响

1. **代码量增加**：需要创建多个服务类和接口
2. **学习曲线**：开发者需要理解 DDD 分层架构
3. **初始工作量**：需要重写大量代码
4. **服务协调**：需要通过 ApplicationContext 协调多个服务

### 风险缓解

1. **完整测试覆盖**：为每个服务编写单元测试和属性测试
2. **增量重构**：按任务列表逐步完成，每个阶段都有 checkpoint
3. **文档完善**：提供 ADR、重构指南、JSDoc 注释
4. **代码审查**：确保新代码符合 DDD 原则

## 实现细节

### 文件结构

```
src/
├── infrastructure/
│   └── services/
│       ├── FileService.ts
│       └── QueuePersistenceService.ts
├── application/
│   ├── services/
│   │   ├── SettingsService.ts
│   │   ├── ReviewLogService.ts
│   │   └── RiffBlacklistService.ts
│   └── ApplicationContext.ts
├── domain/
│   └── queues/
│       ├── RetrievalPracticeQueue.ts
│       ├── FinalDrillQueue.ts
│       ├── IncrementalLearningQueue.ts
│       ├── FilterGroupQueue.ts
│       └── NeuralRoamQueue.ts
└── core/
    └── storage/
        └── UnifiedStorageManager.ts
```

### 存储文件

```
data/
├── settings.json                    # 插件设置
├── riff-integration.json            # Riff 集成配置
├── queues.msgpack                   # 所有队列数据（键值对）
├── unified-cards.msgpack            # 卡片和 XiuYuan 数据
├── riff-blacklist.json              # Riff 黑名单
└── review-logs/
    ├── 2024-01.json                 # 2024年1月的日志
    ├── 2024-02.json                 # 2024年2月的日志
    └── ...
```

### 队列键名约定

- `retrievalPracticeQueue`：复习练习队列
- `finalDrillQueue`：最终演练队列
- `incrementalLearningQueue`：渐进学习队列
- `filterGroupQueue`：过滤组队列
- `neuralRoamQueue`：神经漫游队列

## 相关决策

- ADR-002: UnifiedStorageManager 设计（已存在）
- ADR-003: 队列持久化方案选择（方案 A vs 方案 B）

## 参考资料

- [Domain-Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Dependency Injection](https://martinfowler.com/articles/injection.html)
- [Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)
