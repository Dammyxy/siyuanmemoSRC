# 统一架构 DDD 化迁移计划

> 创建时间：2026-02-19
> 目标：统一为 Xiuyuan 卡片架构，完成 DDD 化

## 🎯 架构演进目标

### 当前问题

1. **混合架构**：同时存在普通闪卡和 Xiuyuan 卡片
2. **旧架构残留**：RetrievalPracticeProvider 等旧组件
3. **模式冗余**：简单模式已移除，但 AdvancedDataRouter 命名仍保留
4. **直接访问 Storage**：大量代码跳过应用层

### 目标架构

```
统一为 Xiuyuan 卡片架构
    ↓
所有卡片都是 Xiuyuan 卡片
    ↓
通过 DDD 分层访问
    ↓
UI → ApplicationService → UseCase → DomainService → Repository → Storage
```

---

## 📋 迁移任务清单

### Phase 4: 清理废弃代码和旧架构（2-3 小时）✅

#### 任务 25: 移除废弃的 Storage 方法 ✅
- [x] 25.1 移除 `StorageManager.getDueCards()`
- [x] 25.2 移除 `MenuManager.getDueCount()`（已在之前完成）
- [x] 25.3 更新所有调用方使用 `CardApplicationService`
  - 更新 `DockManager.ts`
  - 更新 `MenuManager.ts`
  - 更新 `index.ts`
  - 更新 `index.simplified.ts`
- [x] 25.4 运行测试验证
- [x] 25.5 更新文档

#### 任务 26: 移除旧架构组件
- [x] 26.1 删除完全未使用的组件
  - [x] 删除 `src/ui/dock/DockManager.ts`（旧的 DockManager，已被新架构替代）
  - [x] 标记 `MigrateQueueDataService` 为 @deprecated（一次性迁移工具）
- [x] 26.2 迁移 PluginAssembler 使用方（中等优先级）
  - [x] 重构 `src/managers/UIManager.ts` 移除 `PluginUIAssembler`
  - [x] 重构 `src/handlers/BlockEventHandler.ts` 移除 `BlockMenuAssembler`
  - [x] 重构 `src/services/PluginService.ts` 移除 `PluginUIAssembler`
  - [x] 将 `openSRSBrowser` 和 `openSRSBrowserTab` 方法移到 `PluginService`
  - [x] 删除 `src/core/application/PluginAssembler.ts`
- [ ] 26.3 迁移到 UnifiedReviewAdapter（低优先级，可延后到 Phase 6）
  - 说明：涉及复习界面核心逻辑，需要更多测试
  - 旧 Adapter：RetrievalPracticeAdapter、FinalDrillAdapter、LeechAdapter
  - 新 Adapter：UnifiedReviewAdapter
- [ ] 26.4 移除 Provider 层（低优先级，可延后到 Phase 6）
  - 说明：RetrievalPracticeProvider、FinalDrillProvider 等
  - 迁移路径：直接使用对应的 Queue 类

---

### Phase 5: 统一数据源 DDD 化（4-5 小时）🔴

#### 背景
- 当前：`UnifiedDataSourceManager` 直接访问 Storage
- 目标：通过应用服务访问数据

#### 任务 27: 重构 UnifiedDataSourceManager
- [ ] 27.1 分析 `UnifiedDataSourceManager` 的职责
  - 数据源路由（本地 vs Riff）
  - 队列管理
  - 数据同步
- [ ] 27.2 创建 `DataSourceApplicationService`
  ```typescript
  class DataSourceApplicationService {
    async getCards(source: DataSource): Promise<Result<Card[]>>
    async syncCards(command: SyncCommand): Promise<Result<void>>
    async switchDataSource(source: DataSource): Promise<Result<void>>
  }
  ```
- [ ] 27.3 重构 `UnifiedDataSourceManager` 使用应用服务
- [ ] 27.4 编写单元测试
- [ ] 27.5 更新文档

#### 任务 28: 重构队列系统
- [ ] 28.1 分析队列系统的职责
  - `RetrievalPracticeQueue`
  - `FinalDrillQueue`
  - `IncrementalLearningQueue`
  - `FilterGroupQueue`
- [ ] 28.2 确保队列通过应用服务访问数据
- [ ] 28.3 编写单元测试

---

### Phase 6: 统一为 Xiuyuan 卡片架构（5-6 小时）�

#### 任务 29: 重命名和重构 HybridSyncService
- [x] 29.1 重命名为 `XiuyuanSyncService` ✅
  - 说明：现在只同步 Xiuyuan 卡片，不再混合
  - 添加了向后兼容的类型别名
- [ ] 29.2 创建 `SyncApplicationService`（可选，低优先级）
  ```typescript
  class SyncApplicationService {
    async fullSync(): Promise<Result<SyncResult>>
    async incrementalSync(): Promise<Result<SyncResult>>
    async syncXiuyuan(xiuyuanId: string): Promise<Result<void>>
  }
  ```
- [ ] 29.3 重构 `XiuyuanSyncService` 使用应用服务（可选，低优先级）
  - 不再直接访问 `this.storage`
  - 通过 `XiuyuanApplicationService` 访问数据

#### 任务 30: 重命名和重构 AdvancedDataRouter
- [x] 30.1 分析 `AdvancedDataRouter` 的职责 ✅
  - 数据路由（本地 vs Riff）
  - 卡片 CRUD 操作
  - 同步逻辑
- [x] 30.2 重命名为 `DataAccessFacade` ✅
  - 采用 Facade 模式
  - 添加了向后兼容的类型别名
- [ ] 30.3 重构使用 CardApplicationService（延后到 Phase 7 后）
  - 需要先创建 UpdateFSRSCardCommand 和 DeleteFSRSCardCommand
  - 等统一卡片模型后再处理

---

### Phase 7: 完善 XiuyuanApplicationService（4-5 小时）🟡

#### 任务 31: 创建 XiuyuanApplicationService
- [ ] 31.1 创建命令对象
  ```typescript
  CreateXiuyuanFromBlocksCommand {
    blockIds: string[]
    templateId: string
    deckId?: string
    priority?: number
  }
  ```
- [ ] 31.2 创建用例
  ```typescript
  CreateXiuyuanFromBlocksUseCase
  GetXiuyuanUseCase
  GetAllXiuyuansUseCase
  DeleteXiuyuanUseCase
  ```
- [ ] 31.3 创建应用服务
  ```typescript
  class XiuyuanApplicationService {
    async createFromBlocks(command: CreateXiuyuanFromBlocksCommand): Promise<Result<Xiuyuan>>
    async getXiuyuan(id: string): Promise<Result<Xiuyuan>>
    async getAllXiuyuans(): Promise<Result<Xiuyuan[]>>
    async deleteXiuyuan(id: string): Promise<Result<void>>
    
    // 模板管理
    async getTemplate(id: string): Promise<Result<Template>>
    async getAllTemplates(): Promise<Result<Template[]>>
    async createTemplate(template: Template): Promise<Result<void>>
  }
  ```
- [ ] 31.4 编写单元测试
- [ ] 31.5 更新文档

#### 任务 32: 迁移 XiuyuanService 的调用方 ✅
- [x] 32.1 迁移 `AutoCardHandler` ✅
  - 从 `xiuyuanService.createFromBlocks()` 
  - 到 `xiuyuanApplicationService.createFromBlocks()`
  - 迁移了 6 个方法：双向卡片、概念卡片、描述符卡片、填空卡片、列表模板卡片
- [x] 32.2 迁移 `DialogManager` ✅
  - 模板选择对话框
  - 迁移了 `openCreateTemplateCardDialog()` 方法
- [ ] 32.3 迁移 `TransactionObserver`
  - 事务观察者（如果存在）
- [ ] 32.4 迁移 `MigrationService`
  - 迁移服务（暂缓，需要先添加 `getMappingsByXiuyuanID()` 方法）
- [x] 32.5 标记旧 `XiuyuanService` 为废弃或重构为纯领域服务 ✅
  - 添加 @deprecated 注释到类和主要方法
  - 提供迁移指南和示例代码

**完成情况**: 主要调用方已迁移完成，旧服务已标记废弃 ✅

---

### Phase 8: 完善复习记录管理（3-4 小时）🟡

#### 任务 33: 创建 ReviewApplicationService
- [ ] 33.1 创建命令对象
  ```typescript
  RecordReviewCommand {
    cardId: string
    rating: number
    scheduledDays: number
    elapsedDays: number
    state: CardState
  }
  ```
- [ ] 33.2 创建用例
  ```typescript
  RecordReviewUseCase
  GetReviewHistoryUseCase
  GetReviewStatisticsUseCase
  ```
- [ ] 33.3 创建应用服务
  ```typescript
  class ReviewApplicationService {
    async recordReview(command: RecordReviewCommand): Promise<Result<void>>
    async getReviewHistory(cardId: string): Promise<Result<ReviewLog[]>>
    async getReviewStatistics(query: ReviewStatsQuery): Promise<Result<ReviewStats>>
  }
  ```
- [ ] 33.4 发布 `CardReviewedEvent`
- [ ] 33.5 编写单元测试
- [ ] 33.6 更新文档

#### 任务 34: 迁移复习记录的调用方
- [ ] 34.1 迁移复习界面
- [ ] 34.2 迁移统计界面
- [ ] 34.3 移除直接访问 `storage.addReviewLog()`

---

### Phase 9: 插件主文件 DDD 化（2-3 小时）🟡

#### 任务 35: 重构 index.ts
- [ ] 35.1 分析 `index.ts` 的职责
  - 插件生命周期管理
  - ApplicationContext 初始化
  - UI 组件注册
  - 命令注册
- [ ] 35.2 移除直接访问 `this.storage`
  - 通过 `ApplicationContext` 获取服务
  - 使用应用服务而不是直接访问 Storage
- [ ] 35.3 简化插件主文件
  - 目标：< 200 行
  - 将复杂逻辑移到管理器或服务中
- [ ] 35.4 编写单元测试
- [ ] 35.5 更新文档

---

## 🎯 关键决策点

### 1. AdvancedDataRouter 的去向

**当前职责**：
- 数据路由（本地 vs Riff）
- 卡片 CRUD 操作
- 同步逻辑

**选项分析**：

**选项 A：合并到 DataSourceApplicationService** ✅ 推荐
```typescript
class DataSourceApplicationService {
  // 数据路由
  async getCards(source: DataSource): Promise<Result<Card[]>>
  async getCard(cardId: string, source: DataSource): Promise<Result<Card>>
  
  // CRUD 操作（委托给 CardApplicationService）
  async updateCard(card: Card): Promise<Result<void>>
  async deleteCard(cardId: string): Promise<Result<void>>
  
  // 同步逻辑（委托给 SyncApplicationService）
  async syncCards(): Promise<Result<void>>
}
```

**选项 B：重命名为 DataRouter**
- 保留当前结构
- 只是改名
- 不推荐：仍然直接访问 Storage

**选项 C：拆分职责**
- 数据路由 → `DataSourceApplicationService`
- CRUD 操作 → `CardApplicationService`
- 同步逻辑 → `SyncApplicationService`
- 推荐：职责更清晰

### 2. HybridSyncService 的重构

**重命名**：`HybridSyncService` → `XiuyuanSyncService`

**重构方向**：
```typescript
// 旧架构
class HybridSyncService {
  private storage: StorageManager;
  
  async incrementalSync() {
    const cards = this.storage.getAllCards(); // ❌ 直接访问
    // ...
  }
}

// 新架构
class XiuyuanSyncService {
  private syncApplicationService: SyncApplicationService;
  
  async incrementalSync() {
    const result = await this.syncApplicationService.incrementalSync(); // ✅ 通过应用服务
    // ...
  }
}
```

### 3. MigrateQueueDataService 的处理

**职责**：将旧队列数据迁移到新架构

**决策**：
- 如果迁移已完成 → 移除
- 如果还需要迁移 → 保留但标记为一次性工具
- 建议：添加配置项控制是否执行迁移

---

## 📊 工作量估算

| 阶段 | 任务 | 预计时间 | 优先级 |
|------|------|----------|--------|
| Phase 4 | 清理废弃代码和旧架构 | 2-3 小时 | 🔴 高 |
| Phase 5 | 统一数据源 DDD 化 | 4-5 小时 | 🔴 高 |
| Phase 6 | 统一为 Xiuyuan 架构 | 5-6 小时 | 🔴 高 |
| Phase 7 | 完善 XiuyuanApplicationService | 4-5 小时 | 🟡 中 |
| Phase 8 | 完善复习记录管理 | 3-4 小时 | 🟡 中 |
| Phase 9 | 插件主文件 DDD 化 | 2-3 小时 | 🟡 中 |
| **总计** | | **20-26 小时** | |

---

## 🚀 推荐的实施顺序

### 第一批（立即执行）- 6-9 小时
1. **Phase 4**：清理废弃代码（2-3 小时）
2. **Phase 6 任务 29**：重构 HybridSyncService（2-3 小时）
3. **Phase 6 任务 30**：重构 AdvancedDataRouter（2-3 小时）

**理由**：
- 统一命名，消除混淆
- 为后续工作铺平道路
- 快速见效

### 第二批（近期执行）- 8-10 小时
4. **Phase 5**：统一数据源 DDD 化（4-5 小时）
5. **Phase 7**：完善 XiuyuanApplicationService（4-5 小时）

**理由**：
- 建立完整的应用服务层
- 统一数据访问方式

### 第三批（长期优化）- 5-7 小时
6. **Phase 8**：完善复习记录管理（3-4 小时）
7. **Phase 9**：插件主文件 DDD 化（2-3 小时）

**理由**：
- 完善细节
- 提升代码质量

---

## 📝 总结

基于你的需求，我们需要：

1. **统一架构**：所有卡片都是 Xiuyuan 卡片
2. **重命名服务**：
   - `HybridSyncService` → `XiuyuanSyncService`
   - `AdvancedDataRouter` → 合并到应用服务
3. **移除旧架构**：
   - `RetrievalPracticeProvider`（已被统一数据源替代）
   - `MigrateQueueDataService`（一次性迁移工具）
4. **完善 DDD**：
   - 创建 `XiuyuanApplicationService`
   - 创建 `SyncApplicationService`
   - 创建 `ReviewApplicationService`
   - 创建 `DataSourceApplicationService`

**建议从第一批开始**，这样可以快速统一架构并消除混淆！🚀
