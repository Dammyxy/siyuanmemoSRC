import type FSRSPlugin from '@/index';
import { CardBuilderContext, detectCardType, initializeAFactor } from '@/core/card-builder';
import { getBlockKramdown, getBlockAttrs, setBlockAttrs } from '@/core/siyuan/api';
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
        console.log('[FSRS] TransactionObserver initialized');
        this.plugin.eventBus.on('ws-main', this.handleTransaction);
    }

    public unload() {
        this.plugin.eventBus.off('ws-main', this.handleTransaction);
    }

    public setEnabled(enabled: boolean) {
        console.log('[FSRS] TransactionObserver enabled:', enabled);
        this.enabled = enabled;
    }

    private handleTransaction = (event: any) => {
        if (!this.enabled) return;

        const detail = event.detail as TransactionDetail;
        console.log('[FSRS] WS Event:', detail.cmd);

        if (detail.cmd !== 'transactions' || !detail.data) return;

        console.log('[FSRS] Transaction received:', detail.data.length);

        detail.data.forEach(data => {
            data.doOperations.forEach(op => {
                // We monitor insert and update actions
                if (op.action === 'insert' || op.action === 'update') {
                    console.log('[FSRS] Ops:', op.action, op.id);
                    this.queueBlockCheck(op.id);
                }
            });
        });
    }

    private queueBlockCheck(blockId: string) {
        // console.log('[FSRS] Queueing check for block:', blockId);
        this.pendingBlocks.add(blockId);
        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        // Debounce for 2 seconds to avoid processing receiving partial inputs
        this.debounceTimer = setTimeout(() => {
            this.processQueue();
        }, 2000);
    }

    private async processQueue() {
        const blocks = Array.from(this.pendingBlocks);
        console.log('[FSRS] Processing queue, blocks:', blocks.length);
        this.pendingBlocks.clear();

        for (const blockId of blocks) {
            try {
                await this.checkAndCreateCard(blockId);
            } catch (err) {
                console.error(`[FSRS] Auto-card failed for block ${blockId}:`, err);
            }
        }
        // Save storage once after batch
        this.plugin.storage.saveCards();
    }

    private async checkAndCreateCard(blockId: string) {
        if (this.processing.has(blockId)) return;
        this.processing.add(blockId);

        console.log(`[FSRS] checkAndCreateCard called for ${blockId}`);

        try {
            // 1. Get block markdown content
            const { kramdown } = await getBlockKramdown(blockId);
            console.log(`[FSRS] Check block ${blockId}, content: ${kramdown}`);
            if (!kramdown) return;

            // 2. Check if content matches any strategy (Excluding default)
            const strategy = this.builder.matchStrategy(blockId, kramdown, true);
            console.log(`[FSRS] Strategy match result for ${blockId}:`, strategy ? strategy.strategyName : 'None');
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

            console.log(`[FSRS] Card Status for ${blockId}: RiffDB=${isRiffInDb}, RiffAttr=${hasRiffAttr}, FSRSAttr=${isFsrsAttr}`);

            // 检查卡片类型是否已标记
            const attrs = await getBlockAttrs(blockId);
            const hasCardType = attrs && (attrs['custom-fsrs-card-type'] === 'topic' || attrs['custom-fsrs-card-type'] === 'item');

            if (isRiffInDb && hasRiffAttr && isFsrsAttr && hasCardType) {
                // Completely done and synced (including card type)
                console.log(`[FSRS] Card ${blockId} already fully synced with type: ${attrs['custom-fsrs-card-type']}`);
                return;
            }

            console.log(`[FSRS] Syncing card for block ${blockId}... (hasCardType: ${hasCardType})`);

            // 4. Build card object (generate metadata) - only if needed
            let card;
            if (!isRiffInDb || !hasRiffAttr || !isFsrsAttr) {
                card = await strategy.build(blockId, kramdown);
            }

            // 5. Add to Siyuan Riff Deck (Native) if not in DB OR missing attribute (repair UI)
            if (!isRiffInDb || !hasRiffAttr) {
                console.log(`[FSRS] Adding to Riff Deck: ${BUILTIN_DECK_ID}`);
                const res = await addRiffCards(BUILTIN_DECK_ID, [blockId]);
                console.log(`[FSRS] addRiffCards result:`, res);
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
                    console.log(`[FSRS] Topic card detected: blockID=${blockId}, aFactor=${aFactor}`);
                } else {
                    console.log(`[FSRS] Item card detected: blockID=${blockId}`);
                }

                await setBlockAttrs(blockId, cardTypeAttrs);
            }

            // 7. Save to Plugin Storage (only if card was created)
            if (card) {
                this.plugin.storage.setCard(card);
            }

        } catch (err) {
            console.error(`[FSRS] Failed to auto-create card for ${blockId}:`, err);
        } finally {
            this.processing.delete(blockId);
        }
    }
}
