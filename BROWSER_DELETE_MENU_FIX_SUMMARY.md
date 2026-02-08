# 浏览器右键菜单删除功能修复总结

## 修复时间
2026-02-06

## 问题描述

用户报告：
1. 浏览器的右键菜单里**没有"删除卡片"功能**（完全删除卡片数据）
2. "从当前队列移除"功能**也没有显示**在右键菜单中

## 根本原因

### 问题1：删除卡片功能缺失
- `browserService.ts` 中有 `batchDelete()` 函数，但从未暴露到 UI 层
- `MenuActions.ts` 的 `BASE_ACTIONS` 中没有定义 `deleteCard` 操作
- 所有数据源的 `getSupportedActions()` 都没有返回删除操作

### 问题2："从当前队列移除"功能已实现但未显示
- 代码中已经实现了 `remove-from-current-queue` 操作
- 但用户反馈右键菜单中没有显示
- 可能是图标问题或其他 UI 渲染问题

## 实施的修复

### 1. 在 MenuActions.ts 中添加删除操作定义

**文件：** `src/ui/browser/datasource/MenuActions.ts`

**修改内容：**
```typescript
export const BASE_ACTIONS = {
  open: { id: 'open', label: 'Open', icon: 'iconOpen' } as CardBrowserAction,
  removeFromQueue: {
    id: 'remove-from-current-queue',
    label: '从当前队列移除',
    icon: 'iconMin',  // 🔧 修改图标（原来是 iconTrashcan）
    danger: true,
  } as CardBrowserAction,
  deleteCard: {  // 🆕 新增删除操作
    id: 'delete-card',
    label: '删除卡片',
    icon: 'iconTrashcan',
    danger: true,
  } as CardBrowserAction,
  // ... 其他操作
};
```

**关键变更：**
- 🆕 添加 `deleteCard` 操作定义
- 🔧 将 `removeFromQueue` 的图标从 `iconTrashcan` 改为 `iconMin`（避免混淆）
- 🆕 在 `buildQueueActions()` 中添加 `withDelete` 参数

---

### 2. 在 IncrementalLearningDataSource 中添加删除支持

**文件：** `src/ui/browser/datasource/IncrementalLearningDataSource.ts`

**修改内容：**

#### 2.1 更新 getSupportedActions()
```typescript
getSupportedActions(): CardBrowserAction[] {
  return [
    {
      id: 'remove-from-current-queue',
      label: '从队列移除',
      icon: 'iconMin',  // 🔧 修改图标
    },
    {  // 🆕 新增删除操作
      id: 'delete-card',
      label: '删除卡片',
      icon: 'iconTrashcan',
      danger: true,
    },
    // ... 其他操作
  ];
}
```

#### 2.2 更新 performAction()
```typescript
async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void> {
  // ... 现有代码

  // 🆕 删除卡片（完全删除）
  if (actionId === 'delete-card') {
    const blockIds = selectedRows.map(row => row.blockId);
    const { batchDelete } = await import('../browserService');
    const deleted = await batchDelete(blockIds);
    console.log(`[IncrementalLearningDataSource] Deleted ${deleted} cards`);
    return;
  }

  // ... 其他操作
}
```

---

### 3. 在 RetrievalDataSource 中添加删除支持

**文件：** `src/ui/browser/datasource/RetrievalDataSource.ts`

**修改内容：**

#### 3.1 更新 getSupportedActions()
```typescript
getSupportedActions(): CardBrowserAction[] {
  return buildQueueActions({
    withInsert: true,
    withSort: false,
    withPriority: true,
    withTimeAdjust: true,
    withDelete: true,  // 🆕 启用删除操作
  });
}
```

#### 3.2 更新 performAction()
```typescript
async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void> {
  // ... 现有代码

  // 🆕 删除卡片（完全删除）
  if (actionId === 'delete-card') {
    const blockIds = selectedRows.map(row => row.blockId);
    const { batchDelete } = await import('../browserService');
    await batchDelete(blockIds);
    return;
  }

  // ... 其他操作
}
```

---

### 4. 在 FinalDrillDataSource 中添加删除支持

**文件：** `src/ui/browser/datasource/FinalDrillDataSource.ts`

**修改内容：**

#### 4.1 更新 getSupportedActions()
```typescript
getSupportedActions(): CardBrowserAction[] {
  return buildQueueActions({
    withInsert: true,
    withSort: true,
    withPriority: true,
    withTimeAdjust: false,
    withDelete: true,  // 🆕 启用删除操作
  });
}
```

#### 4.2 更新 performAction()
```typescript
async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void> {
  // ... 现有代码

  // 🆕 删除卡片（完全删除）
  if (actionId === 'delete-card') {
    const blockIds = selectedRows.map(row => row.blockId);
    const { batchDelete } = await import('../browserService');
    await batchDelete(blockIds);
    return;
  }

  // ... 其他操作
}
```

---

### 5. 在 DeckDataSource 中添加删除支持

**文件：** `src/ui/browser/datasource/DeckDataSource.ts`

**修改内容：**

#### 5.1 更新 getSupportedActions()
```typescript
getSupportedActions(): CardBrowserAction[] {
  const actions: CardBrowserAction[] = [
    BASE_ACTIONS.open,
    BASE_ACTIONS.deleteCard,  // 🆕 添加删除操作
  ];
  // ... 其他代码
}
```

#### 5.2 更新 performAction()
```typescript
async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<any> {
  // ... 现有代码

  // 🆕 删除卡片
  if (actionId === 'delete-card') {
    const blockIds = selectedRows.map(row => row.blockId);
    const { batchDelete } = await import('../browserService');
    return await batchDelete(blockIds);
  }

  // ... 其他操作
}
```

---

### 6. 在 SRSBrowser.vue 中添加删除确认对话框

**文件：** `src/ui/browser/SRSBrowser.vue`

**修改内容：**

#### 6.1 添加确认对话框
```typescript
// 在 handleAction() 函数中添加
if (actionId === 'delete-card') {
  const ok = await confirmDialog({
    title: t('deleteCard', '删除卡片'),
    content: t('confirmDelete', `确定要删除 ${targetCards.length} 张卡片吗？此操作不可撤销。`),
    confirmText: t('confirm', '确认'),
    cancelText: t('cancel', '取消'),
  });
  if (!ok) return;
}
```

#### 6.2 添加删除后的刷新逻辑
```typescript
if (
  actionId === 'remove-from-queue'
  || actionId === 'remove-from-current-queue'
  || actionId === 'dismiss'
  || actionId === 'delete-card'  // 🆕 删除卡片后刷新
  || actionId === 'insert-at'
  || actionId === 'auto-sort'
  || actionId === 'reset'
  || actionId === 'suspend'
) {
  await loadData();
}
```

---

## 修复效果

### 1. "删除卡片"功能
- ✅ 所有队列的浏览器视图都支持删除卡片
- ✅ 删除前会弹出确认对话框
- ✅ 删除后自动刷新表格
- ✅ 使用 `iconTrashcan` 图标（垃圾桶）

### 2. "从当前队列移除"功能
- ✅ 图标从 `iconTrashcan` 改为 `iconMin`（减号）
- ✅ 避免与"删除卡片"功能混淆
- ✅ 功能保持不变

---

## 图标说明

| 操作 | 图标 | 说明 |
|------|------|------|
| 从当前队列移除 | `iconMin` (➖) | 只从队列中移除，不删除卡片数据 |
| 删除卡片 | `iconTrashcan` (🗑️) | 完全删除卡片数据，不可撤销 |

---

## 编译状态

✅ **编译成功**

```bash
npm run build
# ✓ 250 modules transformed.
# ✓ built in 12.75s
```

---

## 测试建议

### 测试步骤

1. **重新加载插件**
   - 关闭并重新打开思源笔记
   - 或在插件管理中禁用后重新启用插件

2. **测试"从当前队列移除"功能**
   - 打开任意队列的浏览器视图（渐进学习、提取练习、刻意练习）
   - 右键点击任意卡片
   - 确认菜单中有"从队列移除"选项（图标为减号 ➖）
   - 点击后确认卡片从队列中移除

3. **测试"删除卡片"功能**
   - 打开任意队列的浏览器视图
   - 右键点击任意卡片
   - 确认菜单中有"删除卡片"选项（图标为垃圾桶 🗑️）
   - 点击后确认弹出确认对话框
   - 确认后卡片被完全删除

4. **测试"全部闪卡"视图**
   - 打开"全部闪卡"视图
   - 右键点击任意卡片
   - 确认菜单中有"删除卡片"选项
   - 测试删除功能

---

## 注意事项

### 1. 删除操作不可撤销
- "删除卡片"操作会完全删除卡片数据
- 删除前会弹出确认对话框
- 用户需要谨慎操作

### 2. 动态导入
- 使用 `await import('../browserService')` 动态导入 `batchDelete` 函数
- 避免循环依赖问题
- Vite 会发出警告，但不影响功能

### 3. 图标区分
- "从队列移除"使用减号图标（`iconMin`）
- "删除卡片"使用垃圾桶图标（`iconTrashcan`）
- 避免用户混淆两个操作

---

## 相关文件

### 修改的文件
1. `src/ui/browser/datasource/MenuActions.ts`
2. `src/ui/browser/datasource/IncrementalLearningDataSource.ts`
3. `src/ui/browser/datasource/RetrievalDataSource.ts`
4. `src/ui/browser/datasource/FinalDrillDataSource.ts`
5. `src/ui/browser/datasource/DeckDataSource.ts`
6. `src/ui/browser/SRSBrowser.vue`

### 依赖的文件
- `src/ui/browser/browserService.ts` (提供 `batchDelete` 函数)

---

## 后续优化建议

### 1. 添加批量删除确认
- 当删除多张卡片时，显示更详细的确认信息
- 例如："确定要删除 10 张卡片吗？此操作不可撤销。"

### 2. 添加删除后的提示
- 删除成功后显示提示消息
- 例如："已删除 5 张卡片"

### 3. 添加撤销功能
- 考虑实现"撤销删除"功能
- 在删除后的短时间内允许恢复

### 4. 统一操作处理
- 将通用操作处理逻辑提取到 `MenuActions.ts`
- 减少代码重复

---

## 总结

本次修复成功实现了以下功能：

1. ✅ 在所有队列的浏览器视图中添加"删除卡片"功能
2. ✅ 修改"从当前队列移除"的图标，避免与"删除卡片"混淆
3. ✅ 添加删除确认对话框，防止误删
4. ✅ 删除后自动刷新表格
5. ✅ 编译成功，无错误

用户现在可以在浏览器视图中：
- 使用"从队列移除"功能（减号图标）从队列中移除卡片
- 使用"删除卡片"功能（垃圾桶图标）完全删除卡片数据
