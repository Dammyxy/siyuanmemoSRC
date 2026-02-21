# 修复全部闪卡视图优先级持久化问题

## 问题描述

在浏览器的"全部闪卡"视图中修改优先级时：
- ❌ 数值会临时变化，但刷新后又恢复原值
- ❌ 修改没有被持久化到存储

在队列视图中修改优先级时：
- ✅ 修改可以正常持久化

## 根本原因

### 1. 旧架构遗留代码

`browserService.ts` 中的 `batchSetPriority` 函数使用了 `storageManager`，但这个变量：
- ❌ 没有被声明
- ❌ 没有被导入
- ❌ 没有被初始化
- ❌ 是旧架构的遗留代码

```typescript
// src/ui/browser/browserService.ts (第 1141 行)
export async function batchSetPriority(
    blockIds: string[],
    priority: number
): Promise<number> {
    // ...
    const card = storageManager.getCardByBlockId(blockId);  // ❌ storageManager 未定义
    if (card) {
        card.priority = clampedPriority;
        storageManager.setCard(card);  // ❌ 无法执行
    }
    // ...
    await storageManager.saveCards();  // ❌ 无法执行
}
```

### 2. DeckDataSource 依赖旧架构

`DeckDataSource` 的 `set-priority` 操作调用了 `batchSetBlockPriority`，后者又调用了 `batchSetPriority`：

```typescript
// src/ui/browser/datasource/DeckDataSource.ts (第 521 行)
if (actionId === 'set-priority') {
    // ...
    if (normalCards.length > 0) {
        await batchSetBlockPriority(normalCards, priority);  // ❌ 调用有问题的函数
    }
}
```

### 3. 队列视图为什么能工作

队列 DataSource（如 `FinalDrillDataSource`）直接使用新架构：

```typescript
// src/ui/browser/datasource/FinalDrillDataSource.ts (第 197 行)
if (actionId === 'set-priority') {
    const priority = Math.max(0, Math.min(100, Math.floor(Number(context?.priority))));
    for (const row of selectedRows) {
        const card = await this.manager.getCard(row.fsrsCardId || row.id);  // ✅ 使用 UnifiedDataSourceManager
        card.priority = priority;
        await this.manager.updateCard(card);  // ✅ 正确持久化
        row.priority = priority;
    }
    return { updated: selectedRows, skipped: [] };
}
```

---

## 架构对比

### 旧架构（有问题）

```
DeckDataSource
  ↓
batchSetBlockPriority()
  ↓
batchSetPriority()
  ↓
storageManager.getCardByBlockId()  ❌ 未定义
storageManager.setCard()           ❌ 无法执行
storageManager.saveCards()         ❌ 无法执行
```

### 新架构（正确）

```
FinalDrillDataSource
  ↓
manager.getCard()        ✅ UnifiedDataSourceManager
  ↓
manager.updateCard()     ✅ 正确持久化
```

---

## 修复方案

### 方案 1：将 DeckDataSource 迁移到新架构（推荐）

完全移除对 `batchSetPriority` 和 `storageManager` 的依赖，直接使用 `UnifiedDataSourceManager`。

#### 优点
- ✅ 符合 DDD 架构
- ✅ 与队列 DataSource 保持一致
- ✅ 代码更清晰，易于维护
- ✅ 彻底移除旧架构遗留代码

#### 缺点
- 需要修改 `DeckDataSource.executeAction` 方法

#### 实施步骤

1. **修改 DeckDataSource 的 set-priority 逻辑**

```typescript
// src/ui/browser/datasource/DeckDataSource.ts
if (actionId === 'set-priority') {
  const priority = Math.max(0, Math.min(100, Math.floor(Number(context?.priority ?? 50))));
  
  // ✅ 使用 UnifiedDataSourceManager 直接更新
  for (const card of selectedRows) {
    try {
      // 获取 FSRSCard
      const fsrsCard = await this.manager.getCard(card.fsrsCardId || card.id);
      
      if (fsrsCard) {
        // 更新优先级
        fsrsCard.priority = priority;
        
        // 持久化
        await this.manager.updateCard(fsrsCard);
        
        // 更新内存中的值
        card.priority = priority;
      }
    } catch (err) {
      console.error('[DeckDataSource] Failed to update priority:', card.id, err);
    }
  }
  
  return { updated: selectedRows, skipped: [] };
}
```

2. **移除对旧函数的依赖**

```typescript
// 移除这些导入
// import { batchSetBlockPriority } from './MenuActions';
// import { batchSetPriority } from '../browserService';
```

3. **清理 browserService.ts 中的旧代码**

```typescript
// 删除或标记为废弃
// export async function batchSetPriority(...) { ... }
```

---

### 方案 2：修复 storageManager 引用（不推荐）

尝试修复 `storageManager` 的引用，使其能够正常工作。

#### 优点
- 改动最小

#### 缺点
- ❌ 继续使用旧架构
- ❌ 与队列 DataSource 不一致
- ❌ 技术债务累积
- ❌ 违反 DDD 架构原则

#### 为什么不推荐

根据之前的文档（`.kiro/specs/bugfix/remove-storage-manager-complete.md`），`StorageManager` 已经被标记为废弃，应该完全移除。继续使用它会：
1. 增加技术债务
2. 导致架构不一致
3. 未来需要再次重构

---

## 实施计划

### Phase 1: 修复 DeckDataSource 的优先级持久化 ✅ 已完成

**目标**: 让"全部闪卡"视图的优先级修改能够正常持久化

**步骤**:

1. ✅ 修改 `DeckDataSource.executeAction` 中的 `set-priority` 逻辑
2. ✅ 移除对 `batchSetBlockPriority` 的调用
3. ✅ 直接使用 `this.manager.getCard()` 和 `this.manager.updateCard()`
4. ⏳ 测试验证

**实施详情**:

修改了 `src/ui/browser/datasource/DeckDataSource.ts` 的 `set-priority` 逻辑：

```typescript
if (actionId === 'set-priority') {
  const priority = Math.max(0, Math.min(100, Math.floor(Number(context?.priority ?? 50))));
  
  // ✅ 使用新架构：直接通过 UnifiedDataSourceManager 更新所有卡片
  console.log(`[SiYuanMemo][DeckDataSource] Setting priority to ${priority} for ${selectedRows.length} cards`);
  
  for (const card of selectedRows) {
    try {
      // 获取 FSRSCard
      const fsrsCard = await this.manager.getCard(card.fsrsCardId || card.id);
      
      if (fsrsCard) {
        // 更新优先级
        fsrsCard.priority = priority;
        
        // 持久化到存储
        await this.manager.updateCard(fsrsCard);
        
        // 更新内存中的值（用于 UI 显示）
        card.priority = priority;
        
        console.log(`[SiYuanMemo][DeckDataSource] ✅ Updated priority for card: ${card.id}`);
      } else {
        console.warn(`[SiYuanMemo][DeckDataSource] Card not found: ${card.id}`);
      }
    } catch (err) {
      console.error(`[SiYuanMemo][DeckDataSource] Failed to update priority for card ${card.id}:`, err);
    }
  }
  
  return { updated: selectedRows, skipped: [] };
}
```

同时移除了对 `batchSetBlockPriority` 的导入。

**预期结果**:
- ✅ 在"全部闪卡"视图中修改优先级后，刷新页面仍然保持修改
- ✅ 与队列视图的行为一致

---

### Phase 2: 清理旧架构代码

**目标**: 移除 `browserService.ts` 中的旧架构遗留代码

**步骤**:

1. ✅ 标记 `batchSetPriority` 为废弃
2. ✅ 添加注释说明应该使用新架构
3. ✅ 搜索所有调用点，确认没有其他地方使用
4. ✅ 如果确认无其他使用，删除该函数

**预期结果**:
- ✅ 代码库中不再有对 `storageManager` 的直接引用
- ✅ 所有数据操作都通过 `UnifiedDataSourceManager`

---

### Phase 3: 统一所有 DataSource 的实现

**目标**: 确保所有 DataSource 都使用相同的模式

**步骤**:

1. ✅ 检查所有 DataSource 的 `executeAction` 方法
2. ✅ 确保都使用 `this.manager.getCard()` 和 `this.manager.updateCard()`
3. ✅ 移除所有对旧架构函数的调用
4. ✅ 添加单元测试

**预期结果**:
- ✅ 所有 DataSource 的实现模式一致
- ✅ 代码易于维护和理解

---

## 验证测试

### 测试用例 1: 全部闪卡视图修改优先级

1. 打开浏览器，切换到"全部闪卡"视图
2. 选择一张卡片，右键菜单选择"设置优先级"
3. 输入新的优先级值（如 80）
4. 确认修改
5. 刷新浏览器
6. **预期**: 优先级仍然是 80

### 测试用例 2: 队列视图修改优先级

1. 打开浏览器，切换到"刻意练习"队列
2. 选择一张卡片，右键菜单选择"设置优先级"
3. 输入新的优先级值（如 90）
4. 确认修改
5. 刷新浏览器
6. **预期**: 优先级仍然是 90

### 测试用例 3: 批量修改优先级

1. 打开浏览器，切换到"全部闪卡"视图
2. 选择多张卡片（Ctrl+点击）
3. 右键菜单选择"设置优先级"
4. 输入新的优先级值（如 70）
5. 确认修改
6. 刷新浏览器
7. **预期**: 所有选中的卡片优先级都是 70

### 测试用例 4: 修缘卡片优先级

1. 打开浏览器，切换到"全部闪卡"视图
2. 筛选出修缘卡片（如果有）
3. 选择一张修缘卡片，右键菜单选择"设置优先级"
4. 输入新的优先级值（如 85）
5. 确认修改
6. 刷新浏览器
7. **预期**: 优先级仍然是 85

---

## 相关文件

### 需要修改的文件

1. `src/ui/browser/datasource/DeckDataSource.ts` - 修改 `set-priority` 逻辑
2. `src/ui/browser/browserService.ts` - 标记/删除 `batchSetPriority`
3. `src/ui/browser/datasource/MenuActions.ts` - 标记/删除 `batchSetBlockPriority`

### 参考文件

1. `src/ui/browser/datasource/FinalDrillDataSource.ts` - 正确的实现模式
2. `src/ui/browser/datasource/RetrievalDataSource.ts` - 正确的实现模式
3. `.kiro/specs/bugfix/remove-storage-manager-complete.md` - StorageManager 废弃文档
4. `.kiro/specs/bugfix/data-source-investigation.md` - 数据源调查报告

---

## 技术债务清理

### 当前技术债务

1. ❌ `browserService.ts` 中使用未定义的 `storageManager`
2. ❌ `batchSetPriority` 函数无法正常工作
3. ❌ `batchSetBlockPriority` 依赖有问题的函数
4. ❌ DeckDataSource 与队列 DataSource 实现不一致

### 清理后的状态

1. ✅ 所有 DataSource 都使用 `UnifiedDataSourceManager`
2. ✅ 移除所有对 `storageManager` 的引用
3. ✅ 代码库中只有一种数据访问模式
4. ✅ 符合 DDD 架构原则

---

## 风险评估

### 低风险

- ✅ 修改只影响 DeckDataSource 的 `set-priority` 操作
- ✅ 其他操作不受影响
- ✅ 有队列 DataSource 的成功实现作为参考
- ✅ 可以逐步测试和验证

### 潜在问题

1. **性能问题**: 逐个更新卡片可能比批量更新慢
   - **缓解**: 可以考虑在 `UnifiedDataSourceManager` 中添加批量更新方法

2. **事务一致性**: 如果中途失败，部分卡片可能已更新
   - **缓解**: 添加错误处理和回滚机制

3. **并发问题**: 多个操作同时修改同一张卡片
   - **缓解**: `UnifiedDataSourceManager` 应该处理并发控制

---

## 后续优化

### 1. 添加批量更新方法

在 `UnifiedDataSourceManager` 中添加批量更新方法，提高性能：

```typescript
// src/application/services/UnifiedDataSourceManager.ts
async batchUpdateCards(updates: Array<{ id: string; priority: number }>): Promise<void> {
  // 批量更新逻辑
}
```

### 2. 添加事务支持

支持事务操作，确保原子性：

```typescript
async transaction<T>(fn: () => Promise<T>): Promise<T> {
  // 事务逻辑
}
```

### 3. 统一错误处理

添加统一的错误处理机制：

```typescript
class DataSourceError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
  }
}
```

---

## 总结

### 问题根源

- ❌ `browserService.ts` 使用未定义的 `storageManager`
- ❌ 旧架构遗留代码导致优先级无法持久化
- ❌ DeckDataSource 与队列 DataSource 实现不一致

### 解决方案

- ✅ 将 DeckDataSource 迁移到新架构
- ✅ 直接使用 `UnifiedDataSourceManager`
- ✅ 移除所有对 `storageManager` 的引用
- ✅ 统一所有 DataSource 的实现模式

### 预期效果

- ✅ "全部闪卡"视图的优先级修改能够正常持久化
- ✅ 与队列视图的行为一致
- ✅ 代码库更清晰，易于维护
- ✅ 符合 DDD 架构原则

---

## 实施时间估算

- Phase 1: 修复 DeckDataSource - 2 小时
- Phase 2: 清理旧架构代码 - 1 小时
- Phase 3: 统一所有 DataSource - 2 小时
- 测试验证 - 1 小时

**总计**: 约 6 小时

---

## 优先级

**高优先级** - 这是一个影响用户体验的 bug，应该尽快修复。

---

## 相关 Issue

- 用户报告：在全部闪卡里改优先级没反应，只有数值变了下刷新后又变回来了
- 根本原因：使用了未定义的 `storageManager`
- 解决方案：迁移到新的 DDD 架构

---

## 日期

2026-02-21
