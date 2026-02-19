# 完整同步数据覆盖问题修复方案

## 问题描述

用户点击"完整同步"后，本地的复习数据被 Riff 的数据覆盖，导致数据丢失。

### 问题场景

1. 用户在本地复习了一些卡片
2. 复习数据还没有同步到 Riff（或同步失败）
3. 用户点击"完整同步"
4. 本地的最新复习数据被 Riff 的旧数据覆盖 ❌

### 根本原因

**架构理解错误**：当前实现误认为 Riff 是"主数据源"，完整同步时用 Riff 的数据覆盖本地数据。

```typescript
// ❌ 错误的实现
const updatedCard: FSRSCard = {
    ...localCard,
    due: riffData.due ? new Date(riffData.due).getTime() : localCard.due,
    stability: riffData.stability ?? localCard.stability,
    // ... 用 Riff 覆盖本地
};
```

### 正确的架构理解

**Riff 只是一个备份/同步服务，不是主数据源**：

```
正确的数据流：
┌─────────┐
│  本地   │ ──────────────────────> │  Riff  │
│ (主数据) │  复习后立即同步          │ (备份) │
└─────────┘                         └────────┘
     ↑                                   │
     │                                   │
     └───────────────────────────────────┘
          完整同步：只用于发现新卡片
          和删除不存在的卡片
          ❌ 不应该覆盖本地复习数据
```

**关键原则**：
1. 本地是唯一的数据源
2. Riff 只用于跨设备同步和备份
3. 完整同步的作用：
   - ✅ 发现 Riff 中有但本地没有的新卡片
   - ✅ 删除本地有但 Riff 中已删除的卡片
   - ❌ 不应该更新本地已有卡片的复习数据

## 解决方案

### 核心原则：完整同步不应该更新已有卡片的复习数据

完整同步的唯一作用：
1. ✅ 添加本地没有的新卡片
2. ✅ 删除 Riff 中已删除的卡片
3. ❌ 不更新已有卡片的复习数据

### 修复方案

```typescript
async fullSync(onProgress?: ProgressCallback): Promise<SyncResult> {
    return this.withRetry('full', async () => {
        console.log('[HybridSync] Starting full sync...');
        const startTime = Date.now();
        
        this.emit('syncStart', {
            type: 'full',
            timestamp: startTime
        });
        
        try {
            // 1. 获取所有卡片
            this.reportProgress(onProgress, 'full', 'fetching', 0, 7, '正在获取所有卡片...');
            const riffCards = await getRiffCards(this.config.deckId, {
                dueOnly: false,
                includeNew: true
            });
            
            const riffBlockIds = new Set(riffCards.map(c => c.id));
            const localCards = this.storage.getAllCards();
            
            console.log(`[HybridSync] Riff: ${riffBlockIds.size} blocks, Local: ${localCards.length} cards`);
            
            // 2. 🔧 只添加新卡片（本地没有的）
            this.reportProgress(onProgress, 'full', 'adding', 2, 7, '正在添加新卡片...');
            let addedCount = 0;
            
            for (const riffCard of riffCards) {
                const localCard = this.storage.getCard(riffCard.id);
                
                if (!localCard) {
                    // ✅ 本地没有，添加新卡片
                    await this.addNewCardFromRiff(riffCard);
                    addedCount++;
                } else {
                    // ❌ 本地已有，跳过（不更新复习数据）
                    console.log(`[HybridSync] Card exists locally, skipping: ${riffCard.id}`);
                }
            }
            
            console.log(`[HybridSync] Added ${addedCount} new cards`);
            
            // 3. 删除：本地有但 Riff 没有（通过 blockId 判断）
            this.reportProgress(onProgress, 'full', 'deleting', 3, 7, '正在删除过期卡片...');
            const toDelete = localCards.filter(card => {
                // 在Riff中，保留
                if (riffBlockIds.has(card.blockId)) return false;
                
                // 秀元卡片，保留（多卡片共用一个blockId）
                if (card.meta?.xiuyuanID) {
                    console.log(`[HybridSync] Skipping Xiuyuan card: ${card.id}`);
                    return false;
                }
                
                // 其他情况，删除
                return true;
            });
            
            for (const card of toDelete) {
                this.storage.removeCard(card.id);
            }
            console.log(`[HybridSync] Deleted ${toDelete.length} cards not in Riff`);
            
            // 4. 清理黑名单
            let blacklistCleanedCount = 0;
            if (this.config.fullSync.cleanupBlacklist) {
                this.reportProgress(onProgress, 'full', 'cleanup', 4, 7, '正在清理黑名单...');
                const blacklist = this.storage.getRiffBlacklist();
                const toRemoveFromBlacklist = Array.from(blacklist).filter(id => !riffBlockIds.has(id));
                
                for (const id of toRemoveFromBlacklist) {
                    this.storage.removeFromRiffBlacklist(id);
                    blacklistCleanedCount++;
                }
                
                console.log(`[HybridSync] Cleaned ${blacklistCleanedCount} IDs from blacklist`);
            }
            
            // 5. 保存
            this.reportProgress(onProgress, 'full', 'saving', 5, 7, '正在保存数据...');
            if (addedCount > 0 || toDelete.length > 0) {
                await this.storage.saveCards();
            }
            
            // 6. 自动检测卡片类型
            let detectedCount: number | undefined;
            if (this.config.incrementalSync.autoDetectCardType && addedCount > 0) {
                this.reportProgress(onProgress, 'full', 'detecting', 6, 7, '正在检测卡片类型...');
                const newCards = riffCards.filter(card => !this.storage.getCard(card.id));
                if (newCards.length > 0) {
                    detectedCount = await this.detectCardTypesForNewCards(newCards);
                }
            }
            
            // 7. 更新时间戳
            this.lastFullSyncTime = Date.now();
            
            const result: SyncResult = {
                success: true,
                addedCount,
                deletedCount: toDelete.length,
                skippedCount: riffCards.length - addedCount, // 跳过的已有卡片
                blacklistCleanedCount,
                detectedCount
            };
            
            this.emit('syncSuccess', {
                type: 'full',
                result,
                timestamp: Date.now(),
                duration: Date.now() - startTime
            });
            
            console.log('[HybridSync] Full sync completed');
            console.log(`[HybridSync] Added: ${addedCount}, Deleted: ${toDelete.length}, Skipped: ${result.skippedCount}`);
            
            return result;
        } catch (error) {
            console.error('[HybridSync] Full sync failed:', error);
            throw error;
        }
    });
}

/**
 * 🆕 从 Riff 添加新卡片（不更新已有卡片）
 */
private async addNewCardFromRiff(riffCard: RiffBlock): Promise<void> {
    const blockId = riffCard.id;
    
    try {
        // 检查是否为 Xiuyuan 卡片
        const attrs = await getBlockAttrs(blockId);
        const xiuyuanID = attrs['custom-fsrs-xiuyuan-id'];
        
        if (xiuyuanID) {
            // Xiuyuan 卡片：需要重建
            console.log(`[HybridSync] Adding new Xiuyuan card: ${blockId}`);
            await this.rebuildXiuyuanFromBlock(blockId, xiuyuanID, attrs['custom-fsrs-template-id'], riffCard);
        } else {
            // 普通卡片：直接添加
            const fsrsCard = this.convertRiffCardToFSRSCard(riffCard);
            this.storage.setCard(fsrsCard);
            console.log(`[HybridSync] Added new card: ${blockId}`);
        }
    } catch (error) {
        console.error(`[HybridSync] Failed to add card ${blockId}:`, error);
    }
}
```

## 实施步骤

### 立即修复

修改 `HybridSyncService.fullSync()` 方法：

1. ✅ 移除 `syncRiffCardToLocal()` 中更新已有卡片的逻辑
2. ✅ 只在卡片不存在时调用 `addNewCardFromRiff()`
3. ✅ 添加日志，明确显示跳过了多少已有卡片

### 后续优化

1. 添加数据备份功能，在完整同步前自动备份
2. 在 UI 中显示同步结果（添加/删除/跳过的数量）
3. 提供"撤销"功能，允许用户回滚完整同步

## 测试用例

```typescript
describe('Full Sync - No Data Overwrite', () => {
    it('should NOT update existing card review data', async () => {
        // 本地数据：昨天复习，状态为 Review
        const localCard: FSRSCard = {
            id: 'test-card',
            blockId: 'test-block',
            lastReview: Date.now() - 24 * 60 * 60 * 1000,
            state: State.Review,
            stability: 10,
            difficulty: 5,
            reps: 5,
            due: Date.now() + 7 * 24 * 60 * 60 * 1000,
            // ...
        };
        storage.setCard(localCard);
        
        // Riff 数据：一周前复习，状态为 Learning（旧数据）
        const riffCard = {
            id: 'test-block',
            riffCard: {
                lastReview: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                state: State.Learning,
                stability: 3,
                difficulty: 7,
                reps: 2,
                due: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            },
        };
        
        // 执行完整同步
        await syncService.fullSync();
        
        // 验证：本地数据不应该被覆盖
        const result = storage.getCard('test-card');
        expect(result.state).toBe(State.Review); // ✅ 保持本地状态
        expect(result.stability).toBe(10); // ✅ 保持本地稳定性
        expect(result.difficulty).toBe(5); // ✅ 保持本地难度
        expect(result.reps).toBe(5); // ✅ 保持本地复习次数
        expect(result.lastReview).toBe(localCard.lastReview); // ✅ 保持本地复习时间
    });
    
    it('should add new cards from Riff', async () => {
        // Riff 中有新卡片
        const riffCard = {
            id: 'new-block',
            riffCard: {
                state: State.New,
                stability: 0,
                difficulty: 0,
                reps: 0,
            },
        };
        
        // 执行完整同步
        await syncService.fullSync();
        
        // 验证：新卡片应该被添加
        const result = storage.getCard('new-block');
        expect(result).toBeDefined();
        expect(result.state).toBe(State.New);
    });
    
    it('should delete cards not in Riff', async () => {
        // 本地有卡片，但 Riff 中没有
        const localCard: FSRSCard = {
            id: 'old-card',
            blockId: 'old-block',
            // ...
        };
        storage.setCard(localCard);
        
        // Riff 中没有这个卡片
        // ...
        
        // 执行完整同步
        await syncService.fullSync();
        
        // 验证：卡片应该被删除
        const result = storage.getCard('old-card');
        expect(result).toBeUndefined();
    });
    
    it('should report correct sync statistics', async () => {
        // 设置测试数据
        // - 1 张本地已有的卡片（应该跳过）
        // - 1 张 Riff 新卡片（应该添加）
        // - 1 张本地独有的卡片（应该删除）
        
        const result = await syncService.fullSync();
        
        expect(result.addedCount).toBe(1);
        expect(result.deletedCount).toBe(1);
        expect(result.skippedCount).toBe(1); // ✅ 跳过已有卡片
    });
});
```

## 注意事项

1. **修缘卡片**：修缘卡片的多个子卡片共享一个 blockId，完整同步时需要特殊处理
2. **增量同步**：增量同步仍然需要更新复习数据（因为是从 Riff 获取新的复习记录）
3. **向后兼容**：确保修改不影响现有用户的数据
4. **日志记录**：添加详细日志，方便调试和问题排查

## 相关文件

- `src/services/HybridSyncService.ts` - 主要修改文件
- `src/services/__tests__/HybridSyncService.test.ts` - 测试文件
- `src/types/sync.ts` - 类型定义

## 总结

**核心修改**：完整同步不再更新已有卡片的复习数据，只添加新卡片和删除不存在的卡片。

**数据流**：
- 本地 → Riff：复习后立即同步（单向）
- Riff → 本地：只用于发现新卡片（不覆盖已有数据）

这样可以确保用户的复习数据永远不会被覆盖。
