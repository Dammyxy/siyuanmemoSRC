/**
 * HybridSyncService - 混合同步服务
 * 
 * 管理 Riff 系统的混合同步方案：
 * - 增量同步：快速获取新卡片（日常使用）
 * - 全量同步：检测双向删除 + 清理黑名单（定期维护）
 * - 删除同步：双向删除同步（插件删除 → Riff 删除，Riff 删除 → 本地删除）
 */

import type { StorageManager } from '@/core/storage/manager';
import type { FSRSCard } from '@/types';
import { getRiffCards, getRiffNewCards, removeRiffCards, type RiffBlock } from '@/core/siyuan/riff';
import { batchDetectCardType, initializeAFactor } from '@/core/card-builder';
import { setBlockAttrs } from '@/core/siyuan/api';
import { ATTR_CARD_TYPE, ATTR_A_FACTOR } from '@/core/siyuan/block';

// ==================== 配置接口 ====================

/**
 * 混合同步服务配置
 */
export interface HybridSyncConfig {
    /** 卡包 ID */
    deckId: string;
    
    /** 存储管理器 */
    storage: StorageManager;
    
    /** 增量同步配置 */
    incrementalSync: {
        /** 是否启用增量同步 */
        enabled: boolean;
        /** 触发时机 */
        triggers: Array<'plugin-start' | 'browser-open' | 'review-open'>;
        /** 是否使用黑名单过滤 */
        useBlacklist: boolean;
        /** 是否自动检测卡片类型（Topic/Item） */
        autoDetectCardType: boolean;
    };
    
    /** 全量同步配置 */
    fullSync: {
        /** 是否启用全量同步 */
        enabled: boolean;
        /** 同步间隔（毫秒） */
        interval: number;
        /** 是否清理黑名单 */
        cleanupBlacklist: boolean;
    };
    
    /** 删除同步配置 */
    deleteSync: {
        /** 是否启用删除同步 */
        enabled: boolean;
        /** 删除失败时是否使用黑名单作为后备 */
        useBlacklistFallback: boolean;
    };
}

/**
 * 同步结果
 */
export interface SyncResult {
    /** 是否成功 */
    success: boolean;
    /** 新增卡片数量 */
    addedCount: number;
    /** 删除卡片数量 */
    deletedCount: number;
    /** 跳过卡片数量 */
    skippedCount: number;
    /** 清理黑名单数量 */
    blacklistCleanedCount?: number;
    /** 检测卡片类型数量 */
    detectedCount?: number;
    /** 错误消息 */
    errorMessage?: string;
}

/**
 * 同步状态
 */
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

// ==================== 混合同步服务 ====================

/**
 * 混合同步服务
 * 
 * 负责管理 Riff 系统的混合同步方案：
 * - 增量同步：快速获取新卡片
 * - 全量同步：检测双向删除 + 清理黑名单
 * - 删除同步：双向删除同步
 */
export class HybridSyncService {
    private config: HybridSyncConfig;
    private storage: StorageManager;
    private lastSyncTime: number = 0;
    private lastFullSyncTime: number = 0;
    private fullSyncTimer?: NodeJS.Timeout;
    private syncStatus: SyncStatus = 'idle';
    
    constructor(config: HybridSyncConfig) {
        this.config = config;
        this.storage = config.storage;
    }
    
    /**
     * 启动同步服务
     */
    async start(): Promise<void> {
        console.log('[HybridSync] Starting sync service...');
        
        // 启动全量同步定时器
        if (this.config.fullSync.enabled) {
            this.startFullSyncTimer();
        }
        
        // 执行初始增量同步
        if (this.config.incrementalSync.enabled) {
            await this.incrementalSync();
        }
        
        console.log('[HybridSync] Sync service started');
    }
    
    /**
     * 停止同步服务
     */
    stop(): void {
        console.log('[HybridSync] Stopping sync service...');
        
        if (this.fullSyncTimer) {
            clearInterval(this.fullSyncTimer);
            this.fullSyncTimer = undefined;
        }
        
        console.log('[HybridSync] Sync service stopped');
    }
    
    /**
     * 增量同步（公共方法）
     * 
     * 从 Riff 获取新卡片，使用黑名单过滤，只添加本地不存在的卡片
     * 如果启用自动检测，会自动检测新卡片的类型（Topic/Item）
     */
    async incrementalSync(): Promise<SyncResult> {
        console.log('[HybridSync] Starting incremental sync...');
        this.syncStatus = 'syncing';
        
        try {
            // 1. 获取新卡片（since lastSyncTime）
            const newCards = await getRiffNewCards(
                this.config.deckId,
                this.lastSyncTime > 0 ? this.lastSyncTime : undefined
            );
            
            console.log(`[HybridSync] Fetched ${newCards.length} new cards from Riff`);
            
            // 2. 过滤黑名单
            let filtered = newCards;
            if (this.config.incrementalSync.useBlacklist) {
                const blacklist = this.storage.getRiffBlacklist();
                filtered = newCards.filter(card => !blacklist.has(card.id));
                console.log(`[HybridSync] Filtered ${newCards.length - filtered.length} blacklisted cards`);
            }
            
            // 3. 只添加本地不存在的卡片
            let addedCount = 0;
            let skippedCount = 0;
            const addedCards: RiffBlock[] = [];
            
            for (const riffCard of filtered) {
                const localCard = this.storage.getCard(riffCard.id);
                
                if (!localCard) {
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
            if (addedCount > 0) {
                await this.storage.saveCards();
            }
            
            // 5. 自动检测卡片类型（如果启用）
            let detectedCount: number | undefined;
            if (this.config.incrementalSync.autoDetectCardType && addedCards.length > 0) {
                detectedCount = await this.detectCardTypesForNewCards(addedCards);
            }
            
            // 6. 更新时间戳
            this.lastSyncTime = Date.now();
            
            this.syncStatus = 'success';
            console.log(`[HybridSync] Incremental sync completed: added ${addedCount}, skipped ${skippedCount}, detected ${detectedCount || 0}`);
            
            return {
                success: true,
                addedCount,
                deletedCount: 0,
                skippedCount,
                detectedCount
            };
        } catch (error) {
            this.syncStatus = 'error';
            console.error('[HybridSync] Incremental sync failed:', error);
            
            return {
                success: false,
                addedCount: 0,
                deletedCount: 0,
                skippedCount: 0,
                errorMessage: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    
    /**
     * 全量同步
     * 
     * 对比 Riff 和本地的所有卡片，执行新增/删除，清理黑名单
     * 如果启用自动检测，会自动检测新卡片的类型（Topic/Item）
     */
    async fullSync(): Promise<SyncResult> {
        console.log('[HybridSync] Starting full sync...');
        this.syncStatus = 'syncing';
        
        try {
            // 1. 获取所有卡片 ID
            const riffCards = await getRiffCards(this.config.deckId, {
                dueOnly: false,
                includeNew: true
            });
            const riffCardIDs = new Set(riffCards.map(c => c.id));
            const localCardIDs = new Set(this.storage.getAllCards().map(c => c.id));
            
            console.log(`[HybridSync] Riff: ${riffCardIDs.size} cards, Local: ${localCardIDs.size} cards`);
            
            // 2. 新增：Riff 有但本地没有
            const toAdd = riffCards.filter(card => !localCardIDs.has(card.id));
            for (const card of toAdd) {
                const fsrsCard = this.convertRiffCardToFSRSCard(card);
                this.storage.setCard(fsrsCard);
            }
            console.log(`[HybridSync] Added ${toAdd.length} cards from Riff`);
            
            // 3. 删除：本地有但 Riff 没有
            const toDelete = Array.from(localCardIDs).filter(id => !riffCardIDs.has(id));
            for (const id of toDelete) {
                this.storage.removeCard(id);
            }
            console.log(`[HybridSync] Deleted ${toDelete.length} cards not in Riff`);
            
            // 4. 清理黑名单：黑名单中 Riff 已不存在的 ID
            let blacklistCleanedCount = 0;
            if (this.config.fullSync.cleanupBlacklist) {
                const blacklist = this.storage.getRiffBlacklist();
                const toRemoveFromBlacklist = Array.from(blacklist).filter(id => !riffCardIDs.has(id));
                
                for (const id of toRemoveFromBlacklist) {
                    this.storage.removeFromRiffBlacklist(id);
                    blacklistCleanedCount++;
                }
                
                console.log(`[HybridSync] Cleaned ${blacklistCleanedCount} IDs from blacklist`);
            }
            
            // 5. 保存
            if (toAdd.length > 0 || toDelete.length > 0) {
                await this.storage.saveCards();
            }
            
            // 6. 自动检测卡片类型（如果启用）
            let detectedCount: number | undefined;
            if (this.config.incrementalSync.autoDetectCardType && toAdd.length > 0) {
                detectedCount = await this.detectCardTypesForNewCards(toAdd);
            }
            
            // 7. 更新时间戳
            this.lastFullSyncTime = Date.now();
            
            this.syncStatus = 'success';
            console.log('[HybridSync] Full sync completed');
            
            return {
                success: true,
                addedCount: toAdd.length,
                deletedCount: toDelete.length,
                skippedCount: 0,
                blacklistCleanedCount,
                detectedCount
            };
        } catch (error) {
            this.syncStatus = 'error';
            console.error('[HybridSync] Full sync failed:', error);
            
            return {
                success: false,
                addedCount: 0,
                deletedCount: 0,
                skippedCount: 0,
                errorMessage: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    
    /**
     * 删除同步
     * 
     * 尝试从 Riff 删除卡片，失败时加入黑名单
     */
    async deleteSync(cardID: string): Promise<boolean> {
        if (!this.config.deleteSync.enabled) {
            console.log('[HybridSync] Delete sync disabled');
            return true;
        }
        
        console.log(`[HybridSync] Syncing delete for card: ${cardID}`);
        
        try {
            // 尝试从 Riff 删除
            await removeRiffCards(this.config.deckId, [cardID]);
            console.log(`[HybridSync] Successfully removed card from Riff: ${cardID}`);
            return true;
        } catch (error) {
            console.error(`[HybridSync] Failed to remove card from Riff: ${cardID}`, error);
            
            // 失败时加入黑名单（如果启用）
            if (this.config.deleteSync.useBlacklistFallback) {
                this.storage.addToRiffBlacklist(cardID);
                console.log(`[HybridSync] Added card to blacklist as fallback: ${cardID}`);
            }
            
            return false;
        }
    }
    
    /**
     * 获取同步状态
     */
    getSyncStatus(): {
        status: SyncStatus;
        lastSyncTime: number;
        lastFullSyncTime: number;
    } {
        return {
            status: this.syncStatus,
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
                            // 从 riffCard 获取优先级（如果有），否则使用默认值 50
                            const priority = card.riffCard?.priority ?? 50;
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
     * 启动全量同步定时器
     */
    private startFullSyncTimer(): void {
        this.fullSyncTimer = setInterval(
            () => this.fullSync(),
            this.config.fullSync.interval
        );
        console.log(`[HybridSync] Full sync timer started (interval: ${this.config.fullSync.interval}ms)`);
    }
    
    /**
     * 转换 RiffBlock 为 FSRSCard
     */
    private convertRiffCardToFSRSCard(riffBlock: RiffBlock): FSRSCard {
        const riffCard = riffBlock.riffCard;
        
        return {
            id: riffBlock.id,
            blockId: riffBlock.id,
            due: riffCard?.due ? new Date(riffCard.due).getTime() : Date.now(),
            stability: riffCard?.stability || 0,
            difficulty: riffCard?.difficulty || 0,
            elapsedDays: riffCard?.elapsedDays || 0,
            scheduledDays: riffCard?.scheduledDays || 0,
            reps: riffCard?.reps || 0,
            lapses: riffCard?.lapses || 0,
            state: riffCard?.state || 0,
            lastReview: riffCard?.lastReview 
                ? new Date(riffCard.lastReview).getTime()
                : undefined,
            deckID: riffCard?.deckID || this.config.deckId
        };
    }
}
