# 对话框关闭后 UI 刷新 - 最终方案

## 问题

关闭复习界面后，数据已同步，但浏览器 UI 没有刷新。

## 解决方案

**在对话框关闭回调中自动调用 `ReviewSyncManager.onDialogClose()`**

### 实现位置

`src/strategies/createUnifiedReviewDialog.ts`：

```typescript
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

## 工作流程

```
关闭对话框
    ↓
createUnifiedReviewDialog.onClose
    ↓
reviewSyncManager.onDialogClose()
    ↓
1. hybridSyncService.incrementalSync()  // 同步数据
2. notifyObservers({ type: 'mode-switched' })  // 通知观察者
    ↓
SRSBrowserAdapter.onDataChanged
    ↓
SRSBrowser.vue → loadData(true)
    ↓
UI 刷新 ✅
```

## 为什么这是最优雅的方案？

1. ✅ **无需修改 Vue 组件** - `ReviewView.vue` 保持纯粹
2. ✅ **集中管理** - 所有复习对话框自动生效
3. ✅ **利用现有生命周期** - 对话框关闭时自动触发
4. ✅ **完全利用观察者模式** - 自动通知所有观察者

## 待完成

在 `src/index.ts` 中初始化 `ReviewSyncManager`：

```typescript
// 在 onload() 中（HybridSyncService 初始化之后）
if (this.hybridSyncService) {
  this.reviewSyncManager = new ReviewSyncManager(
    this.hybridSyncService,
    {
      autoSyncCardInterval: 10,
      autoSyncTimeInterval: 5 * 60 * 1000,
      showCompletionMessage: true,
      showAutoSyncErrors: false,
    }
  );
  
  this.reviewSyncManager.setUnifiedDataSourceManager(this.unifiedDataSourceManager);
  this.unifiedDataSourceManager.registerObserver(this.reviewSyncManager);
}

// 在 onunload() 中
if (this.reviewSyncManager) {
  this.unifiedDataSourceManager.unregisterObserver(this.reviewSyncManager);
}
```

## 相关文档

- `DIALOG_CLOSE_UI_REFRESH_SOLUTION_V2.md` - 完整的解决方案说明
- `REVIEW_SYNC_MANAGER_INTEGRATION.md` - 集成指南
- `src/strategies/createUnifiedReviewDialog.ts` - 已修改 ✅
- `src/services/ReviewSyncManager.ts` - 已实现 ✅
- `src/ui/browser/SRSBrowser.vue` - 已修改 ✅
