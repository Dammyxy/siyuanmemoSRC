# Xiuyuan 卡片 Riff 同步文档

**版本**：v1.0  
**最后更新**：2026-02-14  
**适用版本**：v2.0.0+

---

## 目录

- [用户文档](#用户文档)
  - [Xiuyuan 卡片同步说明](#xiuyuan-卡片同步说明)
  - [迁移指南](#迁移指南)
  - [故障排查指南](#故障排查指南)
- [开发文档](#开发文档)
  - [ID 转换机制说明](#id-转换机制说明)
  - [同步流程文档](#同步流程文档)
  - [API 参考文档](#api-参考文档)

---

# 用户文档

## Xiuyuan 卡片同步说明

### 什么是 Xiuyuan 卡片？

Xiuyuan（修远）卡片是一种特殊的卡片类型，它允许从一组相关的块（如列表项）生成多张复习卡片。例如：

**列表模版示例**：
```markdown
- 什么是 FSRS？
  - 一种间隔重复算法
  - Free Spaced Repetition Scheduler
```

从这个列表可以生成多张卡片：
- 卡片 1：问题 → 答案 1
- 卡片 2：问题 → 答案 2
- 卡片 3：问题 → 所有答案

### Xiuyuan 卡片如何同步？

Xiuyuan 卡片使用特殊的同步机制：

1. **代表块机制**：每组 Xiuyuan 卡片选择一个"代表块"加入 Riff 数据库
2. **共享 blockId**：同一组的所有卡片共用同一个 blockId（代表块的 ID）
3. **跨设备同步**：通过 Riff 同步代表块，本地自动重建所有卡片


### 代表块选择规则

不同模版类型有不同的代表块选择规则：

| 模版类型 | 代表块 | 说明 |
|---------|--------|------|
| 列表模版 (`builtin-list-item`) | 父列表项 | 父块是问题，最具代表性 |
| 概念-描述符 (`builtin-concept-descriptor`) | 描述符块 | 描述符是核心内容 |
| 双向卡片 (`builtin-bidirectional`) | 第一个块 | 默认选择第一个 |
| 其他模版 | 第一个块 | 默认选择第一个 |

### 同步保证

- ✅ 创建 Xiuyuan 卡片时自动加入 Riff
- ✅ 全量同步后不会丢失 Xiuyuan 卡片
- ✅ 跨设备同步正常工作
- ✅ 复习数据正确同步

---

## 迁移指南

### 为什么需要迁移？

如果您在 v2.0.0 之前创建了 Xiuyuan 卡片，这些卡片可能没有加入 Riff 数据库，导致：

- ❌ 全量同步后被删除
- ❌ 无法跨设备同步
- ❌ 复习数据无法持久化

### 自动迁移

插件会在启动时自动检测并提示迁移：

1. 打开思源笔记
2. 如果检测到未迁移的 Xiuyuan 卡片，会弹出提示
3. 点击"立即迁移"按钮
4. 等待迁移完成

### 手动迁移

如果需要手动触发迁移：

1. 打开插件设置面板
2. 找到"Xiuyuan 卡片迁移"部分
3. 点击"开始迁移"按钮
4. 查看迁移结果


### 迁移结果说明

迁移完成后会显示：

```
迁移完成！
- 总计：10 个 Xiuyuan
- 成功迁移：8 个
- 失败：2 个
```

**成功迁移**：卡片已加入 Riff，可以正常同步

**失败**：可能的原因：
- 代表块不存在
- Riff API 调用失败
- 块属性设置失败

### 迁移后验证

迁移完成后，建议验证：

1. **检查卡片数量**：确保卡片数量没有减少
2. **执行全量同步**：验证卡片不会被删除
3. **跨设备测试**：在另一台设备上验证同步

### 迁移失败处理

如果迁移失败：

1. 查看迁移日志（控制台）
2. 记录失败的 Xiuyuan ID
3. 手动检查代表块是否存在
4. 联系开发者获取支持

---

## 故障排查指南

### 问题 1：全量同步后 Xiuyuan 卡片被删除

**症状**：
- 执行全量同步后，Xiuyuan 卡片消失
- 复习队列中找不到 Xiuyuan 卡片

**原因**：
- Xiuyuan 卡片未加入 Riff 数据库

**解决方案**：
1. 执行迁移（参见[迁移指南](#迁移指南)）
2. 重新创建 Xiuyuan 卡片
3. 验证代表块已加入 Riff


### 问题 2：跨设备同步失败

**症状**：
- 设备 A 创建的 Xiuyuan 卡片在设备 B 上看不到
- 复习数据不同步

**原因**：
- 代表块未加入 Riff
- 块属性未正确标记
- 同步服务未正确配置

**解决方案**：
1. 在设备 A 上执行迁移
2. 检查代表块属性（`custom-fsrs-xiuyuan-id`）
3. 执行全量同步
4. 在设备 B 上验证

### 问题 3：迁移失败

**症状**：
- 迁移过程中报错
- 部分 Xiuyuan 卡片迁移失败

**原因**：
- 代表块不存在（块已被删除）
- Riff API 调用失败
- 网络问题

**解决方案**：
1. 检查失败的 Xiuyuan ID
2. 验证代表块是否存在
3. 重试迁移
4. 如果代表块不存在，重新创建 Xiuyuan

### 问题 4：复习数据不同步

**症状**：
- 设备 A 复习后，设备 B 的复习数据未更新
- 复习进度不一致

**原因**：
- 同步服务未正确更新所有卡片
- blockId 不一致

**解决方案**：
1. 检查所有卡片的 blockId 是否一致
2. 执行全量同步
3. 验证复习数据


### 调试技巧

#### 1. 检查代表块是否在 Riff 中

```javascript
// 在浏览器控制台执行
const blockId = 'your-block-id';
const riffCards = await window.Lute.GetRiffCardsByBlockIDs([blockId]);
console.log('Riff 中的卡片:', riffCards);
```

#### 2. 检查块属性

```javascript
// 在浏览器控制台执行
const blockId = 'your-block-id';
const attrs = await window.siyuan.getBlockAttrs(blockId);
console.log('块属性:', attrs);
console.log('Xiuyuan ID:', attrs['custom-fsrs-xiuyuan-id']);
console.log('模版 ID:', attrs['custom-fsrs-template-id']);
```

#### 3. 检查本地卡片

```javascript
// 在浏览器控制台执行
const storage = window.siyuanMemoPlugin.storageManager;
const allCards = storage.getAllCards();
const xiuyuanCards = allCards.filter(c => c.meta?.xiuyuanID);
console.log('Xiuyuan 卡片数量:', xiuyuanCards.length);
console.log('Xiuyuan 卡片:', xiuyuanCards);
```

#### 4. 查看迁移日志

打开浏览器控制台（F12），搜索 `[Migration]` 关键字，查看详细的迁移日志。

---

# 开发文档

## ID 转换机制说明

### 核心设计

Xiuyuan 卡片使用 ID 转换机制实现 Riff 同步：

```typescript
// Riff 中只存储一个"代表块"
Riff: [{ id: 'parent-block-id', ... }]

// 本地存储多张卡片（共用同一个 blockId）
LocalCards: [
  { id: 'xiuyuan-001-0', blockId: 'parent-block-id', meta: { xiuyuanID: 'xiuyuan-001' } },
  { id: 'xiuyuan-001-1', blockId: 'parent-block-id', meta: { xiuyuanID: 'xiuyuan-001' } },
  { id: 'xiuyuan-001-2', blockId: 'parent-block-id', meta: { xiuyuanID: 'xiuyuan-001' } },
]
```


### 设计优势

1. ✅ **符合 Xiuyuan 设计初衷**：块和卡片解耦，一组块可以生成多张卡片
2. ✅ **避免 Riff 冗余**：Riff 中只存一个代表块，不存储所有卡片
3. ✅ **独立复习数据**：每张卡片有独立的复习数据（due, stability 等）
4. ✅ **支持跨设备同步**：通过 blockId 关联，同步时可以找到所有相关卡片
5. ✅ **易于重建**：从 Riff 同步代表块后，本地可以重建所有卡片

### 代表块选择逻辑

```typescript
private selectRepresentativeBlock(
    blockIDs: string[],
    templateID: string,
    fieldMapping: Record<string, string>
): string {
    switch (templateID) {
        case 'builtin-list-item':
            // 列表模版：选择父列表项（问题块）
            return fieldMapping['question'] || blockIDs[0];
            
        case 'builtin-concept-descriptor':
            // 概念-描述符：选择描述符块
            return fieldMapping['descriptor'] || blockIDs[0];
            
        case 'builtin-bidirectional':
            // 双向卡片：选择第一个块
            return blockIDs[0];
            
        default:
            // 其他模版：默认选择第一个块
            return blockIDs[0];
    }
}
```

### 块属性标记

代表块会被标记两个自定义属性：

```typescript
{
    'custom-fsrs-xiuyuan-id': 'xiuyuan-001',      // Xiuyuan ID
    'custom-fsrs-template-id': 'builtin-list-item' // 模版 ID
}
```

这些属性用于：
- 识别 Xiuyuan 卡片
- 跨设备重建时恢复模版信息
- 同步时查找关联的卡片


---

## 同步流程文档

### 创建流程

```typescript
async createFromBlocks(
    blockIDs: string[],
    templateID: string,
    fieldMapping: Record<string, string>,
    deckID: string
): Promise<Result<{ xiuyuan: IXiuyuan; cards: ICardMapping[] }>> {
    // 1. 创建 Xiuyuan 对象
    const xiuyuan = this.storage.createXiuyuan({
        blockIDs,
        fields: template.fields.map(f => ({
            name: f.name,
            blockID: fieldMapping[f.name] || '',
            marker: f.name,
        })),
        templateID,
    });

    // 2. 选择代表块
    const representativeBlockID = this.selectRepresentativeBlock(
        blockIDs, 
        templateID, 
        fieldMapping
    );

    // 3. 添加到 Riff
    try {
        await riffAPI.addRiffCards(deckID, [representativeBlockID]);
    } catch (err) {
        console.error('[Xiuyuan] Failed to add to Riff:', err);
        // 不阻断流程，但记录错误
    }

    // 4. 标记块属性
    try {
        await setBlockAttrs(representativeBlockID, {
            'custom-fsrs-xiuyuan-id': xiuyuan.id,
            'custom-fsrs-template-id': templateID,
        });
    } catch (err) {
        console.error('[Xiuyuan] Failed to mark attributes:', err);
    }

    // 5. 创建 FSRSCards（共用 blockId）
    for (let ruleIndex = 0; ruleIndex < template.cardRules.length; ruleIndex++) {
        const cardID = generateXiuyuanCardID(xiuyuan.id, ruleIndex);
        
        const fsrsCard: FSRSCard = {
            id: cardID,
            blockId: representativeBlockID,  // ← 关键：共用代表块
            // ... 其他字段 ...
            meta: {
                xiuyuanID: xiuyuan.id,
                templateID,
                ruleIndex,
            },
        };
        
        this.storageManager.setCard(fsrsCard);
    }

    return ok({ xiuyuan, cards });
}
```


### 删除流程

```typescript
async deleteXiuyuan(id: string): Promise<Result<boolean>> {
    try {
        const xiuyuan = this.storage.getXiuyuan(id);
        
        // 1. 删除所有关联的 FSRSCard
        const mappings = this.storage.getMappingsByXiuyuanID(id);
        for (const mapping of mappings) {
            this.storageManager.removeCard(mapping.cardID);
        }

        // 2. 从 Riff 中移除代表块
        const representativeBlockID = this.selectRepresentativeBlock(
            xiuyuan.blockIDs,
            xiuyuan.templateID,
            this.buildFieldMapping(xiuyuan)
        );
        await riffAPI.removeRiffCards([representativeBlockID]);

        // 3. 清除代表块属性
        await setBlockAttrs(representativeBlockID, {
            'custom-fsrs-xiuyuan-id': '',
            'custom-fsrs-template-id': '',
        });

        // 4. 删除 Xiuyuan 对象
        this.storage.deleteXiuyuan(id);

        return ok(true);
    } catch (error) {
        return err(error as Error);
    }
}
```

### 全量同步流程

```typescript
async fullSync(): Promise<void> {
    // 1. 获取 Riff 卡片
    const riffCards = await getRiffCards();
    const riffBlockIds = new Set(riffCards.map(c => c.blockId));
    
    // 2. 获取本地卡片
    const localCards = this.storage.getAllCards();
    
    // 3. 删除本地独有的卡片（通过 blockId 判断）
    for (const card of localCards) {
        if (!riffBlockIds.has(card.blockId)) {
            console.log('[HybridSync] Removing local-only card:', card.id);
            this.storage.removeCard(card.id);
        }
    }
    
    // 4. 同步 Riff 卡片到本地
    for (const riffCard of riffCards) {
        await this.syncRiffCardToLocal(riffCard);
    }
}
```


### 单卡同步流程

```typescript
private async syncRiffCardToLocal(riffCard: any): Promise<void> {
    const blockId = riffCard.blockId;
    
    // 1. 检查是否为 Xiuyuan 卡片
    const attrs = await getBlockAttrs(blockId);
    const xiuyuanID = attrs['custom-fsrs-xiuyuan-id'];
    
    if (xiuyuanID) {
        // 2. 通过 blockId 查找所有关联的 FSRSCard
        const xiuyuanCards = this.storage.getAllCards().filter(
            card => card.blockId === blockId && card.meta?.xiuyuanID === xiuyuanID
        );
        
        // 3. 更新所有卡片的复习数据
        for (const localCard of xiuyuanCards) {
            const riffData = riffCard.card || {};
            const updatedCard = {
                ...localCard,
                due: riffData.due || localCard.due,
                stability: riffData.stability || localCard.stability,
                difficulty: riffData.difficulty || localCard.difficulty,
                elapsedDays: riffData.elapsed_days || localCard.elapsedDays,
                scheduledDays: riffData.scheduled_days || localCard.scheduledDays,
                reps: riffData.reps || localCard.reps,
                lapses: riffData.lapses || localCard.lapses,
                state: riffData.state || localCard.state,
                lastReview: riffData.last_review || localCard.lastReview,
            };
            this.storage.setCard(updatedCard);
        }
    } else {
        // 普通卡片：直接同步
        // ... 现有逻辑 ...
    }
}
```

### 跨设备重建流程

```typescript
async syncXiuyuanFromRiff(riffCard: any): Promise<void> {
    const blockId = riffCard.blockId;
    
    // 1. 检查块属性
    const attrs = await getBlockAttrs(blockId);
    const xiuyuanID = attrs['custom-fsrs-xiuyuan-id'];
    const templateID = attrs['custom-fsrs-template-id'];
    
    if (!xiuyuanID || !templateID) {
        return; // 不是 Xiuyuan 卡片
    }
    
    // 2. 检查本地是否已有该 Xiuyuan
    const existingXiuyuan = this.xiuyuanService.getXiuyuan(xiuyuanID);
    
    if (existingXiuyuan) {
        // 已存在，只更新复习数据
        await this.updateXiuyuanReviewData(xiuyuanID, riffCard);
    } else {
        // 不存在，需要重建 Xiuyuan
        await this.rebuildXiuyuanFromBlock(blockId, xiuyuanID, templateID, riffCard);
    }
}
```


### 迁移流程

```typescript
async migrateExistingXiuyuanCards(): Promise<{
    total: number;
    migrated: number;
    failed: number;
    errors: Array<{ xiuyuanID: string; error: string }>;
}> {
    const xiuyuans = this.xiuyuanService.getAllXiuyuans();
    let migratedCount = 0;
    let failedCount = 0;
    const errors: Array<{ xiuyuanID: string; error: string }> = [];
    
    for (const xiuyuan of xiuyuans) {
        try {
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
                
                // 5. 更新所有 FSRSCard 的 blockId
                const mappings = this.storage.getMappingsByXiuyuanID(xiuyuan.id);
                for (const mapping of mappings) {
                    const card = this.storage.getCard(mapping.cardID);
                    if (card) {
                        card.blockId = representativeBlockID;
                        this.storage.setCard(card);
                    }
                }
                
                migratedCount++;
                console.log(`[Migration] Migrated Xiuyuan: ${xiuyuan.id}`);
            }
        } catch (error) {
            failedCount++;
            errors.push({
                xiuyuanID: xiuyuan.id,
                error: error.message,
            });
            console.error(`[Migration] Failed to migrate Xiuyuan ${xiuyuan.id}:`, error);
        }
    }
    
    // 保存
    await this.storage.saveCards();
    
    return {
        total: xiuyuans.length,
        migrated: migratedCount,
        failed: failedCount,
        errors,
    };
}
```


---

## API 参考文档

### XiuyuanService

#### selectRepresentativeBlock

选择代表块。

```typescript
private selectRepresentativeBlock(
    blockIDs: string[],
    templateID: string,
    fieldMapping: Record<string, string>
): string
```

**参数**：
- `blockIDs`: 所有相关块 ID
- `templateID`: 模版 ID
- `fieldMapping`: 字段映射

**返回**：代表块 ID

**选择规则**：
- `builtin-list-item`: 父列表项（`fieldMapping['question']`）
- `builtin-concept-descriptor`: 描述符块（`fieldMapping['descriptor']`）
- `builtin-bidirectional`: 第一个块
- 其他: 第一个块

---

#### createFromBlocks

创建 Xiuyuan 卡片。

```typescript
async createFromBlocks(
    blockIDs: string[],
    templateID: string,
    fieldMapping: Record<string, string>,
    deckID: string = riffAPI.BUILTIN_DECK_ID
): Promise<Result<{ xiuyuan: IXiuyuan; cards: ICardMapping[] }>>
```

**参数**：
- `blockIDs`: 相关块 ID 列表
- `templateID`: 模版 ID
- `fieldMapping`: 字段映射（字段名 → 块 ID）
- `deckID`: 牌组 ID（默认为内置牌组）

**返回**：
- `ok`: `{ xiuyuan: IXiuyuan; cards: ICardMapping[] }`
- `err`: `Error`

**副作用**：
1. 创建 Xiuyuan 对象
2. 将代表块加入 Riff
3. 标记代表块属性
4. 创建所有 FSRSCard（共用 blockId）


---

#### deleteXiuyuan

删除 Xiuyuan 卡片。

```typescript
async deleteXiuyuan(id: string): Promise<Result<boolean>>
```

**参数**：
- `id`: Xiuyuan ID

**返回**：
- `ok`: `true`
- `err`: `Error`

**副作用**：
1. 删除所有关联的 FSRSCard
2. 从 Riff 移除代表块
3. 清除代表块属性
4. 删除 Xiuyuan 对象

---

### HybridSyncService

#### fullSync

执行全量同步。

```typescript
async fullSync(): Promise<void>
```

**流程**：
1. 获取 Riff 卡片的 blockIds
2. 遍历本地卡片，检查 `card.blockId` 是否在 Riff 中
3. 不在 Riff 中的卡片删除
4. 同步 Riff 卡片到本地

**注意**：
- 通过 `blockId` 判断（而不是 `cardId`）
- Xiuyuan 卡片不会被误删

---

#### syncRiffCardToLocal

同步单张 Riff 卡片到本地。

```typescript
private async syncRiffCardToLocal(riffCard: any): Promise<void>
```

**参数**：
- `riffCard`: Riff 卡片对象

**流程**：
1. 检查块属性判断是否为 Xiuyuan 卡片
2. 如果是 Xiuyuan：
   - 通过 blockId 查找所有关联的 FSRSCard
   - 更新所有卡片的复习数据
3. 如果是普通卡片：
   - 直接同步


---

### MigrationService

#### migrateExistingXiuyuanCards

迁移现有 Xiuyuan 卡片。

```typescript
async migrateExistingXiuyuanCards(): Promise<{
    total: number;
    migrated: number;
    failed: number;
    errors: Array<{ xiuyuanID: string; error: string }>;
}>
```

**返回**：
- `total`: 总计 Xiuyuan 数量
- `migrated`: 成功迁移数量
- `failed`: 失败数量
- `errors`: 错误列表

**流程**：
1. 遍历所有 Xiuyuan
2. 检查是否已在 Riff 中
3. 未在 Riff 中的：
   - 添加到 Riff
   - 标记块属性
   - 更新所有 FSRSCard 的 blockId
4. 返回迁移结果

**错误处理**：
- 单个 Xiuyuan 迁移失败不影响其他
- 记录所有错误信息

---

## 数据结构

### Xiuyuan 对象

```typescript
interface IXiuyuan {
    id: string;                    // Xiuyuan ID
    blockIDs: string[];            // 所有相关块 ID
    fields: IXiuyuanField[];       // 字段列表
    templateID: string;            // 模版 ID
    createdAt: number;             // 创建时间
}

interface IXiuyuanField {
    name: string;                  // 字段名
    blockID: string;               // 块 ID
    marker: string;                // 标记
}
```

### FSRSCard 对象

```typescript
interface FSRSCard {
    id: string;                    // 卡片 ID（如 'xiuyuan-001-0'）
    blockId: string;               // 代表块 ID（共用）
    due: Date;                     // 到期时间
    stability: number;             // 稳定性
    difficulty: number;            // 难度
    // ... 其他 FSRS 字段 ...
    meta: {
        xiuyuanID: string;         // Xiuyuan ID
        templateID: string;        // 模版 ID
        ruleIndex: number;         // 规则索引
    };
}
```


### 块属性

代表块的自定义属性：

```typescript
{
    'custom-fsrs-xiuyuan-id': string;      // Xiuyuan ID
    'custom-fsrs-template-id': string;     // 模版 ID
}
```

**用途**：
- 识别 Xiuyuan 卡片
- 跨设备重建时恢复模版信息
- 同步时查找关联的卡片

---

## 测试指南

### 单元测试

#### 测试代表块选择

```typescript
describe('selectRepresentativeBlock', () => {
    it('应该为列表模版选择父块', () => {
        const blockId = service.selectRepresentativeBlock(
            ['parent', 'child1', 'child2'],
            'builtin-list-item',
            { question: 'parent', answer: 'child1' }
        );
        expect(blockId).toBe('parent');
    });
});
```

#### 测试创建流程

```typescript
describe('createFromBlocks', () => {
    it('应该将代表块加入 Riff', async () => {
        await service.createFromBlocks(...);
        const riffCards = await getRiffCardsByBlockIDs(['parent']);
        expect(riffCards.length).toBeGreaterThan(0);
    });
    
    it('所有 FSRSCard 应该共用同一个 blockId', async () => {
        const result = await service.createFromBlocks(...);
        const cards = storage.getAllCards().filter(
            c => c.meta?.xiuyuanID === result.value.xiuyuan.id
        );
        const blockIds = new Set(cards.map(c => c.blockId));
        expect(blockIds.size).toBe(1);
    });
});
```

### 集成测试

#### 测试全量同步

```typescript
describe('fullSync', () => {
    it('全量同步后不应删除 Xiuyuan 卡片', async () => {
        // 1. 创建 Xiuyuan
        await xiuyuanService.createFromBlocks(...);
        
        // 2. 执行全量同步
        await hybridSyncService.fullSync();
        
        // 3. 验证卡片仍存在
        const cards = storage.getAllCards();
        const xiuyuanCards = cards.filter(c => c.meta?.xiuyuanID);
        expect(xiuyuanCards.length).toBeGreaterThan(0);
    });
});
```


#### 测试迁移

```typescript
describe('migrateExistingXiuyuanCards', () => {
    it('应该迁移现有 Xiuyuan 卡片', async () => {
        // 1. 创建未加入 Riff 的 Xiuyuan（模拟旧数据）
        const xiuyuan = createXiuyuanWithoutRiff();
        
        // 2. 执行迁移
        const result = await migrationService.migrateExistingXiuyuanCards();
        
        // 3. 验证已加入 Riff
        const riffCards = await getRiffCardsByBlockIDs([xiuyuan.blockIDs[0]]);
        expect(riffCards.length).toBeGreaterThan(0);
        
        // 4. 验证 blockId 已更新
        const cards = storage.getAllCards().filter(
            c => c.meta?.xiuyuanID === xiuyuan.id
        );
        cards.forEach(card => {
            expect(card.blockId).toBe(xiuyuan.blockIDs[0]);
        });
        
        // 5. 验证迁移结果
        expect(result.migrated).toBeGreaterThan(0);
        expect(result.failed).toBe(0);
    });
});
```

---

## 性能优化

### 批量操作

```typescript
// 批量添加到 Riff
await riffAPI.addRiffCards(deckID, [representativeBlockID]);

// 批量标记属性
await setBlockAttrs(representativeBlockID, {
    'custom-fsrs-xiuyuan-id': xiuyuan.id,
    'custom-fsrs-template-id': templateID,
});
```

### 缓存优化

```typescript
// 缓存 Riff blockIds
private riffBlockIdsCache: Set<string> | null = null;

async fullSync(): Promise<void> {
    // 1. 获取并缓存 Riff blockIds
    const riffCards = await getRiffCards();
    this.riffBlockIdsCache = new Set(riffCards.map(c => c.blockId));
    
    // 2. 使用缓存
    for (const card of localCards) {
        if (!this.riffBlockIdsCache.has(card.blockId)) {
            this.storage.removeCard(card.id);
        }
    }
    
    // 3. 清除缓存
    this.riffBlockIdsCache = null;
}
```


---

## 常见问题（FAQ）

### Q1: 为什么不把所有卡片都加入 Riff？

**A**: 这样会导致 Riff 数据库冗余。Xiuyuan 的设计初衷是"一组块生成多张卡片"，如果把所有卡片都加入 Riff，会违背这个设计原则。通过代表块机制，我们既保持了设计初衷，又实现了同步功能。

### Q2: 代表块被删除了怎么办？

**A**: 如果代表块被删除，Xiuyuan 卡片会在全量同步时被删除。这是预期行为，因为代表块是 Xiuyuan 的核心。建议在删除块之前先删除 Xiuyuan 卡片。

### Q3: 可以手动修改代表块吗？

**A**: 不建议手动修改代表块。如果需要修改，应该：
1. 删除现有 Xiuyuan
2. 修改块内容
3. 重新创建 Xiuyuan

### Q4: 迁移会影响复习数据吗？

**A**: 不会。迁移只是将代表块加入 Riff 并更新 blockId，不会修改复习数据（due, stability 等）。

### Q5: 迁移失败了怎么办？

**A**: 查看迁移日志，找到失败的 Xiuyuan ID，检查：
1. 代表块是否存在
2. Riff API 是否正常
3. 网络连接是否正常

如果代表块不存在，需要重新创建 Xiuyuan。

### Q6: 跨设备同步后卡片顺序不一致？

**A**: 这是正常现象。跨设备重建时，卡片顺序可能不同，但不影响复习功能。如果需要保持顺序，可以在模版中定义固定的卡片规则。

---

## 更新日志

### v1.0.0 (2026-02-14)

**新增**：
- ✅ 实现代表块选择逻辑
- ✅ 修改 createFromBlocks 方法，支持 Riff 同步
- ✅ 修改 deleteXiuyuan 方法，支持 Riff 清理
- ✅ 修改 HybridSyncService，支持 Xiuyuan 同步
- ✅ 实现迁移脚本
- ✅ 添加单元测试和集成测试
- ✅ 创建用户文档和开发文档

**修复**：
- ✅ 全量同步后 Xiuyuan 卡片被删除的问题
- ✅ 跨设备同步失败的问题
- ✅ 复习数据无法持久化的问题

---

## 参考资料

- [Xiuyuan 设计文档](../XIUYUAN_REDESIGN.md)
- [FSRS 集成指南](./TS_FSRS_INTEGRATION_GUIDE.md)
- [Riff API 文档](https://github.com/siyuan-note/riff)

---

**文档版本**：v1.0  
**最后更新**：2026-02-14  
**维护者**：SiyuanMemo 开发团队
