/**
 * RiffCleanupService - Riff 清理工具服务
 * 
 * @deprecated 此服务为维护工具，未来可能移到应用层
 * 
 * 提供扫描和清理 Riff 残留卡片的功能：
 * - 扫描：对比本地和 Riff 的卡片列表，找出 Riff 中有但本地没有的卡片
 * - 清理：批量删除 Riff 中的残留卡片
 */

import type { StorageManager } from '@/core/storage/manager';
import { getRiffCards, removeRiffCards, type RiffBlock } from '@/core/siyuan/riff';

// ==================== 类型定义 ====================

/**
 * 残留卡片信息
 */
export interface OrphanCard {
    /** 卡片 ID */
    id: string;
    /** 块 ID */
    blockId: string;
    /** 卡片内容（可选） */
    content?: string;
    /** 卡片路径（可选） */
    path?: string;
}

/**
 * 扫描结果
 */
export interface ScanResult {
    /** 残留卡片列表 */
    orphanCards: OrphanCard[];
    /** 残留卡片数量 */
    count: number;
    /** 是否成功 */
    success: boolean;
    /** 错误消息（如果失败） */
    errorMessage?: string;
}

/**
 * 清理结果
 */
export interface CleanupResult {
    /** 是否成功 */
    success: boolean;
    /** 删除的卡片数量 */
    deletedCount: number;
    /** 失败的卡片数量 */
    failedCount: number;
    /** 错误消息（如果失败） */
    errorMessage?: string;
}

// ==================== 清理服务 ====================

/**
 * Riff 清理工具服务
 * 
 * 提供扫描和清理 Riff 残留卡片的功能
 */
export class RiffCleanupService {
    private deckId: string;
    private storage: StorageManager;
    
    constructor(deckId: string, storage: StorageManager) {
        this.deckId = deckId;
        this.storage = storage;
    }
    
    /**
     * 扫描残留卡片
     * 
     * 对比本地和 Riff 的卡片列表，找出 Riff 中有但本地没有的卡片
     * 
     * @returns 扫描结果，包含残留卡片列表和统计信息
     * 
     * @example
     * const service = new RiffCleanupService(deckId, storage);
     * const result = await service.scanOrphanCards();
     * console.log(`Found ${result.count} orphan cards`);
     */
    async scanOrphanCards(): Promise<ScanResult> {
        console.log('[RiffCleanup] Starting scan for orphan cards...');
        
        try {
            // 1. 获取本地所有卡片 ID
            const localCards = this.storage.getAllCards();
            const localCardIDs = new Set(localCards.map(card => card.id));
            
            console.log(`[RiffCleanup] Local cards: ${localCardIDs.size}`);
            
            // 2. 获取 Riff 中所有卡片
            const riffCards = await getRiffCards(this.deckId, {
                dueOnly: false,
                includeNew: true
            });
            
            console.log(`[RiffCleanup] Riff cards: ${riffCards.length}`);
            
            // 3. 找出需要删除的卡片（Riff 有但本地没有）
            const orphanCards: OrphanCard[] = riffCards
                .filter(card => !localCardIDs.has(card.id))
                .map(card => this.convertToOrphanCard(card));
            
            console.log(`[RiffCleanup] Scan completed: found ${orphanCards.length} orphan cards`);
            
            return {
                orphanCards,
                count: orphanCards.length,
                success: true
            };
        } catch (error) {
            console.error('[RiffCleanup] Scan failed:', error);
            
            return {
                orphanCards: [],
                count: 0,
                success: false,
                errorMessage: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    
    /**
     * 清理残留卡片
     * 
     * 批量删除 Riff 中的残留卡片
     * 
     * @param orphanCards 要删除的残留卡片列表
     * @returns 清理结果，包含删除成功和失败的数量
     * 
     * @example
     * const scanResult = await service.scanOrphanCards();
     * const cleanupResult = await service.cleanupOrphanCards(scanResult.orphanCards);
     * console.log(`Deleted ${cleanupResult.deletedCount} cards`);
     */
    async cleanupOrphanCards(orphanCards: OrphanCard[]): Promise<CleanupResult> {
        console.log(`[RiffCleanup] Starting cleanup for ${orphanCards.length} orphan cards...`);
        
        if (orphanCards.length === 0) {
            return {
                success: true,
                deletedCount: 0,
                failedCount: 0
            };
        }
        
        try {
            // 提取卡片 ID
            const cardIDs = orphanCards.map(card => card.id);
            
            // 批量删除
            await removeRiffCards(this.deckId, cardIDs);
            
            console.log(`[RiffCleanup] Cleanup completed: deleted ${cardIDs.length} cards`);
            
            return {
                success: true,
                deletedCount: cardIDs.length,
                failedCount: 0
            };
        } catch (error) {
            console.error('[RiffCleanup] Cleanup failed:', error);
            
            return {
                success: false,
                deletedCount: 0,
                failedCount: orphanCards.length,
                errorMessage: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    
    /**
     * 扫描并清理残留卡片（一步完成）
     * 
     * 先扫描残留卡片，然后自动清理
     * 
     * @returns 清理结果
     * 
     * @example
     * const service = new RiffCleanupService(deckId, storage);
     * const result = await service.scanAndCleanup();
     * console.log(`Deleted ${result.deletedCount} orphan cards`);
     */
    async scanAndCleanup(): Promise<CleanupResult> {
        console.log('[RiffCleanup] Starting scan and cleanup...');
        
        // 1. 扫描残留卡片
        const scanResult = await this.scanOrphanCards();
        
        if (!scanResult.success) {
            return {
                success: false,
                deletedCount: 0,
                failedCount: 0,
                errorMessage: scanResult.errorMessage
            };
        }
        
        if (scanResult.count === 0) {
            console.log('[RiffCleanup] No orphan cards found');
            return {
                success: true,
                deletedCount: 0,
                failedCount: 0
            };
        }
        
        // 2. 清理残留卡片
        const cleanupResult = await this.cleanupOrphanCards(scanResult.orphanCards);
        
        console.log('[RiffCleanup] Scan and cleanup completed');
        
        return cleanupResult;
    }
    
    // ==================== 私有方法 ====================
    
    /**
     * 转换 RiffBlock 为 OrphanCard
     */
    private convertToOrphanCard(riffBlock: RiffBlock): OrphanCard {
        return {
            id: riffBlock.id,
            blockId: riffBlock.id,
            content: riffBlock.content,
            path: riffBlock.hPath
        };
    }
}
