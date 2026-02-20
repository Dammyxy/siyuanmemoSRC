# XiuyuanRepository Storage 修复

## 问题描述

删除卡片时报错：`TypeError: this.storage.getAllXiuYuans is not a function`

```
[SiYuanMemo][DeckDataSource] Failed to delete card: 
TypeError: this.storage.getAllXiuYuans is not a function
    at Proxy.findAll (XiuyuanRepository.ts:189)
    at Proxy.findXiuyuanAndCardId (DeleteCardUseCase.ts:105)
    at Proxy.execute (DeleteCardUseCase.ts:87)
    at Proxy.deleteCard (CardApplicationService.ts:106)
    at Proxy.performAction (DeckDataSource.ts:87)
```

## 根本原因分析

### 架构问题

**问题根源**：`XiuyuanRepository` 被传入了错误的 storage 类型。

```typescript
// ❌ ApplicationContext.ts（旧代码）
const xiuyuanRepo = new XiuyuanRepository(
    context.getXiuyuanStorage(),  // ❌ 传入 XiuyuanStorage
    context.getPlugin()
);
```

### 类型不匹配

1. **XiuyuanRepository 期望的类型**：
   ```typescript
   // XiuyuanRepository.ts
   constructor(
       private readonly storage: UnifiedStorageManager  // 期望 UnifiedStorageManager
   ) {}
   ```

2. **实际传入的类型**：
   ```typescript
   // ApplicationContext.ts
   context.getXiuyuanStorage()  // 返回 XiuyuanStorage
   ```

3. **方法名不匹配**：
   - `XiuyuanStorage.getAllXiuyuans()` - 小写 y
   - `UnifiedStorageManager.getAllXiuYuans()` - 大写 Y

### 为什么会出现这个问题？

**历史原因**：
- `XiuyuanStorage` 是旧架构，专门存储 Xiuyuan 数据
- `UnifiedStorageManager` 是新架构，统一存储所有数据
- 在迁移过程中，`XiuyuanRepository` 的构造函数类型声明是 `UnifiedStorageManager`，但实际传入的是 `XiuyuanStorage`

**TypeScript 没有报错的原因**：
- 两个类都有类似的方法（`getAllXiuyuans` vs `getAllXiuYuans`）
- TypeScript 的结构类型系统认为它们兼容
- 但运行时方法名不匹配导致错误

## DDD 架构分析

### 两套并行的 Repository 系统

#### 1. XiuyuanRepository（Xiuyuan 聚合根）

**职责**：
- 管理 Xiuyuan 聚合根（一个 Xiuyuan 包含多个卡片）
- 处理 Xiuyuan 的 CRUD 操作
- 协调 msgpack、块属性、Riff 三个数据源

**位置**：`src/core/xiuyuan/infrastructure/XiuyuanRepository.ts`

**应该使用的 storage**：`UnifiedStorageManager`（统一数据访问层）

#### 2. CardRepository（单个卡片）

**职责**：
- 管理单个卡片实体
- 使用 CardMapper 进行模型转换
- 提供卡片级别的 CRUD 操作

**位置**：`src/infrastructure/persistence/CardRepository.ts`

**使用的 storage**：`UnifiedStorageManager`

**状态**：✅ 已实现但未使用（映射层迁移未完成）

### 正确的架构

```
Application Layer
    ↓
DeleteCardUseCase
    ↓
XiuyuanRepository (管理 Xiuyuan 聚合根)
    ↓
UnifiedStorageManager (统一数据访问层)
    ↓
MessagePack
```

**关键点**：
- `XiuyuanRepository` 应该使用 `UnifiedStorageManager`
- `XiuyuanStorage` 只用于模板管理，不用于卡片数据
- 所有卡片数据都通过 `UnifiedStorageManager` 访问

## 解决方案

### 修复 ApplicationContext

#### 1. 服务容器中的 cardService

```typescript
// ✅ 修复后
this.registerServiceFactory('cardService', (context) => {
  // 创建基础设施层：XiuyuanRepository
  // ✅ DDD 架构修复：使用 UnifiedStorageManager 而不是 XiuyuanStorage
  const xiuyuanRepo = new XiuyuanRepository(
    context.getStorage(),  // ✅ 使用 UnifiedStorageManager
    context.getPlugin()
  );

  // 创建领域服务
  const cardCreationService = new CardCreationService();
  const cardDeletionService = new CardDeletionService();

  // 创建用例
  const createCardUseCase = new CreateCardUseCase(xiuyuanRepo, cardCreationService);
  const deleteCardUseCase = new DeleteCardUseCase(xiuyuanRepo, cardDeletionService, context.getEventBus());
  const updateCardUseCase = new UpdateCardUseCase(xiuyuanRepo);

  // 创建应用服务
  const scheduleService = new CardScheduleService();
  
  return new CardApplicationService(
    createCardUseCase,
    deleteCardUseCase,
    updateCardUseCase,
    context.getStorage(),
    scheduleService
  );
});
```

#### 2. ApplicationContext.create() 中的临时 repository

```typescript
// ✅ 修复后
// 6. 创建 CardApplicationService（DataAccessFacade 和 BlockMenuHandler 需要）
// ✅ DDD 架构修复：使用 UnifiedStorageManager 创建 XiuyuanRepository
// 确保所有地方使用统一的数据访问层，避免数据不一致
const xiuyuanRepoTemp = new XiuyuanRepository(storageManager, config.plugin);

// 创建领域服务
const cardCreationService = new CardCreationService();
const cardDeletionService = new CardDeletionService();
const cardScheduleService = new CardScheduleService();
const eventBus = new EventBus(false);  // false = 不启用调试日志

// 创建用例
const createCardUseCase = new CreateCardUseCase(xiuyuanRepoTemp, cardCreationService);
const deleteCardUseCase = new DeleteCardUseCase(xiuyuanRepoTemp, cardDeletionService, eventBus);
const updateCardUseCase = new UpdateCardUseCase(xiuyuanRepoTemp);

// 创建 CardApplicationService
const cardApplicationService = new CardApplicationService(
  createCardUseCase,
  deleteCardUseCase,
  updateCardUseCase,
  storageManager,
  cardScheduleService
);

// 10. 初始化 Xiuyuan 服务（使用 XiuyuanStorage 用于模板管理）
// 注意：XiuyuanStorage 只用于模板管理，卡片数据使用 UnifiedStorageManager
const xiuyuanStorageTemp = new XiuyuanStorage(config.plugin as any);
await xiuyuanStorageTemp.load();
const xiuyuanService = new XiuyuanService(xiuyuanStorageTemp, storageManager);
```

### 关键改进

1. **统一数据访问**：
   - 所有 Repository 都使用 `UnifiedStorageManager`
   - `XiuyuanStorage` 只用于模板管理
   - 避免数据不一致

2. **符合 DDD 原则**：
   - Repository 使用统一的基础设施服务
   - 清晰的职责分离
   - 正确的依赖方向

3. **添加 EventBus**：
   - `DeleteCardUseCase` 需要 `EventBus` 参数
   - 用于发布领域事件

## 映射层（Mapper Layer）的关系

### 当前状态

1. **CardMapper**：
   - 位置：`src/infrastructure/persistence/mappers/CardMapper.ts`
   - 职责：Entity ↔ DTO ↔ FSRSCard 转换
   - 状态：✅ 已实现

2. **CardRepository**：
   - 位置：`src/infrastructure/persistence/CardRepository.ts`
   - 职责：使用 CardMapper 进行模型转换
   - 状态：✅ 已实现但未使用

3. **XiuyuanRepository**：
   - 位置：`src/core/xiuyuan/infrastructure/XiuyuanRepository.ts`
   - 职责：管理 Xiuyuan 聚合根
   - 状态：✅ 正在使用（本次修复）

### 未来迁移计划

根据 `COMPLETE-DDD-MIGRATION.md`，完整的映射层迁移包括：

**阶段 1：基础设施层**（已完成）
- [x] 创建 Card Entity
- [x] 创建 ICardRepository 接口
- [x] 创建 CardRepository 实现
- [x] 更新 CardMapper（添加 Entity 方法）

**阶段 2：应用层**（未完成）
- [ ] 更新 CardApplicationService 使用 CardRepository
- [ ] 更新 ReviewService
- [ ] 更新 QueueService
- [ ] 更新 XiuyuanSyncService

**当前使用的是**：
- `XiuyuanRepository`（管理 Xiuyuan 聚合根）
- 直接操作 `UnifiedStorageManager`

**未来可以迁移到**：
- `CardRepository`（管理单个卡片）
- 使用 `CardMapper` 进行模型转换
- 更符合 DDD 的单一职责原则

但这是一个更大的重构，不影响当前的修复。

## 测试验证

### 验证点

1. ✅ `XiuyuanRepository` 使用 `UnifiedStorageManager`
2. ✅ `getAllXiuYuans()` 方法调用成功
3. ✅ 删除卡片操作正常
4. ✅ 数据一致性（所有地方使用同一个 storage）
5. ✅ EventBus 正确传递

### 测试命令

```bash
# 编译检查
npm run build

# 运行测试
npm test

# 手动测试
# 1. 打开卡片浏览器
# 2. 选择卡片
# 3. 点击删除按钮
# 4. 验证卡片被成功删除
```

## 影响范围

### 修改的文件

1. `src/application/ApplicationContext.ts`
   - 修改 `cardService` 工厂：使用 `context.getStorage()` 而不是 `context.getXiuyuanStorage()`
   - 修改 `ApplicationContext.create()`：使用 `storageManager` 创建 `xiuyuanRepoTemp`
   - 添加 `EventBus` 参数到 `DeleteCardUseCase`

### 不需要修改的文件

1. `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts`
   - 构造函数类型声明已经是 `UnifiedStorageManager`
   - 不需要修改

2. `src/application/usecases/card/DeleteCardUseCase.ts`
   - 业务逻辑不变
   - 只需要确保传入正确的 storage

## 总结

### 问题根源

`XiuyuanRepository` 被传入了错误的 storage 类型（`XiuyuanStorage` 而不是 `UnifiedStorageManager`），导致方法名不匹配。

### 解决方案

修改 `ApplicationContext`，确保 `XiuyuanRepository` 使用 `UnifiedStorageManager`：
- 服务容器中的 `cardService` 工厂
- `ApplicationContext.create()` 中的临时 repository

### DDD 收益

1. **统一数据访问**：所有 Repository 使用同一个 storage
2. **职责清晰**：`XiuyuanStorage` 只用于模板管理
3. **符合 DDD 原则**：Repository 使用统一的基础设施服务
4. **避免数据不一致**：所有地方访问同一份数据

### 映射层关系

- `XiuyuanRepository`：当前使用，管理 Xiuyuan 聚合根
- `CardRepository`：已实现但未使用，未来可以迁移
- 本次修复不影响映射层的未来迁移计划

## 相关文档

- [Queue Manager DDD 重构](./queue-manager-ddd-refactoring.md)
- [完整 DDD 迁移指南](../storage-manager-ddd-refactoring/COMPLETE-DDD-MIGRATION.md)
- [映射层迁移设计](../mapper-layer-complete-migration/design.md)
- [DDD 架构文档](../storage-manager-ddd-refactoring/ARCHITECTURE.md)
