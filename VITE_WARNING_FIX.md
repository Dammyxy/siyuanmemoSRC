# Vite 动态导入警告修复

## 问题描述

编译时出现 Vite 警告：

```
[plugin:vite:reporter] [plugin vite:reporter] 
(!) H:/project-F/flashcard/siyuan-plugin-fsrs/src/ui/browser/browserService.ts is dynamically imported by 
H:/project-F/flashcard/siyuan-plugin-fsrs/src/ui/browser/datasource/DeckDataSource.ts, 
H:/project-F/flashcard/siyuan-plugin-fsrs/src/ui/browser/datasource/FinalDrillDataSource.ts, 
H:/project-F/flashcard/siyuan-plugin-fsrs/src/ui/browser/datasource/IncrementalLearningDataSource.ts, 
H:/project-F/flashcard/siyuan-plugin-fsrs/src/ui/browser/datasource/RetrievalDataSource.ts 
but also statically imported by 
H:/project-F/flashcard/siyuan-plugin-fsrs/src/ui/browser/BrowserHierarchy.vue?vue&type=script&setup=true&lang.ts, 
H:/project-F/flashcard/siyuan-plugin-fsrs/src/ui/browser/SRSBrowser.vue?vue&type=script&setup=true&lang.ts, 
H:/project-F/flashcard/siyuan-plugin-fsrs/src/ui/browser/composables/useCardActions.ts, 
H:/project-F/flashcard/siyuan-plugin-fsrs/src/ui/browser/composables/useCardTypeDetection.ts, 
H:/project-F/flashcard/siyuan-plugin-fsrs/src/ui/browser/datasource/BlockIdsDataSource.ts, 
H:/project-F/flashcard/siyuan-plugin-fsrs/src/ui/browser/datasource/DeckDataSource.ts, 
H:/project-F/flashcard/siyuan-plugin-fsrs/src/ui/browser/datasource/MenuActions.ts, 
H:/project-F/flashcard/siyuan-plugin-fsrs/src/ui/browser/datasource/QueryDataSource.ts, 
dynamic import will not move module into another chunk.
```

## 问题根源

`browserService.ts` 被同时：
1. **静态导入**：`import { loadCards, batchReset, batchSuspend } from '../browserService';`
2. **动态导入**：`const { batchDelete } = await import('../browserService');`

这导致 Vite 无法正确进行代码分割（code splitting），因为同一个模块既需要在初始加载时包含（静态导入），又需要在运行时按需加载（动态导入）。

## 解决方案

将所有对 `browserService.ts` 的导入统一为**静态导入**。

### 修改的文件

#### 1. DeckDataSource.ts

**修改前**：
```typescript
import { loadCards, batchReset, batchSuspend } from '../browserService';

// ... 在 performAction 中
if (actionId === 'delete-card') {
  const blockIds = selectedRows.map(row => row.blockId);
  const { batchDelete } = await import('../browserService');  // ❌ 动态导入
  
  let deleted = await batchDelete(blockIds);
  // ...
}
```

**修改后**：
```typescript
import { loadCards, batchReset, batchSuspend, batchDelete } from '../browserService';  // ✅ 静态导入

// ... 在 performAction 中
if (actionId === 'delete-card') {
  const blockIds = selectedRows.map(row => row.blockId);
  
  let deleted = await batchDelete(blockIds);  // ✅ 直接使用
  // ...
}
```

#### 2. FinalDrillDataSource.ts

**修改前**：
```typescript
// 没有静态导入 browserService

// ... 在 performAction 中
if (actionId === 'delete-card') {
  const blockIds = selectedRows.map(row => row.blockId);
  const { batchDelete } = await import('../browserService');  // ❌ 动态导入
  
  let deleted = await batchDelete(blockIds);
  // ...
}
```

**修改后**：
```typescript
import { batchDelete } from '../browserService';  // ✅ 静态导入

// ... 在 performAction 中
if (actionId === 'delete-card') {
  const blockIds = selectedRows.map(row => row.blockId);
  
  let deleted = await batchDelete(blockIds);  // ✅ 直接使用
  // ...
}
```

#### 3. IncrementalLearningDataSource.ts

**修改前**：
```typescript
// 没有静态导入 browserService

// ... 在 performAction 中
if (actionId === 'delete-card') {
  const blockIds = selectedRows.map(row => row.blockId);
  const { batchDelete } = await import('../browserService');  // ❌ 动态导入
  
  let deleted = await batchDelete(blockIds);
  // ...
}
```

**修改后**：
```typescript
import { batchDelete } from '../browserService';  // ✅ 静态导入

// ... 在 performAction 中
if (actionId === 'delete-card') {
  const blockIds = selectedRows.map(row => row.blockId);
  
  let deleted = await batchDelete(blockIds);  // ✅ 直接使用
  // ...
}
```

#### 4. RetrievalDataSource.ts

**修改前**：
```typescript
// 没有静态导入 browserService

// ... 在 performAction 中
if (actionId === 'delete-card') {
  const blockIds = selectedRows.map(row => row.blockId);
  const { batchDelete } = await import('../browserService');  // ❌ 动态导入
  
  let deleted = await batchDelete(blockIds);
  // ...
}
```

**修改后**：
```typescript
import { batchDelete } from '../browserService';  // ✅ 静态导入

// ... 在 performAction 中
if (actionId === 'delete-card') {
  const blockIds = selectedRows.map(row => row.blockId);
  
  let deleted = await batchDelete(blockIds);  // ✅ 直接使用
  // ...
}
```

## 为什么之前使用动态导入？

之前使用动态导入 `batchDelete` 的原因可能是：

1. **延迟加载**：希望只在需要删除功能时才加载相关代码
2. **代码分割**：希望将删除功能分离到单独的 chunk

但实际上：
- `browserService.ts` 已经被其他地方静态导入了（如 `loadCards`, `batchReset`, `batchSuspend`）
- 动态导入无法实现代码分割，反而导致 Vite 警告
- `batchDelete` 函数很小，不需要延迟加载

## 修复效果

### 修复前
```
[plugin:vite:reporter] [plugin vite:reporter] 
(!) H:/project-F/flashcard/siyuan-plugin-fsrs/src/ui/browser/browserService.ts is dynamically imported by ...
dynamic import will not move module into another chunk.
```

### 修复后
```
✓ 250 modules transformed.
computing gzip size (1)...[vite-plugin-static-copy] Copied 7 items.
dist/index.css     28.44 kB │ gzip:   5.07 kB
dist/index.js   1,668.23 kB │ gzip: 474.95 kB
✓ built in 6.86s
```

✅ **警告消失，编译成功！**

## 性能影响

将动态导入改为静态导入对性能的影响：

1. **包大小**：几乎无影响（`batchDelete` 函数很小）
2. **初始加载时间**：几乎无影响（`browserService.ts` 已经被静态导入）
3. **代码可维护性**：✅ 提升（统一的导入方式，更清晰）
4. **编译警告**：✅ 消除（Vite 不再警告）

## 最佳实践

1. **统一导入方式**：如果一个模块已经被静态导入，就不要再使用动态导入
2. **动态导入的使用场景**：
   - 大型第三方库（如图表库、编辑器）
   - 条件加载的功能模块
   - 路由懒加载
3. **避免混合导入**：同一个模块不要同时使用静态导入和动态导入

## 总结

通过将 `batchDelete` 从动态导入改为静态导入，成功消除了 Vite 的代码分割警告，同时保持了代码的简洁性和可维护性。

---

**修复时间**: 2026-02-06
**修复状态**: ✅ 成功
**编译状态**: ✅ 无警告
