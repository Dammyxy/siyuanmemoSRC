/**
 * Riff 同步处理器
 * 
 * 职责：
 * - 检测 Riff 相关操作（addFlashcards/removeFlashcards/updateAttrs）
 * - 触发 HybridSyncService 的增量同步
 * - 防抖处理（300ms）
 * 
 * 实现要点：
 * 1. 检测 addFlashcards/removeFlashcards 操作
 * 2. 检测 updateAttrs 中的 custom-riff-decks 变化
 * 3. 防抖 300ms
 * 4. 调用 HybridSyncService.incrementalSync()
 * 
 * @see .kiro/specs/quick-card-symbols/design.md - Section 2.2
 * @see .kiro/specs/quick-card-symbols/tasks.md - Task 1.2
 */

import type { ITransactionHandler, Transaction } from '../TransactionWebSocketService';
import type { HybridSyncService } from '../HybridSyncService';

/**
 * Riff 同步处理器
 * 
 * 监听 Riff 相关的 transaction 操作，触发增量同步
 */
export class RiffSyncHandler implements ITransactionHandler {
    private hybridSyncService: HybridSyncService;
    private debounceTimer: NodeJS.Timeout | null = null;
    private readonly DEBOUNCE_DELAY = 300; // 300ms
    
    constructor(hybridSyncService: HybridSyncService) {
        this.hybridSyncService = hybridSyncService;
    }
    
    /**
     * 处理 transactions
     * 
     * 检测 Riff 相关操作，触发防抖的增量同步
     * 
     * @param transactions 事务列表
     */
    handle(transactions: Transaction[]): void {
        // 检测是否有 Riff 变化
        if (!this.detectRiffChanges(transactions)) {
            return;
        }
        
        console.log('[RiffSync] Detected Riff changes');
        
        // 防抖处理
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        this.debounceTimer = setTimeout(async () => {
            console.log('[RiffSync] Waiting for Riff API to update...');
            
            // ⏰ 延迟 500ms，等待 Riff API 更新
            // 这样可以确保 getRiffNewCards 能获取到最新的卡片
            await new Promise(resolve => setTimeout(resolve, 500));
            
            console.log('[RiffSync] Triggering incremental sync...');
            this.hybridSyncService.incrementalSync()
                .then((result) => {
                    console.log('[RiffSync] Incremental sync completed:', result);
                })
                .catch((error) => {
                    console.error('[RiffSync] Incremental sync failed:', error);
                });
        }, this.DEBOUNCE_DELAY);
    }
    
    /**
     * 检测 Riff 变化
     * 
     * 检测以下操作：
     * 1. addFlashcards - 添加闪卡
     * 2. removeFlashcards - 删除闪卡
     * 3. updateAttrs with custom-riff-decks - 更新卡组属性
     * 
     * @param transactions 事务列表
     * @returns 是否检测到 Riff 变化
     */
    private detectRiffChanges(transactions: Transaction[]): boolean {
        for (const tx of transactions) {
            if (!tx.doOperations) continue;
            
            for (const op of tx.doOperations) {
                // 检测 Riff 相关操作
                if (op.action === 'addFlashcards') {
                    console.log('[RiffSync] Detected addFlashcards:', op.id);
                    return true;
                }
                
                if (op.action === 'removeFlashcards') {
                    console.log('[RiffSync] Detected removeFlashcards:', op.id);
                    return true;
                }
                
                // 检测 updateAttrs 中的 custom-riff-decks 变化
                if (op.action === 'updateAttrs' && op.data?.new?.['custom-riff-decks']) {
                    console.log('[RiffSync] Detected updateAttrs with custom-riff-decks:', op.id);
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * 清理资源
     * 
     * 清除防抖定时器
     */
    dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }
}
