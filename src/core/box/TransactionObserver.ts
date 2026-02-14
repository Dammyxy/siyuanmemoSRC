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
        console.log('[SiyuanMemo] TransactionObserver initialized');
        this.plugin.eventBus.on('ws-main', this.handleTransaction);
    }

    public unload() {
        this.plugin.eventBus.off('ws-main', this.handleTransaction);
    }

    public setEnabled(enabled: boolean) {
        console.log('[SiyuanMemo] TransactionObserver enabled:', enabled);
        this.enabled = enabled;
    }

    private handleTransaction = (event: any) => {
        if (!this.enabled) return;

        const detail = event.detail as TransactionDetail;
        console.log('[SiyuanMemo] WS Event:', detail.cmd);

        if (detail.cmd !== 'transactions' || !detail.data) return;

        console.log('[SiyuanMemo] Transaction received:', detail.data.length);

        detail.data.forEach(data => {
            data.doOperations.forEach(op => {
                // We monitor insert and update actions
                if (op.action === 'insert' || op.action === 'update') {
                    console.log('[SiyuanMemo] Ops:', op.action, op.id);
                    this.queueBlockCheck(op.id);
                }
            });
        });
    }

    private queueBlockCheck(blockId: string) {
        // console.log('[SiyuanMemo] Queueing check for block:', blockId);
        this.pendingBlocks.add(blockId);
        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        // Debounce for 2 seconds to avoid processing receiving partial inputs
        this.debounceTimer = setTimeout(() => {
            this.processQueue();
        }, 2000);
    }

    private async processQueue() {
        const blocks = Array.from(this.pendingBlocks);
        console.log('[SiyuanMemo] Processing queue, blocks:', blocks.length);
        this.pendingBlocks.clear();

        for (const blockId of blocks) {
            try {
                await this.checkAndCreateCard(blockId);
            } catch (err) {
                console.error(`[SiyuanMemo] Auto-card failed for block ${blockId}:`, err);
            }
        }
        // Save storage once after batch
        this.plugin.storage.saveCards();
    }

    private async checkAndCreateCard(blockId: string) {
        if (this.processing.has(blockId)) return;
        this.processing.add(blockId);

        console.log(`[SiyuanMemo] checkAndCreateCard called for ${blockId}`);

        try {
            // 1. Get block markdown content
            const { kramdown } = await getBlockKramdown(blockId);
            console.log(`[SiyuanMemo] Check block ${blockId}, content: ${kramdown}`);
            if (!kramdown) return;

            // 2. Check if content matches any strategy (Excluding default)
            const strategy = this.builder.matchStrategy(blockId, kramdown, true);
            console.log(`[SiyuanMemo] Strategy match result for ${blockId}:`, strategy ? strategy.strategyName : 'None');
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

            console.log(`[SiyuanMemo] Card Status for ${blockId}: RiffDB=${isRiffInDb}, RiffAttr=${hasRiffAttr}, FSRSAttr=${isFsrsAttr}`);

            // 检查卡片类型是否已标记
            const attrs = await getBlockAttrs(blockId);
            const hasCardType = attrs && (attrs['custom-fsrs-card-type'] === 'topic' || attrs['custom-fsrs-card-type'] === 'item');

            if (isRiffInDb && hasRiffAttr && isFsrsAttr && hasCardType) {
                // Completely done and synced (including card type)
                console.log(`[SiyuanMemo] Card ${blockId} already fully synced with type: ${attrs['custom-fsrs-card-type']}`);
                return;
            }

            console.log(`[SiyuanMemo] Syncing card for block ${blockId}... (hasCardType: ${hasCardType})`);

            // 4. Build card object (generate metadata) - only if needed
            let card;
            if (!isRiffInDb || !hasRiffAttr || !isFsrsAttr) {
                card = await strategy.build(blockId, kramdown);
            }

            // 5. Add to Siyuan Riff Deck (Native) if not in DB OR missing attribute (repair UI)
            if (!isRiffInDb || !hasRiffAttr) {
                console.log(`[SiyuanMemo] Adding to Riff Deck: ${BUILTIN_DECK_ID}`);
                const res = await addRiffCards(BUILTIN_DECK_ID, [blockId]);
                console.log(`[SiyuanMemo] addRiffCards result:`, res);
                
                // 🆕 5.5. 检测是否为列表项模版卡
                const isListTemplate = await this.checkListTemplate(blockId);
                if (isListTemplate) {
                    console.log(`[SiyuanMemo] Detected list template card: ${blockId}`);
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
                    console.log(`[SiyuanMemo] Topic card detected: blockID=${blockId}, aFactor=${aFactor}`);
                } else {
                    console.log(`[SiyuanMemo] Item card detected: blockID=${blockId}`);
                }

                await setBlockAttrs(blockId, cardTypeAttrs);
            }

            // 7. Save to Plugin Storage (only if card was created)
            if (card) {
                this.plugin.storage.setCard(card);
            }

        } catch (err) {
            console.error(`[SiyuanMemo] Failed to auto-create card for ${blockId}:`, err);
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
            console.log(`[SiyuanMemo] 🔍 Checking if block ${blockId} is a list template...`);
            
            // 1. 检查块类型
            const typeResult = await sql(`
                SELECT type FROM blocks
                WHERE id = '${blockId}'
                LIMIT 1
            `);
            
            console.log(`[SiyuanMemo] Block type query result:`, typeResult);
            
            if (!typeResult || typeResult.length === 0) {
                console.log(`[SiyuanMemo] ❌ Block ${blockId} not found in database`);
                return false;
            }
            
            const blockType = typeResult[0].type;
            console.log(`[SiyuanMemo] Block ${blockId} type: ${blockType}`);
            
            if (blockType !== 'i') {
                console.log(`[SiyuanMemo] ❌ Block ${blockId} is not a list item (type='${blockType}'), skipping list template check`);
                return false;
            }
            
            // 2. 检查子级列表项数量
            const childrenResult = await sql(`
                SELECT id FROM blocks
                WHERE parent_id = '${blockId}'
                AND type = 'i'
                AND type != 'd'
            `);
            
            console.log(`[SiyuanMemo] Children query result:`, childrenResult);
            
            const childCount = childrenResult ? childrenResult.length : 0;
            console.log(`[SiyuanMemo] Block ${blockId} has ${childCount} list item children`);
            
            const hasMultipleChildren = childCount >= 2;
            
            if (hasMultipleChildren) {
                console.log(`[SiyuanMemo] ✅ Block ${blockId} is a list template with ${childCount} children`);
            } else {
                console.log(`[SiyuanMemo] ❌ Block ${blockId} has only ${childCount} children (need ≥2), not a list template`);
            }
            
            return hasMultipleChildren;
        } catch (err) {
            console.error(`[SiyuanMemo] ❌ Failed to check list template:`, err);
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
            console.log(`[SiyuanMemo] 🎯 Starting to create list template cards for parent: ${parentBlockId}`);
            
            // 1. 获取所有子级列表项
            const childrenResult = await sql(`
                SELECT id FROM blocks
                WHERE parent_id = '${parentBlockId}'
                AND type = 'i'
                AND type != 'd'
                ORDER BY id ASC
            `);
            
            console.log(`[SiyuanMemo] Query children result:`, childrenResult);
            
            if (!childrenResult || childrenResult.length < 2) {
                console.warn(`[SiyuanMemo] ⚠️ Not enough children for list template: ${parentBlockId} (found: ${childrenResult?.length || 0})`);
                return;
            }
            
            const childBlockIds = childrenResult.map((row: any) => row.id);
            console.log(`[SiyuanMemo] 📝 Creating ${childBlockIds.length} list template cards for parent: ${parentBlockId}`);
            console.log(`[SiyuanMemo] Child block IDs:`, childBlockIds);
            
            // 2. 为每个子级创建 Xiuyuan 卡片
            let successCount = 0;
            let failCount = 0;
            
            for (let i = 0; i < childBlockIds.length; i++) {
                const childBlockId = childBlockIds[i];
                console.log(`[SiyuanMemo] 📌 Creating card ${i + 1}/${childBlockIds.length} for child: ${childBlockId}`);
                
                const blockIds = [parentBlockId, childBlockId];
                const fieldMapping = {
                    question: parentBlockId,
                    answer: childBlockId
                };
                
                console.log(`[SiyuanMemo] Calling xiuyuanService.createFromBlocks with:`, {
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
                    console.log(`[SiyuanMemo] ✅ Created list template card ${i + 1}/${childBlockIds.length}: ${result.value.xiuyuan.id} (child: ${childBlockId})`);
                    console.log(`[SiyuanMemo] Card details:`, result.value);
                } else {
                    failCount++;
                    console.error(`[SiyuanMemo] ❌ Failed to create list template card ${i + 1}/${childBlockIds.length} for child ${childBlockId}:`, result.error);
                }
            }
            
            console.log(`[SiyuanMemo] 🎉 List template cards creation complete: ${successCount} succeeded, ${failCount} failed`);
            
            if (successCount > 0) {
                console.log(`[SiyuanMemo] ✅ Successfully created ${successCount} list template cards`);
            }
        } catch (err) {
            console.error(`[SiyuanMemo] ❌ Failed to create list template cards:`, err);
        }
    }
}
