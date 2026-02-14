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
import { setBlockAttrs } from '@/core/siyuan/api';
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
     * 只执行初始增量同步，不再管理定时器
     * 定时器由插件主类管理
     */
    async start(): Promise<void> {
        console.log('[HybridSync] Starting sync service...');
        
        // 执行初始增量同步
        if (this.config.incrementalSync.enabled) {
            await this.incrementalSync();
        }
        
        console.log('[HybridSync] Sync service started');
    }
    
    /**
     * 停止同步服务
     * 
     * 不再清理定时器（由插件主类管理）
     */
    stop(): void {
        console.log('[HybridSync] Stopping sync service...');
        
        // 移除所有事件监听器
        this.removeAllListeners();
        
        console.log('[HybridSync] Sync service stopped');
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
            console.log('[HybridSync] Starting incremental sync...');
            const startTime = Date.now();
            
            // 发射同步开始事件
            this.emit('syncStart', {
                type: 'incremental',
                timestamp: startTime
            });
            
            try {
                // 1. 获取新卡片（since lastSyncTime）
                this.reportProgress(onProgress, 'incremental', 'fetching', 0, 1, '正在获取新卡片...');
                const newCards = await getRiffNewCards(
                    this.config.deckId,
                    this.lastSyncTime > 0 ? this.lastSyncTime : undefined
                );
                
                console.log(`[HybridSync] Fetched ${newCards.length} new cards from Riff`);
                
                // 2. 过滤黑名单
                this.reportProgress(onProgress, 'incremental', 'filtering', 1, 7, '正在过滤黑名单...');
                let filtered = newCards;
                if (this.config.incrementalSync.useBlacklist) {
                    const blacklist = this.storage.getRiffBlacklist();
                    filtered = newCards.filter(card => !blacklist.has(card.id));
                    console.log(`[HybridSync] Filtered ${newCards.length - filtered.length} blacklisted cards`);
                }
                
                // 3. 只添加本地不存在的卡片
                this.reportProgress(onProgress, 'incremental', 'adding', 2, 7, '正在添加新卡片...');
                let addedCount = 0;
                let skippedCount = 0;
                const addedCards: RiffBlock[] = [];
                
                for (const riffCard of filtered) {
                    const localCard = this.storage.getCard(riffCard.id);
                    
                    if (!localCard) {
                        // 检查是否有相同 blockId 的卡片（防止重复）
                        const existingCardWithSameBlock = this.storage.getAllCards()
                            .find(c => c.blockId === riffCard.id);
                        
                        if (existingCardWithSameBlock) {
                            console.log(`[HybridSync] Skipping ${riffCard.id}: block already has card ${existingCardWithSameBlock.id}`);
                            skippedCount++;
                            continue;
                        }
                        
                        // 本地没有，添加新卡片
                        const fsrsCard = this.convertRiffCardToFSRSCard(riffCard);
                        this.storage.setCard(fsrsCard);
                        addedCards.push(riffCard);
                        addedCount++;
                    } else {
                        // 本地已存在，跳过（保留本地数据）
                        skippedCount++;
                    }
                }
                
                // 4. 保存
                this.reportProgress(onProgress, 'incremental', 'saving', 5, 7, '正在保存数据...');
                if (addedCount > 0) {
                    await this.storage.saveCards();
                }
                
                // 5. 自动检测卡片类型（如果启用）
                let detectedCount: number | undefined;
                if (this.config.incrementalSync.autoDetectCardType && addedCards.length > 0) {
                    this.reportProgress(onProgress, 'incremental', 'detecting', 6, 7, '正在检测卡片类型...');
                    detectedCount = await this.detectCardTypesForNewCards(addedCards);
                }
                
                // 6. 更新时间戳
                this.lastSyncTime = Date.now();
                
                const result: SyncResult = {
                    success: true,
                    addedCount,
                    deletedCount: 0,
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
                
                console.log(`[HybridSync] Incremental sync completed: added ${addedCount}, skipped ${skippedCount}, detected ${detectedCount || 0}`);
                
                return result;
            } catch (error) {
                console.error('[HybridSync] Incremental sync failed:', error);
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
            console.log('[HybridSync] Starting full sync...');
            const startTime = Date.now();
            
            // 发射同步开始事件
            this.emit('syncStart', {
                type: 'full',
                timestamp: startTime
            });
            
            try {
                // 1. 获取所有卡片 ID
                this.reportProgress(onProgress, 'full', 'fetching', 0, 7, '正在获取所有卡片...');
                const riffCards = await getRiffCards(this.config.deckId, {
                    dueOnly: false,
                    includeNew: true
                });
                const riffCardIDs = new Set(riffCards.map(c => c.id));
                const localCardIDs = new Set(this.storage.getAllCards().map(c => c.id));
                
                console.log(`[HybridSync] Riff: ${riffCardIDs.size} cards, Local: ${localCardIDs.size} cards`);
                
                // 2. 新增：Riff 有但本地没有
                this.reportProgress(onProgress, 'full', 'adding', 2, 7, '正在添加新卡片...');
                const toAdd = riffCards.filter(card => !localCardIDs.has(card.id));
                for (const card of toAdd) {
                    const fsrsCard = this.convertRiffCardToFSRSCard(card);
                    this.storage.setCard(fsrsCard);
                }
                console.log(`[HybridSync] Added ${toAdd.length} cards from Riff`);
                
                // 3. 删除：本地有但 Riff 没有
                this.reportProgress(onProgress, 'full', 'deleting', 3, 7, '正在删除过期卡片...');
                const toDelete = Array.from(localCardIDs).filter(id => !riffCardIDs.has(id));
                for (const id of toDelete) {
                    this.storage.removeCard(id);
                }
                console.log(`[HybridSync] Deleted ${toDelete.length} cards not in Riff`);
                
                // 4. 清理黑名单：黑名单中 Riff 已不存在的 ID
                let blacklistCleanedCount = 0;
                if (this.config.fullSync.cleanupBlacklist) {
                    this.reportProgress(onProgress, 'full', 'cleanup', 4, 7, '正在清理黑名单...');
                    const blacklist = this.storage.getRiffBlacklist();
                    const toRemoveFromBlacklist = Array.from(blacklist).filter(id => !riffCardIDs.has(id));
                    
                    for (const id of toRemoveFromBlacklist) {
                        this.storage.removeFromRiffBlacklist(id);
                        blacklistCleanedCount++;
                    }
                    
                    console.log(`[HybridSync] Cleaned ${blacklistCleanedCount} IDs from blacklist`);
                }
                
                // 5. 保存
                this.reportProgress(onProgress, 'full', 'saving', 5, 7, '正在保存数据...');
                if (toAdd.length > 0 || toDelete.length > 0) {
                    await this.storage.saveCards();
                }
                
                // 6. 自动检测卡片类型（如果启用）
                let detectedCount: number | undefined;
                if (this.config.incrementalSync.autoDetectCardType && toAdd.length > 0) {
                    this.reportProgress(onProgress, 'full', 'detecting', 6, 7, '正在检测卡片类型...');
                    detectedCount = await this.detectCardTypesForNewCards(toAdd);
                }
                
                // 7. 更新时间戳
                this.lastFullSyncTime = Date.now();
                
                const result: SyncResult = {
                    success: true,
                    addedCount: toAdd.length,
                    deletedCount: toDelete.length,
                    skippedCount: 0,
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
                
                console.log('[HybridSync] Full sync completed');
                
                return result;
            } catch (error) {
                console.error('[HybridSync] Full sync failed:', error);
                throw error; // 让 withRetry 处理重试
            }
        });
    }
    
    /**
     * 删除同步
     * 
     * 尝试从 Riff 删除卡片，失败时加入黑名单
     * 支持自动重试机制
     */
    async deleteSync(cardID: string): Promise<boolean> {
        if (!this.config.deleteSync.enabled) {
            console.log('[HybridSync] Delete sync disabled');
            return true;
        }
        
        console.log(`[HybridSync] Syncing delete for card: ${cardID}`);
        
        try {
            // 使用重试机制尝试从 Riff 删除
            await this.withRetry('delete', async () => {
                await removeRiffCards(this.config.deckId, [cardID]);
            });
            
            console.log(`[HybridSync] Successfully removed card from Riff: ${cardID}`);
            return true;
        } catch (error) {
            console.error(`[HybridSync] Failed to remove card from Riff after retries: ${cardID}`, error);
            
            // 失败时加入黑名单（如果启用）
            if (this.config.deleteSync.useBlacklistFallback) {
                this.storage.addToRiffBlacklist(cardID);
                console.log(`[HybridSync] Added card to blacklist as fallback: ${cardID}`);
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
        
        console.log(`[HybridSync] Auto-detecting card types for ${cards.length} new cards...`);
        
        try {
            // 1. 批量检测类型
            const blockIds = cards.map(c => c.id);
            const typeMap = await batchDetectCardType(blockIds);
            
            // 2. 批量更新块属性（每批 50 张，避免阻塞）
            let updated = 0;
            let failed = 0;
            const BATCH_SIZE = 50;
            
            for (let i = 0; i < cards.length; i += BATCH_SIZE) {
                const batch = cards.slice(i, i + BATCH_SIZE);
                
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
                        console.error(`[HybridSync] Failed to update card type for ${card.id}:`, err);
                        failed++;
                    }
                }));
            }
            
            console.log(`[HybridSync] Auto-detection completed: ${updated} updated, ${failed} failed (total: ${cards.length})`);
            return updated;
        } catch (error) {
            console.error('[HybridSync] Auto-detection failed:', error);
            return 0;
        }
    }
    
    /**
     * 转换 RiffBlock 为 FSRSCard
     * 
     * 从 Riff 数据和块属性中提取卡片信息。
     * 卡片类型（topic/item）从块属性 `custom-fsrs-card-type` 中读取。
     */
    private convertRiffCardToFSRSCard(riffBlock: RiffBlock): FSRSCard {
        const riffCard = riffBlock.riffCard;
        const now = Date.now();
        
        // 从块属性中读取卡片类型
        const cardTypeAttr = riffBlock.ial?.['custom-fsrs-card-type'];
        const cardType = (cardTypeAttr === 'topic' || cardTypeAttr === 'item') 
            ? cardTypeAttr 
            : 'item'; // 默认为 item
        
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
            
            // 🔍 调试：记录无效日期
            if (!isValid && dateStr) {
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
            
            priority: 50, // 默认优先级（RiffCard 不包含 priority 字段）
            type: cardType as any,
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
                console.log(`[HybridSync] Retry ${attempt + 1}/${maxRetries} after ${delay}ms...`);
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
