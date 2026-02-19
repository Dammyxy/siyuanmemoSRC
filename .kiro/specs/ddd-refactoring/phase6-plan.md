# Phase 6 实施计划：统一为 Xiuyuan 卡片架构

> 创建时间：2026-02-19
> 目标：统一所有卡片为 Xiuyuan 架构，完成 DDD 化

## 🎯 Phase 6 目标

将混合的卡片架构（普通 FSRSCard + Xiuyuan 卡片）统一为 Xiuyuan 卡片架构，并完成 DDD 化。

## 📊 当前状况分析

### 1. HybridSyncService
**位置：** `src/services/HybridSyncService.ts`

**职责：**
- 管理 Riff 系统的混合同步
- 增量同步、全量同步、删除同步
- 事件驱动架构

**使用情况：**
- 主要在测试文件中使用
- 生产代码中的使用需要进一步检查

**问题：**
- 名称中的 "Hybrid" 已过时（现在只有 Xiuyuan 卡片）
- 直接访问 `this.storage`
- 没有使用应用服务层

### 2. AdvancedDataRouter
**位置：** `src/routers/AdvancedDataRouter.ts`

**职责：**
- 数据路由（本地存储）
- 卡片 CRUD 操作
- 同步到 Riff

**问题：**
- 名称中的 "Advanced" 已过时（简单模式已移除）
- 直接访问 `this.storage`
- 包含业务逻辑

## 📋 实施计划

### Task 29: 重命名和重构 HybridSyncService

#### 29.1 重命名为 XiuyuanSyncService ✅
简单的重命名操作

**步骤：**
1. 重命名文件：`HybridSyncService.ts` → `XiuyuanSyncService.ts`
2. 重命名类：`HybridSyncService` → `XiuyuanSyncService`
3. 更新所有导入和使用

#### 29.2 创建 SyncApplicationService
创建应用服务封装同步逻辑

**接口设计：**
```typescript
class SyncApplicationService {
  constructor(
    private xiuyuanRepository: IXiuyuanRepository,
    private eventBus: EventBus
  ) {}
  
  async fullSync(): Promise<Result<SyncResult>> {
    // 全量同步逻辑
  }
  
  async incrementalSync(): Promise<Result<SyncResult>> {
    // 增量同步逻辑
  }
  
  async syncXiuyuan(xiuyuanId: string): Promise<Result<void>> {
    // 同步单个 Xiuyuan
  }
}
```

#### 29.3 重构 XiuyuanSyncService 使用应用服务
将 `XiuyuanSyncService` 改为使用 `SyncApplicationService`

**改动：**
```typescript
// 之前
class XiuyuanSyncService {
  private storage: StorageManager;
  
  async incrementalSync() {
    const cards = this.storage.getAllCards();
    // ...
  }
}

// 之后
class XiuyuanSyncService {
  private syncService: SyncApplicationService;
  
  async incrementalSync() {
    const result = await this.syncService.incrementalSync();
    // ...
  }
}
```

### Task 30: 重命名和重构 AdvancedDataRouter

#### 30.1 分析职责 ✅
已在 Phase 5 分析中完成

#### 30.2 决策：重命名为 DataAccessFacade
采用 Facade 模式，保持现有接口

**理由：**
- 保持向后兼容
- 清晰表达职责（数据访问的门面）
- 后续可以逐步简化

#### 30.3 实施重构

**步骤：**
1. 重命名文件和类
2. 更新为使用 `CardApplicationService`（Phase 5 已准备好）
3. 更新所有导入和使用

**改动：**
```typescript
// 之前
class AdvancedDataRouter {
  private storage: StorageManager;
  
  async getCard(cardId: string): Promise<FSRSCard> {
    return this.storage.getCard(cardId);
  }
  
  async updateCard(card: FSRSCard): Promise<void> {
    this.storage.updateCard(card);
  }
}

// 之后
class DataAccessFacade {
  private cardService: CardApplicationService;
  
  async getCard(cardId: string): Promise<FSRSCard> {
    const result = await this.cardService.getCard({ cardId });
    return result.card;
  }
  
  async updateCard(card: FSRSCard): Promise<void> {
    // 需要创建 UpdateFSRSCardCommand
    await this.cardService.updateFSRSCard({ card });
  }
}
```

## 🚧 挑战和解决方案

### 挑战 1：Command 模式不匹配

**问题：**
- 现有 `UpdateCardCommand` 是针对 Xiuyuan 卡片的
- `DataAccessFacade` 需要更新普通 FSRSCard

**解决方案：**
创建新的 Command 和 UseCase：
- `UpdateFSRSCardCommand`
- `UpdateFSRSCardUseCase`
- `DeleteFSRSCardCommand`
- `DeleteFSRSCardUseCase`

### 挑战 2：测试文件的更新

**问题：**
- 大量测试文件使用 `HybridSyncService`
- 需要批量更新

**解决方案：**
- 使用 IDE 的重命名功能
- 逐个文件检查和更新

### 挑战 3：向后兼容

**问题：**
- 可能有外部代码依赖旧名称

**解决方案：**
- 创建类型别名：`export type HybridSyncService = XiuyuanSyncService`
- 添加 @deprecated 标记
- 在下一个版本中移除

## 📝 实施顺序

### 第一步：重命名（低风险）
1. Task 29.1: 重命名 `HybridSyncService` → `XiuyuanSyncService`
2. Task 30.2: 重命名 `AdvancedDataRouter` → `DataAccessFacade`

### 第二步：创建新的 Command 和 UseCase
1. 创建 `UpdateFSRSCardCommand` 和 `UpdateFSRSCardUseCase`
2. 创建 `DeleteFSRSCardCommand` 和 `DeleteFSRSCardUseCase`
3. 扩展 `CardApplicationService`

### 第三步：重构使用应用服务
1. Task 30.3: 重构 `DataAccessFacade` 使用 `CardApplicationService`
2. Task 29.2-29.3: 创建 `SyncApplicationService` 并重构 `XiuyuanSyncService`

### 第四步：测试和验证
1. 运行所有测试
2. 手动测试核心功能
3. 更新文档

## 💡 建议

### 建议 1：先做重命名
- 风险最低
- 改动最小
- 可以快速完成

### 建议 2：分批提交
- 每完成一个小任务就提交
- 便于回滚和调试

### 建议 3：保留向后兼容
- 使用类型别名
- 添加 @deprecated 标记
- 给用户迁移时间

## 🔗 相关文档

- [Phase 5 分析](./phase5-analysis.md)
- [Phase 5 Task 27 进度](./phase5-task27-progress.md)
- [统一架构计划](./unified-architecture-plan.md)
- [任务列表](./tasks.md)
