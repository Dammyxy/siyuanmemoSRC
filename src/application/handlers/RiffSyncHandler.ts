/**
 * Riff 同步处理器
 *
 * 职责：
 * - 检测 Riff 相关操作（addFlashcards/removeFlashcards/updateAttrs）
 * - 根据变更语义触发增量或全量同步
 * - 防抖处理（300ms）
 */

import type { ITransactionHandler, Transaction } from '../../core/infrastructure/websocket/TransactionWebSocketService';
import type { DoOperation } from '../../core/infrastructure/websocket/transaction-types';
import type { XiuyuanSyncService } from '@/application/services/XiuyuanSyncService';
import { createLogger } from '@/utils/logger';

const logger = createLogger('RiffSyncHandler');

type RiffSyncKind = 'none' | 'incremental' | 'full';

/**
 * 监听 Riff 相关 transaction，并将新增/删除变更路由到正确的同步语义。
 */
export class RiffSyncHandler implements ITransactionHandler {
    private xiuyuanSyncService: XiuyuanSyncService;
    private debounceTimer: NodeJS.Timeout | null = null;
    private pendingSyncKind: RiffSyncKind = 'none';
    private readonly DEBOUNCE_DELAY = 300;

    constructor(xiuyuanSyncService: XiuyuanSyncService) {
        this.xiuyuanSyncService = xiuyuanSyncService;
    }

    handle(transactions: Transaction[]): void {
        const detectedKind = this.detectRiffChanges(transactions);
        if (detectedKind === 'none') {
            return;
        }

        this.pendingSyncKind = this.mergeSyncKind(this.pendingSyncKind, detectedKind);
        logger.info('Detected Riff changes', { syncKind: this.pendingSyncKind });

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            const syncKind = this.pendingSyncKind;
            this.pendingSyncKind = 'none';
            void this.runScheduledSync(syncKind);
        }, this.DEBOUNCE_DELAY);
    }

    private detectRiffChanges(transactions: Transaction[]): RiffSyncKind {
        let detectedKind: RiffSyncKind = 'none';

        for (const tx of transactions) {
            if (!tx.doOperations) continue;

            for (const op of tx.doOperations) {
                if (op.action === 'addFlashcards') {
                    logger.debug('Detected addFlashcards:', op.id);
                    detectedKind = this.mergeSyncKind(detectedKind, 'incremental');
                    continue;
                }

                if (op.action === 'removeFlashcards') {
                    logger.debug('Detected removeFlashcards:', op.id);
                    return 'full';
                }

                if (op.action === 'updateAttrs') {
                    const deckChangeKind = this.detectDeckAttrChange(op);
                    if (deckChangeKind === 'full') {
                        return 'full';
                    }
                    detectedKind = this.mergeSyncKind(detectedKind, deckChangeKind);
                }
            }
        }

        return detectedKind;
    }

    private detectDeckAttrChange(operation: DoOperation): RiffSyncKind {
        const previousDecks = this.readDeckAttr(operation.data?.old?.['custom-riff-decks']);
        const nextDecks = this.readDeckAttr(operation.data?.new?.['custom-riff-decks']);

        if (previousDecks === nextDecks) {
            return 'none';
        }

        if (!nextDecks && previousDecks) {
            logger.debug('Detected updateAttrs removing custom-riff-decks:', operation.id);
            return 'full';
        }

        if (nextDecks) {
            logger.debug('Detected updateAttrs with custom-riff-decks:', operation.id);
            return 'incremental';
        }

        return 'none';
    }

    private readDeckAttr(value: unknown): string {
        return typeof value === 'string' ? value.trim() : '';
    }

    private mergeSyncKind(current: RiffSyncKind, incoming: RiffSyncKind): RiffSyncKind {
        if (current === 'full' || incoming === 'full') {
            return 'full';
        }
        if (current === 'incremental' || incoming === 'incremental') {
            return 'incremental';
        }
        return 'none';
    }

    private async runScheduledSync(syncKind: RiffSyncKind): Promise<void> {
        if (syncKind === 'none') {
            return;
        }

        logger.debug('Waiting for Riff API to update...');
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (syncKind === 'full') {
            logger.debug('Triggering full sync...');
            this.xiuyuanSyncService.fullSync()
                .then((result) => {
                    logger.info('Full sync completed:', result);
                })
                .catch((error) => {
                    logger.error('Full sync failed:', error);
                });
            return;
        }

        logger.debug('Triggering incremental sync...');
        this.xiuyuanSyncService.incrementalSync()
            .then((result) => {
                logger.info('Incremental sync completed:', result);
            })
            .catch((error) => {
                logger.error('Incremental sync failed:', error);
            });
    }

    dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.pendingSyncKind = 'none';
    }
}
