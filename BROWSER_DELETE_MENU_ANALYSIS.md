# 浏览器右键菜单删除功能分析报告

## 问题描述

用户报告：
1. 浏览器的右键菜单里**没有"删除卡片"功能**（完全删除卡片数据）
2. "从当前队列移除"功能**也没有了**

## 调查结果

### 1. "删除卡片"功能（完全删除）

**结论：确实没有实现**

- ✅ `browserService.ts` 中有 `batchDelete()` 函数（第946行）
- ❌ `MenuActions.ts` 的 `BASE_ACTIONS` 中**没有定义** `delete` 或 `delete-card` 操作
- ❌ 三个数据源（IncrementalLearning、Retrieval、FinalDrill）的 `getSupportedActions()` 都**没有返回删除操作**
- ❌ `SRSBrowser.vue` 的右键菜单中**没有添加删除选项**

**原因分析：**
- 删除卡片功能从未在浏览器右键菜单中实现
- 虽然底层有 `batchDelete()` 函数，但没有暴露到 UI 层

---

### 2. "从当前队列移除"功能

**结论：已实现，但可能存在问题**

#### 2.1 IncrementalLearningDataSource（渐进学习）

**状态：✅ 已实现**

```typescript
// src/ui/browser/datasource/IncrementalLearningDataSource.ts:337-345
getSupportedActions(): CardBrowserAction[] {
  return [
    {
      id: 'remove-from-current-queue',
      label: '从队列移除',
      icon: 'iconTrashcan',
    },
    // ... 其他操作
  ];
}

// 第363-370行
async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void> {
  if (actionId === 'remove-from-current-queue') {
    for (const row of selectedRows) {
      await queue.removeCard(row.fsrsCardId || row.id);
    }
    console.log(`[IncrementalLearningDataSource] Removed ${selectedRows.length} cards from queue`);
    return;
  }
  // ...
}
```

**实现方式：**
- 通过 `UnifiedDataSourceManager` 获取队列实例
- 调用 `queue.removeCard()` 方法移除卡片
- 使用 `fsrsCardId` 或 `id` 作为卡片标识

---

#### 2.2 RetrievalDataSource（提取练习）

**状态：✅ 已实现**

```typescript
// src/ui/browser/datasource/RetrievalDataSource.ts:115-121
getSupportedActions(): CardBrowserAction[] {
  return buildQueueActions({
    withInsert: true,
    withSort: false,
    withPriority: true,
    withTimeAdjust: true,
  });
}

// 第123-133行
async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void> {
  const q = (this.plugin as any)?.retrievalQueue;
  if (!q) return;

  // 从队列移除
  if (actionId === 'remove-from-current-queue') {
    await removeFromQueue(q, selectedRows);
    return;
  }
  // ...
}
```

**实现方式：**
- 通过 `buildQueueActions()` 构建操作列表（包含 `removeFromQueue`）
- 调用 `MenuActions.ts` 中的 `removeFromQueue()` 辅助函数

---

#### 2.3 FinalDrillDataSource（刻意练习）

**状态：✅ 已实现**

```typescript
// src/ui/browser/datasource/FinalDrillDataSource.ts:115-121
getSupportedActions(): CardBrowserAction[] {
  return buildQueueActions({
    withInsert: true,
    withSort: true,
    withPriority: true,
    withTimeAdjust: false,
  });
}

// 第123-133行
async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void> {
  const q = this.plugin?.finalDrillQueue;
  if (!q) return;

  // 从队列移除
  if (actionId === 'remove-from-current-queue') {
    await removeFromQueue(q, selectedRows);
    return;
  }
  // ...
}
```

**实现方式：**
- 与 RetrievalDataSource 相同

---

### 3. MenuActions.ts 中的定义

```typescript
// src/ui/browser/datasource/MenuActions.ts:23-27
export const BASE_ACTIONS = {
  open: { id: 'open', label: 'Open', icon: 'iconOpen' } as CardBrowserAction,
  removeFromQueue: {
    id: 'remove-from-current-queue',
    label: '从当前队列移除',
    icon: 'iconTrashcan',
    danger: true,
  } as CardBrowserAction,
  // ... 其他操作
};

// 第107-123行
export function buildQueueActions(options: {
  withInsert?: boolean;
  withSort?: boolean;
  withPriority?: boolean;
  withTimeAdjust?: boolean;
}): CardBrowserAction[] {
  const actions: CardBrowserAction[] = [
    BASE_ACTIONS.open,
    BASE_ACTIONS.removeFromQueue,  // ✅ 始终包含
  ];

  if (options.withInsert) {
    actions.push(BASE_ACTIONS.insertAt);
  }
  // ...
  
  return actions;
}
```

**结论：**
- `BASE_ACTIONS.removeFromQueue` 已定义
- `buildQueueActions()` 始终包含 `removeFromQueue` 操作

---

### 4. SRSBrowser.vue 中的处理

```typescript
// src/ui/browser/SRSBrowser.vue:878-885行
if (
  actionId === 'remove-from-queue'
  || actionId === 'remove-from-current-queue'
  || actionId === 'dismiss'
  || actionId === 'insert-at'
  || actionId === 'auto-sort'
  || actionId === 'reset'
  || actionId === 'suspend'
) {
  await loadData();  // ✅ 执行后会重新加载数据
}
```

**结论：**
- `handleAction()` 函数正确处理 `remove-from-current-queue` 操作
- 执行后会调用 `loadData()` 刷新表格

---

## 问题根源分析

### 问题1：删除卡片功能缺失

**根本原因：**
- 从未在浏览器右键菜单中实现"删除卡片"功能
- 虽然底层有 `batchDelete()` 函数，但没有暴露到 UI 层

**影响范围：**
- 所有队列的浏览器视图都无法删除卡片

---

### 问题2："从当前队列移除"功能消失

**可能原因：**

#### 原因A：数据源初始化失败
- 如果 `currentDataSource.value` 为 `null` 或 `undefined`
- `getSupportedActions()` 会返回空数组
- 右键菜单中不会显示任何操作

#### 原因B：队列实例获取失败
- IncrementalLearningDataSource：如果 `this.manager.getQueue()` 失败
- RetrievalDataSource/FinalDrillDataSource：如果 `this.plugin?.retrievalQueue` 为 `undefined`
- `performAction()` 会提前返回，不执行任何操作

#### 原因C：控制台日志被禁用
- 用户可能看不到右键菜单，但实际上功能已实现
- 需要检查控制台日志确认

---

## 验证步骤

### 验证1：检查数据源是否正确初始化

在浏览器控制台中运行：
```javascript
// 打开渐进学习队列的浏览器视图
// 右键点击任意卡片
// 查看控制台输出：
// [CardBrowser] 当前数据源: ...
// [CardBrowser] getSupportedActions 返回的动作数量: ...
```

**预期结果：**
- 数据源不为 `null`
- 动作数量 > 0
- 动作列表中包含 `remove-from-current-queue`

---

### 验证2：检查队列实例是否可用

在浏览器控制台中运行：
```javascript
// 对于渐进学习队列
const manager = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs')?.unifiedDataSourceManager;
const queue = manager?.getQueue('incremental-learning');
console.log('Queue:', queue);
console.log('Queue type:', queue?.constructor?.name);
```

**预期结果：**
- `queue` 不为 `undefined`
- `queue` 有 `removeCard()` 方法

---

## 修复方案

### 方案1：添加"删除卡片"功能

#### 步骤1：在 MenuActions.ts 中添加删除操作定义

```typescript
export const BASE_ACTIONS = {
  // ... 现有操作
  deleteCard: {
    id: 'delete-card',
    label: '删除卡片',
    icon: 'iconTrashcan',
    danger: true,
  } as CardBrowserAction,
};
```

#### 步骤2：在数据源中添加删除操作支持

```typescript
// IncrementalLearningDataSource.ts
getSupportedActions(): CardBrowserAction[] {
  return [
    // ... 现有操作
    {
      id: 'delete-card',
      label: '删除卡片',
      icon: 'iconTrashcan',
      danger: true,
    },
  ];
}

async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void> {
  // ... 现有代码
  
  // 删除卡片
  if (actionId === 'delete-card') {
    const blockIds = selectedRows.map(row => row.blockId);
    await batchDelete(blockIds);
    console.log(`[IncrementalLearningDataSource] Deleted ${selectedRows.length} cards`);
    return;
  }
}
```

#### 步骤3：在 SRSBrowser.vue 中添加确认对话框

```typescript
// 在 handleAction() 函数中添加
if (actionId === 'delete-card') {
  const ok = await confirmDialog({
    title: '删除卡片',
    content: `确定要删除 ${targetCards.length} 张卡片吗？此操作不可撤销。`,
    confirmText: '确认',
    cancelText: '取消',
  });
  if (!ok) return;
}
```

---

### 方案2：修复"从当前队列移除"功能（如果确实有问题）

#### 步骤1：添加详细的调试日志

在 `IncrementalLearningDataSource.performAction()` 中：
```typescript
async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void> {
  console.log('[IncrementalLearningDataSource] performAction called:', {
    actionId,
    selectedRowsCount: selectedRows.length,
    selectedRowIds: selectedRows.map(r => r.id),
  });
  
  if (actionId === 'remove-from-current-queue') {
    const queue = this.manager.getQueue(QueueType.IncrementalLearning);
    console.log('[IncrementalLearningDataSource] Queue instance:', queue);
    
    for (const row of selectedRows) {
      const cardId = row.fsrsCardId || row.id;
      console.log('[IncrementalLearningDataSource] Removing card:', cardId);
      await queue.removeCard(cardId);
    }
    
    console.log(`[IncrementalLearningDataSource] Successfully removed ${selectedRows.length} cards`);
    return;
  }
}
```

#### 步骤2：检查队列实例是否正确初始化

在 `IncrementalLearningDataSource` 构造函数中：
```typescript
constructor(manager: UnifiedDataSourceManager, options?: IncrementalLearningDataSourceOptions) {
  this.manager = manager;
  this.options = options || {};
  
  console.log('[IncrementalLearningDataSource] Initialized with manager:', manager);
  console.log('[IncrementalLearningDataSource] Manager has getQueue method:', typeof manager.getQueue === 'function');
}
```

---

## 建议

### 短期建议（立即修复）

1. **添加"删除卡片"功能**
   - 在所有数据源中添加 `delete-card` 操作
   - 添加确认对话框防止误删
   - 在 `handleAction()` 中添加删除后的刷新逻辑

2. **验证"从当前队列移除"功能**
   - 添加详细的调试日志
   - 检查队列实例是否正确初始化
   - 确认 `removeCard()` 方法是否正常工作

### 长期建议（架构优化）

1. **统一操作定义**
   - 将所有操作定义集中到 `MenuActions.ts`
   - 避免在不同数据源中重复定义

2. **统一操作处理**
   - 将通用操作处理逻辑提取到 `MenuActions.ts`
   - 减少代码重复

3. **添加操作权限控制**
   - 某些操作可能不适用于所有队列
   - 通过配置控制哪些操作可用

---

## 下一步行动

1. **用户验证**
   - 请用户在浏览器控制台中运行验证步骤
   - 确认"从当前队列移除"功能是否真的消失了

2. **实施修复**
   - 如果验证确认功能消失，添加调试日志定位问题
   - 如果功能正常，添加"删除卡片"功能

3. **测试验证**
   - 测试"删除卡片"功能是否正常工作
   - 测试"从当前队列移除"功能是否正常工作
   - 确认操作后表格是否正确刷新
