/**
 * RiffBlacklistService - Riff 黑名单服务
 * 
 * 管理 Riff 同步的黑名单功能：
 * - 添加/移除黑名单
 * - 查询黑名单状态
 * - 清理过期的黑名单项
 * 
 * 黑名单用途：
 * - 当 Riff 删除失败时，将卡片加入黑名单，避免重复同步
 * - 定期清理黑名单中已不存在的卡片
 */

import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';

export interface RiffBlacklistServiceConfig {
    /**
     * 是否启用黑名单功能
     */
    enabled: boolean;
}

/**
 * Riff 黑名单服务
 * 
 * 负责管理 Riff 同步的黑名单，避免重复同步失败的卡片。
 */
export class RiffBlacklistService {
    private config: RiffBlacklistServiceConfig;
    private unifiedStorage: UnifiedStorageManager;
    
    constructor(
        config: RiffBlacklistServiceConfig,
        unifiedStorage: UnifiedStorageManager
    ) {
        this.config = config;
        this.unifiedStorage = unifiedStorage;
    }
    
    /**
     * 添加到黑名单
     * 
     * @param blockId - 块 ID
     */
    async addToBlacklist(blockId: string): Promise<void> {
        if (!this.config.enabled) {
            console.log('[RiffBlacklistService] Blacklist disabled, skipping add');
            return;
        }
        
        try {
            (this.unifiedStorage as any).addToRiffBlacklist?.(blockId);
            console.log(`[RiffBlacklistService] Added to blacklist: ${blockId}`);
        } catch (error) {
            console.error(`[RiffBlacklistService] Failed to add to blacklist: ${blockId}`, error);
            throw error;
        }
    }
    
    /**
     * 从黑名单移除
     * 
     * @param blockId - 块 ID
     */
    async removeFromBlacklist(blockId: string): Promise<void> {
        if (!this.config.enabled) {
            console.log('[RiffBlacklistService] Blacklist disabled, skipping remove');
            return;
        }
        
        try {
            (this.unifiedStorage as any).removeFromRiffBlacklist?.(blockId);
            console.log(`[RiffBlacklistService] Removed from blacklist: ${blockId}`);
        } catch (error) {
            console.error(`[RiffBlacklistService] Failed to remove from blacklist: ${blockId}`, error);
            throw error;
        }
    }
    
    /**
     * 检查是否在黑名单中
     * 
     * @param blockId - 块 ID
     * @returns 是否在黑名单中
     */
    async isInBlacklist(blockId: string): Promise<boolean> {
        if (!this.config.enabled) {
            return false;
        }
        
        try {
            const blacklist = (this.unifiedStorage as any).getRiffBlacklist?.() || new Set();
            return blacklist.has(blockId);
        } catch (error) {
            console.error(`[RiffBlacklistService] Failed to check blacklist: ${blockId}`, error);
            return false;
        }
    }
    
    /**
     * 获取黑名单
     * 
     * @returns 黑名单集合
     */
    async getBlacklist(): Promise<Set<string>> {
        if (!this.config.enabled) {
            return new Set();
        }
        
        try {
            const blacklist = (this.unifiedStorage as any).getRiffBlacklist?.() || new Set();
            return blacklist;
        } catch (error) {
            console.error('[RiffBlacklistService] Failed to get blacklist', error);
            return new Set();
        }
    }
    
    /**
     * 过滤黑名单
     * 
     * 从列表中过滤掉黑名单中的项
     * 
     * @param blockIds - 块 ID 列表
     * @returns 过滤后的块 ID 列表
     */
    async filterBlacklist<T extends { id: string }>(items: T[]): Promise<T[]> {
        if (!this.config.enabled) {
            return items;
        }
        
        try {
            const blacklist = await this.getBlacklist();
            const filtered = items.filter(item => !blacklist.has(item.id));
            
            const filteredCount = items.length - filtered.length;
            if (filteredCount > 0) {
                console.log(`[RiffBlacklistService] Filtered ${filteredCount} blacklisted items`);
            }
            
            return filtered;
        } catch (error) {
            console.error('[RiffBlacklistService] Failed to filter blacklist', error);
            return items;
        }
    }
    
    /**
     * 清理黑名单
     * 
     * 移除黑名单中不在有效列表中的项
     * 
     * @param validBlockIds - 有效的块 ID 集合
     * @returns 清理的数量
     */
    async cleanupBlacklist(validBlockIds: Set<string>): Promise<number> {
        if (!this.config.enabled) {
            console.log('[RiffBlacklistService] Blacklist disabled, skipping cleanup');
            return 0;
        }
        
        try {
            const blacklist = await this.getBlacklist();
            const toRemove = Array.from(blacklist).filter(id => !validBlockIds.has(id));
            
            for (const id of toRemove) {
                await this.removeFromBlacklist(id);
            }
            
            console.log(`[RiffBlacklistService] Cleaned ${toRemove.length} items from blacklist`);
            return toRemove.length;
        } catch (error) {
            console.error('[RiffBlacklistService] Failed to cleanup blacklist', error);
            return 0;
        }
    }
    
    /**
     * 获取黑名单大小
     * 
     * @returns 黑名单中的项数
     */
    async getBlacklistSize(): Promise<number> {
        if (!this.config.enabled) {
            return 0;
        }
        
        try {
            const blacklist = await this.getBlacklist();
            return blacklist.size;
        } catch (error) {
            console.error('[RiffBlacklistService] Failed to get blacklist size', error);
            return 0;
        }
    }
    
    /**
     * 清空黑名单
     */
    async clearBlacklist(): Promise<void> {
        if (!this.config.enabled) {
            console.log('[RiffBlacklistService] Blacklist disabled, skipping clear');
            return;
        }
        
        try {
            const blacklist = await this.getBlacklist();
            for (const id of blacklist) {
                await this.removeFromBlacklist(id);
            }
            console.log('[RiffBlacklistService] Cleared blacklist');
        } catch (error) {
            console.error('[RiffBlacklistService] Failed to clear blacklist', error);
            throw error;
        }
    }
}
