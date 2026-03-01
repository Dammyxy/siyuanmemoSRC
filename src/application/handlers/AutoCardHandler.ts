import type { ITransactionHandler, Transaction } from '../../core/infrastructure/websocket/TransactionWebSocketService';
import type FSRSPlugin from '@/index';
import { CardCreationHelper } from '../helpers/CardCreationHelper';
import type { AutoCardSiyuanPort } from '../ports/AutoCardSiyuanPort';
import type { AutoCardRiffPort } from '../ports/AutoCardRiffPort';
import { AutoCardSiyuanAdapter } from '@/infrastructure/siyuan/AutoCardSiyuanAdapter';
import { AutoCardRiffAdapter } from '@/infrastructure/siyuan/AutoCardRiffAdapter';
import { createLogger } from '@/utils/logger';
import { ClozeDetector } from '@/utils/cloze-detector';
import type { Result } from '@/types/result';
import { QuickCardPostCreationPlanner } from '@/core/card/post-creation/QuickCardPostCreationPlanner';

const logger = createLogger('AutoCardHandler');

type QuickCardSettings = {
    enabled?: boolean;
    enabledSymbols?: {
        basic?: boolean;
        concept?: boolean;
        descriptor?: boolean;
        cloze?: boolean;
        multiLine?: boolean;
    };
    debounceDelay?: {
        quick?: number;
        list?: number;
    };
    enableDebounce?: boolean;
};

export interface AutoCardDocumentScanResult {
    rootId: string;
    scanned: number;
    created: number;
    skipped: number;
    failed: number;
}

type SettingsServiceLike = {
    getSettings: () => {
        quickCard?: QuickCardSettings;
    };
};

type CardCreationResult = Result<{
    id: string;
    priority: number;
}>;

type CardServiceLike = {
    createCard: (command: {
        blockId: string;
        cardType?: string;
        deckId?: string;
        priority?: 'normal' | 'high' | number;
        meta?: Record<string, unknown>;
    }) => Promise<CardCreationResult>;
    getCardByBlockId: (blockId: string) => unknown;
    saveCards: () => Promise<void>;
};

type XiuyuanCreateResult = Result<{
    xiuyuan: {
        id: string;
    };
    cards: Array<{
        id: string;
    }>;
}>;

type XiuyuanApplicationServiceLike = {
    createFromBlocks: (command: Record<string, unknown>) => Promise<XiuyuanCreateResult>;
    createTemplate: (template: Record<string, unknown>) => Promise<Result<void>>;
};

type AutoCardContextLike = {
    getSettingsService?: () => SettingsServiceLike;
    getCardService?: () => CardServiceLike;
    getXiuyuanApplicationService?: () => Promise<XiuyuanApplicationServiceLike>;
};

type ListChildBlock = {
    id: string;
};

/**
 * Auto card handler for quick symbol based card creation.
 *
 * Responsibilities:
 * - Listen to block edit transactions.
 * - Batch process quick symbol detection.
 * - Create cards through application services.
 */
export class AutoCardHandler implements ITransactionHandler {
    private plugin: FSRSPlugin;
    private readonly siyuanApi: AutoCardSiyuanPort;
    private readonly riffApi: AutoCardRiffPort;
    private readonly postCreationPlanner = new QuickCardPostCreationPlanner();
    

    private cardHelper: CardCreationHelper | null = null;
    

    private quickQueue: Set<string> = new Set();
    private listQueue: Set<string> = new Set();
    private processing: Set<string> = new Set();
    private readonly conceptCardEnsureInFlight = new Set<string>();
    
    private quickTimer: NodeJS.Timeout | null = null;
    private listTimer: NodeJS.Timeout | null = null;
    

    private lastEditTime: Map<string, number> = new Map();
    

    private currentEditingBlock: string | null = null;
    
    private readonly QUICK_DEBOUNCE = 1000;
    private readonly LIST_DEBOUNCE = 2000;
    

    // Supported quick-card symbol patterns (half-width and full-width variants).
    private patterns = {
        concept: /^(.+?)\s*(::|：：)\s*(.+)$/,
        conceptForward: /^(.+?)\s*(:>|：》)\s*(.+)$/,
        conceptReverse: /^(.+?)\s*(:<|：《)\s*(.+)$/,
        descriptor: /^(.+?)\s*(;;|；；)\s*(.+)$/,
        descriptorReverse: /^(.+?)\s*(;<|；<|；《)\s*(.+)$/,
        descriptorBoth: /^(.+?)\s*(;<>|；<>|；《》)\s*(.+)$/,
        basicBoth: /^(.+?)\s*(<>|《》)\s*(.+)$/,
        basicForward: /^(.+?)\s*(>>|》》)\s*(.+)$/,
        basicBackward: /^(.+?)\s*(<<|《《)\s*(.+)$/,
        cloze: /\{\{(.+?)\}\}/g,
        clozeEqual: /==(.+?)==/g,
        clozeMark: /<span data-type="mark">(.+?)<\/span>/g,
        multiLine: /(.+?)\s*(>>>|》》》)\s*$/,
        listCue: /^(.+?)\s*(->|→)\s*(.+)$/,
    };
    
    constructor(
        plugin: FSRSPlugin,
        ports?: {
            siyuanApi?: AutoCardSiyuanPort;
            riffApi?: AutoCardRiffPort;
        }
    ) {
        this.plugin = plugin;
        this.siyuanApi = ports?.siyuanApi ?? new AutoCardSiyuanAdapter();
        this.riffApi = ports?.riffApi ?? new AutoCardRiffAdapter();
        logger.debug('[SiYuanMemo][AutoCard] Handler initialized');
    }

    private getContext(): AutoCardContextLike | null {
        try {
            return (this.plugin?.getContext?.() as AutoCardContextLike | null) ?? null;
        } catch (error) {
            logger.warn('[AutoCard] Failed to get ApplicationContext:', error);
            return null;
        }
    }

    private requireContext(): AutoCardContextLike {
        const context = this.getContext();
        if (!context) {
            throw new Error('[AutoCard] ApplicationContext is unavailable');
        }
        return context;
    }

    private get settingsService(): SettingsServiceLike {
        try {
            const context = this.requireContext();
            if (context.getSettingsService) {
                return context.getSettingsService();
            }
        } catch (error) {
            logger.warn('[AutoCard] Failed to get SettingsService from context:', error);
        }
        throw new Error('[AutoCard] SettingsService is unavailable');
    }
    
    private getCardService(): CardServiceLike {
        const context = this.requireContext();
        if (context.getCardService) {
            return context.getCardService();
        }
        throw new Error('[AutoCard] CardApplicationService is unavailable');
    }
    
    private async requireXiuyuanApplicationService(
        unavailableUserMessage = '修缘服务不可用'
    ): Promise<XiuyuanApplicationServiceLike> {
        const context = this.requireContext();
        if (context.getXiuyuanApplicationService) {
            return await context.getXiuyuanApplicationService();
        }

        logger.error('[SiYuanMemo][AutoCard] XiuyuanApplicationService not available');
        await this.siyuanApi.pushErrMsg(unavailableUserMessage);
        throw new Error('[AutoCard] XiuyuanApplicationService is unavailable');
    }
    
    private getCardHelper(): CardCreationHelper {

        if (!this.cardHelper) {
            const cardService = this.getCardService();
            this.cardHelper = new CardCreationHelper(cardService);
        }
        return this.cardHelper;
    }

    private hasXiuyuanBinding(attrs: Record<string, string> | null | undefined): boolean {
        if (!attrs) {
            return false;
        }
        const xiuyuanId = attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'];
        return typeof xiuyuanId === 'string' && xiuyuanId.trim().length > 0;
    }
    
    private async createConceptCardViaDDD(
        blockId: string,
        options: {
            priority?: 'normal' | 'high';
            metadata?: Record<string, unknown>;
        } = {}
    ): Promise<boolean> {
        try {
            const cardService = this.getCardService();

                        const result = await cardService.createCard({
                blockId: blockId,
                cardType: 'concept',
                deckId: this.riffApi.BUILTIN_DECK_ID,
                priority: options.priority || 'normal',
                meta: {
                    autoCreated: true,
                    source: 'auto',
                    ...options.metadata,
                },
            });

            if (result.ok) {
                logger.debug(`[AutoCard] Concept card created via DDD: ${blockId}`);
                return true;
            } else {
                logger.error(`[AutoCard] Failed to create concept card: ${result.error.message}`);
                return false;
            }
        } catch (error) {
            logger.error('[AutoCard] Error creating concept card via DDD:', error);
            return false;
        }
    }
    
    handle(transactions: Transaction[]): void {

        const quickCardSettings = this.settingsService.getSettings().quickCard;
        logger.debug('[SiYuanMemo][AutoCard] Quick card settings:', quickCardSettings);
        if (!quickCardSettings?.enabled) {
            logger.debug('[SiYuanMemo][AutoCard] Quick card is disabled, skipping');
            return;
        }
        
        logger.debug('[SiYuanMemo][AutoCard] Quick card is enabled, processing transactions');
        
        for (const tx of transactions) {
            if (!tx.doOperations) continue;
            
            for (const op of tx.doOperations) {
                const blockId = op.id;
                

                if (op.action === 'update' || op.action === 'insert') {

                    if (this.currentEditingBlock && this.currentEditingBlock !== blockId) {
                        logger.debug('[SiYuanMemo][AutoCard] Block unfocused:', this.currentEditingBlock);

                        this.processBlockImmediately(this.currentEditingBlock);
                    }
                    

                    this.currentEditingBlock = blockId;
                    
                    logger.debug('[SiYuanMemo][AutoCard] Current editing block:', blockId);
                }
            }
        }
    }

    public async scanDocumentByRootId(rootId: string): Promise<AutoCardDocumentScanResult> {
        const requestedRootId = rootId.trim();
        const resolvedRootId = await this.resolveDocumentRootId(requestedRootId);
        const normalizedRootId = resolvedRootId || requestedRootId;
        const result: AutoCardDocumentScanResult = {
            rootId: normalizedRootId,
            scanned: 0,
            created: 0,
            skipped: 0,
            failed: 0,
        };

        if (!normalizedRootId) {
            return result;
        }

        const stmt = `
            SELECT id
            FROM blocks
            WHERE root_id = '${this.escapeSql(normalizedRootId)}'
              AND type = 'p'
            ORDER BY id ASC
        `;

        const rows = await this.siyuanApi.sql(stmt) as Array<{ id?: string }>;
        const blockIds = rows
            .map((row) => (typeof row.id === 'string' ? row.id : ''))
            .filter((id): id is string => id.length > 0);

        if (blockIds.length === 0) {
            return result;
        }

        const cardService = this.getCardService();
        for (const blockId of blockIds) {
            result.scanned += 1;

            if (this.processing.has(blockId)) {
                result.skipped += 1;
                continue;
            }

            const existedBefore = Boolean(cardService.getCardByBlockId(blockId));
            this.processing.add(blockId);

            try {
                await this.checkQuickSymbols(blockId, { force: true });
                await this.checkListTemplate(blockId, { force: true });

                const existedAfter = Boolean(cardService.getCardByBlockId(blockId));
                if (!existedBefore && existedAfter) {
                    result.created += 1;
                } else {
                    result.skipped += 1;
                }
            } catch (error) {
                result.failed += 1;
                logger.error('[SiYuanMemo][AutoCard] Failed to scan block during document scan:', blockId, error);
            } finally {
                this.processing.delete(blockId);
                this.lastEditTime.delete(blockId);
            }
        }

        return result;
    }
    
    private queueQuickCheck(blockId: string): void {
        this.quickQueue.add(blockId);
        

        this.lastEditTime.set(blockId, Date.now());
        
        if (this.quickTimer) {
            clearTimeout(this.quickTimer);
        }
        

        const quickCardSettings = this.settingsService.getSettings().quickCard;
        const debounceDelay = quickCardSettings?.debounceDelay?.quick || this.QUICK_DEBOUNCE;
        

        if (debounceDelay === 0) {
            logger.debug('[SiYuanMemo][AutoCard] Debounce disabled, only blur detection will trigger');
            return;
        }
        
        this.quickTimer = setTimeout(() => {
            this.processQuickQueue();
        }, debounceDelay);
    }
    
    private queueListCheck(blockId: string): void {



        return;
        
    }
    
    // Process all pending quick-symbol blocks in one batch window.
    private async processQuickQueue(): Promise<void> {
        const blocks = Array.from(this.quickQueue);
        this.quickQueue.clear();
        
        logger.debug('[SiYuanMemo][AutoCard] Processing quick queue, count:', blocks.length);
        
        for (const blockId of blocks) {

            if (this.processing.has(blockId)) {
                logger.debug('[SiYuanMemo][AutoCard] Block already processing:', blockId);
                continue;
            }
            
            this.processing.add(blockId);
            
            try {
                await this.checkQuickSymbols(blockId);
            } catch (error) {
                logger.error('[SiYuanMemo][AutoCard] Failed to check quick symbols:', blockId, error);
            } finally {
                this.processing.delete(blockId);
            }
        }
    }
    
    // Process all pending list-template blocks in one batch window.
    private async processListQueue(): Promise<void> {
        const blocks = Array.from(this.listQueue);
        this.listQueue.clear();
        
        logger.debug('[SiYuanMemo][AutoCard] Processing list queue, count:', blocks.length);
        
        for (const blockId of blocks) {

            if (this.processing.has(blockId)) {
                logger.debug('[SiYuanMemo][AutoCard] Block already processing:', blockId);
                continue;
            }
            
            this.processing.add(blockId);
            
            try {
                await this.checkListTemplate(blockId);
            } catch (error) {
                logger.error('[SiYuanMemo][AutoCard] Failed to check list template:', blockId, error);
            } finally {
                this.processing.delete(blockId);
            }
        }
        

        const cardService = this.getCardService();
        await cardService.saveCards();
    }
    
    // Check a block for quick symbols and create all matched cards in one pass.
    private async checkQuickSymbols(blockId: string, options?: { force?: boolean }): Promise<void> {
        try {

            const quickCardSettings = this.settingsService.getSettings().quickCard;
            if (!quickCardSettings) {
                return;
            }

            if (!quickCardSettings.enabled && !options?.force) {
                return;
            }
            

            const { kramdown } = await this.siyuanApi.getBlockKramdown(blockId);
            if (!kramdown) {
                logger.debug('[SiYuanMemo][AutoCard] Block has no content:', blockId);
                return;
            }
            
            logger.debug('[SiYuanMemo][AutoCard] Checking quick symbols:', blockId, 'content:', kramdown);
            

                        const typeResult = await this.siyuanApi.sql(`SELECT type FROM blocks WHERE id = '${blockId}' LIMIT 1`);
            
            if (!typeResult || typeResult.length === 0) {
                logger.debug('[SiYuanMemo][AutoCard] Block not found:', blockId);
                return;
            }
            
            const blockType = typeResult[0].type;
            if (!this.isQuickSymbolSupportedBlockType(blockType)) {
                logger.debug(
                    '[SiYuanMemo][AutoCard] Block type not supported for symbol detection (type:',
                    blockType,
                    '), skipping'
                );
                return;
            }
            

                        const attrs = await this.siyuanApi.getBlockAttrs(blockId);
            
            if (this.hasXiuyuanBinding(attrs)) {
                logger.debug('[SiYuanMemo][AutoCard] Block is already part of a Xiuyuan card, skipping:', blockId);
                return;
            }
            

            const cardService = this.getCardService();
            const existingCard = cardService.getCardByBlockId(blockId);

            if (existingCard) {
                logger.debug('[SiYuanMemo][AutoCard] Block already has card:', blockId);
                return;
            }
            

            const normalizedSettings: QuickCardSettings = {
                ...quickCardSettings,
                enabledSymbols: {
                    basic: quickCardSettings.enabledSymbols?.basic ?? true,
                    concept: quickCardSettings.enabledSymbols?.concept ?? true,
                    descriptor: quickCardSettings.enabledSymbols?.descriptor ?? true,
                    cloze: quickCardSettings.enabledSymbols?.cloze ?? true,
                    multiLine: quickCardSettings.enabledSymbols?.multiLine ?? true,
                },
            };

            logger.debug('[SiYuanMemo][AutoCard] Enabled symbols:', JSON.stringify(normalizedSettings.enabledSymbols));
            const detectedSymbols = this.detectAllSymbols(kramdown, normalizedSettings);
            
            if (detectedSymbols.length === 0) {
                logger.debug('[SiYuanMemo][AutoCard] No quick symbol detected:', blockId);
                return;
            }
            
            logger.debug('[SiYuanMemo][AutoCard] Detected symbols:', detectedSymbols);
            

            const cleanContent = kramdown.replace(/\{:[^}]*\}/g, '').trim();
            

            for (const symbol of detectedSymbols) {
                try {
                    await this.createCardBySymbol(blockId, symbol, cleanContent);
                } catch (error) {
                    logger.error('[SiYuanMemo][AutoCard] Failed to create card for symbol:', symbol.type, error);
                }
            }
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Error checking quick symbols:', blockId, error);
        }
    }
    
    // Detect all supported symbols with deterministic priority.
    private detectAllSymbols(content: string, settings: QuickCardSettings): Array<{
        type: 'basic-both' | 'basic-forward' | 'basic-backward' | 'concept' | 'concept-forward' | 'concept-reverse' | 'descriptor' | 'descriptor-reverse' | 'descriptor-both' | 'cloze';
        match: RegExpMatchArray;
    }> {
        const enabledSymbols = settings.enabledSymbols ?? {};
        const symbols: Array<{
            type: 'basic-both' | 'basic-forward' | 'basic-backward' | 'concept' | 'concept-forward' | 'concept-reverse' | 'descriptor' | 'descriptor-reverse' | 'descriptor-both' | 'cloze';
            match: RegExpMatchArray;
        }> = [];
        

        let cleanContent = content.replace(/\{:[^}]*\}/g, '').trim();
        
        logger.debug('[SiYuanMemo][AutoCard] detectAllSymbols - original:', content.substring(0, 100));
        logger.debug('[SiYuanMemo][AutoCard] detectAllSymbols - cleaned:', cleanContent.substring(0, 100));
        logger.debug('[SiYuanMemo][AutoCard] detectAllSymbols - descriptor enabled:', enabledSymbols.descriptor);
        



        cleanContent = cleanContent.replace(/`[^`]*`/g, '');
        cleanContent = cleanContent.replace(/```[\s\S]*?```/g, '');
        
        const hasConceptTripleMarker = /:::|：：：/.test(cleanContent);
        const hasDescriptorTripleMarker = /;;;|；；；/.test(cleanContent);

        if (hasConceptTripleMarker) {
            logger.debug('[SiYuanMemo][AutoCard] Detected ::: marker, skip :: concept detection');
        }
        if (hasDescriptorTripleMarker) {
            logger.debug('[SiYuanMemo][AutoCard] Detected ;;; marker, skip ;; descriptor detection');
        }



        
        logger.debug('[SiYuanMemo][AutoCard] Starting symbol detection...');
        
        let matched = false;
        

        if (!matched && enabledSymbols.descriptor && this.patterns.descriptorBoth.test(cleanContent)) {
            logger.debug('[SiYuanMemo][AutoCard] Matched: descriptorBoth');
            const match = cleanContent.match(this.patterns.descriptorBoth);
            if (match) {
                symbols.push({ type: 'descriptor-both', match });
                matched = true;
            }
        }
        

        if (!matched && enabledSymbols.basic && this.patterns.basicBoth.test(cleanContent)) {
            logger.debug('[SiYuanMemo][AutoCard] Matched: basicBoth');
            const match = cleanContent.match(this.patterns.basicBoth);
            if (match) {
                symbols.push({ type: 'basic-both', match });
                matched = true;
            }
        }
        

        if (!matched && enabledSymbols.basic && this.patterns.basicForward.test(cleanContent) && !this.patterns.multiLine.test(cleanContent)) {
            logger.debug('[SiYuanMemo][AutoCard] Matched: basicForward');
            const match = cleanContent.match(this.patterns.basicForward);
            if (match) {
                symbols.push({ type: 'basic-forward', match });
                matched = true;
            }
        }
        

        if (!matched && enabledSymbols.basic && this.patterns.basicBackward.test(cleanContent)) {
            logger.debug('[SiYuanMemo][AutoCard] Matched: basicBackward');
            const match = cleanContent.match(this.patterns.basicBackward);
            if (match) {
                symbols.push({ type: 'basic-backward', match });
                matched = true;
            }
        }
        

        if (!matched && enabledSymbols.concept && !hasConceptTripleMarker) {
            logger.debug('[SiYuanMemo][AutoCard] Checking concept patterns...');

            if (this.patterns.conceptForward.test(cleanContent)) {
                logger.debug('[SiYuanMemo][AutoCard] Matched: conceptForward');
                const match = cleanContent.match(this.patterns.conceptForward);
                if (match) {
                    symbols.push({ type: 'concept-forward', match });
                    matched = true;
                }
            }

            else if (this.patterns.conceptReverse.test(cleanContent)) {
                logger.debug('[SiYuanMemo][AutoCard] Matched: conceptReverse');
                const match = cleanContent.match(this.patterns.conceptReverse);
                if (match) {
                    symbols.push({ type: 'concept-reverse', match });
                    matched = true;
                }
            }

            else if (this.patterns.concept.test(cleanContent)) {
                logger.debug('[SiYuanMemo][AutoCard] Matched: concept');
                const match = cleanContent.match(this.patterns.concept);
                if (match) {
                    symbols.push({ type: 'concept', match });
                    matched = true;
                }
            } else {
                logger.debug('[SiYuanMemo][AutoCard] No concept pattern matched');
            }
        }
        

        if (!matched && enabledSymbols.descriptor && !hasDescriptorTripleMarker) {
            logger.debug('[SiYuanMemo][AutoCard] Checking descriptor patterns...');

            if (this.patterns.descriptorReverse.test(cleanContent)) {
                const match = cleanContent.match(this.patterns.descriptorReverse);
                logger.debug('[SiYuanMemo][AutoCard] Matched descriptorReverse:', match);
                if (match) {
                    symbols.push({ type: 'descriptor-reverse', match });
                    matched = true;
                }
            }

            else if (this.patterns.descriptor.test(cleanContent)) {
                const match = cleanContent.match(this.patterns.descriptor);
                logger.debug('[SiYuanMemo][AutoCard] Matched descriptor:', match);
                if (match) {
                    symbols.push({ type: 'descriptor', match });
                    matched = true;
                }
            } else {
                logger.debug('[SiYuanMemo][AutoCard] No descriptor pattern matched');
                logger.debug('[SiYuanMemo][AutoCard] descriptorReverse test:', this.patterns.descriptorReverse.test(cleanContent));
                logger.debug('[SiYuanMemo][AutoCard] descriptor test:', this.patterns.descriptor.test(cleanContent));
            }
        }
        

        if (!matched && enabledSymbols.cloze && ClozeDetector.hasClozes(cleanContent)) {
            logger.debug('[SiYuanMemo][AutoCard] Matched: cloze');
            symbols.push({ type: 'cloze', match: [cleanContent] as unknown as RegExpMatchArray });
            matched = true;
        }
        
        logger.debug('[SiYuanMemo][AutoCard] Symbol detection complete, matched:', matched, 'symbols:', symbols.length);
        
        return symbols;
    }

    private isQuickSymbolSupportedBlockType(blockType: string): boolean {
        // `p`: paragraph, `m`: formula block.
        return blockType === 'p' || blockType === 'm';
    }
    
    // Route one detected symbol to its concrete card creation flow.
    private async createCardBySymbol(
        blockId: string,
        symbol: { type: string; match: RegExpMatchArray },
        content: string
    ): Promise<void> {

        const actualSymbol = symbol.match[2] || '';
        
        switch (symbol.type) {
            case 'basic-both':
                await this.createBasicCard(blockId, 'both', content, actualSymbol);
                break;
            case 'basic-forward':
                await this.createBasicCard(blockId, 'forward', content, actualSymbol);
                break;
            case 'basic-backward':
                await this.createBasicCard(blockId, 'backward', content, actualSymbol);
                break;
            case 'concept':
                await this.createConceptCard(blockId, content, actualSymbol, 'both');
                break;
            case 'concept-forward':
                await this.createConceptCard(blockId, content, actualSymbol, 'forward');
                break;
            case 'concept-reverse':
                await this.createConceptCard(blockId, content, actualSymbol, 'reverse');
                break;
            case 'descriptor':
                await this.createDescriptorCard(blockId, content, actualSymbol, 'forward');
                break;
            case 'descriptor-reverse':
                await this.createDescriptorCard(blockId, content, actualSymbol, 'reverse');
                break;
            case 'descriptor-both':
                await this.createDescriptorCard(blockId, content, actualSymbol, 'both');
                break;
            case 'cloze':
                await this.createClozeCard(blockId, content);
                break;
            default:
                logger.warn('[SiYuanMemo][AutoCard] Unknown symbol type:', symbol.type);
        }
    }
    
    // Trigger immediate processing when focus moves away from the previous block.
    private async processBlockImmediately(blockId: string): Promise<void> {
        logger.debug('[SiYuanMemo][AutoCard] Processing block immediately:', blockId);
        

        this.quickQueue.delete(blockId);
        this.listQueue.delete(blockId);
        

        if (this.processing.has(blockId)) {
            logger.debug('[SiYuanMemo][AutoCard] Block already processing:', blockId);
            return;
        }
        
        this.processing.add(blockId);
        
        try {

            await this.checkQuickSymbols(blockId);
            

            await this.checkListTemplate(blockId);
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Failed to process block immediately:', blockId, error);
        } finally {
            this.processing.delete(blockId);
            this.lastEditTime.delete(blockId);
        }
    }
    
    // Handle list template marker (>>> + child list items).
    private async checkListTemplate(blockId: string, options?: { force?: boolean }): Promise<void> {
        try {

            const quickCardSettings = this.settingsService.getSettings().quickCard;
            if (!quickCardSettings) {
                return;
            }

            if (!quickCardSettings.enabled && !options?.force) {
                return;
            }

            if (!(quickCardSettings.enabledSymbols?.multiLine ?? true)) {
                return;
            }
            

            const { kramdown } = await this.siyuanApi.getBlockKramdown(blockId);
            if (!kramdown) {
                logger.debug('[SiYuanMemo][AutoCard] Block has no content:', blockId);
                return;
            }
            
            logger.debug('[SiYuanMemo][AutoCard] Checking list template:', blockId, 'content:', kramdown);
            

            if (!this.patterns.multiLine.test(kramdown)) {
                logger.debug('[SiYuanMemo][AutoCard] No list template symbol detected:', blockId);
                return;
            }
            

            const typeResult = await this.siyuanApi.sql(`
                SELECT type FROM blocks WHERE id = '${blockId}' LIMIT 1
            `);
            
            if (!typeResult || typeResult.length === 0 || typeResult[0]?.type !== 'i') {
                logger.debug('[SiYuanMemo][AutoCard] Block is not a list item:', blockId);
                return;
            }
            

            const childrenResult = await this.siyuanApi.sql(`
                SELECT id FROM blocks
                WHERE parent_id = '${blockId}' AND type = 'i'
            `);
            
            if (!childrenResult || childrenResult.length < 2) {
                logger.debug('[SiYuanMemo][AutoCard] Not enough child list items:', blockId, 'count:', childrenResult?.length || 0);
                return;
            }
            
            logger.debug('[SiYuanMemo][AutoCard] List template detected:', blockId, 'children:', childrenResult.length);
            

            await this.createListTemplateCards(blockId, childrenResult);
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Error checking list template:', blockId, error);
        }
    }
    

    
    // Create one-way basic card or symbol card.
    private async createBasicCard(blockId: string, direction: string, content: string, actualSymbol?: string): Promise<void> {
        try {
            logger.debug('[SiYuanMemo][AutoCard] Creating basic card:', blockId, direction, 'symbol:', actualSymbol);
            

            let question = '';
            let answer = '';
            
            if (direction === 'forward') {
                const match = content.match(this.patterns.basicForward);
                if (match) {
                    question = match[1].trim();
                    answer = match[3].trim();
                }
            } else if (direction === 'backward') {
                const match = content.match(this.patterns.basicBackward);
                if (match) {
                    answer = match[1].trim();
                    question = match[3].trim();
                }
            } else if (direction === 'both') {

                const match = content.match(this.patterns.basicBoth);
                if (match) {
                    const term = match[1].trim();
                    const definition = match[3].trim();
                    await this.createBidirectionalCard(blockId, term, definition);
                    return;
                }
            }
            
            if (!question || !answer) {
                logger.error('[SiYuanMemo][AutoCard] Failed to parse basic card content:', content);
                return;
            }
            

            const { ClozeDetector } = await import('@/utils/cloze-detector');
            const backClozes = ClozeDetector.extractClozes(answer);
            

            if (backClozes.length > 0) {
                logger.debug('[SiYuanMemo][AutoCard] Detected back clozes:', backClozes.length);
                
                const xiuyuanAppService = await this.requireXiuyuanApplicationService('修缘服务不可用');
                
                                
                const result = await xiuyuanAppService.createFromBlocks({
                    blockIds: [blockId],
                    templateId: 'builtin-quick-card',
                    fieldMapping: { content: blockId },
                    deckId: this.riffApi.BUILTIN_DECK_ID,
                    backClozeInfo: {
                        originalContent: content,
                        front: question,
                        back: answer,
                        clozes: backClozes,
                        direction: 'forward',
                        symbol: actualSymbol
                    }
                });
                
                if (!result.ok) {
                    throw new Error(`Failed to create cards with back cloze: ${result.error?.message}`);
                }
                
                                await this.siyuanApi.pushMsg(`已创建 ${backClozes.length} 张卡片（背面挖空）`);
                return;
            }
            

            const helper = this.getCardHelper();
            
            const result = await helper.createSymbolCard(blockId, {
                metadata: {
                    direction,
                    question,
                    answer,
                    cardSource: 'quick-symbol',
                    symbolType: actualSymbol || (direction === 'forward' ? '>>' : '<<')
                }
            });
            
            if (!result.ok) {
                throw new Error(`Failed to create symbol card: ${result.error}`);
            }
            

                        await this.riffApi.addRiffCards(this.riffApi.BUILTIN_DECK_ID, [blockId]);
            logger.debug('[SiYuanMemo][AutoCard] Added to Riff deck:', blockId);
            

                        const card = result.value;
            await this.siyuanApi.markBlockAsCard(blockId, card.getId().getValue(), 50, 'item');
            logger.debug('[SiYuanMemo][AutoCard] Marked block as card:', blockId);
            
            logger.debug('[SiYuanMemo][AutoCard] Basic card created successfully:', blockId, direction);
            

                        const symbolText = direction === 'forward' ? '>>' : '<<';
            await this.siyuanApi.pushMsg(`已创建${direction === 'forward' ? '正向' : '反向'}卡片 (${symbolText})`);
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Failed to create basic card:', blockId, error);
                        await this.siyuanApi.pushErrMsg(`创建基础卡片失败：${this.getErrorMessage(error)}`);
        }
    }
    
    // Create bidirectional concept card with term/definition.
    private async createBidirectionalCard(blockId: string, term: string, definition: string): Promise<void> {
        try {
            logger.debug('[SiYuanMemo][AutoCard] Creating bidirectional card using Xiuyuan:', blockId);
            

            const xiuyuanAppService = await this.requireXiuyuanApplicationService();
            

            const { ClozeDetector } = await import('@/utils/cloze-detector');
            const backClozes = ClozeDetector.extractClozes(definition);
            
                        

            if (backClozes.length > 0) {
                logger.debug('[SiYuanMemo][AutoCard] Detected back clozes in bidirectional card:', backClozes.length);
                
                const result = await xiuyuanAppService.createFromBlocks({
                    blockIds: [blockId],
                    templateId: 'builtin-quick-card',
                    fieldMapping: { content: blockId },
                    deckId: this.riffApi.BUILTIN_DECK_ID,
                    backClozeInfo: {
                        originalContent: `${term} <> ${definition}`,
                        front: term,
                        back: definition,
                        clozes: backClozes,
                        direction: 'both',
                        symbol: '<>'
                    }
                });
                
                if (!result.ok) {
                    throw new Error(`Failed to create bidirectional card with back cloze: ${result.error?.message}`);
                }
                
                const totalCards = backClozes.length + 1;
                                await this.siyuanApi.pushMsg(`已创建双向卡片 (<>)，共 ${totalCards} 张（背面挖空）`);
                return;
            }
            

            const result = await xiuyuanAppService.createFromBlocks({
                blockIds: [blockId],
                templateId: 'builtin-bidirectional-single',
                fieldMapping: {
                    content: blockId
                },
                deckId: this.riffApi.BUILTIN_DECK_ID,
            });
            
            if (!result.ok) {
                throw new Error('Failed to create bidirectional card via Xiuyuan');
            }
            
            logger.debug('[SiYuanMemo][AutoCard] Bidirectional card created via Xiuyuan:', {
                xiuyuanID: result.value.xiuyuan.id,
                cardCount: result.value.cards.length,
                blockId
            });
            

                        await this.siyuanApi.pushMsg(`已创建双向卡片 (<>)，共 ${result.value.cards.length} 张`);
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Failed to create bidirectional card:', blockId, error);
                        await this.siyuanApi.pushErrMsg(`创建双向卡片失败：${this.getErrorMessage(error)}`);
        }
    }
    
    // Create concept-definition style cards from block reference syntax.
    private async createConceptCard(
        blockId: string, 
        content: string, 
        actualSymbol?: string,
        direction: 'both' | 'forward' | 'reverse' = 'both'
    ): Promise<void> {
        try {
            logger.debug('[SiYuanMemo][AutoCard] Creating concept card:', blockId, 'symbol:', actualSymbol, 'direction:', direction);
            


            let blockRefPattern: RegExp;
            if (direction === 'forward') {
                blockRefPattern = /\(\((\d{14}-[a-z0-9]{7})[^\)]*\)\)\s*(:>|：》)\s*(.+)/;
            } else if (direction === 'reverse') {
                blockRefPattern = /\(\((\d{14}-[a-z0-9]{7})[^\)]*\)\)\s*(:<|：《)\s*(.+)/;
            } else {
                blockRefPattern = /\(\((\d{14}-[a-z0-9]{7})[^\)]*\)\)\s*(::|：：)\s*(.+)/;
            }
            
            const blockRefMatch = content.match(blockRefPattern);
            
            if (blockRefMatch) {

                const refId = blockRefMatch[1];
                const definition = blockRefMatch[3].trim();
                
                logger.debug('[SiYuanMemo][AutoCard] Detected block reference format:', refId, definition);
                

                                const blockTypeQuery = `
                    SELECT type, content 
                    FROM blocks 
                    WHERE id = '${refId}' 
                    LIMIT 1
                `;
                const typeResult = await this.siyuanApi.sql(blockTypeQuery);
                
                if (!typeResult || typeResult.length === 0) {
                    logger.error('[SiYuanMemo][AutoCard] Block reference not found:', refId);
                    return;
                }
                
                if (typeResult[0].type !== 'd') {
                    logger.debug('[SiYuanMemo][AutoCard] Block reference is not a document block, skipping:', refId);
                                        await this.siyuanApi.pushErrMsg('概念定义卡要求引用文档块，当前引用不是文档块');
                    return;
                }
                
                const conceptName = typeResult[0].content;
                logger.debug('[SiYuanMemo][AutoCard] Concept name from document block:', conceptName);
                

                const clozePattern = /==(.+?)==|\{\{(.+?)\}\}/g;
                const clozes = [...definition.matchAll(clozePattern)];
                
                logger.debug('[SiYuanMemo][AutoCard] Detected clozes in definition:', clozes.length);
                

                const xiuyuanAppService = await this.requireXiuyuanApplicationService();
                
                                
                if (clozes.length > 0) {

                    logger.debug('[SiYuanMemo][AutoCard] Creating multi-cloze concept definition cards, direction:', direction);
                    

                    const dynamicCardRules = [];
                    for (let i = 0; i < clozes.length; i++) {
                        if (direction === 'both' || direction === 'forward') {
                            dynamicCardRules.push({
                                typeMarker: `concept-definition-cloze-${i}-forward`,
                                frontFields: ['concept'],
                                backFields: ['definition'],
                            });
                        }
                        if (direction === 'both' || direction === 'reverse') {
                            dynamicCardRules.push({
                                typeMarker: `concept-definition-cloze-${i}-reverse`,
                                frontFields: ['definition'],
                                backFields: ['concept'],
                            });
                        }
                    }
                    

                    const directionSuffix = direction === 'both' ? 'both' : direction === 'forward' ? 'fwd' : 'rev';
                    const tempTemplateId = `cd-cloze-${directionSuffix}-${blockId.slice(-7)}`;
                    const tempTemplate = {
                        id: tempTemplateId,
                        name: 'Concept Definition (Multi Cloze - Bidirectional)',
                        description: 'Concept definition cards with multi-cloze support.',
                        fields: [
                            { name: 'concept', description: 'Concept block' },
                            { name: 'definition', description: 'Definition block with cloze' },
                        ],
                        cardRules: dynamicCardRules,
                    };
                    

                    await xiuyuanAppService.createTemplate(tempTemplate);
                    

                    const result = await xiuyuanAppService.createFromBlocks({
                        blockIds: [blockId, refId],
                        templateId: tempTemplateId,
                        fieldMapping: {
                            concept: refId,
                            definition: blockId
                        },
                        deckId: this.riffApi.BUILTIN_DECK_ID
                    });
                    
                    if (!result.ok) {
                        const error = (result as { ok: false; error: Error }).error;
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        logger.error('[SiYuanMemo][AutoCard] Failed to create multi-cloze concept card:', errorMsg);
                        return;
                    }
                    
                    logger.debug('[SiYuanMemo][AutoCard] Created', clozes.length * 2, 'concept definition cards (bidirectional with cloze)');
                    
                } else {

                    logger.debug('[SiYuanMemo][AutoCard] Creating concept definition card, direction:', direction);
                    logger.debug('[SiYuanMemo][AutoCard] blockIds order:', [blockId, refId], 'definition first, concept second');
                    
                    let templateId: string;
                    let cardCount: number;
                    
                    if (direction === 'both') {

                        templateId = 'builtin-concept-definition';
                        cardCount = 2;
                    } else if (direction === 'forward') {

                        templateId = 'builtin-concept-definition-forward';
                        cardCount = 1;
                    } else {

                        templateId = 'builtin-concept-definition-reverse';
                        cardCount = 1;
                    }
                    
                    const result = await xiuyuanAppService.createFromBlocks({
                        blockIds: [blockId, refId],
                        templateId: templateId,
                        fieldMapping: {
                            concept: refId,
                            definition: blockId
                        },
                        deckId: this.riffApi.BUILTIN_DECK_ID,
                        cardType: 'descriptor'
                    });
                    
                    if (!result.ok) {
                        const error = (result as { ok: false; error: Error }).error;
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        logger.error('[SiYuanMemo][AutoCard] Failed to create Xiuyuan concept card:', errorMsg);
                        return;
                    }
                    
                    logger.debug('[SiYuanMemo][AutoCard] Created', cardCount, 'concept definition card(s)');
                }
                

                                await this.siyuanApi.setBlockAttrs(blockId, {
                    'custom-fsrs-card-type': 'descriptor'
                });
                
                logger.debug('[SiYuanMemo][AutoCard] Concept definition card created successfully:', blockId);
                

                logger.debug('[SiYuanMemo][AutoCard] About to ensure concept document card for:', refId, conceptName);
                await this.ensureConceptDocumentCard(refId, conceptName);
                logger.debug('[SiYuanMemo][AutoCard] Finished ensuring concept document card');
                
                const directionText = direction === 'both' ? 'bidirectional' : direction === 'forward' ? 'forward' : 'reverse';
                let message: string;
                if (clozes.length > 0) {
                    const totalCards = direction === 'both' ? clozes.length * 2 : clozes.length;
                    message = `Created ${totalCards} concept-definition cards (${directionText} + cloze).`;
                } else {
                    const cardCount = direction === 'both' ? 2 : 1;
                    message = `Created ${cardCount} concept-definition cards (${directionText}).`;
                }
                await this.siyuanApi.pushMsg(message);
                
            } else {

                logger.debug('[SiYuanMemo][AutoCard] Not a valid block reference format, skipping');
                                await this.siyuanApi.pushErrMsg('概念定义卡格式错误：需要使用 [[概念]]::定义 格式，且概念必须是文档块引用');
            }
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Failed to create concept card:', blockId, error);
                        await this.siyuanApi.pushErrMsg(`创建概念卡片失败：${this.getErrorMessage(error)}`);
        }
    }
    
    // Create descriptor cards linked to nearest/derived concept card.
    private async createDescriptorCard(
        blockId: string, 
        content: string, 
        actualSymbol?: string,
        direction: 'forward' | 'reverse' | 'both' = 'forward'
    ): Promise<void> {
        try {
            logger.debug('[SiYuanMemo][AutoCard] Creating descriptor card:', blockId, 'symbol:', actualSymbol, 'direction:', direction);
            

            let match: RegExpMatchArray | null = null;
            if (direction === 'both') {
                match = content.match(this.patterns.descriptorBoth);
            } else if (direction === 'reverse') {
                match = content.match(this.patterns.descriptorReverse);
            } else {
                match = content.match(this.patterns.descriptor);
            }
            
            if (!match) {
                logger.error('[SiYuanMemo][AutoCard] Failed to parse descriptor card content:', content);
                return;
            }
            
            const attribute = match[1].trim();
            const description = match[3].trim();
            
            if (!attribute || !description) {
                logger.error('[SiYuanMemo][AutoCard] Empty attribute or description:', content);
                return;
            }
            

            const hasListParent = await this.hasListItemParent(blockId);
            logger.debug('[SiYuanMemo][AutoCard] Has list item parent:', hasListParent);
            
            let foundConceptId: string | null = null;
            
            if (hasListParent) {

                logger.debug('[SiYuanMemo][AutoCard] Case A: Has list parent, searching ancestors...');
                foundConceptId = await this.findConceptInAncestors(blockId, 4);
            } else {

                logger.debug('[SiYuanMemo][AutoCard] Case B: No list parent, searching heading/document...');
                foundConceptId = await this.findConceptWithoutListParent(blockId);
            }
            
            if (!foundConceptId) {
                logger.warn('[SiYuanMemo][AutoCard] No concept card found for descriptor, skipping creation');
                await this.siyuanApi.pushErrMsg('描述符卡创建失败：未找到可关联的概念卡');
                return;
            }
            logger.debug('[SiYuanMemo][AutoCard] Found concept card:', foundConceptId, ', creating Xiuyuan descriptor card');
            

            
                        

            let templateId: string;
            let cardCount: number;
            
            if (direction === 'forward') {

                templateId = 'builtin-concept-descriptor';
                cardCount = 1;
            } else if (direction === 'reverse') {

                templateId = 'builtin-concept-descriptor-reverse';
                cardCount = 1;
            } else {

                templateId = 'builtin-concept-descriptor-both';
                cardCount = 2;
            }
            

                        const currentAttrs = await this.siyuanApi.getBlockAttrs(blockId);
            if (this.hasXiuyuanBinding(currentAttrs)) {
                logger.debug('[SiYuanMemo][AutoCard] Block already has Xiuyuan card (race condition detected), skipping:', blockId);
                return;
            }
            

            const xiuyuanAppService = await this.requireXiuyuanApplicationService();
            const result = await xiuyuanAppService.createFromBlocks({
                blockIds: [foundConceptId, blockId],
                templateId: templateId,
                fieldMapping: {
                    concept: foundConceptId,
                    descriptor: blockId
                },
                deckId: this.riffApi.BUILTIN_DECK_ID,
                cardType: 'descriptor'
            });
            
            if (!result.ok) {
                const errorMsg = this.getErrorMessage(result.error);
                logger.error('[SiYuanMemo][AutoCard] Failed to create Xiuyuan descriptor card:', errorMsg);
                await this.siyuanApi.pushErrMsg(`创建描述符卡片失败：${errorMsg}`);
                return;
            }
            
            logger.debug('[SiYuanMemo][AutoCard] Descriptor card created successfully:', blockId);
            

            const directionText = direction === 'forward' ? 'forward' : direction === 'reverse' ? 'reverse' : 'bidirectional';
            await this.siyuanApi.pushMsg(`已创建${cardCount}张描述符卡片（${directionText}）`);
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Failed to create descriptor card:', blockId, error);
            await this.siyuanApi.pushErrMsg(`创建描述符卡片失败：${this.getErrorMessage(error)}`);
        }
    }
    
    // Create cloze cards, switching to multi-card flow for multiple clozes.
    private async createClozeCard(blockId: string, content: string): Promise<void> {
        try {
            logger.debug('[SiYuanMemo][AutoCard] Creating cloze card:', blockId);
            

            const clozes = ClozeDetector.extractClozes(content);
            
            if (clozes.length === 0) {
                logger.error('[SiYuanMemo][AutoCard] No cloze found in content:', content);
                return;
            }
            
            logger.debug('[SiYuanMemo][AutoCard] Found clozes:', clozes.length, clozes);

            const postCreationPlan = this.postCreationPlanner.plan({
                blockId,
                content,
                source: 'auto-card-listener',
                resolvedCardType: 'item',
            });

            logger.debug('[SiYuanMemo][AutoCard] Post-creation plan for cloze card:', {
                blockId,
                mode: postCreationPlan.mode,
                templateId: postCreationPlan.templateId,
                renderMode: postCreationPlan.renderMode,
                facesPlan: postCreationPlan.facesPlan,
                ruleId: postCreationPlan.hints.ruleId,
            });

            if (postCreationPlan.mode !== 'multi-cloze' && clozes.length === 1 && clozes[0].type !== 'latex') {
                await this.createSingleClozeCard(blockId, content, clozes);
                return;
            }
            

            await this.createMultipleClozeCards(
                blockId,
                content,
                clozes,
                postCreationPlan.renderMode
            );
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Failed to create cloze card:', blockId, error);
                        await this.siyuanApi.pushErrMsg(`创建填空卡片失败：${this.getErrorMessage(error)}`);
        }
    }
    
    // Create single cloze card with CardCreationHelper.
    private async createSingleClozeCard(
        blockId: string,
        content: string,
        clozes: Array<{ text: string; type: 'brace' | 'equal' | 'mark' | 'latex' }>
    ): Promise<void> {

        const helper = this.getCardHelper();
        
        const result = await helper.createQuickCard(blockId, {
            metadata: {
                clozes: clozes.map(c => c.text),
                clozeCount: 1,
                cardSource: 'quick-symbol',
                symbolType:
                    clozes[0].type === 'brace'
                        ? '{{}}'
                        : clozes[0].type === 'equal'
                            ? '=='
                            : clozes[0].type === 'mark'
                                ? 'mark'
                                : '\\cloze'
            }
        });
        
        if (!result.ok) {
            logger.error('[SiYuanMemo][AutoCard] Failed to create cloze card:', result.error);
                        await this.siyuanApi.pushErrMsg(`创建填空卡片失败：${result.error}`);
            return;
        }
        
        const card = result.value;
        

                await this.riffApi.addRiffCards(this.riffApi.BUILTIN_DECK_ID, [blockId]);
        

                await this.siyuanApi.markBlockAsCard(blockId, card.getId().getValue(), 50, 'item');
        
        logger.debug('[SiYuanMemo][AutoCard] Single cloze card created:', blockId);
        

        const symbolText =
            clozes[0].type === 'brace'
                ? '{{}}'
                : clozes[0].type === 'equal'
                    ? '=='
                    : clozes[0].type === 'mark'
                        ? 'mark'
                        : '\\cloze{}';
        await this.siyuanApi.pushMsg(`Created cloze card (${symbolText})`);
    }
    
    // Create multi-cloze cards through Xiuyuan template.
    private async createMultipleClozeCards(
        blockId: string,
        content: string,
        clozes: Array<{ text: string; type: 'brace' | 'equal' | 'mark' | 'latex' }>,
        clozeRenderMode: 'inline-formula-cloze' | 'default' = 'default'
    ): Promise<void> {
        const xiuyuanAppService = await this.requireXiuyuanApplicationService();
        
        try {
            const clozesWithPosition = ClozeDetector.extractClozes(content);
            clozesWithPosition.sort((a, b) => a.start - b.start);
            
            logger.debug('[SiYuanMemo][AutoCard] Extracted clozes with positions:', clozesWithPosition);
            

            const result = await xiuyuanAppService.createFromBlocks({
                blockIds: [blockId],
                templateId: 'builtin-multi-cloze',
                fieldMapping: {
                    content: blockId
                },
                deckId: this.riffApi.BUILTIN_DECK_ID,
                cardType: 'item',
                clozeRenderMode,
                clozeInfo: {
                    originalContent: content,
                    clozes: clozesWithPosition
                }
            });
            
            if (!result.ok) {
                const errorMsg = this.getErrorMessage(result.error);
                logger.error('[SiYuanMemo][AutoCard] Failed to create Xiuyuan cloze cards:', errorMsg);
                await this.siyuanApi.pushErrMsg(`创建填空卡片失败：${errorMsg}`);
                return;
            }
            
            logger.debug('[SiYuanMemo][AutoCard] Multiple cloze cards created:', blockId, 'count:', result.value.cards.length);
            

            const hasEqual = clozes.some(c => c.type === 'equal');
            const hasBrace = clozes.some(c => c.type === 'brace');
            const hasMark = clozes.some(c => c.type === 'mark');
            const hasLatex = clozes.some(c => c.type === 'latex');
            let symbolText = '';
            if (hasLatex) {
                symbolText = '\\cloze{}';
            } else if (hasMark) {
                symbolText = 'mark';
            } else if (hasEqual && hasBrace) {
                symbolText = '{{}} / ==';
            } else if (hasEqual) {
                symbolText = '==';
            } else {
                symbolText = '{{}}';
            }
            await this.siyuanApi.pushMsg(`Created ${clozes.length} cloze cards (${symbolText})`);
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Error creating multiple cloze cards:', error);
            await this.siyuanApi.pushErrMsg(`创建填空卡片失败：${this.getErrorMessage(error)}`);
        }
    }
    
    // Create list template cards based on parent question and child entries.
    private async createListTemplateCards(blockId: string, children: ListChildBlock[]): Promise<void> {
        try {
            logger.debug('[SiYuanMemo][AutoCard] Creating list template cards:', blockId, 'children:', children.length);
            

            const cardService = this.getCardService();
            const existingCard = cardService.getCardByBlockId(blockId);
            
            if (existingCard) {
                logger.debug('[SiYuanMemo][AutoCard] Block already has card:', blockId);
                return;
            }
            

                        const { kramdown: parentContent } = await this.siyuanApi.getBlockKramdown(blockId);
            if (!parentContent) {
                logger.error('[SiYuanMemo][AutoCard] Parent block has no content:', blockId);
                return;
            }
            

            const questionMatch = parentContent.match(this.patterns.multiLine);
            if (!questionMatch) {
                logger.error('[SiYuanMemo][AutoCard] Failed to parse list template question:', parentContent);
                return;
            }
            // Note: question is extracted but not used directly, as it's part of the parent block
            

            const childBlocks = [];
            for (const child of children) {
                const { kramdown: childContent } = await this.siyuanApi.getBlockKramdown(child.id);
                if (!childContent) continue;
                

                const cueMatch = childContent.match(this.patterns.listCue);
                if (cueMatch) {

                    childBlocks.push({
                        id: child.id,
                        cue: cueMatch[1].trim(),
                        answer: cueMatch[2].trim()
                    });
                } else {

                    childBlocks.push({
                        id: child.id,
                        cue: '',
                        answer: childContent.trim()
                    });
                }
            }
            
            if (childBlocks.length < 2) {
                logger.error('[SiYuanMemo][AutoCard] Not enough valid child blocks:', blockId);
                return;
            }
            
            logger.debug('[SiYuanMemo][AutoCard] Parsed child blocks:', childBlocks);
            

            const xiuyuanAppService = await this.requireXiuyuanApplicationService();
            

            const blockIDs = [blockId, ...childBlocks.map(c => c.id)];
            



                        const result = await xiuyuanAppService.createFromBlocks({
                blockIds: blockIDs,
                templateId: 'builtin-list-item',
                fieldMapping: {
                    question: blockId,
                    items: childBlocks.map(c => c.id).join(',')
                },
                deckId: this.riffApi.BUILTIN_DECK_ID
            });
            
            if (!result.ok) {
                const error = (result as { ok: false; error: Error }).error;
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.error('[SiYuanMemo][AutoCard] Failed to create Xiuyuan cards:', errorMsg);
                                await this.siyuanApi.pushErrMsg(`创建列表模板卡片失败：${errorMsg}`);
                return;
            }
            
            logger.debug('[SiYuanMemo][AutoCard] List template cards created successfully:', blockId, 'cards:', result.value.cards?.length);
            

                        await this.siyuanApi.pushMsg(`已创建列表模板卡片 (>>>), ${childBlocks.length} 个子项`);
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Failed to create list template cards:', blockId, error);
                        await this.siyuanApi.pushErrMsg(`创建列表模板卡片失败：${this.getErrorMessage(error)}`);
        }
    }
    
    // Ensure referenced concept document has its own concept card.
    private async ensureConceptDocumentCard(conceptBlockId: string, conceptName: string): Promise<void> {
        if (this.conceptCardEnsureInFlight.has(conceptBlockId)) {
            logger.debug('[SiYuanMemo][AutoCard] Concept document ensure already in flight, skipping:', conceptBlockId);
            return;
        }

        this.conceptCardEnsureInFlight.add(conceptBlockId);
        try {
            logger.debug('[SiYuanMemo][AutoCard] Ensuring concept document card:', conceptBlockId, conceptName);

            const attrs = await this.siyuanApi.getBlockAttrs(conceptBlockId);
            const hasXiuyuanId = this.hasXiuyuanBinding(attrs);
            const hasLegacyCardId = typeof attrs?.['custom-fsrs-card-id'] === 'string'
                && attrs['custom-fsrs-card-id'].trim().length > 0;
            const isConceptType = attrs?.['custom-fsrs-card-type'] === 'concept';

            const existingCard = this.getCardService().getCardByBlockId(conceptBlockId);

            if (hasXiuyuanId || hasLegacyCardId || isConceptType || existingCard) {
                logger.debug('[SiYuanMemo][AutoCard] Concept document already has card metadata:', conceptBlockId);
                return;
            }

            logger.debug('[SiYuanMemo][AutoCard] Creating Xiuyuan concept card for:', conceptName);
            
            const xiuyuanAppService = await this.requireXiuyuanApplicationService();
            const result = await xiuyuanAppService.createFromBlocks({
                blockIds: [conceptBlockId],
                templateId: 'builtin-concept-simple',
                fieldMapping: {
                    concept: conceptBlockId
                },
                deckId: this.riffApi.BUILTIN_DECK_ID
            });
            
            if (!result.ok) {
                const error = (result as { ok: false; error: Error }).error;
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.error('[SiYuanMemo][AutoCard] Failed to create concept card:', errorMsg);
                return;
            }
            

                        await this.siyuanApi.setBlockAttrs(conceptBlockId, {
                'custom-fsrs-card-type': 'concept'
            });
            
            logger.debug('[SiYuanMemo][AutoCard] Concept card created for document:', conceptBlockId);
            
                        await this.siyuanApi.pushMsg(`已为概念「${conceptName}」创建概念卡`);
            
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Failed to ensure concept document card:', error);
        } finally {
            this.conceptCardEnsureInFlight.delete(conceptBlockId);
        }
    }
    
    // Cleanup timers and in-memory queues.
    dispose(): void {
        if (this.quickTimer) {
            clearTimeout(this.quickTimer);
            this.quickTimer = null;
        }
        
        if (this.listTimer) {
            clearTimeout(this.listTimer);
            this.listTimer = null;
        }
        
        this.quickQueue.clear();
        this.listQueue.clear();
        this.processing.clear();
        

        this.lastEditTime.clear();
        this.currentEditingBlock = null;
        
        logger.debug('[SiYuanMemo][AutoCard] Handler disposed');
    }

    // Find concept card ID from block references in current block content.
    private async findConceptCardInBlockRef(content: string): Promise<string | null> {
        try {

            const refPattern = /\(\((\d{14}-[a-z0-9]{7})/g;
            const matches = [...content.matchAll(refPattern)];

            logger.debug('[SiYuanMemo][AutoCard] Block reference matches:', matches.length);
            
            if (matches.length === 0) {
                return null;
            }


                        for (const match of matches) {
                const refId = match[1];
                logger.debug('[SiYuanMemo][AutoCard] Checking block reference:', refId);
                
                const cardTypeQuery = `
                    SELECT value 
                    FROM attributes 
                    WHERE block_id = '${refId}' 
                      AND name = 'custom-fsrs-card-type'
                `;
                const result = await this.siyuanApi.sql(cardTypeQuery);
                
                logger.debug('[SiYuanMemo][AutoCard] Block reference card type:', result?.[0]?.value || 'none');
                
                if (result && result.length > 0 && result[0].value === 'concept') {
                    logger.debug('[SiYuanMemo][AutoCard] Found concept card in block reference:', refId);
                    return refId;
                }
            }

            return null;
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Error finding concept card in block ref:', error);
            return null;
        }
    }
    // Find or create concept card from block reference content.
    private async findOrCreateConceptFromBlockRef(content: string): Promise<string | null> {
        try {

            const refPattern = /\(\((\d{14}-[a-z0-9]{7})/g;
            const matches = [...content.matchAll(refPattern)];

            logger.debug('[SiYuanMemo][AutoCard] Block reference matches:', matches.length);
            
            if (matches.length === 0) {
                return null;
            }

                        

            for (const match of matches) {
                const refId = match[1];
                logger.debug('[SiYuanMemo][AutoCard] Checking block reference:', refId);
                

                const blockTypeQuery = `
                    SELECT type 
                    FROM blocks 
                    WHERE id = '${refId}' 
                    LIMIT 1
                `;
                const typeResult = await this.siyuanApi.sql(blockTypeQuery);
                
                if (!typeResult || typeResult.length === 0 || typeResult[0].type !== 'd') {
                    logger.debug('[SiYuanMemo][AutoCard] Block reference is not a document block, skipping:', refId);
                    continue;
                }
                
                logger.debug('[SiYuanMemo][AutoCard] Block reference is a document block:', refId);
                

                const cardTypeQuery = `
                    SELECT value 
                    FROM attributes 
                    WHERE block_id = '${refId}' 
                      AND name = 'custom-fsrs-card-type'
                `;
                const result = await this.siyuanApi.sql(cardTypeQuery);
                
                if (result && result.length > 0 && result[0].value === 'concept') {
                    logger.debug('[SiYuanMemo][AutoCard] Found existing concept card:', refId);
                    return refId;
                }
                

                const { kramdown: refContent } = await this.siyuanApi.getBlockKramdown(refId);
                if (refContent && this.patterns.concept.test(refContent)) {
                    logger.debug('[SiYuanMemo][AutoCard] Block has concept symbol, already a concept:', refId);
                    return refId;
                }
                

                logger.debug('[SiYuanMemo][AutoCard] Auto-marking block as concept card:', refId);
                

                const blockQuery = `SELECT content FROM blocks WHERE id = '${refId}' LIMIT 1`;
                const blockResult = await this.siyuanApi.sql(blockQuery);
                
                if (!blockResult || blockResult.length === 0) {
                    logger.warn('[SiYuanMemo][AutoCard] Block not found:', refId);
                    continue;
                }
                
                const conceptName = blockResult[0].content;
                logger.debug('[SiYuanMemo][AutoCard] Marking as concept card:', conceptName);
                

                await this.siyuanApi.setBlockAttrs(refId, {
                    'custom-fsrs-card-type': 'concept'
                });
                
                logger.debug('[SiYuanMemo][AutoCard] Successfully marked as concept card:', refId);
                

                try {
                    const helper = this.getCardHelper();
                    
                    const result = await helper.createConceptCard(refId, {
                        metadata: {
                            concept: conceptName,
                            cardSource: 'auto-concept',
                            hasDefinition: false
                        }
                    });
                    
                    if (!result.ok) {
                        logger.error('[SiYuanMemo][AutoCard] Failed to create empty concept card:', result.error);
                        continue;
                    }
                    
                    const card = result.value;
                    

                                        await this.riffApi.addRiffCards(this.riffApi.BUILTIN_DECK_ID, [refId]);
                    

                                        await this.siyuanApi.markBlockAsCard(refId, card.getId().getValue(), 50, 'topic');
                    
                    logger.debug('[SiYuanMemo][AutoCard] Empty concept card created:', refId);
                } catch (error) {
                    logger.error('[SiYuanMemo][AutoCard] Failed to create empty concept card:', error);
                }
                

                await this.siyuanApi.pushMsg(`Auto-created concept card: ${conceptName}`);
                
                return refId;
            }

            return null;
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Error finding/creating concept from block ref:', error);
            return null;
        }
    }
    
    // Check whether current block is under a list-item ancestor.
    private async hasListItemParent(blockId: string): Promise<boolean> {
                
        let currentId = blockId;
        const maxDepth = 10;
        
        for (let depth = 0; depth < maxDepth; depth++) {
            const query = `
                SELECT parent_id 
                FROM blocks 
                WHERE id = '${currentId}' 
                LIMIT 1
            `;
            const result = await this.siyuanApi.sql(query);
            
            if (!result || result.length === 0 || !result[0]?.parent_id) {
                break;
            }
            
            const parentId = result[0].parent_id;
            

            const parentQuery = `
                SELECT type 
                FROM blocks 
                WHERE id = '${parentId}' 
                LIMIT 1
            `;
            const parentResult = await this.siyuanApi.sql(parentQuery);
            
            if (parentResult && parentResult.length > 0) {
                const parentType = parentResult[0].type;
                

                if (parentType === 'i') {
                    logger.debug('[SiYuanMemo][AutoCard] Found list item parent at depth', depth, ':', parentId);
                    return true;
                }
                

                if (parentType === 'd') {
                    logger.debug('[SiYuanMemo][AutoCard] Reached document block without finding list parent');
                    break;
                }
            }
            
            currentId = parentId;
        }
        
        return false;
    }
    
    // Resolve concept card from heading/document ancestors when no list parent exists.
    private async findConceptWithoutListParent(blockId: string): Promise<string | null> {
                
        let currentId = blockId;
        let firstHeadingId: string | null = null;
        let documentId: string | null = null;
        const maxDepth = 20;
        
        for (let depth = 0; depth < maxDepth; depth++) {
            const query = `
                SELECT parent_id 
                FROM blocks 
                WHERE id = '${currentId}' 
                LIMIT 1
            `;
            const result = await this.siyuanApi.sql(query);
            
            if (!result || result.length === 0 || !result[0]?.parent_id) {
                break;
            }
            
            const parentId = result[0].parent_id;
            

            const parentQuery = `
                SELECT type, content 
                FROM blocks 
                WHERE id = '${parentId}' 
                LIMIT 1
            `;
            const parentResult = await this.siyuanApi.sql(parentQuery);
            
            if (parentResult && parentResult.length > 0) {
                const parentType = parentResult[0].type;
                const parentContent = parentResult[0].content;
                

                if (parentType === 'h' && !firstHeadingId) {
                    firstHeadingId = parentId;
                    logger.debug('[SiYuanMemo][AutoCard] Found first heading block:', parentId, parentContent);
                }
                

                if (parentType === 'd') {
                    documentId = parentId;
                    logger.debug('[SiYuanMemo][AutoCard] Found document block:', parentId);
                    break;
                }
            }
            
            currentId = parentId;
        }
        

        let conceptId: string | null = null;
        let conceptType: 'heading' | 'document' | null = null;
        
        if (firstHeadingId) {
            conceptId = firstHeadingId;
            conceptType = 'heading';
            logger.debug('[SiYuanMemo][AutoCard] Using heading block as concept card:', conceptId);
        } else if (documentId) {
            conceptId = documentId;
            conceptType = 'document';
            logger.debug('[SiYuanMemo][AutoCard] Using document block as concept card:', conceptId);
        }
        
        if (!conceptId) {
            logger.warn('[SiYuanMemo][AutoCard] No concept block found (no heading or document)');
            return null;
        }
        

        await this.siyuanApi.setBlockAttrs(conceptId, {
            'custom-fsrs-card-type': 'concept'
        });
        

        try {

            const blockQuery = `SELECT content FROM blocks WHERE id = '${conceptId}' LIMIT 1`;
            const blockResult = await this.siyuanApi.sql(blockQuery);
            const conceptName = blockResult && blockResult.length > 0 ? blockResult[0].content : 'unknown concept';
            
            const helper = this.getCardHelper();
            
            const result = await helper.createConceptCard(conceptId, {
                metadata: {
                    concept: conceptName,
                    cardSource: 'auto-concept',
                    hasDefinition: false
                }
            });
            
            if (!result.ok) {
                logger.error('[SiYuanMemo][AutoCard] Failed to create empty concept card:', result.error);
                return null;
            }
            
            const card = result.value;
            

                        await this.riffApi.addRiffCards(this.riffApi.BUILTIN_DECK_ID, [conceptId]);
            

                        await this.siyuanApi.markBlockAsCard(conceptId, card.getId().getValue(), 50, 'topic');
            
            logger.debug('[SiYuanMemo][AutoCard] Empty concept card created:', conceptId);
        } catch (error) {
            logger.error('[SiYuanMemo][AutoCard] Failed to create empty concept card:', error);
        }
        

        const conceptTypeName = conceptType === 'heading' ? 'heading block' : 'document block';
        await this.siyuanApi.pushMsg(`Auto-created concept card: ${conceptTypeName}`);
        
        return conceptId;
    }
    
    // Resolve concept card by traversing ancestors up to maxDepth.
    private async findConceptInAncestors(blockId: string, maxDepth: number): Promise<string | null> {
                
        let currentId = blockId;
        
        for (let depth = 0; depth < maxDepth; depth++) {
            const parentQuery = `SELECT parent_id FROM blocks WHERE id = '${currentId}' LIMIT 1`;
            const parentResult = await this.siyuanApi.sql(parentQuery);
            
            if (!parentResult || parentResult.length === 0 || !parentResult[0]?.parent_id) {
                logger.debug(`[SiYuanMemo][AutoCard] No parent at depth ${depth}`);
                break;
            }
            
            const parentId = parentResult[0].parent_id;
            logger.debug(`[SiYuanMemo][AutoCard] Checking parent at depth ${depth}:`, parentId);
            

            const { kramdown: parentContent } = await this.siyuanApi.getBlockKramdown(parentId);
            logger.debug(`[SiYuanMemo][AutoCard] Parent content at depth ${depth}:`, parentContent?.substring(0, 100));
            
            if (parentContent) {

                if (this.patterns.concept.test(parentContent)) {
                    logger.debug(`[SiYuanMemo][AutoCard] Found concept card with :: symbol at depth ${depth}:`, parentId);
                    

                    const cardTypeQuery = `
                        SELECT value 
                        FROM attributes 
                        WHERE block_id = '${parentId}' 
                          AND name = 'custom-fsrs-card-type'
                    `;
                    const typeResult = await this.siyuanApi.sql(cardTypeQuery);
                    
                    if (typeResult && typeResult.length > 0 && typeResult[0].value === 'concept') {
                        logger.debug(`[SiYuanMemo][AutoCard] Parent is already marked as concept card`);
                        return parentId;
                    }
                    

                    logger.debug(`[SiYuanMemo][AutoCard] Parent has :: symbol but not yet created as concept card`);
                    return null;
                }
                

                logger.debug(`[SiYuanMemo][AutoCard] Checking for block reference at depth ${depth}...`);
                const refResult = await this.findOrCreateConceptFromBlockRef(parentContent);
                if (refResult) {
                    logger.debug(`[SiYuanMemo][AutoCard] Found/created concept card from reference at depth ${depth}:`, refResult);
                    return refResult;
                }
            }
            
            currentId = parentId;
        }
        
        return null;
    }

    private async resolveDocumentRootId(nodeId: string): Promise<string> {
        const normalizedNodeId = nodeId.trim();
        if (!normalizedNodeId) {
            return '';
        }

        type BlockRootRow = {
            root_id?: string;
        };

        try {
            const rows = await this.siyuanApi.sql(`
                SELECT root_id
                FROM blocks
                WHERE id = '${this.escapeSql(normalizedNodeId)}'
                LIMIT 1
            `) as BlockRootRow[];

            const rootId = typeof rows?.[0]?.root_id === 'string' ? rows[0].root_id.trim() : '';
            return rootId || normalizedNodeId;
        } catch (error) {
            logger.warn('[SiYuanMemo][AutoCard] Failed to resolve document root id, fallback to input id:', normalizedNodeId, error);
            return normalizedNodeId;
        }
    }

    // Normalize unknown error input to a readable message.
    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === 'string' && error.length > 0) {
            return error;
        }
        return 'unknown error';
    }

    private escapeSql(value: string): string {
        return value.replace(/'/g, "''");
    }
}
