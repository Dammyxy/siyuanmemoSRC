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

interface DoOperation {
    action: string;
    data: any;
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

/**
 * @deprecated 使用 AutoCardHandler 替代
 */
export class TransactionObserver {
    private plugin: FSRSPlugin;
    private builder: CardBuilderContext;
    private processing: Set<string> = new Set();
    private debounceTimer: any = null;
    private pendingBlocks: Set<string> = new Set();
    private enabled: boolean = false;

    constructor(plugin: FSRSPlugin) {
        this.plugin = plugin;
        this.builder = new CardBuilderContext();
    }

    public init() {
        console.log('[SiYuanMemo] TransactionObserver initialized');
        this.plugin.eventBus.on('ws-main', this.handleTransaction);
    }

    public unload() {
        this.plugin.eventBus.off('ws-main', this.handleTransaction);
    }

    public setEnabled(enabled: boolean) {
        console.log('[SiYuanMemo] TransactionObserver enabled:', enabled);
        this.enabled = enabled;
    }

    private handleTransaction = (event: any) => {
        if (!this.enabled) return;

        const detail = event.detail as TransactionDetail;
        console.log('[SiYuanMemo] WS Event:', detail.cmd);

        if (detail.cmd !== 'transactions' || !detail.data) return;

        console.log('[SiYuanMemo] Transaction received:', detail.data.length);

        detail.data.forEach(data => {
            data.doOperations.forEach(op => {
                // We monitor insert and update actions
                if (op.action === 'insert' || op.action === 'update') {
                    console.log('[SiYuanMemo] Ops:', op.action, op.id);
                    this.queueBlockCheck(op.id);
                }
            });
        });
    }

    private queueBlockCheck(blockId: string) {
        // console.log('[SiYuanMemo] Queueing check for block:', blockId);
        this.pendingBlocks.add(blockId);
        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        // Debounce for 2 seconds to avoid processing receiving partial inputs
        this.debounceTimer = setTimeout(() => {
            this.processQueue();
        }, 2000);
    }

    private async processQueue() {
        const blocks = Array.from(this.pendingBlocks);
        console.log('[SiYuanMemo] Processing queue, blocks:', blocks.length);
        this.pendingBlocks.clear();

        for (const blockId of blocks) {
            try {
                await this.checkAndCreateCard(blockId);
            } catch (err) {
                console.error(`[SiYuanMemo] Auto-card failed for block ${blockId}:`, err);
            }
        }
        // Save storage once after batch
        this.plugin.storage.saveCards();
    }

    private async checkAndCreateCard(blockId: string) {
        if (this.processing.has(blockId)) return;
        this.processing.add(blockId);

        console.log(`[SiYuanMemo] checkAndCreateCard called for ${blockId}`);

        try {
            // 1. Get block markdown content
            const { kramdown } = await getBlockKramdown(blockId);
            console.log(`[SiYuanMemo] Check block ${blockId}, content: ${kramdown}`);
            if (!kramdown) return;

            // 2. Check if content matches any strategy (Excluding default)
            const strategy = this.builder.matchStrategy(blockId, kramdown, true);
            console.log(`[SiYuanMemo] Strategy match result for ${blockId}:`, strategy ? strategy.strategyName : 'None');
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

            console.log(`[SiYuanMemo] Card Status for ${blockId}: RiffDB=${isRiffInDb}, RiffAttr=${hasRiffAttr}, FSRSAttr=${isFsrsAttr}`);

            // 检查卡片类型是否已标记
            const attrs = await getBlockAttrs(blockId);
            const hasCardType = attrs && (attrs['custom-fsrs-card-type'] === 'topic' || attrs['custom-fsrs-card-type'] === 'item');

            if (isRiffInDb && hasRiffAttr && isFsrsAttr && hasCardType) {
                // Completely done and synced (including card type)
                console.log(`[SiYuanMemo] Card ${blockId} already fully synced with type: ${attrs['custom-fsrs-card-type']}`);
                return;
            }

            console.log(`[SiYuanMemo] Syncing card for block ${blockId}... (hasCardType: ${hasCardType})`);

            // 4. Build card object (generate metadata) - only if needed
            let card;
            if (!isRiffInDb || !hasRiffAttr || !isFsrsAttr) {
                card = await strategy.build(blockId, kramdown);
            }

            // 5. Add to Siyuan Riff Deck (Native) if not in DB OR missing attribute (repair UI)
            if (!isRiffInDb || !hasRiffAttr) {
                console.log(`[SiYuanMemo] Adding to Riff Deck: ${BUILTIN_DECK_ID}`);
                const res = await addRiffCards(BUILTIN_DECK_ID, [blockId]);
                console.log(`[SiYuanMemo] addRiffCards result:`, res);
                
                // 🆕 5.5. 检测是否为列表项模版卡
                const isListTemplate = await this.checkListTemplate(blockId);
                if (isListTemplate) {
                    console.log(`[SiYuanMemo] Detected list template card: ${blockId}`);
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
                    console.log(`[SiYuanMemo] Topic card detected: blockID=${blockId}, aFactor=${aFactor}`);
                } else {
                    console.log(`[SiYuanMemo] Item card detected: blockID=${blockId}`);
                }

                await setBlockAttrs(blockId, cardTypeAttrs);
            }

            // 7. Save to Plugin Storage (only if card was created)
            if (card) {
                this.plugin.storage.setCard(card);
            }

        } catch (err) {
            console.error(`[SiYuanMemo] Failed to auto-create card for ${blockId}:`, err);
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
    private async checkListTemplate(blockId: string): Promise<boolean> {
        try {
            console.log(`[SiYuanMemo] 🔍 Checking if block ${blockId} is a list template...`);
            
            // 1. 检查块类型
            const typeResult = await sql(`
                SELECT type FROM blocks
                WHERE id = '${blockId}'
                LIMIT 1
            `);
            
            console.log(`[SiYuanMemo] Block type query result:`, typeResult);
            
            if (!typeResult || typeResult.length === 0) {
                console.log(`[SiYuanMemo] ❌ Block ${blockId} not found in database`);
                return false;
            }
            
            const blockType = typeResult[0].type;
            console.log(`[SiYuanMemo] Block ${blockId} type: ${blockType}`);
            
            if (blockType !== 'i') {
                console.log(`[SiYuanMemo] ❌ Block ${blockId} is not a list item (type='${blockType}'), skipping list template check`);
                return false;
            }
            
            // 2. 检查子级列表项数量
            const childrenResult = await sql(`
                SELECT id FROM blocks
                WHERE parent_id = '${blockId}'
                AND type = 'i'
                AND type != 'd'
            `);
            
            console.log(`[SiYuanMemo] Children query result:`, childrenResult);
            
            const childCount = childrenResult ? childrenResult.length : 0;
            console.log(`[SiYuanMemo] Block ${blockId} has ${childCount} list item children`);
            
            const hasMultipleChildren = childCount >= 2;
            
            if (hasMultipleChildren) {
                console.log(`[SiYuanMemo] ✅ Block ${blockId} is a list template with ${childCount} children`);
            } else {
                console.log(`[SiYuanMemo] ❌ Block ${blockId} has only ${childCount} children (need ≥2), not a list template`);
            }
            
            return hasMultipleChildren;
        } catch (err) {
            console.error(`[SiYuanMemo] ❌ Failed to check list template:`, err);
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
            console.log(`[SiYuanMemo] 🎯 Starting to create list template cards for parent: ${parentBlockId}`);
            
            // 1. 获取所有子级列表项
            const childrenResult = await sql(`
                SELECT id FROM blocks
                WHERE parent_id = '${parentBlockId}'
                AND type = 'i'
                AND type != 'd'
                ORDER BY id ASC
            `);
            
            console.log(`[SiYuanMemo] Query children result:`, childrenResult);
            
            if (!childrenResult || childrenResult.length < 2) {
                console.warn(`[SiYuanMemo] ⚠️ Not enough children for list template: ${parentBlockId} (found: ${childrenResult?.length || 0})`);
                return;
            }
            
            const childBlockIds = childrenResult.map((row: any) => row.id);
            console.log(`[SiYuanMemo] 📝 Creating ${childBlockIds.length} list template cards for parent: ${parentBlockId}`);
            console.log(`[SiYuanMemo] Child block IDs:`, childBlockIds);
            
            // 2. 为每个子级创建 Xiuyuan 卡片
            let successCount = 0;
            let failCount = 0;
            
            for (let i = 0; i < childBlockIds.length; i++) {
                const childBlockId = childBlockIds[i];
                console.log(`[SiYuanMemo] 📌 Creating card ${i + 1}/${childBlockIds.length} for child: ${childBlockId}`);
                
                const blockIds = [parentBlockId, childBlockId];
                const fieldMapping = {
                    question: parentBlockId,
                    answer: childBlockId
                };
                
                console.log(`[SiYuanMemo] Calling xiuyuanService.createFromBlocks with:`, {
                    blockIds,
                    templateId: 'builtin-list-item',
                    fieldMapping,
                    deckId: BUILTIN_DECK_ID
                });
                
                const result = await this.plugin.xiuyuanService.createFromBlocks(
                    blockIds,
                    'builtin-list-item',
                    fieldMapping,
                    BUILTIN_DECK_ID
                );
                
                if (result.ok) {
                    successCount++;
                    console.log(`[SiYuanMemo] ✅ Created list template card ${i + 1}/${childBlockIds.length}: ${result.value.xiuyuan.id} (child: ${childBlockId})`);
                    console.log(`[SiYuanMemo] Card details:`, result.value);
                } else {
                    failCount++;
                    console.error(`[SiYuanMemo] ❌ Failed to create list template card ${i + 1}/${childBlockIds.length} for child ${childBlockId}:`, result.error);
                }
            }
            
            console.log(`[SiYuanMemo] 🎉 List template cards creation complete: ${successCount} succeeded, ${failCount} failed`);
            
            if (successCount > 0) {
                console.log(`[SiYuanMemo] ✅ Successfully created ${successCount} list template cards`);
            }
        } catch (err) {
            console.error(`[SiYuanMemo] ❌ Failed to create list template cards:`, err);
        }
    }
}
