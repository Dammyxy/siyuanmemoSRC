# Riff 同步需要创建 Xiuyuan

## 问题分析

当前 `XiuyuanSyncService` 从 Riff 获取卡片时，只创建了 FSRSCard，没有创建对应的 Xiuyuan 聚合根。

**问题代码**：`convertRiffCardToFSRSCard()` 方法（第 1000+ 行）

```typescript
private async convertRiffCardToFSRSCard(riffBlock: RiffBlock): Promise<FSRSCard> {
  // ... 只创建 FSRSCard，没有 xiuyuanID
  return {
    id: riffBlock.id,
    blockId: riffBlock.id,
    // ... 其他字段
    // ❌ 缺少 meta.xiuyuanID
  };
}
```

**调用链**：
1. `incrementalSync()` → 调用 `convertRiffCardToFSRSCard()`
2. `fullSync()` → 调用 `convertRiffCardToFSRSCard()`
3. 创建的 FSRSCard 没有 `xiuyuanID`
4. 调用 `UnifiedStorageManager.setCard()` 时抛出错误

## 解决方案

### 方案 A：在同步时为每个 Riff 卡片创建 Xiuyuan（推荐）✅

**优点**：
- 符合 DDD 架构
- 自动处理新卡片
- 不需要手动迁移

**实现**：
1. 修改 `convertRiffCardToFSRSCard()` 方法
2. 为每个 Riff 卡片创建一个 Xiuyuan
3. 使用特殊模板标记：`builtin-riff-sync`

**代码修改**：

```typescript
private async convertRiffCardToFSRSCard(riffBlock: RiffBlock): Promise<{
  xiuyuan: IXiuyuan;
  card: FSRSCard;
}> {
  const now = Date.now();
  
  // 1. 生成 Xiuyuan ID
  const xiuyuanId = `xy_riff_${riffBlock.id}`;
  
  // 2. 创建 Xiuyuan 数据结构
  const xiuyuan: IXiuyuan = {
    id: xiuyuanId,
    blockIDs: [riffBlock.id],
    templateID: 'builtin-riff-sync',  // 特殊模板标记 Riff 同步的卡片
    fields: [{
      name: 'riff-card',
      blockID: riffBlock.id,
      marker: 'question'
    }],
    meta: {
      priority: 50,  // 默认优先级
      schedulerType: 'fsrs-v6',
      faces: [{
        question: '',  // Riff 卡片没有 faces 概念
        answer: '',
        questionBlockId: riffBlock.id,
        answerBlockId: riffBlock.id
      }],
      cards: []  // 稍后填充
    },
    createdAt: now,
    updatedAt: now
  };
  
  // 3. 创建 FSRSCard（带 xiuyuanID）
  const card: FSRSCard = {
    id: riffBlock.id,
    blockId: riffBlock.id,
    // ... 其他字段
    meta: {
      xiuyuanID: xiuyuanId,  // ✅ 关键：添加 xiuyuanID
      templateID: 'builtin-riff-sync',
      ruleIndex: 0,
      frontBlockIDs: [riffBlock.id],
      backBlockIDs: [riffBlock.id],
      fieldMapping: {},
      frontFields: [],
      backFields: [],
    }
  };
  
  // 4. 将 card 信息添加到 xiuyuan.meta.cards
  xiuyuan.meta.cards = [{
    id: card.id,
    xiuyuanId: xiuyuanId,
    faceIndex: 0,
    scheduleInfo: {
      due: card.due,
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      lastReview: card.lastReview || now,
      elapsedDays: card.elapsedDays || 0,
      scheduledDays: card.scheduledDays || 0,
      learning_step: card.learning_step || 0
    },
    createdAt: now,
    updatedAt: now
  }];
  
  return { xiuyuan, card };
}
```

**调用方修改**：

```typescript
// incrementalSync() 中
for (const riffCard of filtered) {
  const result = await this.cardApplicationService.getCard({ cardId: riffCard.id });
  const localCard = result.card;
  
  if (!localCard) {
    // ✅ 修改：创建 Xiuyuan 和 Card
    const { xiuyuan, card } = await this.convertRiffCardToFSRSCard(riffCard);
    
    // 保存 Xiuyuan 到 UnifiedStorage
    (this.storage.getUnifiedStorage() as any).xiuyuans.set(xiuyuan.id, xiuyuan);
    
    // 使用 CardApplicationService 添加新卡片
    await this.cardApplicationService.batchCreateCardsWithoutEvents([card]);
    
    addedCount++;
  }
}
```

### 方案 B：使用数据迁移脚本（临时方案）

**优点**：
- 不需要修改同步逻辑
- 一次性解决现有数据

**缺点**：
- 新的 Riff 卡片仍然会失败
- 不是长期解决方案

## 推荐方案

**使用方案 A**，原因：
1. 符合 DDD 架构要求
2. 自动处理新卡片
3. 不需要手动干预
4. 长期可维护

## 实现步骤

1. **修改 `convertRiffCardToFSRSCard()` 方法**
   - 返回 `{ xiuyuan, card }` 而不是只返回 `card`
   - 为每个 Riff 卡片创建对应的 Xiuyuan

2. **修改调用方**
   - `incrementalSync()` 中的卡片创建逻辑
   - `fullSync()` 中的卡片创建逻辑
   - 保存 Xiuyuan 到 UnifiedStorage

3. **创建特殊模板**
   - 模板 ID：`builtin-riff-sync`
   - 用于标记从 Riff 同步的卡片
   - 与手动创建的 Xiuyuan 区分

4. **测试验证**
   - 执行全量同步
   - 验证所有卡片都有 xiuyuanID
   - 测试删除功能

## 注意事项

1. **幂等性**：如果 Xiuyuan 已存在，不要重复创建
2. **性能**：批量创建 Xiuyuan，避免逐个保存
3. **错误处理**：创建失败时记录日志，不要中断整个同步
4. **向后兼容**：保留旧的迁移脚本，用于处理历史数据

## 后续优化

1. **合并相同 blockId 的卡片**：
   - 如果多个卡片共享同一个 blockId
   - 可以合并到同一个 Xiuyuan
   - 减少 Xiuyuan 数量

2. **智能模板选择**：
   - 根据卡片类型选择合适的模板
   - Topic 卡片 → `builtin-topic-riff`
   - Item 卡片 → `builtin-item-riff`

3. **增量更新**：
   - 只在卡片首次同步时创建 Xiuyuan
   - 后续同步只更新 FSRSCard 数据
