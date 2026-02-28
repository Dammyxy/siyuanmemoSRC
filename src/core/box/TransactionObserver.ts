/**
 * TransactionObserver
 * 
 * @deprecated 此类已被 AutoCardHandler 替代，将在未来版本中移除
 * @see AutoCardHandler - 新的自动制卡处理器，使用统一的 WebSocket 架构
 * @see .kiro/specs/quick-card-symbols/tasks.md - Task 2.8
 * 
 * 迁移说明：
 * - TransactionObserver 通过 eventBus 间接监听 WebSocket 事件
 * - AutoCardHandler 直接注册到 TransactionWebSocketService
 * - AutoCardHandler 支持更多符号类型和更短的防抖时间
 * - 列表模版功能已迁移到 AutoCardHandler
 */

import type FSRSPlugin from '@/index';
import { CardBuilderContext, detectCardType, initializeAFactor } from '@/core/card-builder';
import { getBlockKramdown, getBlockAttrs, setBlockAttrs, sql } from '@/core/siyuan/api';
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
 * @deprecated 使用 AutoCardHandler 替代
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
            // 🆕 0. 检查是否为列表模板的子项（如果是，跳过创建）
            logger.info(`[SiYuanMemo] Step 0: Checking if ${blockId} is a list template child...`);
            const isListTemplateChild = await this.isListTemplateChild(blockId);
            logger.info(`[SiYuanMemo] Step 0 result: isListTemplateChild = ${isListTemplateChild}`);
            
            if (isListTemplateChild) {
                logger.info(`[SiYuanMemo] ✅ Block ${blockId} is a child of list template, skipping card creation`);
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

            // Check if plugin knows it (via FSRS block attrs)
            const isFsrsAttr = await isFlashcardBlock(blockId);

            logger.info(`[SiYuanMemo] Card Status for ${blockId}: RiffDB=${isRiffInDb}, RiffAttr=${hasRiffAttr}, FSRSAttr=${isFsrsAttr}`);

            // 检查卡片类型是否已标记
            const attrs = await getBlockAttrs(blockId);
            const hasCardType = attrs && (attrs['custom-fsrs-card-type'] === 'topic' || attrs['custom-fsrs-card-type'] === 'item');

            if (isRiffInDb && hasRiffAttr && isFsrsAttr && hasCardType) {
                // Completely done and synced (including card type)
                logger.info(`[SiYuanMemo] Card ${blockId} already fully synced with type: ${attrs['custom-fsrs-card-type']}`);
                return;
            }

            logger.info(`[SiYuanMemo] Syncing card for block ${blockId}... (hasCardType: ${hasCardType})`);

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
                
                // 🆕 5.5. 检测是否为列表项模版卡
                const isListTemplate = await this.checkListTemplate(blockId);
                if (isListTemplate) {
                    logger.info(`[SiYuanMemo] Detected list template card: ${blockId}`);
                    await this.createListTemplateCards(blockId);
                    return; // 已处理，跳过常规流程
                }
            }

            // 6. Mark block with FSRS attributes (Plugin UI support) if not exists
            if (!isFsrsAttr && card) {
                // 注意：cardType 会在后面的步骤 6.5 中单独设置
                await markBlockAsCard(blockId, card.id, card.priority, card.type as 'topic' | 'item');
            }

            // 6.5. 标记卡片类型和初始化 A-Factor（总是执行，除非已有类型）
            if (!hasCardType) {
                const cardType = await detectCardType(blockId);

                const cardTypeAttrs: Record<string, string> = {
                    'custom-fsrs-card-type': cardType,
                };

                // 如果是 Topic，初始化并存储 A-Factor
                if (cardType === 'topic') {
                    // 获取优先级（从已有卡片或默认值）
                    const priority = card?.priority || parseInt(attrs?.['custom-fsrs-priority'] || '50', 10);
                    const aFactor = initializeAFactor(priority);
                    cardTypeAttrs['custom-fsrs-a-factor'] = aFactor.toString();
                    logger.info(`[SiYuanMemo] Topic card detected: blockID=${blockId}, aFactor=${aFactor}`);
                } else {
                    logger.info(`[SiYuanMemo] Item card detected: blockID=${blockId}`);
                }

                await setBlockAttrs(blockId, cardTypeAttrs);
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
     * 检查块是否为列表项模版卡
     * 
     * @description
     * 列表项模版卡的条件：
     * - 块类型必须是列表项（type='i'）
     * - 必须有至少2个子级列表项块
     * 
     * @param blockId 块 ID
     * @returns 是否为列表项模版卡
     */
    /**
     * 检查块是否为列表项的子项（不应该被单独创建为卡片）
     * 
     * @param blockId - 块 ID
     * @returns 是否为列表项的子项
     * 
     * @description 检测逻辑：
     * 1. 检查块类型是否为列表项（type = 'i'）
     * 2. 获取父列表容器（type = 'l'）
     * 3. 获取列表容器的父块（应该是父列表项）
     * 4. 如果父列表项存在，说明这是一个子列表项，不应该被单独创建为卡片
     * 
     * 注意：
     * - 有序列表：父列表项会创建列表模板，子项不单独创建
     * - 无序列表：父列表项会创建一张卡片（正面隐藏子项），子项不单独创建
     */
    private async isListTemplateChild(blockId: string): Promise<boolean> {
        try {
            logger.info(`[SiYuanMemo][isListTemplateChild] Checking block ${blockId}...`);
            
            // 1. 检查块类型
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
            
            // 只有列表项才可能是列表项的子项
            if (blockType !== 'i') {
                logger.info(`[SiYuanMemo][isListTemplateChild] Not a list item, returning false`);
                return false;
            }
            
            // 2. 获取父块（应该是列表容器 'l'）
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
            
            // 父块必须是列表容器
            if (parentType !== 'l') {
                logger.info(`[SiYuanMemo][isListTemplateChild] Parent is not a list container, returning false`);
                return false;
            }
            
            // 3. 获取祖父块（应该是父列表项 'i'）
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
            
            // 祖父块必须是列表项
            if (grandParentType !== 'i') {
                logger.info(`[SiYuanMemo][isListTemplateChild] Grandparent is not a list item, returning false`);
                return false;
            }
            
            // 4. 如果有父列表项，说明这是一个子列表项
            // 无论是有序还是无序列表，子列表项都不应该被单独创建为卡片
            logger.info(`[SiYuanMemo][isListTemplateChild] ✅ Block ${blockId} is a child list item of ${grandParentId}, should skip card creation`);
            return true;
        } catch (err) {
            logger.error(`[SiYuanMemo][isListTemplateChild] Error checking block ${blockId}:`, err);
            return false;
        }
    }

    private async checkListTemplate(blockId: string): Promise<boolean> {
        try {
            logger.info(`[SiYuanMemo] 🔍 Checking if block ${blockId} is a list template...`);
            
            // 1. 检查块类型
            const typeResult = await sql(`
                SELECT type FROM blocks
                WHERE id = '${blockId}'
                LIMIT 1
            `);
            
            logger.info(`[SiYuanMemo] Block type query result:`, typeResult);
            
            if (!typeResult || typeResult.length === 0) {
                logger.info(`[SiYuanMemo] ❌ Block ${blockId} not found in database`);
                return false;
            }
            
            const blockType = typeResult[0].type;
            logger.info(`[SiYuanMemo] Block ${blockId} type: ${blockType}`);
            
            if (blockType !== 'i') {
                logger.info(`[SiYuanMemo] ❌ Block ${blockId} is not a list item (type='${blockType}'), skipping list template check`);
                return false;
            }
            
            // 2. 获取列表容器（思源结构：列表项(i) → 段落(p) + 列表容器(l)）
            const listContainerResult = await sql(`
                SELECT id FROM blocks
                WHERE parent_id = '${blockId}'
                AND type = 'l'
                LIMIT 1
            `);
            
            if (!listContainerResult || listContainerResult.length === 0) {
                logger.info(`[SiYuanMemo] ❌ Block ${blockId} has no list container, not a list template`);
                return false;
            }
            
            const listContainerId = listContainerResult[0].id;
            logger.info(`[SiYuanMemo] Found list container: ${listContainerId}`);
            
            // 3. 检查子级列表项数量和类型（必须是有序列表 subtype='o'）
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
                logger.info(`[SiYuanMemo] ✅ Block ${blockId} is a list template with ${childCount} ordered children`);
            } else {
                logger.info(`[SiYuanMemo] ❌ Block ${blockId} has only ${childCount} ordered children (need ≥2), not a list template`);
            }
            
            return hasMultipleOrderedChildren;
        } catch (err) {
            logger.error(`[SiYuanMemo] ❌ Failed to check list template:`, err);
            return false;
        }
    }

    /**
     * 创建列表项模版卡
     * 
     * @description
     * 为每个子级列表项创建一张 Xiuyuan 卡片：
     * - 父列表项作为问题（正面）
     * - 每个子级列表项作为答案（背面）
     * 
     * @param parentBlockId 父列表项块 ID
     */
    private async createListTemplateCards(parentBlockId: string): Promise<void> {
        try {
            logger.info(`[SiYuanMemo] 🎯 Starting to create list template cards for parent: ${parentBlockId}`);
            
            // 1. 获取列表容器（思源结构：列表项(i) → 段落(p) + 列表容器(l)）
            const listContainerResult = await sql(`
                SELECT id FROM blocks
                WHERE parent_id = '${parentBlockId}'
                AND type = 'l'
                LIMIT 1
            `);
            
            if (!listContainerResult || listContainerResult.length === 0) {
                logger.warn(`[SiYuanMemo] ⚠️ No list container found for parent: ${parentBlockId}`);
                return;
            }
            
            const listContainerId = listContainerResult[0].id;
            logger.info(`[SiYuanMemo] Found list container: ${listContainerId}`);
            
            // 2. 获取所有有序子级列表项（subtype='o'）
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
                logger.warn(`[SiYuanMemo] ⚠️ Not enough ordered children for list template: ${parentBlockId} (found: ${childrenResult?.length || 0})`);
                return;
            }
            
            const childBlockIds = childrenResult.map((row: { id: string }) => row.id);
            logger.info(`[SiYuanMemo] 📝 Creating list template with ${childBlockIds.length} ordered children for parent: ${parentBlockId}`);
            logger.info(`[SiYuanMemo] Child block IDs:`, childBlockIds);
            
            // 3. 调用列表模板专用的创建方法
            // ✅ 使用 createListTemplateCards 而不是 createFromBlocks
            // 这样会创建 1 个 Xiuyuan → N 张卡片（N = 子列表项数量）
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
            
            if (result.ok) {
                logger.info(
                    `[SiYuanMemo] ✅ Created list template split-v2: created=${result.value.created.length}, skipped=${result.value.skippedChildBlockIds.length}`
                );
                logger.info(`[SiYuanMemo] Created children:`, result.value.created);
            } else {
                logger.error(`[SiYuanMemo] ❌ Failed to create list template:`, result.error);
            }
        } catch (err) {
            logger.error(`[SiYuanMemo] ❌ Failed to create list template cards:`, err);
        }
    }
}
