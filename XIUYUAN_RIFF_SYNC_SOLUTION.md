# Xiuyuan 卡片 Riff 同步解决方案

**文档创建时间**：2026-02-14  
**问题**：Xiuyuan 列表模版卡没有加入 Riff，导致全量同步后被删除  
**目标**：确保 Xiuyuan 卡片与 Riff 数据库保持同步

---

## 🔍 问题分析

### 当前实现

```typescript
// src/core/xiuyuan/service.ts - createFromBlocks()
async createFromBlocks(...) {
    // 1. 创建 Xiuyuan
    const xiuyuan = this.storage.createXiuyuan({...});
    
    // 2. 创建 FSRSCard
    const fsrsCard: FSRSCard = {...};
    this.storageManager.setCard(fsrsCard);
    
    // ❌ 问题：没有调用 addRiffCards
    // ❌ 结果：Riff 数据库中没有这些卡片
}
```

### 问题表现

1. **创建时**：
   - ✅ Xiuyuan 数据正常保存
   - ✅ FSRSCard 本地存储正常
   - ❌ Riff 数据库中没有记录

2. **全量同步时**：
   ```typescript
   // HybridSyncService.fullSync()
   const riffCards = await getRiffCards(); // 从 Riff 获取
   const localCards = storage.getAllCards(); // 从本地获取
   
   // Xiuyuan 卡片不在 Riff 中
   // → 被认为是"本地独有"
   // → 全量同步时被删除 ❌
   ```

3. **复习时**：
   - ✅ 可以正常复习（因为本地有 FSRSCard）
   - ❌ 但数据不持久（全量同步后丢失）

---

## 💡 解决方案

### ⚠️ 方案 A 的问题（已废弃）

**原方案**：选择一个"代表块"加入 Riff

**问题**：
```typescript
// Riff 存储的是 blockId
Riff: [{ id: 'parent-block-id', ... }]

// 但 FSRSCard 的 id 是虚拟的
FSRSCards: [
  { id: 'xiuyuan-001-0', blockId: 'parent-block-id', ... },
  { id: 'xiuyuan-001-1', blockId: 'child-1', ... },
  { id: 'xiuyuan-001-2', blockId: 'child-2', ... },
]

// 全量同步时：
// - Riff 中只有 'parent-block-id'
// - FSRSCard 的 id 是 'xiuyuan-001-0', 'xiuyuan-001-1', 'xiuyuan-001-2'
// - 找不到匹配 → 被删除 ❌
```

---

### ⚠️ 方案 B 的问题（已废弃）

**方案**：将所有相关块都加入 Riff

**问题**：
- 违背 Xiuyuan 设计初衷（块和卡片解耦）
- Riff 中存储冗余数据
- 不够优雅

---

### 方案 C：ID 转换机制（推荐 ✅）

#### 核心思路

**在 Riff 和本地存储之间建立 ID 映射关系**：

```typescript
// 1. Riff 中只存储一个"代表块"
Riff: [
  { id: 'parent-block-id', ... },  // ← 只存一个块
]

// 2. 本地存储多张卡片（共用同一个 blockId）
LocalCards: [
  { id: 'xiuyuan-001-0', blockId: 'parent-block-id', meta: { xiuyuanID: 'xiuyuan-001' } },
  { id: 'xiuyuan-001-1', blockId: 'parent-block-id', meta: { xiuyuanID: 'xiuyuan-001' } },
  { id: 'xiuyuan-001-2', blockId: 'parent-block-id', meta: { xiuyuanID: 'xiuyuan-001' } },
]

// 3. 同步时通过 blockId 查找所有关联的 FSRSCard
syncFromRiff('parent-block-id') → 找到 3 张卡片 → 全部保留
```

#### 关键优势

1. ✅ **符合 Xiuyuan 设计初衷**：块和卡片解耦
2. ✅ **Riff 中只存一个块**：避免冗余
3. ✅ **本地多张卡片**：每张卡片独立的复习数据
4. ✅ **通过 blockId 关联**：同步时可以找到所有相关卡片
5. ✅ **跨设备同步**：Riff 同步代表块，本地重建所有卡片

#### 实现方式

```typescript
async createFromBlocks(
    blockIDs: string[],
    templateID: string,
    fieldMapping: Record<string, string>,
    deckID: string = riffAPI.BUILTIN_DECK_ID
): Promise<Result<{ xiuyuan: IXiuyuan; cards: ICardMapping[] }>> {
    try {
        // ... 创建 Xiuyuan ...
        
        // 🆕 关键：选择一个代表块加入 Riff
        const representativeBlockID = this.selectRepresentativeBlock(
            blockIDs, 
            templateID, 
            fieldMapping
        );
        
        console.log(`[Xiuyuan] Adding representative block to Riff: ${representativeBlockID}`);
        await riffAPI.addRiffCards(deckID, [representativeBlockID]);
        
        // 🆕 标记代表块属性
        await setBlockAttrs(representativeBlockID, {
            'custom-fsrs-xiuyuan-id': xiuyuan.id,
            'custom-fsrs-template-id': templateID,
        });
        
        // 🆕 创建 FSRSCard 时，所有卡片共用同一个 blockId（代表块）
        for (let ruleIndex = 0; ruleIndex < template.cardRules.length; ruleIndex++) {
            const cardID = generateXiuyuanCardID(xiuyuan.id, ruleIndex);
            
            const fsrsCard: FSRSCard = {
                id: cardID,
                blockId: representativeBlockID,  // ← 关键：所有卡片共用同一个 blockId
                // ... 其他字段 ...
                meta: {
                    xiuyuanID: xiuyuan.id,
                    templateID,
                    ruleIndex,
                    // ...
                },
            };
            
            this.storageManager.setCard(fsrsCard);
        }
        
        return ok({ xiuyuan, cards });
    } catch (error) {
        console.error('[Xiuyuan] createFromBlocks failed:', error);
        return err(error as Error);
    }
}

/**
 * 选择代表块
 */
private selectRepresentativeBlock(
    blockIDs: string[],
    templateID: string,
    fieldMapping: Record<string, string>
): string {
    switch (templateID) {
        case 'builtin-list-item':
            // 列表模版：使用父列表项（第一个块）
            return blockIDs[0];
            
        case 'builtin-concept-descriptor':
            // 概念-描述符：使用描述符块
            return fieldMapping['descriptor'] || blockIDs[1] || blockIDs[0];
            
        case 'builtin-bidirectional':
            // 双向卡片：使用第一个块
            return blockIDs[0];
            
        default:
            // 默认：使用第一个块
            return blockIDs[0];
    }
}
```

---

### 方案 B：全量同步时保护 Xiuyuan 卡片

#### 核心思路

在全量同步时，识别并保护 Xiuyuan 卡片，不删除它们。

#### 实现方式

```typescript
// src/services/HybridSyncService.ts
async fullSync(): Promise<void> {
    console.log('[HybridSync] Starting full sync...');
    
    // 1. 获取 Riff 卡片
    const riffCards = await getRiffCards();
    const riffCardIds = new Set(riffCards.map(c => c.id));
    
    // 2. 获取本地卡片
    const localCards = this.storage.getAllCards();
    
    // 3. 🆕 识别 Xiuyuan 卡片
    const xiuyuanCardIds = new Set(
        localCards
            .filter(card => this.isXiuyuanCard(card))
            .map(card => card.id)
    );
    
    console.log(`[HybridSync] Found ${xiuyuanCardIds.size} Xiuyuan cards`);
    
    // 4. 删除本地独有的卡片（但保护 Xiuyuan 卡片）
    for (const card of localCards) {
        if (!riffCardIds.has(card.id)) {
            // 🆕 保护 Xiuyuan 卡片
            if (xiuyuanCardIds.has(card.id)) {
                console.log(`[HybridSync] Protecting Xiuyuan card: ${card.id}`);
                continue;
            }
            
            // 删除非 Xiuyuan 的本地独有卡片
            console.log(`[HybridSync] Removing local-only card: ${card.id}`);
            this.storage.removeCard(card.id);
        }
    }
    
    // ... 其他同步逻辑 ...
}

/**
 * 判断是否为 Xiuyuan 卡片
 */
private isXiuyuanCard(card: FSRSCard): boolean {
    return !!(card.meta?.xiuyuanID);
}
```

---

## 📊 方案对比

| 特性 | 方案 A（代表块） | 方案 B（所有块） | 方案 C（ID转换）✅ |
|------|----------------|----------------|-------------------|
| **Riff 存储** | 1 个块 | N 个块 | 1 个块 |
| **本地卡片** | N 张（共用 blockId） | N 张（不同 blockId） | N 张（共用 blockId） |
| **数据一致性** | ❌ 有问题 | ✅ 完全一致 | ✅ 完全一致 |
| **跨设备同步** | ❌ 不支持 | ✅ 支持 | ✅ 支持 |
| **符合设计初衷** | ✅ 符合 | ❌ 不符合 | ✅ 符合 |
| **实现复杂度** | ⭐⭐ 中等 | ⭐ 简单 | ⭐⭐⭐ 较复杂 |
| **维护成本** | ⭐⭐ 中等 | ⭐ 低 | ⭐⭐ 中等 |
| **推荐度** | ❌ 不推荐 | ⚠️ 备选 | ✅ 推荐 |

---

## ✅ 推荐方案：方案 C（ID 转换机制）

### 理由

1. **符合 Xiuyuan 设计初衷**：块和卡片解耦，Riff 中只存一个块
2. **数据一致性**：通过 blockId 关联，全量同步时不会丢失
3. **跨设备支持**：可以通过 Riff 同步，并在新设备上重建
4. **优雅的架构**：清晰的 ID 映射关系

### 实现细节

#### 1. 修改 `createFromBlocks` 方法

```typescript
// src/core/xiuyuan/service.ts
async createFromBlocks(
    blockIDs: string[],
    templateID: string,
    fieldMapping: Record<string, string>,
    deckID: string = riffAPI.BUILTIN_DECK_ID
): Promise<Result<{ xiuyuan: IXiuyuan; cards: ICardMapping[] }>> {
    try {
        const template = this.storage.getTemplate(templateID);
        if (!template) {
            return err(new Error(`Template not found: ${templateID}`));
        }

        // 1. 创建 Xiuyuan
        const xiuyuan = this.storage.createXiuyuan({
            blockIDs,
            fields: template.fields.map(f => ({
                name: f.name,
                blockID: fieldMapping[f.name] || '',
                marker: f.name,
            })),
            templateID,
        });

        console.log('[Xiuyuan] Created Xiuyuan:', xiuyuan.id);

        // 2. 🆕 选择代表块
        const representativeBlockID = this.selectRepresentativeBlock(
            blockIDs, 
            templateID, 
            fieldMapping
        );

        console.log('[Xiuyuan] Representative block:', representativeBlockID);

        // 3. 🆕 将代表块加入 Riff
        try {
            await riffAPI.addRiffCards(deckID, [representativeBlockID]);
            console.log('[Xiuyuan] ✅ Added to Riff:', representativeBlockID);
        } catch (err) {
            console.error('[Xiuyuan] ❌ Failed to add to Riff:', err);
        }

        // 4. 🆕 标记代表块属性
        try {
            await setBlockAttrs(representativeBlockID, {
                'custom-fsrs-xiuyuan-id': xiuyuan.id,
                'custom-fsrs-template-id': templateID,
            });
            console.log('[Xiuyuan] ✅ Marked block attributes');
        } catch (err) {
            console.error('[Xiuyuan] ❌ Failed to mark attributes:', err);
        }

        // 5. 为每个 cardRule 创建 FSRSCard
        const cards: ICardMapping[] = [];
        const now = Date.now();

        for (let ruleIndex = 0; ruleIndex < template.cardRules.length; ruleIndex++) {
            const rule = template.cardRules[ruleIndex];
            const cardID = generateXiuyuanCardID(xiuyuan.id, ruleIndex);

            // 计算渲染信息
            const { frontBlockIDs, backBlockIDs } = calculateRenderBlockIDs(
                rule.frontFields,
                rule.backFields,
                fieldMapping
            );

            // 创建 CardMapping
            const mapping: ICardMapping = {
                xiuyuanID: xiuyuan.id,
                cardID,
                frontFields: rule.frontFields,
                backFields: rule.backFields,
                typeMarker: rule.typeMarker,
            };
            this.storage.createMapping(mapping);
            cards.push(mapping);

            // 创建 FSRSCard
            const meta: XiuyuanCardMeta = {
                xiuyuanID: xiuyuan.id,
                templateID,
                ruleIndex,
                frontFields: rule.frontFields,
                backFields: rule.backFields,
                fieldMapping,
                frontBlockIDs,
                backBlockIDs,
            };

            const fsrsCard: FSRSCard = {
                id: cardID,
                blockId: representativeBlockID,  // ← 关键：所有卡片共用代表块
                due: now,
                stability: 0,
                difficulty: 0,
                reps: 0,
                lapses: 0,
                state: CardState.New,
                lastReview: 0,
                elapsedDays: 0,
                scheduledDays: 0,
                priority: 50,
                type: CardType.Item,
                tags: [],
                leechCount: 0,
                isLeech: false,
                skipped: false,
                createdAt: now,
                updatedAt: now,
                meta,
            };

            this.storageManager.setCard(fsrsCard);
            console.log('[Xiuyuan] Created FSRSCard:', cardID, 'blockId:', representativeBlockID);
        }

        // 6. 持久化
        const saveResult = await this.save();
        if (!saveResult.ok) {
            console.warn('[Xiuyuan] Save failed:', saveResult.error);
        }
        await this.storageManager.saveCards();

        console.log('[Xiuyuan] ✅ Created:', { 
            xiuyuanID: xiuyuan.id, 
            cardCount: cards.length,
            representativeBlock: representativeBlockID,
        });

        return ok({ xiuyuan, cards });
    } catch (error) {
        console.error('[Xiuyuan] createFromBlocks failed:', error);
        return err(error as Error);
    }
}

/**
 * 选择代表块
 */
private selectRepresentativeBlock(
    blockIDs: string[],
    templateID: string,
    fieldMapping: Record<string, string>
): string {
    switch (templateID) {
        case 'builtin-list-item':
            // 列表模版：使用父列表项（第一个块）
            return blockIDs[0];
            
        case 'builtin-concept-descriptor':
            // 概念-描述符：使用描述符块
            return fieldMapping['descriptor'] || blockIDs[1] || blockIDs[0];
            
        case 'builtin-bidirectional':
            // 双向卡片：使用第一个块
            return blockIDs[0];
            
        default:
            // 默认：使用第一个块
            return blockIDs[0];
    }
}
```

---

#### 2. 修改同步服务（关键：通过 blockId 查找所有卡片）

```typescript
// src/services/HybridSyncService.ts

/**
 * 全量同步
 */
async fullSync(): Promise<void> {
    console.log('[HybridSync] Starting full sync...');
    
    // 1. 获取 Riff 卡片
    const riffCards = await getRiffCards();
    const riffBlockIds = new Set(riffCards.map(c => c.blockId));
    
    console.log(`[HybridSync] Riff has ${riffBlockIds.size} blocks`);
    
    // 2. 获取本地卡片
    const localCards = this.storage.getAllCards();
    
    console.log(`[HybridSync] Local has ${localCards.length} cards`);
    
    // 3. 🆕 删除本地独有的卡片（通过 blockId 判断）
    for (const card of localCards) {
        // 检查卡片的 blockId 是否在 Riff 中
        if (!riffBlockIds.has(card.blockId)) {
            console.log(`[HybridSync] Removing card (block not in Riff): ${card.id}, blockId: ${card.blockId}`);
            this.storage.removeCard(card.id);
        }
    }
    
    // 4. 同步 Riff 卡片到本地
    for (const riffCard of riffCards) {
        await this.syncRiffCardToLocal(riffCard);
    }
    
    console.log('[HybridSync] ✅ Full sync completed');
}

/**
 * 同步单个 Riff 卡片到本地
 */
private async syncRiffCardToLocal(riffCard: any): Promise<void> {
    const blockId = riffCard.blockId;
    
    // 1. 检查是否为 Xiuyuan 卡片
    const attrs = await getBlockAttrs(blockId);
    const xiuyuanID = attrs['custom-fsrs-xiuyuan-id'];
    
    if (xiuyuanID) {
        // 🆕 Xiuyuan 卡片：通过 blockId 查找所有关联的 FSRSCard
        const xiuyuanCards = this.storage.getAllCards().filter(
            card => card.blockId === blockId && card.meta?.xiuyuanID === xiuyuanID
        );
        
        console.log(`[HybridSync] Found ${xiuyuanCards.length} Xiuyuan cards for block ${blockId}`);
        
        // 更新所有 Xiuyuan 卡片的数据
        for (const localCard of xiuyuanCards) {
            // 从 Riff 获取最新的复习数据
            const riffData = riffCard.card || {};
            
            // 合并数据（保留本地的 meta 信息）
            const updatedCard = {
                ...localCard,
                due: riffData.due || localCard.due,
                stability: riffData.stability || localCard.stability,
                difficulty: riffData.difficulty || localCard.difficulty,
                reps: riffData.reps || localCard.reps,
                lapses: riffData.lapses || localCard.lapses,
                state: riffData.state || localCard.state,
                lastReview: riffData.lastReview || localCard.lastReview,
                // ... 其他 FSRS 字段 ...
            };
            
            this.storage.setCard(updatedCard);
        }
    } else {
        // 普通卡片：直接同步
        // ... 现有逻辑 ...
    }
}
```

---

#### 3. 修改删除逻辑

```typescript
// src/core/xiuyuan/service.ts
async deleteXiuyuan(id: string): Promise<Result<boolean>> {
    try {
        const xiuyuan = this.storage.getXiuyuan(id);
        if (!xiuyuan) {
            return err(new Error(`Xiuyuan not found: ${id}`));
        }

        // 1. 获取所有关联的 CardMapping
        const mappings = this.storage.getMappingsByXiuyuanID(id);
        console.log(`[Xiuyuan] Deleting ${mappings.length} cards for Xiuyuan: ${id}`);

        // 2. 删除所有关联的 FSRSCard
        for (const mapping of mappings) {
            this.storageManager.removeCard(mapping.cardID);
            console.log(`[Xiuyuan] Deleted FSRSCard: ${mapping.cardID}`);
        }

        // 3. 🆕 从 Riff 中移除代表块
        const representativeBlockID = this.selectRepresentativeBlock(
            xiuyuan.blockIDs,
            xiuyuan.templateID,
            this.buildFieldMapping(xiuyuan)
        );

        try {
            await riffAPI.removeRiffCards([representativeBlockID]);
            console.log('[Xiuyuan] ✅ Removed from Riff:', representativeBlockID);
        } catch (err) {
            console.error('[Xiuyuan] ❌ Failed to remove from Riff:', err);
        }

        // 4. 🆕 清除代表块属性
        try {
            await setBlockAttrs(representativeBlockID, {
                'custom-fsrs-xiuyuan-id': '',
                'custom-fsrs-template-id': '',
            });
            console.log('[Xiuyuan] ✅ Cleared block attributes');
        } catch (err) {
            console.error('[Xiuyuan] ❌ Failed to clear attributes:', err);
        }

        // 5. 删除 Xiuyuan
        const deleted = this.storage.deleteXiuyuan(id);
        if (!deleted) {
            return err(new Error(`Failed to delete Xiuyuan: ${id}`));
        }

        // 6. 持久化
        await this.save();
        await this.storageManager.saveCards();

        console.log('[Xiuyuan] ✅ Deleted:', id);
        return ok(true);
    } catch (error) {
        console.error('[Xiuyuan] deleteXiuyuan failed:', error);
        return err(error as Error);
    }
}
```

---

#### 4. 跨设备同步机制

```typescript
/**
 * 跨设备同步 Xiuyuan 卡片
 * 
 * 场景：设备 A 创建了 Xiuyuan，同步到设备 B
 */
async syncXiuyuanFromRiff(riffCard: any): Promise<void> {
    const blockId = riffCard.blockId;
    
    // 1. 检查块属性
    const attrs = await getBlockAttrs(blockId);
    const xiuyuanID = attrs['custom-fsrs-xiuyuan-id'];
    const templateID = attrs['custom-fsrs-template-id'];
    
    if (!xiuyuanID || !templateID) {
        // 不是 Xiuyuan 卡片，跳过
        return;
    }
    
    // 2. 检查本地是否已有该 Xiuyuan
    const existingXiuyuan = this.xiuyuanService.getXiuyuan(xiuyuanID);
    
    if (existingXiuyuan) {
        // 已存在，只更新复习数据
        console.log(`[HybridSync] Updating existing Xiuyuan: ${xiuyuanID}`);
        await this.updateXiuyuanReviewData(xiuyuanID, riffCard);
    } else {
        // 不存在，需要重建 Xiuyuan
        console.log(`[HybridSync] Rebuilding Xiuyuan from Riff: ${xiuyuanID}`);
        await this.rebuildXiuyuanFromBlock(blockId, xiuyuanID, templateID, riffCard);
    }
}

/**
 * 从块重建 Xiuyuan
 */
private async rebuildXiuyuanFromBlock(
    blockId: string,
    xiuyuanID: string,
    templateID: string,
    riffCard: any
): Promise<void> {
    // 1. 获取块的子块（重建 blockIDs）
    const blockIDs = await this.getXiuyuanBlockIDs(blockId, templateID);
    
    // 2. 重建 fieldMapping
    const fieldMapping = await this.rebuildFieldMapping(blockIDs, templateID);
    
    // 3. 调用 createFromBlocks（但使用已有的 xiuyuanID）
    const result = await this.xiuyuanService.createFromBlocks(
        blockIDs,
        templateID,
        fieldMapping,
        BUILTIN_DECK_ID
    );
    
    if (result.ok) {
        // 4. 更新复习数据
        await this.updateXiuyuanReviewData(xiuyuanID, riffCard);
        console.log(`[HybridSync] ✅ Rebuilt Xiuyuan: ${xiuyuanID}`);
    } else {
        console.error(`[HybridSync] ❌ Failed to rebuild Xiuyuan:`, result.error);
    }
}
```

---

## 🔧 快速制卡集成

### 在快速制卡中应用

```typescript
// QuickCardRouter
private async createMultiLineCard(
    blockId: string, 
    content: string
): Promise<void> {
    const children = await this.getChildBlocks(blockId);
    
    if (children.length < 2) {
        console.warn(`[QuickCard] Multi-Line needs ≥2 children: ${blockId}`);
        return;
    }
    
    // 创建 Xiuyuan（会自动加入 Riff）
    const result = await this.plugin.xiuyuanService.createFromBlocks(
        [blockId, ...children.map(c => c.id)],
        'builtin-list-item',
        {
            question: blockId,
            answer: children[0].id,
        },
        BUILTIN_DECK_ID
    );
    
    if (result.ok) {
        console.log(`[QuickCard] ✅ Created Multi-Line Card: ${result.value.xiuyuan.id}`);
        // ✅ 已自动加入 Riff，无需额外操作
    } else {
        console.error(`[QuickCard] ❌ Failed:`, result.error);
    }
}

private async createDescriptorCard(
    blockId: string, 
    content: string
): Promise<void> {
    const parentBlock = await this.getParentBlock(blockId);
    
    if (!parentBlock || !this.isConceptBlock(parentBlock.content)) {
        console.warn(`[QuickCard] Descriptor without Concept parent: ${blockId}`);
        await this.createBasicCard(blockId, 'basicForward', content);
        return;
    }
    
    // 创建 Xiuyuan（会自动加入 Riff）
    const result = await this.plugin.xiuyuanService.createFromBlocks(
        [parentBlock.id, blockId],
        'builtin-concept-descriptor',
        {
            concept: parentBlock.id,
            descriptor: blockId,
        },
        BUILTIN_DECK_ID
    );
    
    if (result.ok) {
        console.log(`[QuickCard] ✅ Created Descriptor Card: ${result.value.xiuyuan.id}`);
        // ✅ 已自动加入 Riff，无需额外操作
    } else {
        console.error(`[QuickCard] ❌ Failed:`, result.error);
    }
}
```

---

## ✅ 总结

### 核心改动

1. **`createFromBlocks`**：
   - ✅ 选择代表块
   - ✅ 调用 `addRiffCards`（只添加代表块）
   - ✅ 所有 FSRSCard 共用同一个 `blockId`（代表块）
   - ✅ 标记代表块属性

2. **`deleteXiuyuan`**：
   - ✅ 调用 `removeRiffCards`（只移除代表块）
   - ✅ 清除代表块属性

3. **`HybridSyncService`**：
   - ✅ 通过 `blockId` 查找所有关联的 FSRSCard
   - ✅ 支持跨设备重建 Xiuyuan

### 优势

1. ✅ **符合设计初衷**：块和卡片解耦，Riff 中只存一个块
2. ✅ **数据一致性**：通过 blockId 关联，全量同步时不会丢失
3. ✅ **跨设备支持**：可以通过 Riff 同步，并在新设备上重建
4. ✅ **优雅的架构**：清晰的 ID 映射关系

### 关键点

```typescript
// Riff 中只存一个块
Riff: [{ id: 'parent-block-id', ... }]

// 本地多张卡片，共用同一个 blockId
LocalCards: [
  { id: 'xiuyuan-001-0', blockId: 'parent-block-id', meta: { xiuyuanID: 'xiuyuan-001' } },
  { id: 'xiuyuan-001-1', blockId: 'parent-block-id', meta: { xiuyuanID: 'xiuyuan-001' } },
  { id: 'xiuyuan-001-2', blockId: 'parent-block-id', meta: { xiuyuanID: 'xiuyuan-001' } },
]

// 同步时通过 blockId 查找
fullSync() {
  const riffBlockIds = new Set(riffCards.map(c => c.blockId));
  
  for (const card of localCards) {
    if (!riffBlockIds.has(card.blockId)) {
      // blockId 不在 Riff 中，删除
      removeCard(card.id);
    }
  }
}
```

### 迁移方案

对于已有的 Xiuyuan 卡片（没有加入 Riff 的）：

```typescript
// 一次性迁移脚本
async migrateExistingXiuyuanCards(): Promise<void> {
    console.log('[Migration] Migrating existing Xiuyuan cards...');
    
    const xiuyuans = this.xiuyuanService.getAllXiuyuans();
    let migratedCount = 0;
    
    for (const xiuyuan of xiuyuans) {
        // 1. 选择代表块
        const representativeBlockID = this.selectRepresentativeBlock(
            xiuyuan.blockIDs,
            xiuyuan.templateID,
            this.buildFieldMapping(xiuyuan)
        );
        
        // 2. 检查是否已在 Riff 中
        const riffCards = await getRiffCardsByBlockIDs([representativeBlockID]);
        
        if (riffCards.length === 0) {
            // 3. 添加到 Riff
            await addRiffCards(BUILTIN_DECK_ID, [representativeBlockID]);
            
            // 4. 标记属性
            await setBlockAttrs(representativeBlockID, {
                'custom-fsrs-xiuyuan-id': xiuyuan.id,
                'custom-fsrs-template-id': xiuyuan.templateID,
            });
            
            // 5. 🆕 更新所有 FSRSCard 的 blockId（关键！）
            const mappings = this.storage.getMappingsByXiuyuanID(xiuyuan.id);
            for (const mapping of mappings) {
                const card = this.storage.getCard(mapping.cardID);
                if (card) {
                    card.blockId = representativeBlockID;  // ← 统一为代表块
                    this.storage.setCard(card);
                }
            }
            
            migratedCount++;
            console.log(`[Migration] Migrated: ${xiuyuan.id}`);
        }
    }
    
    // 6. 保存
    await this.storage.saveCards();
    
    console.log(`[Migration] ✅ Migrated ${migratedCount} Xiuyuan cards`);
}
```

---

**文档创建时间**：2026-02-14  
**作者**：Kiro AI Assistant  
**状态**：设计完成，准备实现
