# ReviewSyncManager 实现总结

## 任务背景

用户提出需求：复习结束后或关闭复习界面时，应该刷新数据并同步队列，确保数据不丢失。

在实现前，用户要求调研 Anki 的同步机制。经过搜索 Anki 源码，未找到明确的自动保存/同步模式，因此基于 SuperMemo 的设计理念和现有的 HybridSyncService 实现了 ReviewSyncManager。

## ⚠️ 重要发现：观察者模式已存在

用户指出：**现有的观察者模式已经可以监听数据变更事件**。

### 现状分析

1. **观察者模式已实现**
   - `UnifiedDataSourceManager` 已有观察者模式
   - `handleReviewWithScheduler` → `updateCard` → `notifyObservers`
   - 每次评分后都会触发 `card-updated` 事件

2. **但缺少同步观察者**
   - 目前只有 `SRSBrowserAdapter` 注册为观察者（用于刷新 UI）
   - **没有观察者负责同步数据到服务器**

3. **数据流**
   ```
   评分 → handleReview → updateCard → notifyObservers
                                           ↓
                                    SRSBrowserAdapter (刷新 UI)
                                           ↓
                                    ❌ 缺少同步观察者
   ```

### 优化方案

**方案 A：将 ReviewSyncManager 改为观察者**（推荐）

优点：
- 利用现有的观察者模式
- 自动响应所有数据变更（不仅是复习）
- 架构更清晰，职责分离

缺点：
- 需要处理所有类型的数据变更（不仅是复习）
- 可能触发过于频繁的同步

**方案 B：保持当前实现**

优点：
- 只在复习场景下同步
- 更精确的控制同步时机

缺点：
- 需要手动集成到 ReviewView
- 不能响应其他场景的数据变更（如浏览器中的编辑）

### 推荐实现：混合方案

1. **ReviewSyncManager 作为观察者**
   - 监听 `card-updated` 事件
   - 累计变更，定期批量同步

2. **保留手动触发接口**
   - `onReviewCompleted()` - 复习完成时强制同步
   - `onDialogClose()` - 对话框关闭时强制同步

## 最终实现方案（观察者模式）

### 核心设计

将 `ReviewSyncManager` 实现为 `IDataSourceObserver`，利用现有的观察者模式自动响应数据变更：

1. **自动同步**：监听 `card-updated` 事件，累计变更，定期批量同步
2. **完成同步**：队列为空时强制同步（可选）
3. **关闭同步**：对话框关闭时强制同步（可选）

### 技术细节

#### 1. ReviewSyncManager 类

文件：`src/services/ReviewSyncManager.ts`

实现接口：`IDataSourceObserver`

核心方法：
- `onDataChanged(event)` - 观察者接口，监听 card-updated 事件
- `checkAndAutoSync()` - 检查并执行自动同步（私有方法）
- `onReviewCompleted()` - 队列为空时强制同步（可选）
- `onDialogClose()` - 对话框关闭时强制同步（可选）

配置选项：
```typescript
{
  autoSyncCardInterval: 10,           // 每 10 张卡片同步一次
  autoSyncTimeInterval: 5 * 60 * 1000, // 每 5 分钟同步一次
  showCompletionMessage: true,        // 显示完成提示
  showAutoSyncErrors: false,          // 静默失败
}
```

#### 2. 同步策略

使用 `HybridSyncService.incrementalSync()` 进行同步：
- 从 Riff 获取新卡片
- 使用黑名单过滤
- 只添加本地不存在的卡片
- 自动检测卡片类型（如果启用）

#### 3. 防护机制

- **防止重复同步**：使用 `isSyncing` 标志
- **静默失败**：自动同步失败时不显示错误
- **计数器重置**：完成或关闭时重置计数器
- **跳过空会话**：如果没有复习过任何卡片，关闭时跳过同步

## 集成方案

### 必需集成

**插件主类（index.ts）**
- 初始化 ReviewSyncManager 实例
- 注册为观察者：`unifiedDataSourceManager.registerObserver(reviewSyncManager)`
- 卸载时取消注册：`unifiedDataSourceManager.unregisterObserver(reviewSyncManager)`

### 可选集成

**ReviewView.vue**
- 监听队列为空，调用 `onReviewCompleted()` 显示完成提示
- 组件卸载时调用 `onDialogClose()` 确保立即同步

详细集成步骤见 `REVIEW_SYNC_MANAGER_INTEGRATION.md`。

## 与原方案的对比

### 原方案（手动调用）

```typescript
// 需要在 useReviewSession 中手动调用
const hook = useReviewSession(queue, adapter, {
  onReview: async (cardId, rating) => {
    await reviewSyncManager.onCardReviewed(); // 手动调用
  }
});
```

缺点：
- 需要手动集成到每个复习入口
- 只能响应复习场景
- 代码侵入性强

### 新方案（观察者模式）

```typescript
// 只需注册一次观察者
unifiedDataSourceManager.registerObserver(reviewSyncManager);
```

优点：
- 自动响应所有数据变更
- 无需手动调用 `onCardReviewed()`
- 全局覆盖（复习、浏览器编辑等）
- 架构更清晰，职责分离

## 与 Anki 的对比

### Anki 的同步机制

经过搜索 Anki 源码（`H:\project-F\flashcard\anki\`），未找到明确的自动保存/同步模式文档。

### 我们的实现

基于以下考虑：
1. **SuperMemo 的设计理念**：及时保存，避免数据丢失
2. **HybridSyncService 的能力**：增量同步，快速高效
3. **用户体验**：静默失败，不打断复习流程

## 优势

1. **数据安全**：定期自动同步，避免数据丢失
2. **性能优化**：使用增量同步，不影响复习体验
3. **用户友好**：静默失败，不打断复习流程
4. **灵活配置**：可根据需求调整同步间隔

## 测试场景

1. **正常复习**：复习 10 张 → 自动同步 → 复习完成 → 显示提示
2. **中断复习**：复习 5 张 → 关闭对话框 → 静默同步
3. **长时间复习**：复习 30 分钟 → 每 5 分钟自动同步
4. **网络错误**：同步失败 → 静默失败 → 继续复习

## 相关文件

- ✅ `src/services/ReviewSyncManager.ts` - 同步管理器（已完成）
- 📝 `REVIEW_SYNC_MANAGER_INTEGRATION.md` - 集成指南
- 📝 `REVIEW_SYNC_IMPLEMENTATION_SUMMARY.md` - 实现总结（本文档）

## 下一步

1. 在 `index.ts` 中初始化 ReviewSyncManager
2. 在 `ReviewView.vue` 中集成同步钩子
3. 测试各种复习场景
4. 根据用户反馈调整配置

## 参考资料

- SuperMemo 文档：`H:\project-F\flashcard\资料\supermemo\`
- Anki 源码：`H:\project-F\flashcard\anki\`
- HybridSyncService：`src/services/HybridSyncService.ts`
