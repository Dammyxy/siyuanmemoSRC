# 从 FSRS 卡片操作中移除 StorageManager

## 问题描述

优先级修改无法持久化的根本原因：整个调用链都在使用旧架构的 `StorageManager`，而不是新的 DDD 架构。

## 调用链分析

### 当前调用链（使用旧架构）

```
DeckDataSource.executeAction('set-priority')
  ↓
UnifiedDataSourceManager.updateCard()
  ↓
DataAccessFacade.updateCard()
  ↓
CardApplicationService.updateFSRSCard()
  ↓
UpdateFSRSCardUseCase.execute()
  ↓
StorageManager.setCard()          ❌ 旧架构
StorageManager.saveCards()        ❌ 旧架构
```

### 问题

1. ❌ `UpdateFSRSCardUseCase` 直接使用 `StorageManager`
2. ❌ `StorageManager` 是旧架构，已被标记为废弃
3. ❌ 数据没有通过 DDD 的 Repository 层持久化
4. ❌ 与修缘卡片的实现不一致（修缘卡片使用 `XiuyuanRepository`）

## 新架构应该是什么样的

### 理想的 DDD 架构

```
DeckDataSource.executeAction('set-priority')
  ↓
UnifiedDataSourceManager.updateCard()
  ↓
DataAccessFacade.updateCard()
  ↓
CardApplicationService.updateFSRSCard()
  ↓
UpdateFSRSCardUseCase.execute()
  ↓
FSRSCardRepository.save()        ✅ 新架构（需要创建）
  ↓
UnifiedStorageManager.saveCard() ✅ 统一存储层
```

### 关键组件

1. **FSRSCardRepository** - FSRS 卡片仓储（需要创建）
2. **UnifiedStorageManager** - 统一存储管理器（已存在）
3. **UpdateFSRSCardUseCase** - 更新用例（需要重构）

---

## 解决方案

### 方案 1：创建 FSRSCardRepository（推荐）

完全符合 DDD 架构，与 `XiuyuanRepository` 保持一致。

#### 优点
- ✅ 符合 DDD 架构原则
- ✅ 与修缘卡片的实现一致
- ✅ 易于测试和维护
- ✅ 清晰的职责分离

#### 缺点
- 需要创建新的 Repository 类
- 需要修改多个文件

#### 实施步骤

1. **创建 FSRSCardRepository**

```typescript
// src/core/card/infrastructure/FSRSCardRepository.ts

import { Result, ok, err } from '@/types/result';
import type { FSRSCard } from '@/types/card';
import type { UnifiedStorageManager } from '@/application/services/UnifiedStorageManager';

/**
 * FSRS 卡片仓储
 * 
 * 负责 FSRS 卡片的持久化操作
 */
export class FSRSCardRepository {
  constructor(
    private readonly storage: UnifiedStorageManager
  ) {}
  
  /**
   * 根据 ID 查找卡片
   */
  async findById(cardId: string): Promise<Result<FSRSCard | null>> {
    try {
      const card = await this.storage.getCard(cardId);
      return ok(card);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  /**
   * 保存卡片
   */
  async save(card: FSRSCard): Promise<Result<void>> {
    try {
      await this.storage.saveCard(card);
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  /**
   * 删除卡片
   */
  async delete(cardId: string): Promise<Result<void>> {
    try {
      await this.storage.deleteCard(cardId);
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  /**
   * 批量保存卡片
   */
  async saveMany(cards: FSRSCard[]): Promise<Result<void>> {
    try {
      await this.storage.saveCards(cards);
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
```

2. **修改 UpdateFSRSCardUseCase**

```typescript
// src/application/usecases/card/UpdateFSRSCardUseCase.ts

import type { FSRSCard } from '@/types';
import { ok, err, type Result } from '@/types/result';
import type { UpdateFSRSCardCommand, UpdateFSRSCardCommandResult } from '@/application/commands/card/UpdateFSRSCardCommand';
import type { FSRSCardRepository } from '@/core/card/infrastructure/FSRSCardRepository';

/**
 * 更新 FSRS 卡片用例
 */
export class UpdateFSRSCardUseCase {
  constructor(
    private readonly repository: FSRSCardRepository
  ) {}
  
  /**
   * 执行更新操作
   */
  async execute(command: UpdateFSRSCardCommand): Promise<Result<UpdateFSRSCardCommandResult>> {
    try {
      // 1. 获取卡片
      const cardResult = await this.repository.findById(command.cardId);
      if (!cardResult.ok) {
        return err(cardResult.error);
      }
      
      const card = cardResult.value;
      if (!card) {
        return err(new Error(`Card not found: ${command.cardId}`));
      }
      
      // 2. 应用更新（合并字段）
      const updatedCard: FSRSCard = {
        ...card,
        ...command.updates
      };
      
      // 3. 保存到仓储
      const saveResult = await this.repository.save(updatedCard);
      if (!saveResult.ok) {
        return err(saveResult.error);
      }
      
      console.log('[UpdateFSRSCardUseCase] Card updated:', command.cardId);
      
      return ok({
        card: updatedCard
      });
    } catch (error) {
      console.error('[UpdateFSRSCardUseCase] Failed to update card:', error);
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
```

3. **修改 CardApplicationService**

```typescript
// src/application/services/CardApplicationService.ts

constructor(
  private readonly createCardUseCase: CreateCardUseCase,
  private readonly deleteCardUseCase: DeleteCardUseCase,
  private readonly updateCardUseCase: UpdateCardUseCase,
  storageManager: StorageManager,  // ⚠️ 保留用于查询（临时）
  scheduleService: CardScheduleService,
  private readonly fsrsCardRepository: FSRSCardRepository  // ✅ 新增
) {
  this.storage = storageManager;
  // 初始化查询处理器
  this.getDueCardsQueryHandler = new GetDueCardsQueryHandler(
    storageManager,
    scheduleService
  );
  this.getCardQueryHandler = new GetCardQueryHandler(storageManager);
  this.getCardsQueryHandler = new GetCardsQueryHandler(storageManager);
  
  // ✅ 使用 FSRSCardRepository 初始化用例
  this.updateFSRSCardUseCase = new UpdateFSRSCardUseCase(fsrsCardRepository);
  this.deleteFSRSCardUseCase = new DeleteFSRSCardUseCase(fsrsCardRepository);
}
```

4. **修改 ApplicationContext**

```typescript
// src/application/ApplicationContext.ts

// 在 initializeServices 中
const fsrsCardRepository = new FSRSCardRepository(unifiedStorageManager);

const cardApplicationService = new CardApplicationService(
  createCardUseCase,
  deleteCardUseCase,
  updateCardUseCase,
  storageManager,  // 临时保留用于查询
  scheduleService,
  fsrsCardRepository  // ✅ 传入 FSRSCardRepository
);
```

---

### 方案 2：直接使用 UnifiedStorageManager（快速修复）

跳过 Repository 层，直接在 UseCase 中使用 `UnifiedStorageManager`。

#### 优点
- ✅ 修改最小
- ✅ 快速修复问题

#### 缺点
- ❌ 不符合 DDD 架构
- ❌ 与修缘卡片的实现不一致
- ❌ 违反分层原则

#### 实施步骤

1. **修改 UpdateFSRSCardUseCase**

```typescript
// src/application/usecases/card/UpdateFSRSCardUseCase.ts

import type { UnifiedStorageManager } from '@/application/services/UnifiedStorageManager';
import type { FSRSCard } from '@/types';
import { ok, err, type Result } from '@/types/result';
import type { UpdateFSRSCardCommand, UpdateFSRSCardCommandResult } from '@/application/commands/card/UpdateFSRSCardCommand';

/**
 * 更新 FSRS 卡片用例
 */
export class UpdateFSRSCardUseCase {
  constructor(
    private readonly storage: UnifiedStorageManager
  ) {}
  
  /**
   * 执行更新操作
   */
  async execute(command: UpdateFSRSCardCommand): Promise<Result<UpdateFSRSCardCommandResult>> {
    try {
      // 1. 获取卡片
      const card = await this.storage.getCard(command.cardId);
      if (!card) {
        return err(new Error(`Card not found: ${command.cardId}`));
      }
      
      // 2. 应用更新（合并字段）
      const updatedCard: FSRSCard = {
        ...card,
        ...command.updates
      };
      
      // 3. 保存到存储
      await this.storage.saveCard(updatedCard);
      
      console.log('[UpdateFSRSCardUseCase] Card updated:', command.cardId);
      
      return ok({
        card: updatedCard
      });
    } catch (error) {
      console.error('[UpdateFSRSCardUseCase] Failed to update card:', error);
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
```

2. **修改 CardApplicationService**

```typescript
// src/application/services/CardApplicationService.ts

constructor(
  private readonly createCardUseCase: CreateCardUseCase,
  private readonly deleteCardUseCase: DeleteCardUseCase,
  private readonly updateCardUseCase: UpdateCardUseCase,
  storageManager: StorageManager,  // ⚠️ 保留用于查询（临时）
  scheduleService: CardScheduleService,
  private readonly unifiedStorage: UnifiedStorageManager  // ✅ 新增
) {
  this.storage = storageManager;
  // 初始化查询处理器
  this.getDueCardsQueryHandler = new GetDueCardsQueryHandler(
    storageManager,
    scheduleService
  );
  this.getCardQueryHandler = new GetCardQueryHandler(storageManager);
  this.getCardsQueryHandler = new GetCardsQueryHandler(storageManager);
  
  // ✅ 使用 UnifiedStorageManager 初始化用例
  this.updateFSRSCardUseCase = new UpdateFSRSCardUseCase(unifiedStorage);
  this.deleteFSRSCardUseCase = new DeleteFSRSCardUseCase(unifiedStorage);
}
```

---

## 推荐方案

**推荐使用方案 1（创建 FSRSCardRepository）**，原因：

1. ✅ 符合 DDD 架构原则
2. ✅ 与修缘卡片的实现保持一致
3. ✅ 清晰的职责分离
4. ✅ 易于测试和维护
5. ✅ 为未来的扩展打好基础

虽然需要创建新的 Repository 类，但这是一次性的工作，而且会让整个架构更加清晰和一致。

---

## 实施计划

### Phase 1: 创建 FSRSCardRepository ✅

1. 创建 `src/core/card/infrastructure/FSRSCardRepository.ts`
2. 实现基本的 CRUD 方法
3. 添加单元测试

### Phase 2: 重构 UpdateFSRSCardUseCase ✅

1. 修改构造函数，接受 `FSRSCardRepository`
2. 使用 Repository 方法替代 `StorageManager`
3. 更新错误处理

### Phase 3: 重构 DeleteFSRSCardUseCase ✅

1. 修改构造函数，接受 `FSRSCardRepository`
2. 使用 Repository 方法替代 `StorageManager`

### Phase 4: 更新 CardApplicationService ✅

1. 添加 `FSRSCardRepository` 依赖
2. 传递给 UseCase

### Phase 5: 更新 ApplicationContext ✅

1. 创建 `FSRSCardRepository` 实例
2. 传递给 `CardApplicationService`

### Phase 6: 测试验证 ⏳

1. 测试优先级修改是否持久化
2. 测试其他 FSRS 卡片操作
3. 回归测试

### Phase 7: 清理旧代码 ⏳

1. 移除 `StorageManager` 的引用
2. 更新文档

---

## UnifiedStorageManager 需要的方法

检查 `UnifiedStorageManager` 是否有以下方法：

```typescript
interface UnifiedStorageManager {
  // 读取
  getCard(cardId: string): Promise<FSRSCard>;
  getCards(filter?: CardFilter): Promise<FSRSCard[]>;
  
  // 写入
  saveCard(card: FSRSCard): Promise<void>;
  saveCards(cards: FSRSCard[]): Promise<void>;
  
  // 删除
  deleteCard(cardId: string): Promise<void>;
  deleteCards(cardIds: string[]): Promise<void>;
}
```

如果没有这些方法，需要先在 `UnifiedStorageManager` 中实现它们。

---

## 相关文件

### 需要创建的文件

1. `src/core/card/infrastructure/FSRSCardRepository.ts` - FSRS 卡片仓储

### 需要修改的文件

1. `src/application/usecases/card/UpdateFSRSCardUseCase.ts` - 更新用例
2. `src/application/usecases/card/DeleteFSRSCardUseCase.ts` - 删除用例
3. `src/application/services/CardApplicationService.ts` - 应用服务
4. `src/application/ApplicationContext.ts` - 应用上下文

### 参考文件

1. `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts` - 修缘仓储（参考实现）
2. `src/core/xiuyuan/domain/repositories/IXiuyuanRepository.ts` - 仓储接口（参考）

---

## 风险评估

### 低风险

- ✅ 只影响 FSRS 卡片的更新和删除操作
- ✅ 有修缘卡片的成功实现作为参考
- ✅ 可以逐步测试和验证

### 潜在问题

1. **UnifiedStorageManager 方法缺失**
   - **缓解**: 先检查并实现缺失的方法

2. **性能问题**
   - **缓解**: Repository 层可以添加缓存

3. **数据一致性**
   - **缓解**: 使用事务或原子操作

---

## 后续优化

### 1. 统一所有卡片操作

将所有卡片操作（包括修缘卡片）统一到 `FSRSCardRepository`：

```typescript
// 统一的卡片仓储
class CardRepository {
  async save(card: FSRSCard): Promise<Result<void>> {
    if (card.id.startsWith('xy_card_')) {
      // 修缘卡片逻辑
    } else {
      // 普通 FSRS 卡片逻辑
    }
  }
}
```

### 2. 添加事务支持

```typescript
class FSRSCardRepository {
  async transaction<T>(fn: () => Promise<T>): Promise<Result<T>> {
    // 事务逻辑
  }
}
```

### 3. 添加缓存层

```typescript
class FSRSCardRepository {
  private cache: Map<string, FSRSCard> = new Map();
  
  async findById(cardId: string): Promise<Result<FSRSCard | null>> {
    // 先查缓存
    if (this.cache.has(cardId)) {
      return ok(this.cache.get(cardId)!);
    }
    // 再查存储
    const card = await this.storage.getCard(cardId);
    this.cache.set(cardId, card);
    return ok(card);
  }
}
```

---

## 总结

### 问题根源

- ❌ `UpdateFSRSCardUseCase` 使用旧架构的 `StorageManager`
- ❌ 没有通过 DDD 的 Repository 层持久化
- ❌ 与修缘卡片的实现不一致

### 解决方案

- ✅ 创建 `FSRSCardRepository`
- ✅ 重构 `UpdateFSRSCardUseCase` 和 `DeleteFSRSCardUseCase`
- ✅ 更新 `CardApplicationService` 和 `ApplicationContext`
- ✅ 完全移除对 `StorageManager` 的依赖

### 预期效果

- ✅ 优先级修改能够正常持久化
- ✅ 符合 DDD 架构原则
- ✅ 与修缘卡片的实现一致
- ✅ 代码更清晰，易于维护

---

## 日期

2026-02-21

## 状态

⏳ 待实施
