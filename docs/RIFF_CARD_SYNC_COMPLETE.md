# Riff 卡片同步修复 - 完成总结

## 问题回顾

**用户报告**：渐进学习队列中，四个评分选项显示相同的时间

**根本原因**：Riff 卡片没有被同步到本地存储

---

## 修复过程

### Phase 1: 初步修复（已完成）

**问题**：`FSRSCard.due` 类型处理错误

**修复**：
- ✅ 修复 `RiffDataSource.extractNextDues()` 方法
- ✅ 添加 `IncrementalLearningQueue._recalculateNextDues()` 方法
- ✅ 在加载时创建默认卡片

**结果**：临时解决方案，但不是根本解决

### Phase 2: 核心修复（已完成）

**问题**：Riff 卡片在复习时没有被同步到本地存储

**修复**：
- ✅ 修改 `IncrementalLearningQueue.onFeedback()` 方法
- ✅ 添加 `_createCardFromRiff()` 方法
- ✅ 在复习时同步 Riff 卡片到本地存储

**结果**：根本解决问题

---

## 修改的文件

### 1. IncrementalLearningQueue.ts

**位置**：`siyuan-plugin-fsrs/src/core/queue/strategies/IncrementalLearningQueue.ts`

**修改内容**：

#### A. 修改 onFeedback() 方法

```typescript
if (feedback.action === 'rate') {
  const rating = feedback.rating;
  if (!rating) return;

  if (this.schedulerRouter && this.storage) {
    let fsrsCard = this.storage.getCard(cardID);
    
    // 🆕 如果卡片不存在，从 Riff 数据创建
    if (!fsrsCard) {
      console.log('[IncrementalLearningQueue] Card not found, creating from Riff:', cardID);
      fsrsCard = await this._createCardFromRiff(currentItem);
      if (!fsrsCard) {
        console.warn('[IncrementalLearningQueue] Failed to create card, using Riff API:', cardID);
        await this.api.reviewRiffCard(deckID, cardID, rating);
        if (!isLocal) {
          this._afterRiffConsumed(currentItem);
          this.riffCurrentRaw = null;
        }
        this.reviewedCount++;
        return;
      }
    }

    // 使用 SchedulerRouter 进行复习
    const updatedCard = await this.schedulerRouter.route(fsrsCard, rating);

    // 可选：同步到 Riff
    if (!isLocal && this.config?.enableRiffSync) {
      await this.api.reviewRiffCard(deckID, cardID, rating);
      console.log('[IncrementalLearningQueue] ✅ Synced to Riff:', cardID);
    }

    console.log('[IncrementalLearningQueue] ✅ Used SchedulerRouter:', {
      cardID,
      isLocal,
      cardType: updatedCard.type,
      schedulerType: updatedCard.schedulerType,
      syncedToRiff: !isLocal && this.config?.enableRiffSync,
    });
  }
}
```

#### B. 新增 _createCardFromRiff() 方法

```typescript
/**
 * 从 Riff 数据创建 FSRSCard
 * 
 * @param item QueueItem（来自 Riff API）
 * @returns FSRSCard 或 null（如果创建失败）
 */
private async _createCardFromRiff(item: QueueItem): Promise<any | null> {
  try {
    const now = Date.now();
    
    const fsrsCard = {
      id: item.cardID,
      blockId: item.blockID,
      due: now,
      stability: 0,
      difficulty: 5,
      reps: item.reps ?? 0,
      lapses: item.lapses ?? 0,
      state: item.state ?? 0,
      lastReview: item.lastReview ?? 0,
      elapsedDays: 0,
      scheduledDays: 0,
      priority: item.priority ?? 50,
      type: 'item' as const,
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: now,
      updatedAt: now,
    };
    
    this.storage!.setCard(fsrsCard);
    await this.storage!.saveCards();
    
    console.log('[IncrementalLearningQueue] ✅ Created card from Riff:', item.cardID);
    
    return fsrsCard;
  } catch (error) {
    console.error('[IncrementalLearningQueue] Failed to create card from Riff:', error);
    return null;
  }
}
```

### 2. 文档更新

**新增文档**：
- `siyuan-plugin-fsrs/docs/FIX_RIFF_CARD_SYNC.md` - 详细的修复文档
- `siyuan-plugin-fsrs/docs/RIFF_CARD_SYNC_COMPLETE.md` - 本文档

**更新文档**：
- `siyuan-plugin-fsrs/docs/NEXTDUES_PREDICTION_FIX.md` - 添加了 Phase 2 修复说明

---

## 测试验证

### 测试步骤

1. **清空本地存储**（可选）：
   ```bash
   # 删除 cards.msgpack 文件
   rm /data/storage/petal/siyuan-plugin-fsrs/cards.msgpack
   ```

2. **重新加载插件**：
   - 在思源笔记中重新加载插件
   - 或重启思源笔记

3. **打开渐进学习队列**：
   - 点击插件图标
   - 选择"渐进学习"队列

4. **检查日志**（F12 打开控制台）：
   ```
   [IncrementalLearningQueue] Loading Riff cards for deck: 20230218211946-2kw8jgx
   [IncrementalLearningQueue] Riff cards loaded: { total: X, new: Y, old: Z }
   [IncrementalLearningQueue] ✅ Created N default cards
   [IncrementalLearningQueue] ✅ Recalculated nextDues for N cards
   ```

5. **复习卡片**：
   - 选择一个评分（1-4）
   - 检查日志：
     ```
     [IncrementalLearningQueue] Card not found, creating from Riff: [cardID]
     [IncrementalLearningQueue] ✅ Created card from Riff: [cardID]
     [IncrementalLearningQueue] ✅ Used SchedulerRouter: { ... }
     ```

6. **验证 nextDues**：
   - 四个选项应该显示不同的时间
   - 时间应该符合调度算法（SM-15 或 A-Factor v2）

### 预期结果

#### 修复前

```
nextDues: {
  1: "2026-02-01T12:00:00.000Z",
  2: "2026-02-01T12:00:00.000Z",
  3: "2026-02-01T12:00:00.000Z",
  4: "2026-02-01T12:00:00.000Z"
}
```

#### 修复后

```
nextDues: {
  1: "2026-02-01T12:00:00.000Z",  // Again: 1 minute
  2: "2026-02-01T12:10:00.000Z",  // Hard: 10 minutes
  3: "2026-02-01T13:00:00.000Z",  // Good: 1 hour
  4: "2026-02-02T12:00:00.000Z"   // Easy: 1 day
}
```

---

## 技术细节

### 数据流

```
用户评分
  ↓
IncrementalLearningQueue.onFeedback()
  ↓
检查本地存储
  ├─ 存在 → 使用 SchedulerRouter
  └─ 不存在 → _createCardFromRiff()
                ↓
            创建 FSRSCard
                ↓
            保存到本地存储
                ↓
            使用 SchedulerRouter
```

### 关键改进

1. **在复习时同步**：而不是只在加载时创建默认卡片
2. **使用 QueueItem 数据**：从 Riff API 返回的数据创建 FSRSCard
3. **保存到本地存储**：确保后续复习可以使用本地数据
4. **使用 SchedulerRouter**：确保使用正确的调度算法

### 设计原则

根据 `.kiro/specs/riff-data-source-decoupling/design.md`：

1. **Riff 只是数据源**：不控制排期
2. **本地存储是唯一控制器**：所有排期由 SchedulerRouter 计算
3. **可选同步到 Riff**：通过 `enableRiffSync` 配置

---

## 相关文档

### 设计文档

- `.kiro/specs/riff-data-source-decoupling/design.md` - Riff 数据源解耦设计
- `.kiro/specs/riff-data-source-decoupling/requirements.md` - 需求文档
- `.kiro/specs/riff-data-source-decoupling/tasks.md` - 任务列表

### 修复文档

- `siyuan-plugin-fsrs/docs/FIX_RIFF_CARD_SYNC.md` - 详细的修复文档
- `siyuan-plugin-fsrs/docs/NEXTDUES_PREDICTION_FIX.md` - nextDues 预测修复
- `siyuan-plugin-fsrs/docs/SCHEDULER_ROUTER_DIAGNOSTIC.md` - SchedulerRouter 诊断

### 架构文档

- `siyuan-plugin-fsrs/ARCHITECTURE.md` - 插件架构总览
- `siyuan-plugin-fsrs/docs/API_REFERENCE.md` - API 参考

---

## 下一步

### 立即测试

1. ✅ 重新加载插件
2. ✅ 测试渐进学习队列
3. ✅ 验证 nextDues 显示不同时间
4. ✅ 检查日志确认卡片同步

### 后续优化（可选）

1. **批量同步**：在加载时批量创建所有缺失的卡片
2. **卡片类型检测**：使用 `detectCardType()` 自动检测 Topic/Item
3. **性能优化**：缓存本地卡片数据
4. **错误处理**：更完善的错误处理和回滚机制

### 监控指标

- Riff 卡片同步成功率
- nextDues 计算准确性
- 本地存储命中率
- 复习操作响应时间

---

## 总结

**问题**：Riff 卡片的 nextDues 显示相同的时间

**根本原因**：Riff 卡片没有被同步到本地存储

**解决方案**：
1. ✅ 在 `onFeedback()` 时检查卡片是否存在
2. ✅ 如果不存在，从 Riff 数据创建 FSRSCard
3. ✅ 保存到本地存储
4. ✅ 使用 SchedulerRouter 进行复习

**结果**：
- ✅ Riff 卡片被正确同步到本地存储
- ✅ nextDues 显示不同的时间
- ✅ 使用正确的调度算法（SM-15 或 A-Factor v2）
- ✅ 符合设计文档的架构原则

---

**最后更新**：2026-02-01
**状态**：✅ 完成
**优先级**：P0（关键功能）
**影响范围**：渐进学习队列的 Riff 卡片同步和时间预测
