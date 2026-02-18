/**
 * HybridSyncService - 混合同步服务（优化版）
 * 
 * 管理 Riff 系统的混合同步方案：
 * - 增量同步：快速获取新卡片（日常使用）
 * - 全量同步：检测双向删除 + 清理黑名单（定期维护）
 * - 删除同步：双向删除同步（插件删除 → Riff 删除，Riff 删除 → 本地删除）
 * 
 * 优化特性：
 * - 事件驱动架构（使用 EventEmitter）
 * - 自动重试机制（最多 3 次，指数退避）
 * - 详细的进度回调（7 个阶段）
 * - 简化职责（定时器由外部管理）
 */

import type { StorageManager } from '@/core/storage/manager';
import type { FSRSCard } from '@/types';
import { getRiffCards, getRiffNewCards, removeRiffCards, type RiffBlock } from '@/core/siyuan/riff';
import { batchDetectCardType, initializeAFactor } from '@/core/card-builder';
import { setBlockAttrs, getBlockAttrs } from '@/core/siyuan/api';
import { ATTR_CARD_TYPE, ATTR_A_FACTOR } from '@/core/siyuan/block';
import { EventEmitter } from '@/utils/EventEmitter';
import type {
    HybridSyncConfig,
    HybridSyncEvents,
    SyncResult,
    SyncStatus,
    SyncType,
    ProgressCallback,
    SyncPhase,
    SyncProgress
} from './HybridSyncService.types';

// ==================== 混合同步服务 ====================

/**
 * 混合同步服务（优化版）
 * 
 * 负责管理 Riff 系统的混合同步方案：
 * - 增量同步：快速获取新卡片
 * - 全量同步：检测双向删除 + 清理黑名单
 * - 删除同步：双向删除同步
 * 
 * 优化特性：
 * - 事件驱动：通过 EventEmitter 发射同步事件
 * - 自动重试：网络错误自动重试（最多 3 次，指数退避）
 * - 进度回调：详细的同步进度信息
 * - 简化职责：定时器由插件主类管理
 */
export class HybridSyncService extends EventEmitter<HybridSyncEvents> {
    private config: HybridSyncConfig;
    private storage: StorageManager;
    private lastSyncTime: number = 0;
    private lastFullSyncTime: number = 0;
    
    // 默认重试配置
    private readonly DEFAULT_RETRY_CONFIG = {
        maxRetries: 3,
        retryDelay: 1000,
        backoffMultiplier: 2
    };
    
    constructor(config: HybridSyncConfig) {
        super();
        this.config = {
            ...config,
            retry: config.retry || this.DEFAULT_RETRY_CONFIG
        };
        this.storage = config.storage;
    }
    
    /**
     * 启动同步服务
     * 
     * 执行初始增量同步
     */
    async start(): Promise<void> {
        console.log('[SiYuanMemo][HybridSync] Starting sync service...');
        
        // 执行初始增量同步
        if (this.config.incrementalSync.enabled) {
            await this.incrementalSync();
        }
        
        console.log('[SiYuanMemo][HybridSync] Sync service started');
    }
    
    /**
     * 停止同步服务
     * 
     * 移除所有事件监听器
     */
    stop(): void {
        console.log('[SiYuanMemo][HybridSync] Stopping sync service...');
        
        // 移除所有事件监听器
        this.removeAllListeners();
        
        console.log('[SiYuanMemo][HybridSync] Sync service stopped');
    }
    
    /**
     * 增量同步（公共方法）
     * 
     * 从 Riff 获取新卡片，使用黑名单过滤，只添加本地不存在的卡片
     * 如果启用自动检测，会自动检测新卡片的类型（Topic/Item）
     * 
     * @param onProgress 进度回调函数（可选）
     */
    async incrementalSync(onProgress?: ProgressCallback): Promise<SyncResult> {
        return this.withRetry('incremental', async () => {
            console.log('[SiYuanMemo][HybridSync] Starting incremental sync...');
            const startTime = Date.now();
            
            // 发射同步开始事件
            this.emit('syncStart', {
                type: 'incremental',
                timestamp: startTime
            });
            
            try {
                // 1. 获取新卡片（since lastSyncTime）
                this.reportProgress(onProgress, 'incremental', 'fetching', 0, 1, '正在获取新卡片...');
                
                // 🔧 禁用时间过滤
                // 原因：时间过滤会导致新卡片被过滤掉，具体原因待调查：
                // 1. 卡片的 created 时间可能有问题（如 "0001-01-01T00:00:00Z"）
                // 2. lastSyncTime 更新时机可能不对
                // 3. Riff API 延迟导致时间窗口不够
                // 
                // 当前方案：禁用时间过滤，通过 localCard 检查来避免重复添加
                // 性能影响：每次获取所有卡片，但通过 skipped 机制避免重复
                console.log(`[SiYuanMemo][HybridSync] lastSyncTime: ${this.lastSyncTime}, current: ${Date.now()}, diff: ${Math.floor((Date.now() - this.lastSyncTime) / 1000)}s`);
                
                const newCards = await getRiffNewCards(
                    this.config.deckId,
                    undefined  // 禁用时间过滤，获取所有卡片
                );
                
                console.log(`[SiYuanMemo][HybridSync] Fetched ${newCards.length} cards from Riff (time filter disabled)`);
                
                // 2. 过滤黑名单
                this.reportProgress(onProgress, 'incremental', 'filtering', 1, 7, '正在过滤黑名单...');
                let filtered = newCards;
                if (this.config.incrementalSync.useBlacklist) {
                    const blacklist = this.storage.getRiffBlacklist();
                    filtered = newCards.filter(card => !blacklist.has(card.id));
                    console.log(`[SiYuanMemo][HybridSync] Filtered ${newCards.length - filtered.length} blacklisted cards`);
                }
                
                console.log(`[SiYuanMemo][HybridSync] Processing ${filtered.length} cards for incremental sync`);
                
                // 3. 只添加本地不存在的卡片，或更新已存在卡片的优先级
                this.reportProgress(onProgress, 'incremental', 'adding', 2, 7, '正在同步卡片...');
                let addedCount = 0;
                let updatedCount = 0;
                let skippedCount = 0;
                const addedCards: RiffBlock[] = [];
                
                for (const riffCard of filtered) {
                    const localCard = this.storage.getCard(riffCard.id);
                    
                    console.log(`[SiYuanMemo][HybridSync] Checking card ${riffCard.id}: localCard=${!!localCard}`);
                    
                    if (!localCard) {
                        // 检查是否有相同 blockId 的卡片（防止重复）
                        const existingCardWithSameBlock = this.storage.getAllCards()
                            .find(c => c.blockId === riffCard.id);
                        
                        if (existingCardWithSameBlock) {
                            console.log(`[SiYuanMemo][HybridSync] Skipping ${riffCard.id}: block already has card ${existingCardWithSameBlock.id}`);
                            skippedCount++;
                            continue;
                        }
                        
                        // 本地没有，添加新卡片
                        console.log(`[SiYuanMemo][HybridSync] Adding new card ${riffCard.id}`);
                        const fsrsCard = await this.convertRiffCardToFSRSCard(riffCard);
                        this.storage.setCard(fsrsCard);
                        addedCards.push(riffCard);
                        addedCount++;
                    } else {
                        // 本地已存在，更新块属性相关字段
                        let needsUpdate = false;
                        
                        // 1. 更新优先级
                        const newPriority = (() => {
                            // 检查是否是修缘卡片
                            const isXiuyuanCard = localCard.meta?.xiuyuanID !== undefined;
                            
                            if (isXiuyuanCard) {
                                // 修缘卡片：优先读取 meta.priority（独立优先级）
                                if (localCard.meta?.priority !== undefined) {
                                    return localCard.meta.priority;
                                }
                            } else {
                                // 普通卡片：优先读取块属性
                                if (riffCard.ial?.['custom-fsrs-priority']) {
                                    const priority = parseInt(riffCard.ial['custom-fsrs-priority']);
                                    if (!isNaN(priority)) {
                                        return priority;
                                    }
                                }
                            }
                            
                            // 保持原值
                            return localCard.priority;
                        })();
                        
                        if (newPriority !== localCard.priority) {
                            console.log(`[SiYuanMemo][HybridSync] Updating priority for card ${riffCard.id}: ${localCard.priority} -> ${newPriority}`);
                            localCard.priority = newPriority;
                            needsUpdate = true;
                        }
                        
                        // 2. 更新卡片类型标记（concept/descriptor）
                        const cardTypeMarkerAttr = riffCard.ial?.['custom-fsrs-card-type'];
                        const newCardTypeMarker = (cardTypeMarkerAttr === 'concept' || cardTypeMarkerAttr === 'descriptor')
                            ? cardTypeMarkerAttr as 'concept' | 'descriptor'
                            : undefined;
                        
                        if (newCardTypeMarker && newCardTypeMarker !== localCard.cardTypeMarker) {
                            console.log(`[SiYuanMemo][HybridSync] Updating cardTypeMarker for card ${riffCard.id}: ${localCard.cardTypeMarker} -> ${newCardTypeMarker}`);
                            localCard.cardTypeMarker = newCardTypeMarker;
                            // 同时更新 type 字段
                            localCard.type = newCardTypeMarker as any;
                            needsUpdate = true;
                        }
                        
                        // 3. 更新技术类型（topic/item）
                        if (!newCardTypeMarker) {
                            const cardTypeAttr = riffCard.ial?.['custom-card-type'];
                            const newCardType = (cardTypeAttr === 'topic' || cardTypeAttr === 'item' || cardTypeAttr === 'concept' || cardTypeAttr === 'descriptor') 
                                ? cardTypeAttr 
                                : undefined;
                            
                            if (newCardType && newCardType !== localCard.type) {
                                console.log(`[SiYuanMemo][HybridSync] Updating type for card ${riffCard.id}: ${localCard.type} -> ${newCardType}`);
                                localCard.type = newCardType as any;
                                needsUpdate = true;
                            }
                        }
                        
                        // 4. 更新 Topic 卡片的 A-Factor
                        if (localCard.type === 'topic') {
                            const newAFactor = riffCard.ial?.['custom-fsrs-a-factor'] 
                                ? parseFloat(riffCard.ial['custom-fsrs-a-factor']) 
                                : undefined;
                            
                            if (newAFactor !== undefined && newAFactor !== localCard.aFactor) {
                                console.log(`[SiYuanMemo][HybridSync] Updating aFactor for card ${riffCard.id}: ${localCard.aFactor} -> ${newAFactor}`);
                                localCard.aFactor = newAFactor;
                                needsUpdate = true;
                            }
                        }
                        
                        // 如果有任何字段发生变化，更新卡片
                        if (needsUpdate) {
                            localCard.updatedAt = Date.now();
                            this.storage.setCard(localCard);
                            updatedCount++;
                        } else {
                            skippedCount++;
                        }
                    }
                }
                
                // 4. 检测并删除本地有但 Riff 没有的卡片
                this.reportProgress(onProgress, 'incremental', 'deleting', 4, 7, '正在检测删除的卡片...');
                let deletedCount = 0;
                
                // 获取所有本地卡片
                const localCards = this.storage.getAllCards();
                // 创建 Riff 卡片 ID 集合
                const riffCardIds = new Set(filtered.map(c => c.id));
                
                // 找出本地有但 Riff 没有的卡片
                const cardsToDelete = localCards.filter(localCard => {
                    // ✅ 保护 Xiuyuan 卡片：Xiuyuan 卡片不在 Riff 中，不应该被删除
                    if (localCard.meta?.xiuyuanID) {
                        return false;  // 跳过 Xiuyuan 卡片
                    }
                    
                    // 只删除不在 Riff 中的普通卡片
                    return !riffCardIds.has(localCard.id);
                });
                
                if (cardsToDelete.length > 0) {
                    console.log(`[SiYuanMemo][HybridSync] Deleting ${cardsToDelete.length} cards that no longer exist in Riff`);
                    
                    for (const card of cardsToDelete) {
                        this.storage.removeCard(card.id);  // 使用 removeCard 而不是 deleteCard
                        deletedCount++;
                        console.log(`[SiYuanMemo][HybridSync] Deleted card ${card.id}`);
                    }
                }
                
                // 5. 保存
                this.reportProgress(onProgress, 'incremental', 'saving', 5, 7, '正在保存数据...');
                if (addedCount > 0 || updatedCount > 0 || deletedCount > 0) {
                    await this.storage.saveCards();
                }
                
                // 6. 自动检测卡片类型（如果启用）
                let detectedCount: number | undefined;
                if (this.config.incrementalSync.autoDetectCardType && addedCards.length > 0) {
                    this.reportProgress(onProgress, 'incremental', 'detecting', 6, 7, '正在检测卡片类型...');
                    detectedCount = await this.detectCardTypesForNewCards(addedCards);
                }
                
                // 7. 更新时间戳
                this.lastSyncTime = Date.now();
                
                const result: SyncResult = {
                    success: true,
                    addedCount,
                    deletedCount,  // 🆕 返回删除数量
                    skippedCount,
                    detectedCount
                };
                
                // 发射同步成功事件
                this.emit('syncSuccess', {
                    type: 'incremental',
                    result,
                    timestamp: Date.now(),
                    duration: Date.now() - startTime
                });
                
                console.log(`[SiYuanMemo][HybridSync] Incremental sync completed: added ${addedCount}, updated ${updatedCount}, deleted ${deletedCount}, skipped ${skippedCount}, detected ${detectedCount || 0}`);
                
                return result;
            } catch (error) {
                console.error('[SiYuanMemo][HybridSync] Incremental sync failed:', error);
                throw error; // 让 withRetry 处理重试
            }
        });
    }
    
    /**
     * 全量同步
     * 
     * 对比 Riff 和本地的所有卡片，执行新增/删除，清理黑名单
     * 如果启用自动检测，会自动检测新卡片的类型（Topic/Item）
     * 
     * @param onProgress 进度回调函数（可选）
     */
    async fullSync(onProgress?: ProgressCallback): Promise<SyncResult> {
        return this.withRetry('full', async () => {
            console.log('[SiYuanMemo][HybridSync] Starting full sync...');
            const startTime = Date.now();
            
            // 发射同步开始事件
            this.emit('syncStart', {
                type: 'full',
                timestamp: startTime
            });
            
            try {
                // 1. 获取所有卡片（使用 blockId 而不是 cardId）
                this.reportProgress(onProgress, 'full', 'fetching', 0, 7, '正在获取所有卡片...');
                const riffCards = await getRiffCards(this.config.deckId, {
                    dueOnly: false,
                    includeNew: true
                });
                // 🔧 修改：使用 blockId 而不是 cardId
                const riffBlockIds = new Set(riffCards.map(c => c.id));
                const localCards = this.storage.getAllCards();
                
                console.log(`[SiYuanMemo][HybridSync] Riff: ${riffBlockIds.size} blocks, Local: ${localCards.length} cards`);
                
                // 2. 🔧 只添加新卡片（本地没有的），不更新已有卡片的复习数据
                this.reportProgress(onProgress, 'full', 'adding', 2, 7, '正在添加新卡片...');
                let addedCount = 0;
                let skippedCount = 0;
                
                for (const riffCard of riffCards) {
                    const localCard = this.storage.getCard(riffCard.id);
                    if (localCard) {
                        // ✅ 已存在，跳过（不覆盖本地复习数据）
                        console.log(`[SiYuanMemo][HybridSync] Card exists locally, skipping: ${riffCard.id}`);
                        skippedCount++;
                    } else {
                        // ✅ 不存在，添加新卡片
                        await this.syncRiffCardToLocal(riffCard);
                        addedCount++;
                    }
                }
                console.log(`[SiYuanMemo][HybridSync] Added ${addedCount} new cards, skipped ${skippedCount} existing cards`);
                
                // 3. 删除：本地有但 Riff 没有（通过 blockId 判断）
                this.reportProgress(onProgress, 'full', 'deleting', 3, 7, '正在删除过期卡片...');
                const toDelete = localCards.filter(card => {
                    // 在Riff中，保留
                    if (riffBlockIds.has(card.blockId)) return false;
                    
                    // 🆕 秀元卡片，保留（多卡片共用一个blockId）
                    if (card.meta?.xiuyuanID) {
                        console.log(`[SiYuanMemo][HybridSync] Skipping Xiuyuan card: ${card.id} (xiuyuanID: ${card.meta.xiuyuanID})`);
                        return false;
                    }
                    
                    // 其他情况，删除
                    return true;
                });
                for (const card of toDelete) {
                    this.storage.removeCard(card.id);
                }
                console.log(`[SiYuanMemo][HybridSync] Deleted ${toDelete.length} cards not in Riff`);
                
                // 4. 清理黑名单：黑名单中 Riff 已不存在的 blockId
                let blacklistCleanedCount = 0;
                if (this.config.fullSync.cleanupBlacklist) {
                    this.reportProgress(onProgress, 'full', 'cleanup', 4, 7, '正在清理黑名单...');
                    const blacklist = this.storage.getRiffBlacklist();
                    const toRemoveFromBlacklist = Array.from(blacklist).filter(id => !riffBlockIds.has(id));
                    
                    for (const id of toRemoveFromBlacklist) {
                        this.storage.removeFromRiffBlacklist(id);
                        blacklistCleanedCount++;
                    }
                    
                    console.log(`[SiYuanMemo][HybridSync] Cleaned ${blacklistCleanedCount} IDs from blacklist`);
                }
                
                // 5. 保存
                this.reportProgress(onProgress, 'full', 'saving', 5, 7, '正在保存数据...');
                if (addedCount > 0 || toDelete.length > 0) {
                    await this.storage.saveCards();
                }
                
                // 6. 自动检测卡片类型（如果启用）
                let detectedCount: number | undefined;
                if (this.config.incrementalSync.autoDetectCardType && addedCount > 0) {
                    this.reportProgress(onProgress, 'full', 'detecting', 6, 7, '正在检测卡片类型...');
                    // 只检测新添加的卡片
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
                    skippedCount, // 🔧 记录跳过的已有卡片数量
                    blacklistCleanedCount,
                    detectedCount
                };
                
                // 发射同步成功事件
                this.emit('syncSuccess', {
                    type: 'full',
                    result,
                    timestamp: Date.now(),
                    duration: Date.now() - startTime
                });
                
                console.log('[SiYuanMemo][HybridSync] Full sync completed');
                
                return result;
            } catch (error) {
                console.error('[SiYuanMemo][HybridSync] Full sync failed:', error);
                throw error; // 让 withRetry 处理重试
            }
        });
    }
    
    /**
     * 同步单个 Riff 卡片到本地
     * 
     * 检查是否为 Xiuyuan 卡片，如果是则更新所有关联的 FSRSCard
     * 
     * @param riffCard Riff 卡片数据
     */
    /**
     * 🔧 从 Riff 同步卡片到本地（仅用于添加新卡片）
     * 
     * 注意：此方法现在只用于添加本地不存在的新卡片。
     * fullSync 会在调用前检查卡片是否存在，已存在的卡片会被跳过。
     * 
     * @param riffCard Riff 卡片数据
     */
    private async syncRiffCardToLocal(riffCard: RiffBlock): Promise<void> {
        const blockId = riffCard.id;
        
        try {
            // 1. 检查是否为 Xiuyuan 卡片（通过块属性）
            const attrs = await getBlockAttrs(blockId);
            const xiuyuanID = attrs['custom-fsrs-xiuyuan-id'];
            
            if (xiuyuanID) {
                // 这是一个 Xiuyuan 卡片
                console.log(`[SiYuanMemo][HybridSync] Adding new Xiuyuan card: ${blockId}, xiuyuanID: ${xiuyuanID}`);
                
                // 跨设备同步：本地没有该 Xiuyuan 的卡片
                console.warn(`[SiYuanMemo][HybridSync] Xiuyuan ${xiuyuanID} not found locally. Cross-device rebuild not yet implemented.`);
                console.warn(`[SiYuanMemo][HybridSync] Please manually create the Xiuyuan on this device, or wait for future implementation.`);
                // TODO: 实现跨设备重建逻辑
                // await this.rebuildXiuyuanFromBlock(blockId, xiuyuanID, attrs['custom-fsrs-template-id'], riffCard);
                return;
            } else {
                // 普通卡片：添加新卡片
                const fsrsCard = await this.convertRiffCardToFSRSCard(riffCard);
                this.storage.setCard(fsrsCard);
                console.log(`[SiYuanMemo][HybridSync] Added new card: ${blockId}`);
            }
        } catch (error) {
            console.error(`[SiYuanMemo][HybridSync] Failed to add card ${blockId}:`, error);
            // 不抛出错误，继续处理其他卡片
        }
    }
    
    // ==================== 跨设备重建逻辑（TODO）====================
    
    /**
     * 从块重建 Xiuyuan（跨设备同步）
     * 
     * TODO: 实现跨设备重建逻辑
     * 
     * @param blockId 代表块 ID
     * @param xiuyuanID Xiuyuan ID
     * @param templateID 模版 ID
     * @param riffCard Riff 卡片数据
     */
    private async rebuildXiuyuanFromBlock(
        blockId: string,
        xiuyuanID: string,
        templateID: string,
        riffCard: RiffBlock
    ): Promise<void> {
        console.warn('[SiYuanMemo][HybridSync] rebuildXiuyuanFromBlock not yet implemented');
        // TODO: 实现以下步骤
        // 1. 获取块的子块（重建 blockIDs）
        // const blockIDs = await this.getXiuyuanBlockIDs(blockId, templateID);
        // 
        // 2. 重建 fieldMapping
        // const fieldMapping = await this.rebuildFieldMapping(blockIDs, templateID);
        // 
        // 3. 调用 XiuyuanService.createFromBlocks
        // const result = await this.xiuyuanService.createFromBlocks(
        //     blockIDs,
        //     templateID,
        //     fieldMapping,
        //     BUILTIN_DECK_ID
        // );
        // 
        // 4. 更新复习数据
        // if (result.ok) {
        //     await this.updateXiuyuanReviewData(xiuyuanID, riffCard);
        // }
    }
    
    /**
     * 获取 Xiuyuan 的所有块 ID
     * 
     * TODO: 实现获取子块逻辑
     * 
     * @param blockId 代表块 ID
     * @param templateID 模版 ID
     * @returns 块 ID 数组
     */
    private async getXiuyuanBlockIDs(blockId: string, templateID: string): Promise<string[]> {
        console.warn('[SiYuanMemo][HybridSync] getXiuyuanBlockIDs not yet implemented');
        // TODO: 根据模版类型获取相关块
        // 例如：列表模版需要获取父块和子块
        return [blockId];
    }
    
    /**
     * 重建字段映射
     * 
     * TODO: 实现字段映射重建逻辑
     * 
     * @param blockIDs 块 ID 数组
     * @param templateID 模版 ID
     * @returns 字段映射
     */
    private async rebuildFieldMapping(
        blockIDs: string[],
        templateID: string
    ): Promise<Record<string, string>> {
        console.warn('[SiYuanMemo][HybridSync] rebuildFieldMapping not yet implemented');
        // TODO: 根据模版类型和块 ID 重建字段映射
        return {};
    }
    
    /**
     * 更新 Xiuyuan 的复习数据
     * 
     * TODO: 实现复习数据更新逻辑
     * 
     * @param xiuyuanID Xiuyuan ID
     * @param riffCard Riff 卡片数据
     */
    private async updateXiuyuanReviewData(xiuyuanID: string, riffCard: RiffBlock): Promise<void> {
        console.warn('[SiYuanMemo][HybridSync] updateXiuyuanReviewData not yet implemented');
        // TODO: 更新所有关联卡片的复习数据
        // const xiuyuanCards = this.storage.getAllCards().filter(
        //     card => card.meta?.xiuyuanID === xiuyuanID
        // );
        // 
        // const riffData = riffCard.riffCard || {};
        // for (const card of xiuyuanCards) {
        //     // 更新复习数据
        // }
    }
    
    /**
     * 删除同步
     * 
     * 尝试从 Riff 删除卡片，失败时加入黑名单
     * 支持自动重试机制
     */
    async deleteSync(cardID: string): Promise<boolean> {
        if (!this.config.deleteSync.enabled) {
            console.log('[SiYuanMemo][HybridSync] Delete sync disabled');
            return true;
        }
        
        console.log(`[SiYuanMemo][HybridSync] Syncing delete for card: ${cardID}`);
        
        try {
            // 使用重试机制尝试从 Riff 删除
            await this.withRetry('delete', async () => {
                await removeRiffCards(this.config.deckId, [cardID]);
            });
            
            console.log(`[SiYuanMemo][HybridSync] Successfully removed card from Riff: ${cardID}`);
            return true;
        } catch (error) {
            console.error(`[SiYuanMemo][HybridSync] Failed to remove card from Riff after retries: ${cardID}`, error);
            
            // 失败时加入黑名单（如果启用）
            if (this.config.deleteSync.useBlacklistFallback) {
                this.storage.addToRiffBlacklist(cardID);
                console.log(`[SiYuanMemo][HybridSync] Added card to blacklist as fallback: ${cardID}`);
            }
            
            return false;
        }
    }
    
    /**
     * 获取同步状态（向后兼容）
     * 
     * @deprecated 建议使用事件监听代替轮询状态
     */
    getSyncStatus(): {
        status: SyncStatus;
        lastSyncTime: number;
        lastFullSyncTime: number;
    } {
        return {
            status: 'idle', // 不再维护内部状态
            lastSyncTime: this.lastSyncTime,
            lastFullSyncTime: this.lastFullSyncTime
        };
    }
    
    // ==================== 私有方法 ====================
    
    /**
     * 自动检测新卡片的类型（Topic/Item）
     * 
     * 适配自 browserService.batchDetectCardTypes()
     * 
     * @param cards 新添加的卡片列表
     * @returns 成功检测的卡片数量
     */
    private async detectCardTypesForNewCards(cards: RiffBlock[]): Promise<number> {
        if (cards.length === 0) {
            return 0;
        }
        
        console.log(`[SiYuanMemo][HybridSync] Auto-detecting card types for ${cards.length} new cards...`);
        
        try {
            // 0. 过滤掉已经有 cardTypeMarker 的卡片（用户手动标记的）
            const cardsToDetect: RiffBlock[] = [];
            let skippedWithMarker = 0;
            
            for (const card of cards) {
                try {
                    const attrs = await getBlockAttrs(card.id);
                    const cardTypeMarker = attrs?.['custom-fsrs-card-type'];
                    
                    if (cardTypeMarker === 'concept' || cardTypeMarker === 'descriptor') {
                        // 跳过已有用户标记的卡片
                        skippedWithMarker++;
                        console.log(`[SiYuanMemo][HybridSync] Skipping card with cardTypeMarker: ${card.id} (${cardTypeMarker})`);
                        continue;
                    }
                    
                    cardsToDetect.push(card);
                } catch (err) {
                    // 如果获取属性失败，仍然尝试检测
                    cardsToDetect.push(card);
                }
            }
            
            if (skippedWithMarker > 0) {
                console.log(`[SiYuanMemo][HybridSync] Skipped ${skippedWithMarker} cards with user-defined cardTypeMarker`);
            }
            
            if (cardsToDetect.length === 0) {
                console.log(`[SiYuanMemo][HybridSync] No cards to detect (all have cardTypeMarker)`);
                return 0;
            }
            
            // 1. 批量检测类型
            const blockIds = cardsToDetect.map(c => c.id);
            const typeMap = await batchDetectCardType(blockIds);
            
            // 2. 批量更新块属性（每批 50 张，避免阻塞）
            let updated = 0;
            let failed = 0;
            const BATCH_SIZE = 50;
            
            for (let i = 0; i < cardsToDetect.length; i += BATCH_SIZE) {
                const batch = cardsToDetect.slice(i, i + BATCH_SIZE);
                
                await Promise.all(batch.map(async (card) => {
                    try {
                        const cardType = typeMap.get(card.id);
                        if (!cardType) {
                            failed++;
                            return;
                        }
                        
                        const attrs: Record<string, string> = {
                            [ATTR_CARD_TYPE]: cardType,
                        };
                        
                        // Topic 卡片初始化 A-Factor
                        if (cardType === 'topic') {
                            // 使用默认优先级 50（RiffCard 不包含 priority 字段）
                            const priority = 50;
                            const aFactor = initializeAFactor(priority);
                            attrs[ATTR_A_FACTOR] = aFactor.toString();
                        }
                        
                        await setBlockAttrs(card.id, attrs);
                        updated++;
                    } catch (err) {
                        console.error(`[SiYuanMemo][HybridSync] Failed to update card type for ${card.id}:`, err);
                        failed++;
                    }
                }));
            }
            
            console.log(`[SiYuanMemo][HybridSync] Auto-detection completed: ${updated} updated, ${failed} failed, ${skippedWithMarker} skipped (total: ${cards.length})`);
            return updated;
        } catch (error) {
            console.error('[SiYuanMemo][HybridSync] Auto-detection failed:', error);
            return 0;
        }
    }
    
    /**
     * 智能检测卡片类型（用于快速制卡）
     * 
     * 规则：
     * 1. 文档块 → topic
     * 2. 有挖空符号（==、::）→ item
     * 3. 标题块 → item
     * 4. 列表项有子级 → item
     * 5. 超级块有子级 → item
     * 6. 其他 → topic
     * 
     * @param riffBlock Riff 卡片数据
     * @returns 'topic' | 'item'
     */
    private async smartDetectCardType(riffBlock: RiffBlock): Promise<'topic' | 'item'> {
        try {
            const blockId = riffBlock.id;
            
            // 1. 获取块类型和内容
            const blockData = await sql(`
                SELECT type, markdown, content FROM blocks
                WHERE id = '${blockId}'
                LIMIT 1
            `);
            
            if (!blockData || blockData.length === 0) {
                console.log(`[HybridSyncService] Block ${blockId}: topic (block not found)`);
                return 'topic';
            }
            
            const type = blockData[0].type;
            const markdown = blockData[0].markdown || '';
            const content = blockData[0].content || '';
            
            // 2. 文档块 → topic
            if (type === 'd') {
                console.log(`[HybridSyncService] Block ${blockId}: topic (type: d = document)`);
                return 'topic';
            }
            
            // 3. 有挖空符号 → item
            // 支持三种挖空语法：
            // - ==文本== (Markdown 标记语法)
            // - {{文本}} (双花括号)
            // - <span data-type="mark">文本</span> (思源原生高亮)
            if (/==([^=]+)==/.test(markdown) || /==([^=]+)==/.test(content)) {
                console.log(`[HybridSyncService] Block ${blockId}: item (mark syntax == found)`);
                return 'item';
            }
            
            if (/\{\{.+?\}\}/.test(content)) {
                console.log(`[HybridSyncService] Block ${blockId}: item (cloze syntax {{}} found)`);
                return 'item';
            }
            
            if (/<span data-type="mark">/.test(markdown) || /<span data-type="mark">/.test(content)) {
                console.log(`[HybridSyncService] Block ${blockId}: item (siyuan mark found)`);
                return 'item';
            }
            
            // 4. 有分隔符 → item
            // - :: (概念卡片)
            // - ;; (描述符卡片)
            // - >> (正向卡片)
            // - << (反向卡片)
            // - <> (双向卡片)
            if (/::/.test(content) || /;;/.test(content)) {
                console.log(`[HybridSyncService] Block ${blockId}: item (separator :: or ;; found)`);
                return 'item';
            }
            
            if (/>>/.test(content) || /<</.test(content) || /<>/.test(content)) {
                console.log(`[HybridSyncService] Block ${blockId}: item (direction symbol found)`);
                return 'item';
            }
            
            // 4. 标题块 → item
            if (type === 'h') {
                console.log(`[HybridSyncService] Block ${blockId}: item (type: h = heading)`);
                return 'item';
            }
            
            // 5. 列表项有列表子级 → item
            if (type === 'i') {
                const hasListChildren = await this.checkHasChildren(blockId, ['i', 'l']);
                console.log(`[HybridSyncService] Block ${blockId}: ${hasListChildren ? 'item' : 'topic'} (type: i = list item, hasListChildren: ${hasListChildren})`);
                return hasListChildren ? 'item' : 'topic';
            }
            
            // 6. 超级块有子级 → item
            if (type === 's') {
                const hasAnyChildren = await this.checkHasChildren(blockId);
                console.log(`[HybridSyncService] Block ${blockId}: ${hasAnyChildren ? 'item' : 'topic'} (type: s = super block, hasAnyChildren: ${hasAnyChildren})`);
                return hasAnyChildren ? 'item' : 'topic';
            }
            
            // 7. 其他 → topic
            console.log(`[HybridSyncService] Block ${blockId}: topic (type: ${type}, no answer blocks)`);
            return 'topic';
        } catch (err) {
            console.error(`[HybridSyncService] Smart detect error for ${riffBlock.id}:`, err);
            return 'topic'; // 出错默认为 topic
        }
    }
    
    /**
     * 检查块是否有特定类型的子级
     * 
     * @param blockId 块 ID
     * @param childTypes 需要检查的子级类型数组（如 ['i', 'l'] = 列表项或列表容器）
     * @returns 是否有指定类型的子级
     */
    private async checkHasChildren(blockId: string, childTypes?: string[]): Promise<boolean> {
        try {
            let typeFilter = '';
            if (childTypes && childTypes.length > 0) {
                const typeList = childTypes.map(t => `'${t}'`).join(', ');
                typeFilter = `AND type IN (${typeList})`;
            }
            
            const childBlocks = await sql(`
                SELECT id, type
                FROM blocks
                WHERE parent_id = '${blockId}'
                AND type != 'd'  -- 排除删除的块
                ${typeFilter}
                LIMIT 1
            `);
            
            return childBlocks && childBlocks.length > 0;
        } catch (err) {
            return false;
        }
    }
    
    /**
     * 转换 RiffBlock 为 FSRSCard
     * 
     * 从 Riff 数据和块属性中提取卡片信息。
     * 卡片类型优先从 cardTypeMarker 推导，其次从 custom-card-type 读取。
     * 卡片类型标记（concept/descriptor）从块属性 `custom-fsrs-card-type` 中读取。
     * 
     * 🆕 智能识别 Topic/Item（快速制卡）：
     * - 如果没有块属性标记，自动检测：
     *   1. 文档块 → topic
     *   2. 有挖空符号（==、::）→ item
     *   3. 标题块 → item
     *   4. 列表项有子级 → item
     *   5. 超级块有子级 → item
     *   6. 其他 → topic
     */
    private async convertRiffCardToFSRSCard(riffBlock: RiffBlock): Promise<FSRSCard> {
        const riffCard = riffBlock.riffCard;
        const now = Date.now();
        
        // 从块属性中读取卡片类型标记（concept/descriptor）
        const cardTypeMarkerAttr = riffBlock.ial?.['custom-fsrs-card-type'];
        const cardTypeMarker = (cardTypeMarkerAttr === 'concept' || cardTypeMarkerAttr === 'descriptor')
            ? cardTypeMarkerAttr as 'concept' | 'descriptor'
            : undefined;
        
        // 根据 cardTypeMarker 推导 CardType，或从块属性读取，或智能识别
        let cardType: string;
        if (cardTypeMarker) {
            // 如果有 cardTypeMarker，使用对应的 CardType 枚举值
            // concept -> CardType.Concept, descriptor -> CardType.Descriptor
            cardType = cardTypeMarker === 'concept' ? 'concept' : 'descriptor';
        } else {
            // 否则从块属性中读取技术类型
            const cardTypeAttr = riffBlock.ial?.['custom-card-type'];
            if (cardTypeAttr === 'topic' || cardTypeAttr === 'item' || cardTypeAttr === 'concept' || cardTypeAttr === 'descriptor') {
                cardType = cardTypeAttr;
            } else {
                // 🆕 智能识别：快速制卡没有块属性，需要自动检测
                cardType = await this.smartDetectCardType(riffBlock);
            }
        }
        
        // 🔧 修复：验证 lastReview 日期的有效性
        // Riff API 可能返回无效日期（如 "0001-01-01T00:00:00Z"），需要过滤
        const parseValidDate = (dateStr: string | undefined): number => {
            if (!dateStr) return 0;
            const timestamp = new Date(dateStr).getTime();
            // 检查是否为有效时间戳（大于 2000-01-01 且不是 NaN）
            // 2000-01-01 ≈ 946684800000 ms
            // 这样可以过滤掉 "0001-01-01" 这种无效日期（会被解析为负数或很小的正数）
            const MIN_VALID_TIMESTAMP = 946684800000; // 2000-01-01
            const isValid = timestamp >= MIN_VALID_TIMESTAMP && !isNaN(timestamp);
            
            // 🔍 调试：记录无效日期（仅在开发模式）
            if (!isValid && dateStr && dateStr !== "0001-01-01T00:00:00Z") {
                // 只警告非零值的无效日期，"0001-01-01" 是新卡片的正常零值
                console.warn(`[HybridSyncService] Invalid date detected: "${dateStr}" (timestamp: ${timestamp}) for card ${riffBlock.id}`);
            }
            
            return isValid ? timestamp : 0;
        };
        
        return {
            id: riffBlock.id,
            blockId: riffBlock.id,
            due: parseValidDate(riffCard?.due) || now,
            stability: riffCard?.stability || 0,
            difficulty: riffCard?.difficulty || 0,
            elapsedDays: riffCard?.elapsedDays || 0,
            scheduledDays: riffCard?.scheduledDays || 0,
            reps: riffCard?.reps || 0,
            lapses: riffCard?.lapses || 0,
            state: riffCard?.state || 0,
            lastReview: parseValidDate(riffCard?.lastReview),
            
            // 优先级读取逻辑：
            // 1. 检查是否是修缘卡片（通过 meta.xiuyuanID 判断）
            // 2. 修缘卡片：优先读取 meta.priority（独立优先级，不绑定块属性）
            // 3. 普通卡片：优先读取块属性 custom-fsrs-priority
            // 4. 默认值 50
            priority: (() => {
                // 检查是否是修缘卡片
                const localCard = this.storage.getCard(riffBlock.id);
                const isXiuyuanCard = localCard?.meta?.xiuyuanID !== undefined;
                
                if (isXiuyuanCard) {
                    // 修缘卡片：优先读取 meta.priority
                    if (localCard?.meta?.priority !== undefined) {
                        return localCard.meta.priority;
                    }
                } else {
                    // 普通卡片：优先读取块属性
                    if (riffBlock.ial?.['custom-fsrs-priority']) {
                        const priority = parseInt(riffBlock.ial['custom-fsrs-priority']);
                        if (!isNaN(priority)) {
                            return priority;
                        }
                    }
                }
                
                // 默认值
                return 50;
            })(),
            type: cardType as any,
            cardTypeMarker, // 添加卡片类型标记
            tags: [],
            leechCount: 0,
            isLeech: false,
            skipped: false,
            createdAt: now,
            updatedAt: now,
            
            // Topic 卡片的 A-Factor
            aFactor: cardType === 'topic' 
                ? (riffBlock.ial?.['custom-fsrs-a-factor'] 
                    ? parseFloat(riffBlock.ial['custom-fsrs-a-factor']) 
                    : undefined)
                : undefined,
        };
    }
    
    /**
     * 报告同步进度
     */
    private reportProgress(
        onProgress: ProgressCallback | undefined,
        type: SyncType,
        phase: SyncPhase,
        current: number,
        total: number,
        message?: string
    ): void {
        const progress: SyncProgress = {
            current,
            total,
            phase,
            message,
            percentage: Math.round((current / total) * 100)
        };
        
        // 调用回调函数
        if (onProgress) {
            onProgress(progress);
        }
        
        // 发射进度事件
        this.emit('syncProgress', {
            type,
            progress,
            timestamp: Date.now()
        });
    }
    
    /**
     * 重试包装器
     * 
     * 自动重试失败的同步操作（最多 3 次，指数退避）
     */
    private async withRetry<T>(
        type: SyncType,
        operation: () => Promise<T>
    ): Promise<T> {
        const { maxRetries, retryDelay, backoffMultiplier } = this.config.retry!;
        let lastError: Error | null = null;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;
                const willRetry = attempt < maxRetries && this.shouldRetry(error as Error);
                
                // 发射错误事件
                this.emit('syncError', {
                    type,
                    error: lastError,
                    timestamp: Date.now(),
                    willRetry,
                    retryCount: attempt + 1
                });
                
                if (!willRetry) {
                    break;
                }
                
                // 指数退避
                const delay = retryDelay * Math.pow(backoffMultiplier, attempt);
                console.log(`[SiYuanMemo][HybridSync] Retry ${attempt + 1}/${maxRetries} after ${delay}ms...`);
                await this.sleep(delay);
            }
        }
        
        // 所有重试都失败
        throw lastError;
    }
    
    /**
     * 判断是否应该重试
     */
    private shouldRetry(error: Error): boolean {
        // 网络错误、超时错误应该重试
        const message = error.message.toLowerCase();
        return (
            message.includes('network') ||
            message.includes('timeout') ||
            message.includes('fetch') ||
            message.includes('econnrefused')
        );
    }
    
    /**
     * 延迟辅助方法
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
