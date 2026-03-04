# ReviewSyncManager - 观察者模式实现

## 核心改进

基于用户建议，将 ReviewSyncManager 改为观察者模式实现，利用现有的 `UnifiedDataSourceManager` 观察者架构。

## 架构对比

### 原方案（手动调用）

```
评分 → useReviewSession.grade()
         ↓
      onReview 回调
         ↓
      reviewSyncManager.onCardReviewed() ❌ 需要手动调用
```

缺点：
- 需要在每个复习入口手动集成
- 只能响应复习场景
- 代码侵入性强

### 新方案（观察者模式）

```
评分 → handleReview → updateCard → notifyObservers
                                        ↓
                                 ReviewSyncManager ✅ 自动响应
                                        ↓
                                 累计变更 → 定期同步
```

优点：
- 自动响应所有数据变更
- 全局覆盖（复习、浏览器编辑等）
- 架构清晰，职责分离
- 无需手动调用

## 实现要点

### 1. 实现观察者接口

```typescript
export class ReviewSyncManager implements IDataSourceObserver {
  onDataChanged(event: DataChangeEvent): void {
    // 只响应卡片更新事件
    if (event.type !== 'card-updated') {
      return;
    }
    
    // 累计变更数量
    const cardCount = event.cardIds?.length || 0;
    this.reviewCount += cardCount;
    
    // 检查是否需要自动同步
    void this.checkAndAutoSync();
  }
}
```

### 2. 注册观察者

```typescript
// 在插件初始化时
this.reviewSyncManager = new ReviewSyncManager(this.hybridSyncService, config);
this.unifiedDataSourceManager.registerObserver(this.reviewSyncManager);

// 在插件卸载时
this.unifiedDataSourceManager.unregisterObserver(this.reviewSyncManager);
```

### 3. 自动同步逻辑

```typescript
private async checkAndAutoSync(): Promise<void> {
  const shouldSyncByCount = this.reviewCount >= this.config.autoSyncCardInterval;
  const shouldSyncByTime = timeSinceLastSync > this.config.autoSyncTimeInterval;
  
  if (shouldSyncByCount || shouldSyncByTime) {
    await this.autoSync();
  }
}
```

## 同步时机

### 自动同步（观察者触发）

- 监听 `card-updated` 事件
- 累计变更达到 10 张卡片
- 或距离上次同步超过 5 分钟
- 静默失败，不打断用户

### 手动同步（可选）

- `onReviewCompleted()` - 复习完成时，显示提示
- `onDialogClose()` - 对话框关闭时，确保立即同步

## 集成步骤

### 必需

1. 在 `index.ts` 中初始化 ReviewSyncManager
2. 注册为观察者：`registerObserver(reviewSyncManager)`
3. 卸载时取消注册：`unregisterObserver(reviewSyncManager)`

### 可选

在 `ReviewView.vue` 中：
- 监听队列为空，调用 `onReviewCompleted()` 显示完成提示
- 组件卸载时调用 `onDialogClose()` 确保立即同步

## 优势总结

1. **自动化**：无需手动调用，自动响应数据变更
2. **全局覆盖**：不仅响应复习，还能响应浏览器编辑等场景
3. **架构清晰**：利用现有观察者模式，职责分离
4. **易于维护**：集中管理同步逻辑，减少代码重复
5. **性能优化**：批量同步，避免频繁触发

## 相关文件

- ✅ `src/services/ReviewSyncManager.ts` - 观察者实现
- 📝 `REVIEW_SYNC_MANAGER_INTEGRATION.md` - 集成指南
- 📝 `REVIEW_SYNC_IMPLEMENTATION_SUMMARY.md` - 实现总结
- 📝 `REVIEW_SYNC_OBSERVER_PATTERN.md` - 本文档

## 下一步

1. 在 `index.ts` 中注册观察者
2. 测试自动同步功能
3. 根据需要添加手动同步钩子（可选）
