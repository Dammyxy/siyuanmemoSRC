# Riff 同步集成

## 1. 概述

Xiuyuan 系统已经有完整的 Riff 同步实现（`XiuyuanSyncService`，原名 `HybridSyncService`），统一化后**不需要重新实现**，只需要确保兼容性。

## 2. 现有同步服务

### 2.1 XiuyuanSyncService

**文件**：`src/application/services/XiuyuanSyncService.ts`

**功能**：
- ✅ 增量同步：快速获取 Riff 新卡片
- ✅ 全量同步：检测双向删除 + 清理黑名单
- ✅ 删除同步：双向删除同步
- ✅ 自动重试：网络错误自动重试（最多 3 次）
- ✅ 进度回调：详细的同步进度信息
- ✅ 事件驱动：通过 EventBus 发布领域事件

### 2.2 同步策略

```typescript
/**
 * 同步策略
 * 
 * 1. 增量同步（日常使用）
 *    - 获取 Riff 新卡片
 *    - 不覆盖本地卡片数据
 *    - 只添加新卡片
 * 
 * 2. 全量同步（定期维护）
 *    - 检测双向删除
 *    - 清理黑名单
 *    - 同步所有卡片
 * 
 * 3. 删除同步
 *    - 插件删除 → Riff 删除
 *    - Riff 删除 → 本地删除
 */
```

## 3. 统一化后的兼容性

### 3.1 核心原则

**不覆盖本地数据**：
- Riff 同步只添加新卡片
- 不修改已存在的卡片
- 保持本地优先

**示例**：

```typescript
// XiuyuanSyncService 中的逻辑
async syncFromRiff(): Promise<SyncResult> {
  // 1. 获取 Riff 新卡片
  const riffCards = await getRiffNewCards(this.config.deckId);
  
  // 2. 过滤已存在的卡片
  const newCards = riffCards.filter(riffCard => {
    const localCard = this.storage.getCard(riffCard.id);
    return !localCard;  // ✅ 只添加不存在的卡片
  });
  
  // 3. 转换为 FSRSCard
  const fsrsCards = await Promise.all(
    newCards.map(riffCard => this.convertRiffCardToFSRSCard(riffCard))
  );
  
  // 4. 批量创建（不覆盖）
  await this.cardApplicationService.batchCreateCardsWithoutEvents(fsrsCards);
  
  return { addedCount: fsrsCards.length };
}
```

### 3.2 统一化后的调整

**需要确保的点**：

1. **所有新卡片都有 xiuyuanID**

```typescript
private async convertRiffCardToFSRSCard(riffCard: RiffBlock): Promise<FSRSCard> {
  // 1. 创建 Xiuyuan
  const xiuyuan = await this.createXiuyuanForRiffCard(riffCard);
  
  // 2. 创建 FSRSCard
  const card: FSRSCard = {
    id: riffCard.id,
    xiuyuanID: xiuyuan.id,  // ✅ 必需
    blockId: riffCard.id,
    
    // FSRS 数据
    due: riffCard.due,
    stability: riffCard.stability,
    difficulty: riffCard.difficulty,
    // ...
    
    // 类型和模板
    type: this.detectCardType(riffCard),
    templateID: this.selectTemplate(riffCard),
    
    // 元数据
    meta: {
      xiuyuanID: xiuyuan.id,
      templateID: this.selectTemplate(riffCard),
      frontBlockIDs: [riffCard.id],
      backBlockIDs: [riffCard.id],
      fieldMapping: { content: riffCard.id },
    },
    
    // 时间戳
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  return card;
}
```

2. **自动选择模板**

```typescript
private selectTemplate(riffCard: RiffBlock): string {
  // 检测符号
  if (this.hasSymbol(riffCard)) {
    return 'builtin-symbol-qa';
  }
  
  // 检测类型
  const cardType = this.detectCardType(riffCard);
  if (cardType === 'concept') {
    return 'builtin-concept-simple';
  }
  
  // 默认
  return 'builtin-quick-card';
}
```

3. **保持优先级同步**

```typescript
private async convertRiffCardToFSRSCard(riffCard: RiffBlock): Promise<FSRSCard> {
  // 读取块属性中的优先级
  const attrs = await getBlockAttrs(riffCard.id);
  const priority = parseInt(attrs['custom-fsrs-priority'] || '50');
  
  return {
    // ...
    priority,  // ✅ 从块属性读取
    // ...
  };
}
```

## 4. 一对多关系支持

### 4.1 核心特性

**Xiuyuan 系统的核心价值**：
- ✅ 解耦块和闪卡
- ✅ 一个块可以有多张闪卡
- ✅ 支持双向卡片、列表模版卡等

### 4.2 数据结构

```typescript
// 一个块 → 多张卡片
Block {
  id: 'block-1',
  content: 'DDD <> 领域驱动设计',
}

// 生成 1 个 Xiuyuan
Xiuyuan {
  id: 'xy_123',
  blockIDs: ['block-1'],
  templateID: 'builtin-quick-bidirectional',
  fields: [
    { name: 'content', blockID: 'block-1' },
  ],
}

// 生成 2 张卡片
Card {
  id: 'card-1',
  xiuyuanID: 'xy_123',
  blockId: 'block-1',
  meta: {
    typeMarker: 'forward',
    frontBlockIDs: ['block-1'],
    backBlockIDs: ['block-1'],
  },
}

Card {
  id: 'card-2',
  xiuyuanID: 'xy_123',
  blockId: 'block-1',
  meta: {
    typeMarker: 'reverse',
    frontBlockIDs: ['block-1'],
    backBlockIDs: ['block-1'],
  },
}
```

### 4.3 查询支持

```typescript
// 查询一个块的所有卡片
const cards = storage.getCardsByBlockId('block-1');
// 返回：[card-1, card-2]

// 查询一个 Xiuyuan 的所有卡片
const cards = storage.getCardsByXiuyuanId('xy_123');
// 返回：[card-1, card-2]
```

### 4.4 删除级联

```typescript
// 删除块时，删除所有关联的卡片
async deleteBlock(blockId: string): Promise<void> {
  // 1. 查找所有关联的卡片
  const cards = storage.getCardsByBlockId(blockId);
  
  // 2. 删除所有卡片
  for (const card of cards) {
    await cardService.deleteCard({ cardId: card.id });
  }
  
  // 3. Xiuyuan 会自动级联删除（如果没有其他卡片）
}
```

## 5. Riff 同步的一对多处理

### 5.1 问题

Riff 系统是一对一的（一个块 → 一张卡片），但 Xiuyuan 是一对多的。

### 5.2 解决方案

**策略**：Riff 同步时，只创建单张卡片（使用快速卡片模板）

```typescript
private async convertRiffCardToFSRSCard(riffCard: RiffBlock): Promise<FSRSCard> {
  // 1. 创建 Xiuyuan（单块）
  const xiuyuan: IXiuyuan = {
    id: `xy_riff_${riffCard.id}`,
    blockIDs: [riffCard.id],
    templateID: 'builtin-quick-card',  // ✅ 使用快速卡片模板（单卡）
    fields: [
      { name: 'content', blockID: riffCard.id },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  // 2. 创建 FSRSCard（单卡）
  const card: FSRSCard = {
    id: riffCard.id,
    xiuyuanID: xiuyuan.id,
    blockId: riffCard.id,
    // ...
    templateID: 'builtin-quick-card',
    meta: {
      xiuyuanID: xiuyuan.id,
      templateID: 'builtin-quick-card',
      frontBlockIDs: [riffCard.id],
      backBlockIDs: [riffCard.id],
      fieldMapping: { content: riffCard.id },
    },
  };
  
  return card;
}
```

**用户可以手动转换**：
- 用户可以删除 Riff 同步的卡片
- 然后使用插件的模板功能重新创建（如双向卡片）

## 6. 同步配置

### 6.1 配置选项

```typescript
interface RiffIntegrationConfig {
  mode: 'simple' | 'advanced';
  deckId: string;
  syncInterval?: number;
  autoSync?: boolean;
}
```

### 6.2 Simple 模式

- 不使用 XiuyuanSyncService
- 直接使用 Riff API
- 适合简单场景

### 6.3 Advanced 模式

- 使用 XiuyuanSyncService
- 完整的同步功能
- 适合高级用户

## 7. 统一化后的验证

### 7.1 验证清单

- [ ] Riff 同步的卡片都有 xiuyuanID
- [ ] Riff 同步不覆盖本地数据
- [ ] 一对多关系正确处理
- [ ] 删除级联正确
- [ ] 优先级同步正确

### 7.2 测试场景

```typescript
describe('Riff Sync Integration', () => {
  it('should sync new cards from Riff', async () => {
    // 1. Mock Riff 返回新卡片
    const riffCards = [createMockRiffCard()];
    
    // 2. 同步
    await syncService.syncFromRiff();
    
    // 3. 验证卡片已创建
    const card = storage.getCard(riffCards[0].id);
    expect(card).toBeDefined();
    expect(card?.meta?.xiuyuanID).toBeDefined();
  });
  
  it('should not overwrite existing cards', async () => {
    // 1. 创建本地卡片
    const localCard = await cardService.createCard({
      blockIds: ['block-1'],
      priority: 80,
    });
    
    // 2. Mock Riff 返回相同的卡片（但优先级不同）
    const riffCard = createMockRiffCard({
      id: 'block-1',
      priority: 50,
    });
    
    // 3. 同步
    await syncService.syncFromRiff();
    
    // 4. 验证本地卡片未被覆盖
    const card = storage.getCard('block-1');
    expect(card?.priority).toBe(80);  // ✅ 保持本地值
  });
  
  it('should support one-to-many relationship', async () => {
    // 1. 创建双向卡片
    await cardService.createCard({
      blockIds: ['block-1'],
      templateId: 'builtin-quick-bidirectional',
    });
    
    // 2. 验证生成了 2 张卡片
    const cards = storage.getCardsByBlockId('block-1');
    expect(cards.length).toBe(2);
    
    // 3. 验证都关联到同一个 Xiuyuan
    const xiuyuanId = cards[0].meta.xiuyuanID;
    expect(cards[1].meta.xiuyuanID).toBe(xiuyuanId);
  });
});
```

## 8. 总结

### 8.1 现有功能

- ✅ XiuyuanSyncService 已实现完整的 Riff 同步
- ✅ 不覆盖本地数据
- ✅ 支持增量和全量同步
- ✅ 支持删除同步

### 8.2 统一化后的调整

- ✅ 确保所有卡片都有 xiuyuanID
- ✅ 自动选择模板
- ✅ 保持优先级同步
- ✅ 支持一对多关系

### 8.3 不需要重新实现

- ✅ 同步逻辑已完整
- ✅ 只需要确保兼容性
- ✅ 添加测试验证

## 9. 下一步

1. 验证 XiuyuanSyncService 与统一化后的存储兼容
2. 添加一对多关系的测试
3. 更新文档说明 Riff 同步的限制（单卡）
4. 提供用户手动转换的指南
