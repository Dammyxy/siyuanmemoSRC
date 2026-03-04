# ReviewSyncManager 集成指南（观察者模式版本）

## 概述

ReviewSyncManager 作为观察者监听数据变更事件，负责在复习过程中管理数据同步，确保数据及时保存到服务器，避免数据丢失。

## 功能特性

1. **自动同步**：监听 `card-updated` 事件，每 N 张卡片或每 M 分钟自动同步一次
2. **完成同步**：复习完成时强制同步
3. **关闭同步**：对话框关闭时强制同步并通知观察者刷新 UI

## 架构设计

### 观察者模式

```
评分 → handleReview → updateCard → notifyObservers
                                        ↓
                                 ReviewSyncManager (观察者)
                                        ↓
                                 累计变更 → 定期同步
```

### 对话框关闭自动同步

```
关闭对话框
    ↓
createUnifiedReviewDialog.onClose 回调
    ↓
reviewSyncManager.onDialogClose()
    ↓
hybridSyncService.incrementalSync()  // 同步数据
    ↓
unifiedDataSourceManager.notifyObservers({
  type: 'mode-switched'
})
    ↓
SRSBrowserAdapter.onDataChanged
    ↓
SRSBrowser.vue 回调
    ↓
loadData(true)  // 重新加载数据
    ↓
UI 刷新 ✅
```

### 优势

1. **自动响应**：无需手动调用 `onCardReviewed()`，自动响应所有数据变更
2. **架构清晰**：利用现有的观察者模式和对话框生命周期，职责分离
3. **全局覆盖**：不仅响应复习场景，还能响应浏览器编辑等其他场景
4. **UI 自动刷新**：对话框关闭时自动通知观察者，浏览器 UI 自动刷新

## 实现状态

### ✅ 已完成

- `ReviewSyncManager.ts` 实现完成，实现了 `IDataSourceObserver` 接口
- 三个核心方法：
  - `onDataChanged()` - 观察者接口，监听 card-updated 事件
  - `onReviewCompleted()` - 队列为空时强制同步
  - `onDialogClose()` - 对话框关闭时强制同步并通知观察者
- `createUnifiedReviewDialog.ts` 已添加 `onClose` 回调，自动调用 `onDialogClose()`
- `SRSBrowser.vue` 已修改数据变更回调为 `loadData(true)`

### 🚧 待集成

需要在以下位置集成 ReviewSyncManager：

#### 1. 插件主类（index.ts）

在插件初始化时创建 ReviewSyncManager 实例并注册为观察者：

```typescript
// 在 SiyuanMemo 类中添加
private reviewSyncManager?: ReviewSyncManager;

// 在 onload() 中初始化（在 HybridSyncService 初始化之后）
if (this.hybridSyncService) {
  this.reviewSyncManager = new ReviewSyncManager(
    this.hybridSyncService,
    {
      autoSyncCardInterval: 10,        // 每 10 张卡片同步一次
      autoSyncTimeInterval: 5 * 60 * 1000, // 每 5 分钟同步一次
      showCompletionMessage: true,     // 显示完成提示
      showAutoSyncErrors: false,       // 静默失败
    }
  );

  // 🆕 设置 UnifiedDataSourceManager 引用（用于关闭对话框时通知观察者）
  this.reviewSyncManager.setUnifiedDataSourceManager(this.unifiedDataSourceManager);

  // 🆕 注册为观察者
  this.unifiedDataSourceManager.registerObserver(this.reviewSyncManager);
  
  console.log('[SiyuanMemo] ✅ ReviewSyncManager initialized and registered');
}

// 在 onunload() 中取消注册
if (this.reviewSyncManager) {
  this.unifiedDataSourceManager.unregisterObserver(this.reviewSyncManager);
}
```

#### 2. 对话框关闭自动同步（已完成）

`createUnifiedReviewDialog` 已经在 `onClose` 回调中自动调用 `reviewSyncManager.onDialogClose()`：

```typescript
// src/strategies/createUnifiedReviewDialog.ts
onClose: async () => {
    // 🆕 对话框关闭时自动调用 ReviewSyncManager
    // 这会触发数据同步并通知所有观察者（包括浏览器）刷新 UI
    if (plugin.reviewSyncManager) {
        await plugin.reviewSyncManager.onDialogClose();
    }
    
    // 调用用户提供的关闭回调
    onClose?.();
}
```

**优势**：
- ✅ 无需修改 `ReviewView.vue`
- ✅ 所有复习对话框（提取练习、最终训练、渐进学习等）自动生效
- ✅ 利用现有的对话框生命周期
- ✅ 完全利用观察者模式

#### 3. ReviewView.vue（可选，已废弃）

~~如果需要在复习完成时强制同步，可以添加：~~

**注意**：由于对话框关闭时已经自动调用 `onDialogClose()`，不再需要在 `ReviewView.vue` 中手动调用。

```typescript
// ❌ 已废弃：不需要在 ReviewView.vue 中手动调用
// 监听队列为空（复习完成）
watch(() => hook.state.value.content.type, async (newType) => {
  if (newType === 'empty' && reviewSyncManager) {
    await reviewSyncManager.onReviewCompleted();
  }
});
```

## 同步时机

### 1. 自动同步（onDataChanged）

触发条件：
- 监听到 `card-updated` 事件
- 累计变更达到 10 张卡片（可配置）
- 或距离上次同步超过 5 分钟（可配置）

行为：
- 调用 `hybridSyncService.incrementalSync()`
- 静默失败（不显示错误提示，除非配置了 `showAutoSyncErrors`）

### 2. 完成同步（onReviewCompleted）

触发条件：
- 队列为空（`content.type === 'empty'`）

行为：
- 调用 `hybridSyncService.incrementalSync()`
- 显示完成提示（可配置）
- 重置计数器

### 3. 关闭同步（onDialogClose）

触发条件：
- 对话框关闭（`createUnifiedReviewDialog.onClose`）
- 且至少复习过 1 张卡片

行为：
- 调用 `hybridSyncService.incrementalSync()`
- 通知观察者刷新 UI（`notifyObservers({ type: 'mode-switched' })`）
- 静默失败（不显示错误提示）
- 重置计数器

## 配置选项

```typescript
interface ReviewSyncManagerConfig {
  autoSyncCardInterval?: number;      // 默认：10
  autoSyncTimeInterval?: number;      // 默认：5 * 60 * 1000 (5分钟)
  showCompletionMessage?: boolean;    // 默认：true
  showAutoSyncErrors?: boolean;       // 默认：false
}
```

## 注意事项

1. **防止重复同步**：使用 `isSyncing` 标志防止并发同步
2. **静默失败**：自动同步和关闭同步失败时不显示错误提示，避免打断用户
3. **计数器重置**：完成或关闭时重置计数器，避免下次复习时误触发
4. **UI 自动刷新**：关闭对话框时自动通知观察者，浏览器 UI 自动刷新

## 测试场景

1. **正常复习流程**
   - 复习 10 张卡片 → 自动同步
   - 复习完成 → 显示提示 + 同步
   - 关闭对话框 → 静默同步 + UI 刷新 ✅

2. **中断场景**
   - 复习 5 张卡片 → 关闭对话框 → 静默同步 + UI 刷新 ✅
   - 复习 0 张卡片 → 关闭对话框 → 跳过同步

3. **长时间复习**
   - 复习 30 分钟 → 每 5 分钟自动同步一次

4. **网络错误**
   - 自动同步失败 → 静默失败，继续复习
   - 完成同步失败 → 显示错误提示

5. **UI 刷新**
   - 关闭对话框 → 浏览器自动刷新，显示最新数据 ✅

## 相关文件

- `src/services/ReviewSyncManager.ts` - 同步管理器实现
- `src/services/HybridSyncService.ts` - 底层同步服务
- `src/strategies/createUnifiedReviewDialog.ts` - 对话框创建工具（已添加 `onClose` 回调）
- `src/ui/browser/SRSBrowser.vue` - 浏览器组件（已修改数据变更回调）
- `src/ui/browser/SRSBrowserAdapter.ts` - 浏览器适配器（观察者实现）

## 下一步

1. ✅ 在 `createUnifiedReviewDialog.ts` 中添加 `onClose` 回调
2. 📝 在 `index.ts` 中初始化 ReviewSyncManager
3. 测试各种复习场景
4. 根据用户反馈调整同步间隔和提示
