# DDD 架构迁移分析报告

> 分析时间：2026-02-19

## 📊 当前状态

### ✅ 已完成 DDD 化的部分

1. **卡片调度逻辑**
   - ✅ `CardScheduleService` - 领域服务
   - ✅ `CardApplicationService` - 应用服务
   - ✅ `GetDueCardsQuery/QueryHandler` - CQRS 查询

2. **卡片生命周期管理**
   - ✅ `CreateCardUseCase` - 创建卡片用例
   - ✅ `DeleteCardUseCase` - 删除卡片用例
   - ✅ `UpdateCardUseCase` - 更新卡片用例
   - ✅ `CardCreationService` - 领域服务
   - ✅ `CardDeletionService` - 领域服务

3. **领域事件机制**
   - ✅ `DomainEvent` - 事件基类
   - ✅ `EventBus` - 事件总线
   - ✅ 事件发布和订阅

4. **聚合根和值对象**
   - ✅ `Xiuyuan` - 聚合根
   - ✅ `Card` - 实体
   - ✅ `XiuyuanId`, `CardId`, `BlockId`, `TemplateId` - 值对象
   - ✅ `CardFace`, `Priority` - 值对象

5. **仓储模式**
   - ✅ `IXiuyuanRepository` - 仓储接口
   - ✅ `XiuyuanRepository` - 仓储实现

---

## ⚠️ 需要 DDD 化的部分

### 1. 直接访问 Storage 的代码（高优先级）

#### 问题区域

**A. 复习相关服务**
- `src/services/HybridSyncService.ts` - 大量直接访问 `this.storage`
- `src/routers/AdvancedDataRouter.ts` - 直接访问 `this.storage`
- `src/ui/review/v2/providers/RetrievalPracticeProvider.ts` - 直接访问 `this.storage`

**B. 迁移和清理服务**
- `src/services/MigrateQueueDataService.ts` - 直接访问 `this.storage`
- `src/services/RiffCleanupService.ts` - 直接访问 `this.storage`
- `src/services/MigrationService.ts` - 直接访问 `this.storage`

**C. 插件主文件**
- `src/index.ts` - 直接访问 `this.storage`

#### 影响

这些代码跳过了应用层，直接访问基础设施层，违反了 DDD 分层原则：

```
❌ 当前架构：
Service → Storage (跳过应用层和领域层)

✅ 应该是：
Service → ApplicationService → UseCase → DomainService → Repository → Storage
```

#### 建议方案

**方案 1：扩展 CardApplicationService**

为常用操作添加应用服务方法：

```typescript
// CardApplicationService 新增方法
async getCard(cardId: string): Promise<Result<Card>>
async getAllCards(): Promise<Result<Card[]>>
async updateCard(card: Card): Promise<Result<void>>
async addReviewLog(log: ReviewLog): Promise<Result<void>>
async getCardsByBlockId(blockId: string): Promise<Result<Card[]>>
```

**方案 2：创建 ReviewApplicationService**

专门处理复习相关的业务逻辑：

```typescript
class ReviewApplicationService {
  async recordReview(command: RecordReviewCommand): Promise<Result<void>>
  async getReviewHistory(cardId: string): Promise<Result<ReviewLog[]>>
  async getReviewStatistics(): Promise<Result<ReviewStats>>
}
```

**方案 3：创建 SyncApplicationService**

处理同步相关的业务逻辑：

```typescript
class SyncApplicationService {
  async syncWithRiff(command: SyncCommand): Promise<Result<SyncResult>>
  async fullSync(): Promise<Result<SyncResult>>
  async incrementalSync(): Promise<Result<SyncResult>>
}
```

---

### 2. XiuyuanService 的使用（中优先级）

#### 问题

`XiuyuanService` 是旧架构的服务，直接操作 `XiuyuanStorage`，没有经过应用层：

```typescript
// 当前使用方式（旧架构）
xiuyuanService.createFromBlocks(blockIds, templateId)
xiuyuanService.getAllXiuyuans()
xiuyuanService.getTemplate(templateId)
```

#### 使用位置

- `src/services/handlers/AutoCardHandler.ts` - 自动制卡
- `src/application/managers/DialogManager.ts` - 模板选择对话框
- `src/core/box/TransactionObserver.ts` - 事务观察者
- `src/services/MigrationService.ts` - 迁移服务

#### 建议方案

**方案 1：保留 XiuyuanService 作为领域服务**

将 `XiuyuanService` 重构为纯领域服务，不直接访问存储：

```typescript
// 重构后的 XiuyuanService（领域服务）
class XiuyuanService {
  // 只包含业务逻辑，不访问存储
  validateTemplate(template: Template): Result<void>
  buildCardFaces(blocks: Block[], template: Template): Result<CardFace[]>
  calculatePriority(blocks: Block[]): Priority
}
```

**方案 2：创建 XiuyuanApplicationService**

通过应用服务封装 Xiuyuan 相关操作：

```typescript
class XiuyuanApplicationService {
  async createFromBlocks(command: CreateXiuyuanCommand): Promise<Result<Xiuyuan>>
  async getXiuyuan(id: string): Promise<Result<Xiuyuan>>
  async getAllXiuyuans(): Promise<Result<Xiuyuan[]>>
  
  // 模板管理
  async getTemplate(id: string): Promise<Result<Template>>
  async getAllTemplates(): Promise<Result<Template[]>>
  async createTemplate(template: Template): Promise<Result<void>>
}
```

**方案 3：扩展 CardApplicationService**

将 Xiuyuan 相关操作整合到 CardApplicationService：

```typescript
class CardApplicationService {
  // 现有方法
  async createCard(command: CreateCardCommand): Promise<Result<Card>>
  
  // 新增：从块创建卡片（使用模板）
  async createCardsFromBlocks(command: CreateCardsFromBlocksCommand): Promise<Result<Card[]>>
  
  // 新增：模板管理
  async getTemplate(id: string): Promise<Result<Template>>
  async getAllTemplates(): Promise<Result<Template[]>>
}
```

---

### 3. 复习记录和统计（中优先级）

#### 问题

复习记录（ReviewLog）的管理分散在多个地方：

- `StorageManager.addReviewLog()`
- `RetrievalPracticeProvider` 直接调用
- 没有统一的应用服务

#### 建议方案

创建 `ReviewApplicationService`：

```typescript
class ReviewApplicationService {
  constructor(
    private readonly reviewLogRepository: IReviewLogRepository,
    private readonly cardRepository: ICardRepository,
    private readonly eventBus: EventBus
  ) {}
  
  async recordReview(command: RecordReviewCommand): Promise<Result<void>> {
    // 1. 验证命令
    // 2. 获取卡片
    // 3. 更新卡片状态
    // 4. 保存复习记录
    // 5. 发布 CardReviewedEvent
  }
  
  async getReviewHistory(cardId: string): Promise<Result<ReviewLog[]>>
  async getReviewStatistics(query: ReviewStatsQuery): Promise<Result<ReviewStats>>
}
```

---

### 4. 废弃代码清理（高优先级）

#### 需要移除的废弃方法

```typescript
// StorageManager
@deprecated getDueCards(): Card[]  // 使用 CardApplicationService.getDueCards()

// MenuManager
@deprecated getDueCount(): number  // 使用 CardApplicationService.getDueCount()
```

#### 调用位置

- `src/index.ts` - `getDueCount()`
- `src/application/managers/DockManager.ts` - `getDueCards()`
- `src/application/managers/MenuManager.ts` - `getDueCards()` (已部分迁移)
- `src/application/ApplicationContext.ts` - `getDueCards()`

---

## 📋 迁移优先级

### 🔴 高优先级（立即处理）

1. **清理废弃代码**
   - 移除 `StorageManager.getDueCards()`
   - 移除 `MenuManager.getDueCount()`
   - 更新所有调用方

2. **扩展 CardApplicationService**
   - 添加 `getCard(cardId)`
   - 添加 `getAllCards()`
   - 添加 `getCardsByBlockId(blockId)`

### 🟡 中优先级（近期处理）

3. **创建 ReviewApplicationService**
   - 实现 `recordReview()`
   - 实现 `getReviewHistory()`
   - 实现 `getReviewStatistics()`

4. **重构 XiuyuanService**
   - 创建 `XiuyuanApplicationService`
   - 迁移 `createFromBlocks()`
   - 迁移模板管理方法

5. **迁移 HybridSyncService**
   - 创建 `SyncApplicationService`
   - 通过应用服务访问数据

### 🟢 低优先级（长期优化）

6. **迁移其他服务**
   - `AdvancedDataRouter`
   - `MigrateQueueDataService`
   - `RiffCleanupService`

7. **完善领域事件**
   - 添加更多事件类型
   - 实现事件溯源
   - 添加事件重放

---

## 🎯 推荐的迁移路径

### Phase 4: 清理废弃代码（1-2 小时）

```
✅ 任务 25: 清理废弃代码
  - 25.1 移除 StorageManager.getDueCards()
  - 25.2 移除 MenuManager.getDueCount()
  - 25.3 更新所有调用方
  - 25.4 运行所有测试
  - 25.5 更新文档
```

### Phase 5: 扩展 CardApplicationService（2-3 小时）

```
✅ 任务 26: 扩展 CardApplicationService
  - 26.1 添加 getCard() 方法
  - 26.2 添加 getAllCards() 方法
  - 26.3 添加 getCardsByBlockId() 方法
  - 26.4 编写单元测试
  - 26.5 迁移调用方
  - 26.6 更新文档
```

### Phase 6: 创建 ReviewApplicationService（3-4 小时）

```
✅ 任务 27: 创建 ReviewApplicationService
  - 27.1 创建 RecordReviewCommand
  - 27.2 创建 RecordReviewUseCase
  - 27.3 创建 ReviewApplicationService
  - 27.4 实现 recordReview() 方法
  - 27.5 实现 getReviewHistory() 方法
  - 27.6 编写单元测试
  - 27.7 迁移调用方
  - 27.8 更新文档
```

### Phase 7: 重构 XiuyuanService（4-5 小时）

```
✅ 任务 28: 重构 XiuyuanService
  - 28.1 创建 CreateXiuyuanCommand
  - 28.2 创建 CreateXiuyuanUseCase
  - 28.3 创建 XiuyuanApplicationService
  - 28.4 实现 createFromBlocks() 方法
  - 28.5 实现模板管理方法
  - 28.6 编写单元测试
  - 28.7 迁移调用方
  - 28.8 更新文档
```

---

## 📊 工作量估算

| 阶段 | 任务 | 预计时间 | 优先级 |
|------|------|----------|--------|
| Phase 4 | 清理废弃代码 | 1-2 小时 | 🔴 高 |
| Phase 5 | 扩展 CardApplicationService | 2-3 小时 | 🔴 高 |
| Phase 6 | 创建 ReviewApplicationService | 3-4 小时 | 🟡 中 |
| Phase 7 | 重构 XiuyuanService | 4-5 小时 | 🟡 中 |
| Phase 8 | 迁移其他服务 | 6-8 小时 | 🟢 低 |
| **总计** | | **16-22 小时** | |

---

## 🎯 建议

### 立即行动

1. **完成 Phase 4**：清理废弃代码
   - 这是最简单的任务
   - 可以立即减少技术债务
   - 为后续工作铺平道路

2. **完成 Phase 5**：扩展 CardApplicationService
   - 提供基础的卡片查询方法
   - 让其他服务可以通过应用层访问数据
   - 减少直接访问 Storage 的代码

### 渐进式迁移

3. **按需迁移**：不需要一次性完成所有迁移
   - 优先迁移经常修改的代码
   - 保持系统稳定运行
   - 逐步改善架构

4. **保持向后兼容**：在迁移过程中
   - 保留旧方法但标记为 @deprecated
   - 逐步迁移调用方
   - 确认无调用后再删除

---

## 📝 总结

当前系统已经完成了核心的 DDD 化工作：
- ✅ 领域模型（聚合根、实体、值对象）
- ✅ 领域服务（CardScheduleService）
- ✅ 应用服务（CardApplicationService）
- ✅ 用例（CreateCard, DeleteCard, UpdateCard）
- ✅ 仓储模式（XiuyuanRepository）
- ✅ 领域事件（EventBus）

但仍有大量代码直接访问 Storage，需要逐步迁移到新架构。

**建议的迁移策略**：
1. 先完成 Phase 4 和 Phase 5（高优先级，3-5 小时）
2. 根据实际需求决定是否继续 Phase 6-8
3. 保持渐进式迁移，不影响系统稳定性

这样可以在保持系统稳定的前提下，逐步改善架构设计！🚀
