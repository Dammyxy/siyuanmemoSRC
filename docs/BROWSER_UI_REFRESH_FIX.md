# 浏览器 UI 刷新修复

## 问题

复习完成后关闭复习界面，数据已经同步刷新，但浏览器 UI 显示没有刷新。

## 原因分析

### 观察者模式已存在

系统已经有完整的观察者模式：

```
评分 → updateCard → notifyObservers
                        ↓
                 SRSBrowserAdapter (观察者)
                        ↓
                 onDataChanged → 回调 Vue 组件
                        ↓
                 SRSBrowser.vue
```

### 两个问题

#### 问题 1：浏览器回调只刷新单元格

在 `SRSBrowser.vue` 的数据变更回调中，只是刷新了单元格显示，而没有重新加载数据：

```typescript
// ❌ 错误的实现
case 'card-updated':
case 'card-deleted':
  // 只刷新单元格，不重新加载数据
  if (gridApi.value) {
    gridApi.value.refreshCells({ force: true });  // ❌ 只刷新显示
  }
  void refreshQueueCounts();
  break;
```

#### 问题 2：关闭对话框不触发事件

从日志可以看到：
- 复习过程中，每次评分都触发了 `[UnifiedDataSourceManager] Card updated: xxx`
- 但是**关闭对话框时没有任何观察者通知**

关闭对话框本身不会触发数据变更事件，所以浏览器不知道需要刷新。

## 解决方案

### 方案 1：修改浏览器回调（已实现）

调用 `loadData(true)` 重新加载数据：

```typescript
// ✅ 正确的实现
case 'card-updated':
case 'card-deleted':
  // 重新加载数据以反映最新状态
  console.log('[SRSBrowser] Reloading data due to card changes');
  void loadData(true);  // ✅ 强制刷新，重新加载数据
  void refreshQueueCounts();
  break;
```

### 方案 2：关闭对话框时主动通知（已实现）

在 `ReviewSyncManager.onDialogClose()` 中，同步完成后主动通知观察者：

```typescript
// 2. 通知观察者刷新 UI（触发浏览器刷新）
if (this.unifiedDataSourceManager) {
  this.unifiedDataSourceManager.notifyObservers({
    type: 'mode-switched' as any,  // 使用 mode-switched 触发 loadData()
    timestamp: Date.now(),
  });
  console.log('[ReviewSyncManager] Notified observers to refresh UI');
}
```

为什么使用 `mode-switched`？
- `card-updated` 需要 `cardIds` 参数，不适合批量刷新
- `mode-switched` 会触发 `loadData()`，完全重新加载数据
- 这正是我们需要的：关闭对话框后，浏览器显示最新数据

### 工作流程

1. **复习评分**
   ```
   用户评分 → handleReview → updateCard
   ```

2. **通知观察者**
   ```
   updateCard → notifyObservers({
     type: 'card-updated',
     cardIds: [cardId],
     timestamp: Date.now()
   })
   ```

3. **SRSBrowserAdapter 响应**
   ```
   onDataChanged → handleCardUpdated → 调用回调
   ```

4. **SRSBrowser.vue 刷新**
   ```
   回调 → loadData(true) → 重新加载数据 → UI 更新
   ```

## 优势

### 1. 利用现有观察者模式

无需添加新的刷新机制，直接利用已有的观察者模式：
- `SRSBrowserAdapter` 已经注册为观察者
- `UnifiedDataSourceManager` 已经在 `updateCard` 时通知观察者
- 只需修改 Vue 组件的响应逻辑

### 2. 自动响应所有数据变更

不仅响应复习场景，还能响应：
- 浏览器中的编辑操作
- 批量操作（重置、暂停等）
- 其他任何导致卡片更新的操作

### 3. 简单优雅

只需修改一行代码：
```typescript
// 从
gridApi.value.refreshCells({ force: true });

// 改为
void loadData(true);
```

## 事件类型处理

### card-updated（卡片更新）

触发场景：
- 复习评分
- 编辑卡片属性
- 批量修改

处理方式：
```typescript
void loadData(true);  // 重新加载数据
void refreshQueueCounts();  // 刷新队列统计
```

### card-deleted（卡片删除）

触发场景：
- 删除卡片
- 批量删除

处理方式：
```typescript
void loadData(true);  // 重新加载数据
void refreshQueueCounts();  // 刷新队列统计
```

### queue-changed（队列变更）

触发场景：
- 队列配置变更
- 筛选条件变更

处理方式：
```typescript
void refreshQueueCounts();  // 只刷新队列统计
```

### mode-switched（模式切换）

触发场景：
- 切换数据源模式

处理方式：
```typescript
void loadData();  // 重新加载数据
```

## 性能考虑

### 防抖优化

`loadData` 方法已经有防抖机制：

```typescript
async function loadData(forceRefresh = false) {
  // 取消之前的加载请求
  if (loadDataAbortController) {
    loadDataAbortController.abort();
  }
  
  loadDataAbortController = new AbortController();
  // ...
}
```

这样即使短时间内多次触发 `card-updated` 事件，也只会执行最后一次加载。

### 强制刷新

使用 `loadData(true)` 强制刷新，确保获取最新数据：

```typescript
void loadData(true);  // forceRefresh = true
```

## 测试场景

### 1. 复习后刷新

1. 打开浏览器
2. 打开复习界面
3. 复习几张卡片
4. 关闭复习界面
5. **验证**：浏览器自动刷新，显示最新的到期时间和统计

### 2. 批量操作后刷新

1. 打开浏览器
2. 选择多张卡片
3. 执行批量操作（如重置、暂停）
4. **验证**：浏览器自动刷新，显示最新状态

### 3. 编辑后刷新

1. 打开浏览器
2. 编辑卡片属性（如优先级）
3. **验证**：浏览器自动刷新，显示最新属性

## 相关文件

- ✅ `src/ui/browser/SRSBrowser.vue` - 修改了数据变更回调
- 📝 `src/ui/browser/SRSBrowserAdapter.ts` - 观察者实现
- 📝 `src/managers/UnifiedDataSourceManager.ts` - 通知观察者
- 📝 `BROWSER_UI_REFRESH_FIX.md` - 本文档

## 总结

通过修改 `SRSBrowser.vue` 的数据变更回调，从只刷新单元格改为重新加载数据，优雅地解决了 UI 不刷新的问题。

这个方案：
- ✅ 利用现有的观察者模式
- ✅ 自动响应所有数据变更
- ✅ 简单优雅，只需修改一行代码
- ✅ 有防抖机制，性能良好

完全符合观察者模式的设计理念：数据变更时自动通知所有观察者，观察者自动刷新 UI。
