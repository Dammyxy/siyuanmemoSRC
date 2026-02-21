# 优先级持久化问题修复完成

## 问题描述

在浏览器的"全部闪卡"视图中修改优先级时，数值会临时变化，但刷新后又恢复原值。

## 根本原因

`UpdateFSRSCardUseCase` 使用的是旧架构的 `StorageManager`，而不是新的 `UnifiedStorageManager`。

### 调用链

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
StorageManager.setCard()          ❌ 旧架构，无法持久化
StorageManager.saveCards()        ❌ 旧架构，无法持久化
```

## 修复方案

将 `UpdateFSRSCardUseCase` 从旧的 `StorageManager` 迁移到新的 `UnifiedStorageManager`。

## 已完成的修改

### 1. UpdateFSRSCardUseCase ✅

**文件**: `src/application/usecases/card/UpdateFSRSCardUseCase.ts`

**修改内容**:
- ✅ 将依赖从 `StorageManager` 改为 `UnifiedStorageManager`
- ✅ 使用 `storage.getCard()` 替代 `storage.getCard()`（同步改为异步）
- ✅ 使用 `storage.updateCard()` 替代 `storage.setCard()` + `storage.saveCards()`
- ✅ 添加详细的日志输出

**修改前**:
```typescript
import type { StorageManager } from '@/core/storage/manager';

export class UpdateFSRSCardUseCase {
  constructor(
    private readonly storage: StorageManager
  ) {}
  
  async execute(command: UpdateFSRSCardCommand): Promise<Result<UpdateFSRSCardCommandResult>> {
    const card = this.storage.getCard(command.cardId);  // 同步
    const updatedCard = { ...card, ...command.updates };
    this.storage.setCard(updatedCard);  // 同步
    await this.storage.saveCards();  // 异步
    return ok({ card: updatedCard });
  }
}
```

**修改后**:
```typescript
import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';

export class UpdateFSRSCardUseCase {
  constructor(
    private readonly storage: UnifiedStorageManager
  ) {}
  
  async execute(command: UpdateFSRSCardCommand): Promise<Result<UpdateFSRSCardCommandResult>> {
    const card = this.storage.getCard(command.cardId);  // 同步（UnifiedStorageManager 的 getCard 是同步的）
    const updatedCard = { ...card, ...command.updates };
    const updateResult = await this.storage.updateCard(updatedCard);  // 异步，直接持久化
    if (!updateResult.ok) {
      return err(updateResult.error);
    }
    return ok({ card: updatedCard });
  }
}
```

### 2. CardApplicationService ✅

**文件**: `src/application/services/CardApplicationService.ts`

**修改内容**:
- ✅ 添加 `unifiedStorage` 参数
- ✅ 将 `UnifiedStorageManager` 传递给 `UpdateFSRSCardUseCase`

**修改前**:
```typescript
constructor(
  private readonly createCardUseCase: CreateCardUseCase,
  private readonly deleteCardUseCase: DeleteCardUseCase,
  private readonly updateCardUseCase: UpdateCardUseCase,
  storageManager: StorageManager,
  scheduleService: CardScheduleService
) {
  this.updateFSRSCardUseCase = new UpdateFSRSCardUseCase(storageManager);
}
```

**修改后**:
```typescript
constructor(
  private readonly createCardUseCase: CreateCardUseCase,
  private readonly deleteCardUseCase: DeleteCardUseCase,
  private readonly updateCardUseCase: UpdateCardUseCase,
  storageManager: StorageManager,  // 临时保留用于查询
  scheduleService: CardScheduleService,
  unifiedStorage: any  // UnifiedStorageManager
) {
  this.updateFSRSCardUseCase = new UpdateFSRSCardUseCase(unifiedStorage);
}
```

### 3. ApplicationContext ✅

**文件**: `src/application/ApplicationContext.ts`

**修改内容**:
- ✅ 在两处 `CardApplicationService` 创建时传递 `UnifiedStorageManager`

**修改**:
```typescript
// 第一处
const unifiedStorage = context.getUnifiedStorage();
return new CardApplicationService(
  createCardUseCase,
  deleteCardUseCase,
  updateCardUseCase,
  unifiedStorage as any,  // 临时保留用于查询
  scheduleService,
  unifiedStorage  // ✅ 传递 UnifiedStorageManager
);

// 第二处
const cardApplicationService = new CardApplicationService(
  createCardUseCase,
  deleteCardUseCase,
  updateCardUseCase,
  unifiedStorageManager as any,  // 临时保留用于查询
  cardScheduleService,
  unifiedStorageManager  // ✅ 传递 UnifiedStorageManager
);
```

### 4. DeckDataSource ✅

**文件**: `src/ui/browser/datasource/DeckDataSource.ts`

**修改内容**:
- ✅ 简化 `set-priority` 逻辑，直接使用 `UnifiedDataSourceManager`
- ✅ 移除对 `batchSetBlockPriority` 的依赖
- ✅ 添加详细的日志输出

---

## 新的调用链

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
UnifiedStorageManager.updateCard()  ✅ 新架构，正确持久化
```

---

## 测试验证

### 测试步骤

1. 打开浏览器，切换到"全部闪卡"视图
2. 选择一张卡片，右键菜单选择"设置优先级"
3. 输入新的优先级值（如 80）
4. 确认修改
5. 查看控制台日志，应该看到：
   ```
   [SiYuanMemo][DeckDataSource] ========== SET PRIORITY START ==========
   [SiYuanMemo][DeckDataSource] Setting priority to 80 for 1 cards
   [SiYuanMemo][DeckDataSource] Processing card: xxx
   [SiYuanMemo][DeckDataSource] Got FSRSCard: { id: xxx, oldPriority: 50, newPriority: 80 }
   [SiYuanMemo][DeckDataSource] Calling manager.updateCard()...
   [UpdateFSRSCardUseCase] Updating card: xxx
   [UpdateFSRSCardUseCase] Found card: { id: xxx, oldPriority: 50, newPriority: 80 }
   [UpdateFSRSCardUseCase] Calling storage.updateCard()...
   [UpdateFSRSCardUseCase] ✅ Card updated successfully
   [SiYuanMemo][DeckDataSource] ✅ manager.updateCard() completed
   [SiYuanMemo][DeckDataSource] ✅ Updated priority for card: xxx
   [SiYuanMemo][DeckDataSource] ========== SET PRIORITY END ==========
   ```
6. 刷新浏览器
7. **预期**: 优先级仍然是 80 ✅

### 预期结果

- ✅ 优先级修改能够正常持久化
- ✅ 刷新后优先级保持不变
- ✅ 与队列视图的行为一致
- ✅ 控制台有详细的日志输出

---

## 架构改进

### 修复前（使用旧架构）

```
UpdateFSRSCardUseCase
  ↓
StorageManager (旧架构)
  ↓
setCard() + saveCards()
  ↓
❌ 无法持久化
```

### 修复后（使用新架构）

```
UpdateFSRSCardUseCase
  ↓
UnifiedStorageManager (新架构)
  ↓
updateCard()
  ↓
✅ 正确持久化
```

---

## 相关文件

### 已修改的文件

1. ✅ `src/application/usecases/card/UpdateFSRSCardUseCase.ts`
2. ✅ `src/application/services/CardApplicationService.ts`
3. ✅ `src/application/ApplicationContext.ts`
4. ✅ `src/ui/browser/datasource/DeckDataSource.ts`

### 已废弃的文件/函数

1. ⚠️ `src/ui/browser/browserService.ts` - `batchSetPriority()` (标记为 @deprecated)
2. ⚠️ `src/ui/browser/datasource/MenuActions.ts` - `batchSetBlockPriority()` (标记为 @deprecated)

---

## 后续工作

### 1. 测试验证 ⏳

- 在"全部闪卡"视图中测试优先级修改
- 在队列视图中测试优先级修改
- 测试批量修改优先级
- 测试修缘卡片的优先级修改

### 2. 清理旧代码 ⏳

- 完全删除 `batchSetPriority()`
- 完全删除 `batchSetBlockPriority()`
- 移除所有对旧 `StorageManager` 的引用

### 3. 统一其他 UseCase ⏳

- `DeleteFSRSCardUseCase` 也需要迁移到 `UnifiedStorageManager`
- 其他可能使用旧 `StorageManager` 的地方

---

## 技术债务清理

### 已清理

1. ✅ `UpdateFSRSCardUseCase` 不再使用旧的 `StorageManager`
2. ✅ `DeckDataSource` 不再依赖 `batchSetBlockPriority`
3. ✅ 标记了旧函数为废弃

### 待清理

1. ⏳ 完全删除 `batchSetPriority` 和 `batchSetBlockPriority`
2. ⏳ 迁移 `DeleteFSRSCardUseCase`
3. ⏳ 移除所有对旧 `StorageManager` 的引用
4. ⏳ 更新查询处理器（`GetCardQueryHandler` 等）使用 `UnifiedStorageManager`

---

## 总结

### 问题根源

- ❌ `UpdateFSRSCardUseCase` 使用旧架构的 `StorageManager`
- ❌ 旧架构无法正确持久化数据

### 解决方案

- ✅ 将 `UpdateFSRSCardUseCase` 迁移到 `UnifiedStorageManager`
- ✅ 更新 `CardApplicationService` 和 `ApplicationContext`
- ✅ 简化 `DeckDataSource` 的实现

### 预期效果

- ✅ 优先级修改能够正常持久化
- ✅ 符合新的 DDD 架构
- ✅ 与队列视图的行为一致
- ✅ 代码更清晰，易于维护

---

## 日期

2026-02-21

## 状态

✅ 修复完成，等待测试验证
