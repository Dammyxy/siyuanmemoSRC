/**
 * TransactionObserver
 * 
 * @deprecated 姝ょ被宸茶 AutoCardHandler 鏇夸唬锛屽皢鍦ㄦ湭鏉ョ増鏈腑绉婚櫎
 * @see AutoCardHandler - 鏂扮殑鑷姩鍒跺崱澶勭悊鍣紝浣跨敤缁熶竴鐨?WebSocket 鏋舵瀯
 * @see .kiro/specs/quick-card-symbols/tasks.md - Task 2.8
 * 
 * 杩佺Щ璇存槑锛?
 * - TransactionObserver 閫氳繃 eventBus 闂存帴鐩戝惉 WebSocket 浜嬩欢
 * - AutoCardHandler 鐩存帴娉ㄥ唽鍒?TransactionWebSocketService
 * - AutoCardHandler 鏀寔鏇村绗﹀彿绫诲瀷鍜屾洿鐭殑闃叉姈鏃堕棿
 * - 鍒楄〃妯＄増鍔熻兘宸茶縼绉诲埌 AutoCardHandler
 */

import type FSRSPlugin from '@/index';
import { CardBuilderContext } from '@/core/card-builder';
import { getBlockKramdown, sql } from '@/core/siyuan/api';
import { getRiffCardsByBlockIDs, addRiffCards, BUILTIN_DECK_ID } from '@/core/siyuan/riff';
import { isFlashcardBlock, markBlockAsCard, hasRiffAttribute } from '@/core/siyuan/block';
import { createLogger } from '@/utils/logger';
import type { FSRSCard } from '@/types';
import type { CardWritePort } from '@/core/storage/ports';

const logger = createLogger('TransactionObserver');

type TransactionObserverStoragePort = CardWritePort & {
    save?: () => Promise<{ ok?: boolean; error?: Error } | unknown>;
};

interface DoOperation {
    action: string;
    data: unknown;
    id: string;
    parentID?: string;
    previousID?: string;
    nextID?: string;
}

interface TransactionDetail {
    cmd: string;
    data: {
        doOperations: DoOperation[];
        undoOperations: DoOperation[] | null;
    }[];
}

type XiuyuanCreateListTemplateResult =
    | {
        ok: true;
        value: {
            mode: 'split-v2';
            parentBlockId: string;
            parentParagraphId: string;
            totalChildren: number;
            created: Array<{
                childBlockId: string;
                xiuyuanId: string;
                cardIds: string[];
            }>;
            skippedChildBlockIds: string[];
        };
    }
    | {
        ok: false;
        error: unknown;
    };

interface XiuyuanApplicationServiceLike {
    createListTemplateCards(command: {
        parentBlockId: string;
        childBlockIds: string[];
        templateId: string;
        deckId: string;
    }): Promise<XiuyuanCreateListTemplateResult>;
}

interface TransactionObserverContextLike {
    getStorage?: () => TransactionObserverStoragePort | null;
    getXiuyuanApplicationService?: () => Promise<XiuyuanApplicationServiceLike>;
}

/**
 * @deprecated 浣跨敤 AutoCardHandler 鏇夸唬
 */
export class TransactionObserver {
    private plugin: FSRSPlugin;
    private builder: CardBuilderContext;
    private processing: Set<string> = new Set();
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingBlocks: Set<string> = new Set();
    private enabled: boolean = false;

    constructor(plugin: FSRSPlugin) {
        this.plugin = plugin;
        this.builder = new CardBuilderContext();
    }

    private getContext(): TransactionObserverContextLike | null {
        try {
            return (this.plugin?.getContext?.() as TransactionObserverContextLike | null) ?? null;
        } catch (error) {
            logger.warn('[TransactionObserver] Failed to get ApplicationContext:', error);
            return null;
        }
    }

    private getStorage(): TransactionObserverStoragePort | null {
        const storage = this.getContext()?.getStorage?.();
        if (!storage) {
            return null;
        }
        return storage as TransactionObserverStoragePort;
    }

    private async persistStorage(): Promise<void> {
        const storage = this.getStorage();
        if (!storage) {
            return;
        }

        if (typeof storage.saveCards === 'function') {
            await storage.saveCards();
            return;
        }

        if (typeof storage.save === 'function') {
            const result = await storage.save();
            if (
                result &&
                typeof result === 'object' &&
                'ok' in (result as Record<string, unknown>) &&
                (result as { ok?: boolean }).ok === false
            ) {
                const errorMessage = (result as { error?: Error })?.error?.message || 'Unknown persistence error';
                throw new Error(errorMessage);
            }
        }
    }

    private setCardToStorage(card: FSRSCard): void {
        const storage = this.getStorage();
        if (!storage) {
            logger.warn('setCard skipped: storage unavailable');
            return;
        }
        storage.setCard(card);
    }

    public init() {
        logger.info('[SiYuanMemo] TransactionObserver initialized');
        this.plugin.eventBus.on('ws-main', this.handleTransaction);
    }

    public unload() {
        this.plugin.eventBus.off('ws-main', this.handleTransaction);
    }

    public setEnabled(enabled: boolean) {
        logger.info('[SiYuanMemo] TransactionObserver enabled:', enabled);
        this.enabled = enabled;
    }

    private handleTransaction = (event: { detail?: TransactionDetail }): void => {
        if (!this.enabled) return;

        if (!event.detail) return;
        const detail = event.detail;
        logger.info('[SiYuanMemo] WS Event:', detail.cmd);

        if (detail.cmd !== 'transactions' || !detail.data) return;

        logger.info('[SiYuanMemo] Transaction received:', detail.data.length);

        detail.data.forEach(data => {
            data.doOperations.forEach(op => {
                // We monitor insert and update actions
                if (op.action === 'insert' || op.action === 'update') {
                    logger.info('[SiYuanMemo] Ops:', op.action, op.id);
                    this.queueBlockCheck(op.id);
                }
            });
        });
    }

    private queueBlockCheck(blockId: string) {
        // logger.info('[SiYuanMemo] Queueing check for block:', blockId);
        this.pendingBlocks.add(blockId);
        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        // Debounce for 2 seconds to avoid processing receiving partial inputs
        this.debounceTimer = setTimeout(() => {
            this.processQueue();
        }, 2000);
    }

    private async processQueue() {
        const blocks = Array.from(this.pendingBlocks);
        logger.info('[SiYuanMemo] Processing queue, blocks:', blocks.length);
        this.pendingBlocks.clear();

        for (const blockId of blocks) {
            try {
                await this.checkAndCreateCard(blockId);
            } catch (err) {
                logger.error(`[SiYuanMemo] Auto-card failed for block ${blockId}:`, err);
            }
        }
        // Save storage once after batch
        try {
            await this.persistStorage();
        } catch (error) {
            logger.error('Failed to persist storage after processing queue:', error);
        }
    }

    private async checkAndCreateCard(blockId: string) {
        if (this.processing.has(blockId)) return;
        this.processing.add(blockId);

        logger.info(`[SiYuanMemo] ========== checkAndCreateCard called for ${blockId} ==========`);

        try {
            // 馃啎 0. 妫€鏌ユ槸鍚︿负鍒楄〃妯℃澘鐨勫瓙椤癸紙濡傛灉鏄紝璺宠繃鍒涘缓锛?
            logger.info(`[SiYuanMemo] Step 0: Checking if ${blockId} is a list template child...`);
            const isListTemplateChild = await this.isListTemplateChild(blockId);
            logger.info(`[SiYuanMemo] Step 0 result: isListTemplateChild = ${isListTemplateChild}`);
            
            if (isListTemplateChild) {
                logger.info(`[SiYuanMemo] 鉁?Block ${blockId} is a child of list template, skipping card creation`);
                return;
            }

            // 1. Get block markdown content
            const { kramdown } = await getBlockKramdown(blockId);
            logger.info(`[SiYuanMemo] Check block ${blockId}, content: ${kramdown}`);
            if (!kramdown) return;

            // 2. Check if content matches a supported strategy (Excluding default)
            const strategy = this.builder.matchStrategy(blockId, kramdown, true);
            logger.info(`[SiYuanMemo] Strategy match result for ${blockId}:`, strategy ? strategy.strategyName : 'None');
            if (!strategy) {
                return;
            }

            // 3. Check if already a card (via Riff DB)
            const existingRiffCards = await getRiffCardsByBlockIDs([blockId]);
            const isRiffInDb = existingRiffCards && existingRiffCards.length > 0;

            // Check if block has Riff attribute (for UI marker)
            const hasRiffAttr = await hasRiffAttribute(blockId);

            // Check if plugin knows it (via local storage first)
            const storage = this.getStorage() as TransactionObserverStoragePort & {
                getCardByBlockId?: (id: string) => FSRSCard | undefined;
            };
            const isFsrsAttr = typeof storage?.getCardByBlockId === 'function'
                ? Boolean(storage.getCardByBlockId(blockId))
                : await isFlashcardBlock(blockId);

            logger.info(`[SiYuanMemo] Card Status for ${blockId}: RiffDB=${isRiffInDb}, RiffAttr=${hasRiffAttr}, FSRSAttr=${isFsrsAttr}`);

            if (isRiffInDb && hasRiffAttr && isFsrsAttr) {
                logger.info(`[SiYuanMemo] Card ${blockId} already fully synced`);
                return;
            }

            logger.info(`[SiYuanMemo] Syncing card for block ${blockId}...`);


            // 4. Build card object (generate metadata) - only if needed
            let card;
            if (!isRiffInDb || !hasRiffAttr || !isFsrsAttr) {
                card = await strategy.build(blockId, kramdown);
            }

            // 5. Add to Siyuan Riff Deck (Native) if not in DB OR missing attribute (repair UI)
            if (!isRiffInDb || !hasRiffAttr) {
                logger.info(`[SiYuanMemo] Adding to Riff Deck: ${BUILTIN_DECK_ID}`);
                const res = await addRiffCards(BUILTIN_DECK_ID, [blockId]);
                logger.info(`[SiYuanMemo] addRiffCards result:`, res);
                
                // 馃啎 5.5. 妫€娴嬫槸鍚︿负鍒楄〃椤规ā鐗堝崱
                const isListTemplate = await this.checkListTemplate(blockId);
                if (isListTemplate) {
                    logger.info(`[SiYuanMemo] Detected list template card: ${blockId}`);
                    await this.createListTemplateCards(blockId);
                    return; // 宸插鐞嗭紝璺宠繃甯歌娴佺▼
                }
            }

            // 6. Mark block with FSRS attributes (Plugin UI support) if not exists
            if (!isFsrsAttr && card) {
                // 娉ㄦ剰锛歝ardType 浼氬湪鍚庨潰鐨勬楠?6.5 涓崟鐙缃?
                await markBlockAsCard(blockId, card.id, card.priority, card.type as 'topic' | 'item');
            }


            // 7. Save to Plugin Storage (only if card was created)
            if (card) {
                this.setCardToStorage(card);
            }

        } catch (err) {
            logger.error(`[SiYuanMemo] Failed to auto-create card for ${blockId}:`, err);
        } finally {
            this.processing.delete(blockId);
        }
    }

    /**
     * 妫€鏌ュ潡鏄惁涓哄垪琛ㄩ」妯＄増鍗?
     * 
     * @description
     * 鍒楄〃椤规ā鐗堝崱鐨勬潯浠讹細
     * - 鍧楃被鍨嬪繀椤绘槸鍒楄〃椤癸紙type='i'锛?
     * - 蹇呴』鏈夎嚦灏?涓瓙绾у垪琛ㄩ」鍧?
     * 
     * @param blockId 鍧?ID
     * @returns 鏄惁涓哄垪琛ㄩ」妯＄増鍗?
     */
    /**
     * 妫€鏌ュ潡鏄惁涓哄垪琛ㄩ」鐨勫瓙椤癸紙涓嶅簲璇ヨ鍗曠嫭鍒涘缓涓哄崱鐗囷級
     * 
     * @param blockId - 鍧?ID
     * @returns 鏄惁涓哄垪琛ㄩ」鐨勫瓙椤?
     * 
     * @description 妫€娴嬮€昏緫锛?
     * 1. 妫€鏌ュ潡绫诲瀷鏄惁涓哄垪琛ㄩ」锛坱ype = 'i'锛?
     * 2. 鑾峰彇鐖跺垪琛ㄥ鍣紙type = 'l'锛?
     * 3. 鑾峰彇鍒楄〃瀹瑰櫒鐨勭埗鍧楋紙搴旇鏄埗鍒楄〃椤癸級
     * 4. 濡傛灉鐖跺垪琛ㄩ」瀛樺湪锛岃鏄庤繖鏄竴涓瓙鍒楄〃椤癸紝涓嶅簲璇ヨ鍗曠嫭鍒涘缓涓哄崱鐗?
     * 
     * 娉ㄦ剰锛?
     * - 鏈夊簭鍒楄〃锛氱埗鍒楄〃椤逛細鍒涘缓鍒楄〃妯℃澘锛屽瓙椤逛笉鍗曠嫭鍒涘缓
     * - 鏃犲簭鍒楄〃锛氱埗鍒楄〃椤逛細鍒涘缓涓€寮犲崱鐗囷紙姝ｉ潰闅愯棌瀛愰」锛夛紝瀛愰」涓嶅崟鐙垱寤?
     */
    private async isListTemplateChild(blockId: string): Promise<boolean> {
        try {
            logger.info(`[SiYuanMemo][isListTemplateChild] Checking block ${blockId}...`);
            
            // 1. 妫€鏌ュ潡绫诲瀷
            const typeResult = await sql(`
                SELECT type, parent_id FROM blocks
                WHERE id = '${blockId}'
                LIMIT 1
            `);
            
            logger.info(`[SiYuanMemo][isListTemplateChild] Block type query result:`, typeResult);
            
            if (!typeResult || typeResult.length === 0) {
                logger.info(`[SiYuanMemo][isListTemplateChild] Block not found`);
                return false;
            }
            
            const blockType = typeResult[0].type;
            const parentId = typeResult[0].parent_id;
            
            logger.info(`[SiYuanMemo][isListTemplateChild] Block type: ${blockType}, parent_id: ${parentId}`);
            
            // 鍙湁鍒楄〃椤规墠鍙兘鏄垪琛ㄩ」鐨勫瓙椤?
            if (blockType !== 'i') {
                logger.info(`[SiYuanMemo][isListTemplateChild] Not a list item, returning false`);
                return false;
            }
            
            // 2. 鑾峰彇鐖跺潡锛堝簲璇ユ槸鍒楄〃瀹瑰櫒 'l'锛?
            const parentResult = await sql(`
                SELECT type, parent_id FROM blocks
                WHERE id = '${parentId}'
                LIMIT 1
            `);
            
            logger.info(`[SiYuanMemo][isListTemplateChild] Parent query result:`, parentResult);
            
            if (!parentResult || parentResult.length === 0) {
                logger.info(`[SiYuanMemo][isListTemplateChild] Parent not found`);
                return false;
            }
            
            const parentType = parentResult[0].type;
            const grandParentId = parentResult[0].parent_id;
            
            logger.info(`[SiYuanMemo][isListTemplateChild] Parent type: ${parentType}, grandparent_id: ${grandParentId}`);
            
            // 鐖跺潡蹇呴』鏄垪琛ㄥ鍣?
            if (parentType !== 'l') {
                logger.info(`[SiYuanMemo][isListTemplateChild] Parent is not a list container, returning false`);
                return false;
            }
            
            // 3. 鑾峰彇绁栫埗鍧楋紙搴旇鏄埗鍒楄〃椤?'i'锛?
            const grandParentResult = await sql(`
                SELECT type FROM blocks
                WHERE id = '${grandParentId}'
                LIMIT 1
            `);
            
            logger.info(`[SiYuanMemo][isListTemplateChild] Grandparent query result:`, grandParentResult);
            
            if (!grandParentResult || grandParentResult.length === 0) {
                logger.info(`[SiYuanMemo][isListTemplateChild] Grandparent not found`);
                return false;
            }
            
            const grandParentType = grandParentResult[0].type;
            
            logger.info(`[SiYuanMemo][isListTemplateChild] Grandparent type: ${grandParentType}`);
            
            // 绁栫埗鍧楀繀椤绘槸鍒楄〃椤?
            if (grandParentType !== 'i') {
                logger.info(`[SiYuanMemo][isListTemplateChild] Grandparent is not a list item, returning false`);
                return false;
            }
            
            // 4. 濡傛灉鏈夌埗鍒楄〃椤癸紝璇存槑杩欐槸涓€涓瓙鍒楄〃椤?
            // 鏃犺鏄湁搴忚繕鏄棤搴忓垪琛紝瀛愬垪琛ㄩ」閮戒笉搴旇琚崟鐙垱寤轰负鍗＄墖
            logger.info(`[SiYuanMemo][isListTemplateChild] 鉁?Block ${blockId} is a child list item of ${grandParentId}, should skip card creation`);
            return true;
        } catch (err) {
            logger.error(`[SiYuanMemo][isListTemplateChild] Error checking block ${blockId}:`, err);
            return false;
        }
    }

    private async checkListTemplate(blockId: string): Promise<boolean> {
        try {
            logger.info(`[SiYuanMemo] 馃攳 Checking if block ${blockId} is a list template...`);
            
            // 1. 妫€鏌ュ潡绫诲瀷
            const typeResult = await sql(`
                SELECT type FROM blocks
                WHERE id = '${blockId}'
                LIMIT 1
            `);
            
            logger.info(`[SiYuanMemo] Block type query result:`, typeResult);
            
            if (!typeResult || typeResult.length === 0) {
                logger.info(`[SiYuanMemo] 鉂?Block ${blockId} not found in database`);
                return false;
            }
            
            const blockType = typeResult[0].type;
            logger.info(`[SiYuanMemo] Block ${blockId} type: ${blockType}`);
            
            if (blockType !== 'i') {
                logger.info(`[SiYuanMemo] 鉂?Block ${blockId} is not a list item (type='${blockType}'), skipping list template check`);
                return false;
            }
            
            // 2. 鑾峰彇鍒楄〃瀹瑰櫒锛堟€濇簮缁撴瀯锛氬垪琛ㄩ」(i) 鈫?娈佃惤(p) + 鍒楄〃瀹瑰櫒(l)锛?
            const listContainerResult = await sql(`
                SELECT id FROM blocks
                WHERE parent_id = '${blockId}'
                AND type = 'l'
                LIMIT 1
            `);
            
            if (!listContainerResult || listContainerResult.length === 0) {
                logger.info(`[SiYuanMemo] 鉂?Block ${blockId} has no list container, not a list template`);
                return false;
            }
            
            const listContainerId = listContainerResult[0].id;
            logger.info(`[SiYuanMemo] Found list container: ${listContainerId}`);
            
            // 3. 妫€鏌ュ瓙绾у垪琛ㄩ」鏁伴噺鍜岀被鍨嬶紙蹇呴』鏄湁搴忓垪琛?subtype='o'锛?
            const childrenResult = await sql(`
                SELECT id, subtype FROM blocks
                WHERE parent_id = '${listContainerId}'
                AND type = 'i'
                AND subtype = 'o'
                AND type != 'd'
            `);
            
            logger.info(`[SiYuanMemo] Ordered children query result:`, childrenResult);
            
            const childCount = childrenResult ? childrenResult.length : 0;
            logger.info(`[SiYuanMemo] Block ${blockId} has ${childCount} ordered list item children`);
            
            const hasMultipleOrderedChildren = childCount >= 2;
            
            if (hasMultipleOrderedChildren) {
                logger.info(`[SiYuanMemo] 鉁?Block ${blockId} is a list template with ${childCount} ordered children`);
            } else {
                logger.info(`[SiYuanMemo] 鉂?Block ${blockId} has only ${childCount} ordered children (need 鈮?), not a list template`);
            }
            
            return hasMultipleOrderedChildren;
        } catch (err) {
            logger.error(`[SiYuanMemo] 鉂?Failed to check list template:`, err);
            return false;
        }
    }

    /**
     * 鍒涘缓鍒楄〃椤规ā鐗堝崱
     * 
     * @description
     * 涓烘瘡涓瓙绾у垪琛ㄩ」鍒涘缓涓€寮?Xiuyuan 鍗＄墖锛?
     * - 鐖跺垪琛ㄩ」浣滀负闂锛堟闈級
     * - 姣忎釜瀛愮骇鍒楄〃椤逛綔涓虹瓟妗堬紙鑳岄潰锛?
     * 
     * @param parentBlockId 鐖跺垪琛ㄩ」鍧?ID
     */
    private async createListTemplateCards(parentBlockId: string): Promise<void> {
        try {
            logger.info(`[SiYuanMemo] 馃幆 Starting to create list template cards for parent: ${parentBlockId}`);
            
            // 1. 鑾峰彇鍒楄〃瀹瑰櫒锛堟€濇簮缁撴瀯锛氬垪琛ㄩ」(i) 鈫?娈佃惤(p) + 鍒楄〃瀹瑰櫒(l)锛?
            const listContainerResult = await sql(`
                SELECT id FROM blocks
                WHERE parent_id = '${parentBlockId}'
                AND type = 'l'
                LIMIT 1
            `);
            
            if (!listContainerResult || listContainerResult.length === 0) {
                logger.warn(`[SiYuanMemo] 鈿狅笍 No list container found for parent: ${parentBlockId}`);
                return;
            }
            
            const listContainerId = listContainerResult[0].id;
            logger.info(`[SiYuanMemo] Found list container: ${listContainerId}`);
            
            // 2. 鑾峰彇鎵€鏈夋湁搴忓瓙绾у垪琛ㄩ」锛坰ubtype='o'锛?
            const childrenResult = await sql(`
                SELECT id FROM blocks
                WHERE parent_id = '${listContainerId}'
                AND type = 'i'
                AND subtype = 'o'
                AND type != 'd'
                ORDER BY id ASC
            `);
            
            logger.info(`[SiYuanMemo] Query ordered children result:`, childrenResult);
            
            if (!childrenResult || childrenResult.length < 2) {
                logger.warn(`[SiYuanMemo] 鈿狅笍 Not enough ordered children for list template: ${parentBlockId} (found: ${childrenResult?.length || 0})`);
                return;
            }
            
            const childBlockIds = childrenResult.map((row: { id: string }) => row.id);
            logger.info(`[SiYuanMemo] 馃摑 Creating list template with ${childBlockIds.length} ordered children for parent: ${parentBlockId}`);
            logger.info(`[SiYuanMemo] Child block IDs:`, childBlockIds);
            
            // 3. 璋冪敤鍒楄〃妯℃澘涓撶敤鐨勫垱寤烘柟娉?
            // 鉁?浣跨敤 createListTemplateCards 鑰屼笉鏄?createFromBlocks
            // 杩欐牱浼氬垱寤?1 涓?Xiuyuan 鈫?N 寮犲崱鐗囷紙N = 瀛愬垪琛ㄩ」鏁伴噺锛?
            const xiuyuanAppService = await this.getContext()?.getXiuyuanApplicationService?.();
            if (!xiuyuanAppService) {
                logger.warn('[TransactionObserver] XiuyuanApplicationService not available');
                return;
            }
            const result = await xiuyuanAppService.createListTemplateCards({
                parentBlockId,
                childBlockIds,
                templateId: 'builtin-list-item',
                deckId: BUILTIN_DECK_ID
            });
            
            if (result.ok === true) {
                logger.info(
                    `[SiYuanMemo] 鉁?Created list template split-v2: created=${result.value.created.length}, skipped=${result.value.skippedChildBlockIds.length}`
                );
                logger.info(`[SiYuanMemo] Created children:`, result.value.created);
            } else {
                logger.error(`[SiYuanMemo] 鉂?Failed to create list template:`, result.error);
            }
        } catch (err) {
            logger.error(`[SiYuanMemo] 鉂?Failed to create list template cards:`, err);
        }
    }
}
