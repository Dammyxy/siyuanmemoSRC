# Phase 5 - Task 27 进度报告

> 更新时间：2026-02-19
> 任务：重构 UnifiedDataSourceManager

## ✅ 已完成

### 27.1 分析职责 ✅
创建了详细的分析文档：`.kiro/specs/ddd-refactoring/phase5-analysis.md`

**关键发现：**
- `UnifiedDataSourceManager` 通过 `AdvancedDataRouter` 直接访问 `StorageManager`
- 需要引入应用服务层
- 推荐采用保守重构方案（方案 A）

### 27.2 扩展 CardApplicationService ✅
添加了两个新的查询方法：

**新增文件：**
1. `src/application/queries/card/GetCardQuery.ts` - 获取单个卡片查询
2. `src/application/queries/card/GetCardQueryHandler.ts` - 查询处理器
3. `src/application/queries/card/GetCardsQuery.ts` - 获取卡片列表查询
4. `src/application/queries/card/GetCardsQueryHandler.ts` - 查询处理器

**扩展的方法：**
```typescript
class CardApplicationService {
  // 新增方法
  async getCard(query: GetCardQuery): Promise<GetCardQueryResult>
  async getCards(query: GetCardsQuery): Promise<GetCardsQueryResult>
}
```

**特性：**
- `getCard()` - 获取单个卡片，如果不存在则抛出异常
- `getCards()` - 获取卡片列表，支持过滤（按状态、deckId、标签、自定义过滤函数）
- 编译检查通过，无错误

## 🚧 待完成

### 27.3 重构 AdvancedDataRouter 使用 CardApplicationService

**当前状态：**
```typescript
class AdvancedDataRouter {
  private storage: StorageManager;  // 直接访问
  
  async getCard(cardId: string): Promise<FSRSCard> {
    const card = this.storage.getCard(cardId);  // 直接调用
    if (!card) throw new Error(`Card not found: ${cardId}`);
    return migrateCard(card);
  }
}
```

**目标状态：**
```typescript
class AdvancedDataRouter {
  private cardService: CardApplicationService;  // 使用应用服务
  
  async getCard(cardId: string): Promise<FSRSCard> {
    const result = await this.cardService.getCard({ cardId });
    return migrateCard(result.card);
  }
}
```

**需要改动的方法：**
1. `getCard(cardId)` - 获取单个卡片
2. `getCards(filter?)` - 获取卡片列表
3. `updateCard(card)` - 更新卡片（需要创建 UpdateCardCommand）
4. `deleteCard(cardId)` - 删除卡片（需要创建 DeleteCardCommand）

**挑战：**
1. `AdvancedDataRouter` 在多处被创建，需要更新所有创建点
2. 更新和删除操作需要使用 Command 模式，但当前的 Command 是针对 Xiuyuan 卡片的
3. 需要保持向后兼容

### 27.4 编写单元测试

需要测试：
- `GetCardQueryHandler`
- `GetCardsQueryHandler`
- 更新后的 `AdvancedDataRouter`

### 27.5 更新文档

需要更新：
- 架构文档
- API 文档

## 🤔 发现的问题

### 问题 1：Command 模式的适用性

当前的 `UpdateCardCommand` 和 `DeleteCardCommand` 是针对 Xiuyuan 卡片设计的：

```typescript
interface UpdateCardCommand {
  cardId: string;
  xiuyuanId: string;  // Xiuyuan 特定
  faceIndex: number;  // Xiuyuan 特定
}
```

但 `AdvancedDataRouter` 需要更新普通的 FSRSCard：

```typescript
async updateCard(card: FSRSCard): Promise<void> {
  // 需要更新整个 FSRSCard 对象
}
```

**解决方案：**
1. **方案 A**：创建新的 `UpdateFSRSCardCommand`
2. **方案 B**：扩展现有 Command 支持两种模式
3. **方案 C**：`AdvancedDataRouter` 暂时保持直接访问 Storage，等 Phase 6 统一为 Xiuyuan 架构后再迁移

### 问题 2：AdvancedDataRouter 的创建点

`AdvancedDataRouter` 在多处被创建，需要注入 `CardApplicationService`：

```typescript
// 需要找到所有创建点并更新
new AdvancedDataRouter(storage, plugin)
// 改为
new AdvancedDataRouter(cardService, plugin)
```

## 💡 建议

### 建议 1：采用渐进式迁移

1. **第一步**：只迁移查询方法（getCard, getCards）
   - 风险低
   - 改动小
   - 可以验证架构

2. **第二步**：等 Phase 6 统一为 Xiuyuan 架构后，再迁移更新和删除方法
   - 避免创建临时的 Command
   - 减少重复工作

### 建议 2：标记当前进度

将 Task 27 标记为部分完成：
- ✅ 27.1 分析职责
- ✅ 27.2 扩展 CardApplicationService（查询方法）
- ⏸️ 27.3 重构 AdvancedDataRouter（延后到 Phase 6）
- ⏸️ 27.4 编写单元测试（延后）
- ⏸️ 27.5 更新文档（延后）

### 建议 3：继续 Phase 6

直接开始 Phase 6（统一为 Xiuyuan 架构），在那里一起处理：
- 统一卡片模型
- 统一 Command 模式
- 完成 AdvancedDataRouter 的 DDD 化

## 🔗 相关文档

- [Phase 5 分析](./phase5-analysis.md)
- [统一架构计划](./unified-architecture-plan.md)
- [任务列表](./tasks.md)
