/**
 * 自动制卡处理器（统一版）
 * 
 * 职责：
 * - 检测块内容变化（insert/update）
 * - 管理两个独立的防抖队列
 * - 创建各种类型的卡片
 * 
 * 两个队列：
 * 1. 快速符号队列（1000ms 防抖）：>>, ::, ;;, {{}}
 * 2. 列表模版队列（2000ms 防抖）：>>> + 子列表项
 * 
 * 🆕 方案 5 + 方案 3：智能检测 + 批量创建
 * 
 * 方案 5（智能检测块编辑完成）：
 * - 正常编辑时：使用较长的防抖时间（1秒），支持多符号输入
 * - 块失焦时：立即检测该块的所有符号，批量创建卡片
 * - 检测失焦：当切换到其他块时，自动触发前一个块的制卡
 * 
 * 方案 3（批量检测模式）：
 * - 一次扫描找出块内所有符号
 * - 批量创建多张卡片
 * - 避免遗漏任何符号
 * 
 * 优势：
 * ✅ 支持在一个块里输入多个符号
 * ✅ 响应及时（失焦时立即触发）
 * ✅ 不会误触发（编辑过程中不会触发）
 * ✅ 用户体验好（符合自然的编辑习惯）
 * 
 * @see .kiro/specs/quick-card-symbols/design.md - Section 2.3
 * @see .kiro/specs/quick-card-symbols/tasks.md - Task 2.1
 */

import type { ITransactionHandler, Transaction } from '../../core/infrastructure/websocket/TransactionWebSocketService';
import type FSRSPlugin from '@/index';
import { getBlockKramdown, sql } from '@/core/siyuan/api';
import { CardCreationHelper } from '../helpers/CardCreationHelper';

/**
 * 自动制卡处理器（统一版）
 * 
 * 监听块内容变化，检测快速制卡符号，创建对应类型的卡片
 */
export class AutoCardHandler implements ITransactionHandler {
    private plugin: FSRSPlugin;
    
    // 🆕 CardCreationHelper for unified card creation
    private cardHelper: CardCreationHelper | null = null;
    
    // 两个独立的防抖队列
    private quickQueue: Set<string> = new Set();  // 快速符号
    private listQueue: Set<string> = new Set();   // 列表模版
    private processing: Set<string> = new Set();  // 正在处理的块
    
    private quickTimer: NodeJS.Timeout | null = null;
    private listTimer: NodeJS.Timeout | null = null;
    
    // 🆕 记录最后编辑时间（用于智能防抖）
    private lastEditTime: Map<string, number> = new Map();
    
    // 🆕 记录当前正在编辑的块（用于检测失焦）
    private currentEditingBlock: string | null = null;
    
    private readonly QUICK_DEBOUNCE = 1000;   // 快速符号：1000ms（延长以支持多符号输入）
    private readonly LIST_DEBOUNCE = 2000;   // 列表模版：2000ms
    
    // 符号正则表达式（私有）
    private patterns = {
        concept: /^(.+?)\s*(::|：：)\s*(.+)$/,         // 概念 :: 或 ：： 定义（默认双向）
        conceptForward: /^(.+?)\s*(:>|：》)\s*(.+)$/,  // 概念 :> 或 ：》 定义（仅正向）
        conceptReverse: /^(.+?)\s*(:<|：《)\s*(.+)$/,  // 概念 :< 或 ：《 定义（仅反向）
        descriptor: /^(.+?)\s*(;;|；；)\s*(.+)$/,      // 属性 ;; 或 ；； 描述（默认仅正向）
        descriptorReverse: /^(.+?)\s*(;<|；《)\s*(.+)$/,  // 属性 ;< 或 ；《 描述（仅反向）
        descriptorBoth: /^(.+?)\s*(;<>|；《》)\s*(.+)$/,  // 属性 ;<> 或 ；《》 描述（双向）
        basicBoth: /^(.+?)\s*(<>|《》)\s*(.+)$/,       // 问题 <> 或 《》 答案
        basicForward: /^(.+?)\s*(>>|》》)\s*(.+)$/,    // 问题 >> 或 》》 答案
        basicBackward: /^(.+?)\s*(<<|《《)\s*(.+)$/,   // 答案 << 或 《《 问题
        cloze: /\{\{(.+?)\}\}/g,                // {{填空}}
        clozeEqual: /==(.+?)==/g,               // ==填空==
        clozeMark: /<span data-type="mark">(.+?)<\/span>/g,  // 思源标记
        multiLine: /(.+?)\s*(>>>|》》》)\s*$/,           // 问题 >>> 或 》》》
        listCue: /^(.+?)\s*→\s*(.+)$/,         // 提示 → 答案（列表模版子项）
    };
    
    constructor(plugin: FSRSPlugin) {
        this.plugin = plugin;
        console.log('[SiYuanMemo][AutoCard] Handler initialized');
    }

    private getContext(): any | null {
        try {
            return this.plugin?.getContext?.() ?? null;
        } catch (error) {
            console.warn('[AutoCard] Failed to get ApplicationContext:', error);
            return null;
        }
    }

    private getStorage(): any | null {
        const context = this.getContext();
        return context?.getStorage?.() ?? null;
    }

    private get storage(): any {
        const storage = this.getStorage();
        if (!storage) {
            throw new Error('[AutoCard] Storage service is unavailable');
        }
        return storage;
    }
    
    /**
     * 获取 SettingsService
     * 
     * @private
     * @returns SettingsService 实例
     * 
     * @description
     * ✅ DDD 架构：通过 ApplicationContext 获取 SettingsService
     */
    private get settingsService(): any {
        try {
            const context = this.getContext();
            if (context) {
                return context.getSettingsService();
            }
        } catch (error) {
            console.warn('[AutoCard] Failed to get SettingsService from context:', error);
        }
        // 回退到 storage（保持兼容）
        return this.getStorage();
    }
    
    /**
     * 获取 CardApplicationService
     * 
     * @private
     * @returns CardApplicationService 实例，如果不可用则返回 null
     */
    private getCardService(): any | null {
        try {
            const context = this.getContext();
            if (context) {
                return context.getCardService();
            }
        } catch (error) {
            console.warn('[AutoCard] Failed to get CardApplicationService:', error);
        }
        return null;
    }
    
    /**
     * 获取 XiuyuanApplicationService
     * 
     * @private
     * @returns XiuyuanApplicationService 实例的 Promise，如果不可用则返回 null
     */
    private async getXiuyuanApplicationService(): Promise<any | null> {
        try {
            const context = this.getContext();
            if (context) {
                return await context.getXiuyuanApplicationService();
            }
        } catch (error) {
            console.warn('[AutoCard] Failed to get XiuyuanApplicationService:', error);
        }
        return null;
    }
    
    /**
     * 获取 CardCreationHelper
     * 
     * @private
     * @returns CardCreationHelper 实例，如果不可用则返回 null
     */
    private getCardHelper(): CardCreationHelper | null {
        // 懒加载：只在第一次使用时初始化
        if (!this.cardHelper) {
            const cardService = this.getCardService();
            if (cardService) {
                this.cardHelper = new CardCreationHelper(cardService);
            }
        }
        return this.cardHelper;
    }
    
    /**
     * 保存单个卡片（使用 DDD 架构）
     * 
     * @private
     * @param card 卡片对象
     * @description
     * 优先使用 CardApplicationService.batchCreateCardsWithoutEvents()
     * 回退到直接 storage 访问（向后兼容）
     */
    private async saveCard(card: any): Promise<void> {
        const cardService = this.getCardService();
        
        if (cardService) {
            // 使用 CardApplicationService（推荐）
            await cardService.batchCreateCardsWithoutEvents([card]);
        } else {
            // 回退到直接 storage 访问（向后兼容）
            this.storage.setCard(card);
            await this.storage.saveCards();
        }
    }
    
    /**
     * 使用 CardApplicationService 创建概念卡
     * 
     * @private
     * @param blockId 块 ID
     * @param options 选项
     * @returns 是否成功创建
     */
    private async createConceptCardViaDDD(
        blockId: string,
        options: {
            priority?: 'normal' | 'high';
            metadata?: Record<string, any>;
        } = {}
    ): Promise<boolean> {
        try {
            const cardService = this.getCardService();
            if (!cardService) {
                console.warn('[AutoCard] CardApplicationService not available, using fallback');
                return false;
            }

            const { riff } = await import('@/core/siyuan/riff');
            const result = await cardService.createCard({
                blockId: blockId,
                cardType: 'concept',  // 自动选择 builtin-concept-simple 模板
                deckId: riff.BUILTIN_DECK_ID,
                priority: options.priority || 'normal',
                meta: {
                    autoCreated: true,
                    source: 'auto',
                    ...options.metadata,
                },
            });

            if (result.ok) {
                console.log(`[AutoCard] Concept card created via DDD: ${blockId}`);
                return true;
            } else {
                console.error(`[AutoCard] Failed to create concept card: ${result.error.message}`);
                return false;
            }
        } catch (error) {
            console.error('[AutoCard] Error creating concept card via DDD:', error);
            return false;
        }
    }
    
    /**
     * 处理 transactions
     * 
     * 检测块内容变化（insert/update），只在失焦时触发制卡
     * 
     * 🆕 方案 5：智能检测块编辑完成
     * - 块失焦时：立即检测该块的所有符号
     * - 不使用防抖：避免在编辑过程中误触发
     * 
     * @param transactions 事务列表
     */
    handle(transactions: Transaction[]): void {
        // 检查快速制卡是否启用
        const quickCardSettings = this.settingsService.getSettings().quickCard;
        console.log('[SiYuanMemo][AutoCard] Quick card settings:', quickCardSettings);
        if (!quickCardSettings?.enabled) {
            console.log('[SiYuanMemo][AutoCard] Quick card is disabled, skipping');
            return;
        }
        
        console.log('[SiYuanMemo][AutoCard] Quick card is enabled, processing transactions');
        
        for (const tx of transactions) {
            if (!tx.doOperations) continue;
            
            for (const op of tx.doOperations) {
                const blockId = op.id;
                
                // 只处理 insert 和 update 操作
                if (op.action === 'update' || op.action === 'insert') {
                    // 🆕 检测块失焦事件（切换到其他块）
                    if (this.currentEditingBlock && this.currentEditingBlock !== blockId) {
                        console.log('[SiYuanMemo][AutoCard] Block unfocused:', this.currentEditingBlock);
                        // 立即处理失焦的块
                        this.processBlockImmediately(this.currentEditingBlock);
                    }
                    
                    // 更新当前编辑的块
                    this.currentEditingBlock = blockId;
                    
                    console.log('[SiYuanMemo][AutoCard] Current editing block:', blockId);
                }
            }
        }
    }
    
    /**
     * 快速符号检测队列（1000ms 防抖）
     * 
     * 用于检测：>>, <<, <>, ::, ;;, {{}}
     * 
     * 🆕 方案 5：智能防抖
     * - 记录最后编辑时间
     * - 延长防抖时间以支持多符号输入
     * - 可选：完全禁用防抖，只依赖失焦检测
     * 
     * @param blockId 块 ID
     */
    private queueQuickCheck(blockId: string): void {
        this.quickQueue.add(blockId);
        
        // 🆕 记录最后编辑时间
        this.lastEditTime.set(blockId, Date.now());
        
        if (this.quickTimer) {
            clearTimeout(this.quickTimer);
        }
        
        // 从设置中获取防抖时间
        const quickCardSettings = this.settingsService.getSettings().quickCard;
        const debounceDelay = quickCardSettings?.debounceDelay?.quick || this.QUICK_DEBOUNCE;
        
        // 🆕 如果防抖时间设置为 0，则完全禁用防抖（只依赖失焦检测）
        if (debounceDelay === 0) {
            console.log('[SiYuanMemo][AutoCard] Debounce disabled, only blur detection will trigger');
            return;
        }
        
        this.quickTimer = setTimeout(() => {
            this.processQuickQueue();
        }, debounceDelay);
    }
    
    /**
     * 列表模版检测队列（2000ms 防抖）
     * 
     * 用于检测：>>> + 子列表项
     * 
     * 🚫 已禁用：列表模板卡触发太快，容易误触
     * 
     * @param blockId 块 ID
     */
    private queueListCheck(blockId: string): void {
        // 🚫 禁用列表模板卡自动识别
        // 原因：打出 >>> 后会立即触发，但用户还没来得及输入子列表项
        // 建议：使用手动创建列表模板卡的方式（右键菜单）
        return;
        
        /* 原代码保留以供参考
        this.listQueue.add(blockId);
        
        if (this.listTimer) {
            clearTimeout(this.listTimer);
        }
        
        // 从设置中获取防抖时间
        const quickCardSettings = this.settingsService.getSettings().quickCard;
        const debounceDelay = quickCardSettings?.debounceDelay?.list || this.LIST_DEBOUNCE;
        
        this.listTimer = setTimeout(() => {
            this.processListQueue();
        }, debounceDelay);
        */
    }
    
    /**
     * 处理快速符号队列
     * 
     * 批量处理队列中的所有块
     */
    private async processQuickQueue(): Promise<void> {
        const blocks = Array.from(this.quickQueue);
        this.quickQueue.clear();
        
        console.log('[SiYuanMemo][AutoCard] Processing quick queue, count:', blocks.length);
        
        for (const blockId of blocks) {
            // 避免重复处理
            if (this.processing.has(blockId)) {
                console.log('[SiYuanMemo][AutoCard] Block already processing:', blockId);
                continue;
            }
            
            this.processing.add(blockId);
            
            try {
                await this.checkQuickSymbols(blockId);
            } catch (error) {
                console.error('[SiYuanMemo][AutoCard] Failed to check quick symbols:', blockId, error);
            } finally {
                this.processing.delete(blockId);
            }
        }
    }
    
    /**
     * 处理列表模版队列
     * 
     * 批量处理队列中的所有块
     */
    private async processListQueue(): Promise<void> {
        const blocks = Array.from(this.listQueue);
        this.listQueue.clear();
        
        console.log('[SiYuanMemo][AutoCard] Processing list queue, count:', blocks.length);
        
        for (const blockId of blocks) {
            // 避免重复处理
            if (this.processing.has(blockId)) {
                console.log('[SiYuanMemo][AutoCard] Block already processing:', blockId);
                continue;
            }
            
            this.processing.add(blockId);
            
            try {
                await this.checkListTemplate(blockId);
            } catch (error) {
                console.error('[SiYuanMemo][AutoCard] Failed to check list template:', blockId, error);
            } finally {
                this.processing.delete(blockId);
            }
        }
        
        // 批量保存
        const cardService = this.getCardService();
        if (cardService) {
            await cardService.saveCards();
        } else {
            await this.storage.saveCards();
        }
    }
    
    /**
     * 检测快速符号（>>, ::, ;;, {{}}）
     * 
     * 注意：不包括 >>>，因为它需要更长的防抖时间
     * 
     * 🆕 方案 3：批量检测模式
     * - 一次扫描找出所有符号
     * - 批量创建多张卡片
     * 
     * @param blockId 块 ID
     */
    private async checkQuickSymbols(blockId: string): Promise<void> {
        try {
            // 获取设置
            const quickCardSettings = this.settingsService.getSettings().quickCard;
            if (!quickCardSettings?.enabled) {
                return;
            }
            
            // 1. 获取块内容
            const { kramdown } = await getBlockKramdown(blockId);
            if (!kramdown) {
                console.log('[SiYuanMemo][AutoCard] Block has no content:', blockId);
                return;
            }
            
            console.log('[SiYuanMemo][AutoCard] Checking quick symbols:', blockId, 'content:', kramdown);
            
            // 2. ✅ 检查块类型，只允许段落块触发符号制卡（防止列表块误触）
            const { sql } = await import('@/core/siyuan/api');
            const typeResult = await sql(`SELECT type FROM blocks WHERE id = '${blockId}' LIMIT 1`);
            
            if (!typeResult || typeResult.length === 0) {
                console.log('[SiYuanMemo][AutoCard] Block not found:', blockId);
                return;
            }
            
            const blockType = typeResult[0].type;
            if (blockType !== 'p') {
                console.log('[SiYuanMemo][AutoCard] Block is not a paragraph (type:', blockType, '), skipping symbol detection');
                return;
            }
            
            // 3. ✅ 检查是否已经是 Xiuyuan 卡片（通过块属性）
            const { getBlockAttrs } = await import('@/core/siyuan/api');
            const attrs = await getBlockAttrs(blockId);
            
            if (attrs && (attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'])) {
                console.log('[SiYuanMemo][AutoCard] Block is already part of a Xiuyuan card, skipping:', blockId);
                return;
            }
            
            // 4. 检查是否已制卡
            const cardService = this.getCardService();
            let existingCard = null;
            
            if (cardService) {
                existingCard = cardService.getCardByBlockId(blockId);
            } else {
                existingCard = this.storage.getCardByBlockId(blockId);
            }
            
            if (existingCard) {
                console.log('[SiYuanMemo][AutoCard] Block already has card:', blockId);
                return;
            }
            
            // 🆕 5. 批量检测所有符号（方案 3）
            console.log('[SiYuanMemo][AutoCard] Enabled symbols:', JSON.stringify(quickCardSettings.enabledSymbols));
            const detectedSymbols = this.detectAllSymbols(kramdown, quickCardSettings);
            
            if (detectedSymbols.length === 0) {
                console.log('[SiYuanMemo][AutoCard] No quick symbol detected:', blockId);
                return;
            }
            
            console.log('[SiYuanMemo][AutoCard] Detected symbols:', detectedSymbols);
            
            // 移除 IAL，用于后续的卡片创建
            const cleanContent = kramdown.replace(/\{:[^}]*\}/g, '').trim();
            
            // 🆕 6. 批量创建卡片
            for (const symbol of detectedSymbols) {
                try {
                    await this.createCardBySymbol(blockId, symbol, cleanContent);
                } catch (error) {
                    console.error('[SiYuanMemo][AutoCard] Failed to create card for symbol:', symbol.type, error);
                }
            }
        } catch (error) {
            console.error('[SiYuanMemo][AutoCard] Error checking quick symbols:', blockId, error);
        }
    }
    
    /**
     * 🆕 批量检测所有符号（方案 3）
     * 
     * 在一个块内检测所有符号类型，返回匹配列表
     * 
     * @param content 块内容
     * @param settings 快速制卡设置
     * @returns 检测到的符号列表
     */
    private detectAllSymbols(content: string, settings: any): Array<{
        type: 'basic-both' | 'basic-forward' | 'basic-backward' | 'concept' | 'concept-forward' | 'concept-reverse' | 'descriptor' | 'descriptor-reverse' | 'descriptor-both' | 'cloze';
        match: RegExpMatchArray;
    }> {
        const symbols: Array<{
            type: 'basic-both' | 'basic-forward' | 'basic-backward' | 'concept' | 'concept-forward' | 'concept-reverse' | 'descriptor' | 'descriptor-reverse' | 'descriptor-both' | 'cloze';
            match: RegExpMatchArray;
        }> = [];
        
        // 先移除 IAL 属性块，避免干扰正则匹配
        let cleanContent = content.replace(/\{:[^}]*\}/g, '').trim();
        
        console.log('[SiYuanMemo][AutoCard] detectAllSymbols - original:', content.substring(0, 100));
        console.log('[SiYuanMemo][AutoCard] detectAllSymbols - cleaned:', cleanContent.substring(0, 100));
        console.log('[SiYuanMemo][AutoCard] detectAllSymbols - descriptor enabled:', settings.enabledSymbols.descriptor);
        
        // 🆕 移除被反引号包裹的内容（代码块），避免误触发符号检测
        // 例如：`这里有个 :: 符号` 不应该触发概念卡片
        // 支持单行代码 `code` 和多行代码块 ```code```
        cleanContent = cleanContent.replace(/`[^`]*`/g, '');
        cleanContent = cleanContent.replace(/```[\s\S]*?```/g, '');
        
        // 检测顺序（优先级从高到低）
        // 注意：排除 >>> 符号（它在列表模版队列中处理）
        // 🔧 修复：使用独立的 if 语句而不是 else if 链，避免概念检测阻止描述符检测
        
        console.log('[SiYuanMemo][AutoCard] Starting symbol detection...');
        
        let matched = false;
        
        // 1. 描述符双向 ;<> (优先级最高，避免被 <> 误匹配)
        if (!matched && settings.enabledSymbols.descriptor && this.patterns.descriptorBoth.test(cleanContent)) {
            console.log('[SiYuanMemo][AutoCard] Matched: descriptorBoth');
            const match = cleanContent.match(this.patterns.descriptorBoth);
            if (match) {
                symbols.push({ type: 'descriptor-both', match });
                matched = true;
            }
        }
        
        // 2. 双向卡片 <>
        if (!matched && settings.enabledSymbols.basic && this.patterns.basicBoth.test(cleanContent)) {
            console.log('[SiYuanMemo][AutoCard] Matched: basicBoth');
            const match = cleanContent.match(this.patterns.basicBoth);
            if (match) {
                symbols.push({ type: 'basic-both', match });
                matched = true;
            }
        }
        
        // 3. 正向卡片 >> (排除 >>>)
        if (!matched && settings.enabledSymbols.basic && this.patterns.basicForward.test(cleanContent) && !this.patterns.multiLine.test(cleanContent)) {
            console.log('[SiYuanMemo][AutoCard] Matched: basicForward');
            const match = cleanContent.match(this.patterns.basicForward);
            if (match) {
                symbols.push({ type: 'basic-forward', match });
                matched = true;
            }
        }
        
        // 4. 反向卡片 <<
        if (!matched && settings.enabledSymbols.basic && this.patterns.basicBackward.test(cleanContent)) {
            console.log('[SiYuanMemo][AutoCard] Matched: basicBackward');
            const match = cleanContent.match(this.patterns.basicBackward);
            if (match) {
                symbols.push({ type: 'basic-backward', match });
                matched = true;
            }
        }
        
        // 5. 概念卡片（优先检测方向符号）
        if (!matched && settings.enabledSymbols.concept) {
            console.log('[SiYuanMemo][AutoCard] Checking concept patterns...');
            // 5.1 概念正向 :>
            if (this.patterns.conceptForward.test(cleanContent)) {
                console.log('[SiYuanMemo][AutoCard] Matched: conceptForward');
                const match = cleanContent.match(this.patterns.conceptForward);
                if (match) {
                    symbols.push({ type: 'concept-forward', match });
                    matched = true;
                }
            }
            // 5.2 概念反向 :<
            else if (this.patterns.conceptReverse.test(cleanContent)) {
                console.log('[SiYuanMemo][AutoCard] Matched: conceptReverse');
                const match = cleanContent.match(this.patterns.conceptReverse);
                if (match) {
                    symbols.push({ type: 'concept-reverse', match });
                    matched = true;
                }
            }
            // 5.3 概念双向 :: (默认)
            else if (this.patterns.concept.test(cleanContent)) {
                console.log('[SiYuanMemo][AutoCard] Matched: concept');
                const match = cleanContent.match(this.patterns.concept);
                if (match) {
                    symbols.push({ type: 'concept', match });
                    matched = true;
                }
            } else {
                console.log('[SiYuanMemo][AutoCard] No concept pattern matched');
            }
        }
        
        // 6. 描述符卡片（检测反向和正向）
        if (!matched && settings.enabledSymbols.descriptor) {
            console.log('[SiYuanMemo][AutoCard] Checking descriptor patterns...');
            // 6.1 描述符反向 ;<
            if (this.patterns.descriptorReverse.test(cleanContent)) {
                const match = cleanContent.match(this.patterns.descriptorReverse);
                console.log('[SiYuanMemo][AutoCard] Matched descriptorReverse:', match);
                if (match) {
                    symbols.push({ type: 'descriptor-reverse', match });
                    matched = true;
                }
            }
            // 6.2 描述符正向 ;; (默认)
            else if (this.patterns.descriptor.test(cleanContent)) {
                const match = cleanContent.match(this.patterns.descriptor);
                console.log('[SiYuanMemo][AutoCard] Matched descriptor:', match);
                if (match) {
                    symbols.push({ type: 'descriptor', match });
                    matched = true;
                }
            } else {
                console.log('[SiYuanMemo][AutoCard] No descriptor pattern matched');
                console.log('[SiYuanMemo][AutoCard] descriptorReverse test:', this.patterns.descriptorReverse.test(cleanContent));
                console.log('[SiYuanMemo][AutoCard] descriptor test:', this.patterns.descriptor.test(cleanContent));
            }
        }
        
        // 7. 填空卡片 {{}} 或 == 或思源标记
        if (!matched && settings.enabledSymbols.cloze && (this.patterns.cloze.test(cleanContent) || this.patterns.clozeEqual.test(cleanContent) || this.patterns.clozeMark.test(cleanContent))) {
            console.log('[SiYuanMemo][AutoCard] Matched: cloze');
            const match = cleanContent.match(this.patterns.cloze) || cleanContent.match(this.patterns.clozeEqual) || cleanContent.match(this.patterns.clozeMark);
            if (match) {
                symbols.push({ type: 'cloze', match });
                matched = true;
            }
        }
        
        console.log('[SiYuanMemo][AutoCard] Symbol detection complete, matched:', matched, 'symbols:', symbols.length);
        
        return symbols;
    }
    
    /**
     * 🆕 根据符号类型创建卡片
     * 
     * @param blockId 块 ID
     * @param symbol 检测到的符号
     * @param content 块内容
     */
    private async createCardBySymbol(
        blockId: string,
        symbol: { type: string; match: RegExpMatchArray },
        content: string
    ): Promise<void> {
        // 从 match[2] 提取实际使用的符号
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
                console.warn('[SiYuanMemo][AutoCard] Unknown symbol type:', symbol.type);
        }
    }
    
    /**
     * 🆕 立即处理块（方案 5）
     * 
     * 当块失焦时立即检测并创建卡片，不等待防抖
     * 
     * @param blockId 块 ID
     */
    private async processBlockImmediately(blockId: string): Promise<void> {
        console.log('[SiYuanMemo][AutoCard] Processing block immediately:', blockId);
        
        // 从队列中移除（避免重复处理）
        this.quickQueue.delete(blockId);
        this.listQueue.delete(blockId);
        
        // 避免重复处理
        if (this.processing.has(blockId)) {
            console.log('[SiYuanMemo][AutoCard] Block already processing:', blockId);
            return;
        }
        
        this.processing.add(blockId);
        
        try {
            // 检测快速符号
            await this.checkQuickSymbols(blockId);
            
            // 检测列表模版
            await this.checkListTemplate(blockId);
        } catch (error) {
            console.error('[SiYuanMemo][AutoCard] Failed to process block immediately:', blockId, error);
        } finally {
            this.processing.delete(blockId);
            this.lastEditTime.delete(blockId);
        }
    }
    
    /**
     * 检测列表模版（>>> + 子列表项）
     * 
     * @param blockId 块 ID
     */
    private async checkListTemplate(blockId: string): Promise<void> {
        try {
            // 获取设置
            const quickCardSettings = this.settingsService.getSettings().quickCard;
            if (!quickCardSettings?.enabled || !quickCardSettings.enabledSymbols.multiLine) {
                return;
            }
            
            // 1. 获取块内容
            const { kramdown } = await getBlockKramdown(blockId);
            if (!kramdown) {
                console.log('[SiYuanMemo][AutoCard] Block has no content:', blockId);
                return;
            }
            
            console.log('[SiYuanMemo][AutoCard] Checking list template:', blockId, 'content:', kramdown);
            
            // 2. 检测 >>> 符号
            if (!this.patterns.multiLine.test(kramdown)) {
                console.log('[SiYuanMemo][AutoCard] No list template symbol detected:', blockId);
                return;
            }
            
            // 3. 检查是否为列表项
            const typeResult = await sql(`
                SELECT type FROM blocks WHERE id = '${blockId}' LIMIT 1
            `);
            
            if (!typeResult || typeResult.length === 0 || typeResult[0]?.type !== 'i') {
                console.log('[SiYuanMemo][AutoCard] Block is not a list item:', blockId);
                return;
            }
            
            // 4. 检查子列表项数量
            const childrenResult = await sql(`
                SELECT id FROM blocks
                WHERE parent_id = '${blockId}' AND type = 'i'
            `);
            
            if (!childrenResult || childrenResult.length < 2) {
                console.log('[SiYuanMemo][AutoCard] Not enough child list items:', blockId, 'count:', childrenResult?.length || 0);
                return;
            }
            
            console.log('[SiYuanMemo][AutoCard] List template detected:', blockId, 'children:', childrenResult.length);
            
            // 5. 创建列表模版卡片
            await this.createListTemplateCards(blockId, childrenResult);
        } catch (error) {
            console.error('[SiYuanMemo][AutoCard] Error checking list template:', blockId, error);
        }
    }
    
    // ==================== 卡片创建方法 ====================
    
    /**
     * 创建基础卡片（>>, <<, <> 及其中文版本）
     * 
     * @param blockId 块 ID
     * @param direction 方向（forward/backward/both）
     * @param content 块内容
     * @param actualSymbol 实际使用的符号（如 '>>' 或 '》》'）
     */
    private async createBasicCard(blockId: string, direction: string, content: string, actualSymbol?: string): Promise<void> {
        try {
            console.log('[SiYuanMemo][AutoCard] Creating basic card:', blockId, direction, 'symbol:', actualSymbol);
            
            // 1. 解析问题和答案
            let question = '';
            let answer = '';
            
            if (direction === 'forward') {
                const match = content.match(this.patterns.basicForward);
                if (match) {
                    question = match[1].trim();
                    answer = match[3].trim();  // 调整索引：match[2]是符号，match[3]是答案
                }
            } else if (direction === 'backward') {
                const match = content.match(this.patterns.basicBackward);
                if (match) {
                    answer = match[1].trim();
                    question = match[3].trim();  // 调整索引：match[2]是符号，match[3]是问题
                }
            } else if (direction === 'both') {
                // 双向卡片：使用 Xiuyuan 系统
                const match = content.match(this.patterns.basicBoth);
                if (match) {
                    const term = match[1].trim();
                    const definition = match[3].trim();  // 调整索引：match[2]是符号，match[3]是定义
                    await this.createBidirectionalCard(blockId, term, definition);
                    return;
                }
            }
            
            if (!question || !answer) {
                console.error('[SiYuanMemo][AutoCard] Failed to parse basic card content:', content);
                return;
            }
            
            // 🆕 2. 检测背面挖空
            const { ClozeDetector } = await import('@/utils/cloze-detector');
            const backClozes = ClozeDetector.extractClozes(answer);
            
            // 🆕 3. 如果背面有挖空，使用 Xiuyuan 系统创建多张卡片
            if (backClozes.length > 0) {
                console.log('[SiYuanMemo][AutoCard] Detected back clozes:', backClozes.length);
                
                const xiuyuanAppService = await this.getXiuyuanApplicationService();
                if (!xiuyuanAppService) {
                    console.error('[SiYuanMemo][AutoCard] XiuyuanApplicationService not available');
                    const { pushErrMsg } = await import('@/core/siyuan/api');
                    await pushErrMsg('修缘服务不可用');
                    return;
                }
                
                const { BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
                
                const result = await xiuyuanAppService.createFromBlocks({
                    blockIds: [blockId],
                    templateId: 'builtin-quick-card',
                    fieldMapping: { content: blockId },
                    deckId: BUILTIN_DECK_ID,
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
                
                const { pushMsg } = await import('@/core/siyuan/api');
                await pushMsg(`✅ 已创建 ${backClozes.length} 张卡片（背面挖空）`);
                return;
            }
            
            // 4. 否则使用原有逻辑创建单张卡片
            const helper = this.getCardHelper();
            if (!helper) {
                console.error('[SiYuanMemo][AutoCard] CardCreationHelper not available');
                const { pushErrMsg } = await import('@/core/siyuan/api');
                await pushErrMsg('卡片创建服务不可用');
                return;
            }
            
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
            
            // 5. 添加到 Riff 卡组
            const { addRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            await addRiffCards(BUILTIN_DECK_ID, [blockId]);
            console.log('[SiYuanMemo][AutoCard] Added to Riff deck:', blockId);
            
            // 6. 标记 FSRS 属性
            const { markBlockAsCard } = await import('@/core/siyuan/block');
            const card = result.value;
            await markBlockAsCard(blockId, card.id, card.priority, 'item');
            console.log('[SiYuanMemo][AutoCard] Marked block as card:', blockId);
            
            console.log('[SiYuanMemo][AutoCard] Basic card created successfully:', blockId, direction);
            
            // 7. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            const symbolText = direction === 'forward' ? '>>' : '<<';
            await pushMsg(`✅ 已创建${direction === 'forward' ? '正向' : '反向'}卡片 (${symbolText})`);
        } catch (error) {
            console.error('[SiYuanMemo][AutoCard] Failed to create basic card:', blockId, error);
            const { pushErrMsg } = await import('@/core/siyuan/api');
            await pushErrMsg(`创建基础卡片失败：${error.message}`);
        }
    }
    
    /**
     * 创建双向卡片（使用 Xiuyuan 系统）
     * 
     * 双向卡片会通过 Xiuyuan 的 builtin-quick-card 模板创建两张卡片：
     * - 卡片1：term -> definition (forward)
     * - 卡片2：definition -> term (reverse)
     * 
     * 所有卡片共用同一个 blockId 作为代表块
     * 
     * @param blockId 块 ID
     * @param term 术语
     * @param definition 定义
     */
    private async createBidirectionalCard(blockId: string, term: string, definition: string): Promise<void> {
        try {
            console.log('[SiYuanMemo][AutoCard] Creating bidirectional card using Xiuyuan:', blockId);
            
            // 1. 检查 XiuyuanApplicationService 是否可用
            const xiuyuanAppService = await this.getXiuyuanApplicationService();
            if (!xiuyuanAppService) {
                console.error('[SiYuanMemo][AutoCard] XiuyuanApplicationService not available, falling back to single card');
                // 降级：使用 CardCreationHelper 创建符号检测卡
                const helper = this.getCardHelper();
                if (!helper) {
                    console.error('[SiYuanMemo][AutoCard] CardCreationHelper not available');
                    const { pushErrMsg } = await import('@/core/siyuan/api');
                    await pushErrMsg('卡片创建服务不可用');
                    return;
                }
                
                const result = await helper.createSymbolCard(blockId, {
                    metadata: {
                        direction: 'forward',
                        question: term,
                        answer: definition,
                        cardSource: 'quick-symbol',
                        symbolType: '<>'
                    }
                });
                
                if (!result.ok) {
                    throw new Error(`Failed to create symbol card: ${result.error}`);
                }
                
                const { addRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
                await addRiffCards(BUILTIN_DECK_ID, [blockId]);
                
                const { markBlockAsCard } = await import('@/core/siyuan/block');
                const card = result.value;
                await markBlockAsCard(blockId, card.id, card.priority, 'item');
                
                const { pushMsg } = await import('@/core/siyuan/api');
                await pushMsg(`✅ 已创建双向卡片 (<>) - 仅正向`);
                return;
            }
            
            // 🆕 2. 检测背面挖空
            const { ClozeDetector } = await import('@/utils/cloze-detector');
            const backClozes = ClozeDetector.extractClozes(definition);
            
            const { BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            
            // 🆕 3. 如果背面有挖空，使用 backClozeInfo
            if (backClozes.length > 0) {
                console.log('[SiYuanMemo][AutoCard] Detected back clozes in bidirectional card:', backClozes.length);
                
                const result = await xiuyuanAppService.createFromBlocks({
                    blockIds: [blockId],
                    templateId: 'builtin-quick-card',
                    fieldMapping: { content: blockId },
                    deckId: BUILTIN_DECK_ID,
                    backClozeInfo: {
                        originalContent: `${term} <> ${definition}`,
                        front: term,
                        back: definition,
                        clozes: backClozes,
                        direction: 'both',  // 双向卡片
                        symbol: '<>'
                    }
                });
                
                if (!result.ok) {
                    throw new Error(`Failed to create bidirectional card with back cloze: ${result.error?.message}`);
                }
                
                const totalCards = backClozes.length + 1;  // 正向N张 + 反向1张
                const { pushMsg } = await import('@/core/siyuan/api');
                await pushMsg(`✅ 已创建双向卡片 (<>) - 共 ${totalCards} 张（背面挖空）`);
                return;
            }
            
            // 4. 否则使用原有逻辑创建双向卡片
            const result = await xiuyuanAppService.createFromBlocks({
                blockIds: [blockId],  // 只有一个块
                templateId: 'builtin-bidirectional-single',  // 🔧 使用双向卡片模板
                fieldMapping: {
                    content: blockId  // content 字段映射到当前块
                },
                deckId: BUILTIN_DECK_ID,
            });
            
            if (!result.ok) {
                throw new Error('Failed to create bidirectional card via Xiuyuan');
            }
            
            console.log('[SiYuanMemo][AutoCard] Bidirectional card created via Xiuyuan:', {
                xiuyuanID: result.value.xiuyuan.id,
                cardCount: result.value.cards.length,
                blockId
            });
            
            // 5. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            await pushMsg(`✅ 已创建双向卡片 (<>) - 共 ${result.value.cards.length} 张卡片`);
        } catch (error) {
            console.error('[SiYuanMemo][AutoCard] Failed to create bidirectional card:', blockId, error);
            const { pushErrMsg } = await import('@/core/siyuan/api');
            await pushErrMsg(`创建双向卡片失败：${error.message}`);
        }
    }
    
    /**
     * 创建概念卡片（:: 或 ：：）
     * 
     * @param blockId 块 ID
     * @param content 块内容
     * @param actualSymbol 实际使用的符号（如 '::' 或 '：：'）
     * @param direction 卡片方向：'both' 双向（默认），'forward' 仅正向，'reverse' 仅反向
     */
    private async createConceptCard(
        blockId: string, 
        content: string, 
        actualSymbol?: string,
        direction: 'both' | 'forward' | 'reverse' = 'both'
    ): Promise<void> {
        try {
            console.log('[SiYuanMemo][AutoCard] Creating concept card:', blockId, 'symbol:', actualSymbol, 'direction:', direction);
            
            // 1. 检查是否是块引用格式：((block-id))::定义
            // 根据方向使用不同的正则
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
                // ✅ 块引用格式：[[概念]]::定义
                const refId = blockRefMatch[1];
                const definition = blockRefMatch[3].trim();
                
                console.log('[SiYuanMemo][AutoCard] Detected block reference format:', refId, definition);
                
                // 检查块引用是否指向文档块
                const { sql } = await import('@/core/siyuan/api');
                const blockTypeQuery = `
                    SELECT type, content 
                    FROM blocks 
                    WHERE id = '${refId}' 
                    LIMIT 1
                `;
                const typeResult = await sql(blockTypeQuery);
                
                if (!typeResult || typeResult.length === 0) {
                    console.error('[SiYuanMemo][AutoCard] Block reference not found:', refId);
                    return;
                }
                
                if (typeResult[0].type !== 'd') {
                    console.log('[SiYuanMemo][AutoCard] Block reference is not a document block, skipping:', refId);
                    const { pushErrMsg } = await import('@/core/siyuan/api');
                    await pushErrMsg('❌ 概念定义卡要求引用文档块，当前引用的不是文档块');
                    return;
                }
                
                const conceptName = typeResult[0].content;
                console.log('[SiYuanMemo][AutoCard] Concept name from document block:', conceptName);
                
                // ✅ 检测定义中是否包含挖空标记
                const clozePattern = /==(.+?)==|\{\{(.+?)\}\}/g;
                const clozes = [...definition.matchAll(clozePattern)];
                
                console.log('[SiYuanMemo][AutoCard] Detected clozes in definition:', clozes.length);
                
                // 使用 Xiuyuan 创建概念定义卡片
                const xiuyuanAppService = await this.getXiuyuanApplicationService();
                if (!xiuyuanAppService) {
                    console.error('[SiYuanMemo][AutoCard] XiuyuanApplicationService not available');
                    return;
                }
                
                const { BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
                
                if (clozes.length > 0) {
                    // ✅ 有挖空：根据方向生成对应的卡片
                    console.log('[SiYuanMemo][AutoCard] Creating multi-cloze concept definition cards, direction:', direction);
                    
                    // 动态生成 cardRules（根据方向）
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
                    
                    // 创建临时模板
                    const directionSuffix = direction === 'both' ? 'both' : direction === 'forward' ? 'fwd' : 'rev';
                    const tempTemplateId = `cd-cloze-${directionSuffix}-${blockId.slice(-7)}`;  // 使用短 ID
                    const tempTemplate = {
                        id: tempTemplateId,
                        name: '概念定义（多挖空-双向）',
                        description: '概念定义卡片，支持多个挖空，每个挖空生成双向卡片',
                        fields: [
                            { name: 'concept', description: '概念块' },
                            { name: 'definition', description: '定义块（包含挖空）' },
                        ],
                        cardRules: dynamicCardRules,
                    };
                    
                    // ✅ 临时注册模板
                    await xiuyuanAppService.createTemplate(tempTemplate);
                    
                    // 创建卡片
                    const result = await xiuyuanAppService.createFromBlocks({
                        blockIds: [blockId, refId],  // 定义块在前，概念块在后
                        templateId: tempTemplateId,
                        fieldMapping: {
                            concept: refId,
                            definition: blockId
                        },
                        deckId: BUILTIN_DECK_ID
                    });
                    
                    if (!result.ok) {
                        const error = (result as { ok: false; error: Error }).error;
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        console.error('[SiYuanMemo][AutoCard] Failed to create multi-cloze concept card:', errorMsg);
                        return;
                    }
                    
                    console.log('[SiYuanMemo][AutoCard] Created', clozes.length * 2, 'concept definition cards (bidirectional with cloze)');
                    
                } else {
                    // ✅ 无挖空：根据方向选择预定义模板
                    console.log('[SiYuanMemo][AutoCard] Creating concept definition card, direction:', direction);
                    console.log('[SiYuanMemo][AutoCard] blockIds order:', [blockId, refId], 'definition first, concept second');
                    
                    let templateId: string;
                    let cardCount: number;
                    
                    if (direction === 'both') {
                        // 双向：使用标准模板
                        templateId = 'builtin-concept-definition';
                        cardCount = 2;
                    } else if (direction === 'forward') {
                        // 仅正向：使用预定义模板
                        templateId = 'builtin-concept-definition-forward';
                        cardCount = 1;
                    } else {
                        // 仅反向：使用预定义模板
                        templateId = 'builtin-concept-definition-reverse';
                        cardCount = 1;
                    }
                    
                    const result = await xiuyuanAppService.createFromBlocks({
                        blockIds: [blockId, refId],  // 定义块在前，概念块在后
                        templateId: templateId,  // 使用选择的模板
                        fieldMapping: {
                            concept: refId,
                            definition: blockId
                        },
                        deckId: BUILTIN_DECK_ID,
                        cardType: 'descriptor'  // 🆕 概念定义卡的类型是 descriptor
                    });
                    
                    if (!result.ok) {
                        const error = (result as { ok: false; error: Error }).error;
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        console.error('[SiYuanMemo][AutoCard] Failed to create Xiuyuan concept card:', errorMsg);
                        return;
                    }
                    
                    console.log('[SiYuanMemo][AutoCard] Created', cardCount, 'concept definition card(s)');
                }
                
                // 标记定义块为 descriptor 卡类型（概念定义卡本质是描述符卡）
                const { setBlockAttrs } = await import('@/core/siyuan/api');
                await setBlockAttrs(blockId, {
                    'custom-fsrs-card-type': 'descriptor'
                });
                
                console.log('[SiYuanMemo][AutoCard] Concept definition card created successfully:', blockId);
                
                // 🆕 自动为概念文档块创建概念卡（如果还不是卡片）
                console.log('[SiYuanMemo][AutoCard] About to ensure concept document card for:', refId, conceptName);
                await this.ensureConceptDocumentCard(refId, conceptName);
                console.log('[SiYuanMemo][AutoCard] Finished ensuring concept document card');
                
                const { pushMsg } = await import('@/core/siyuan/api');
                const directionText = direction === 'both' ? '双向' : direction === 'forward' ? '正向' : '反向';
                let message: string;
                if (clozes.length > 0) {
                    const totalCards = direction === 'both' ? clozes.length * 2 : clozes.length;
                    message = `✅ 已创建 ${totalCards} 张概念定义卡片（${directionText}+挖空）`;
                } else {
                    const cardCount = direction === 'both' ? 2 : 1;
                    message = `✅ 已创建 ${cardCount} 张概念定义卡片（${directionText}）`;
                }
                await pushMsg(message);
                
            } else {
                // ❌ 不是块引用格式，提示错误
                console.log('[SiYuanMemo][AutoCard] Not a valid block reference format, skipping');
                const { pushErrMsg } = await import('@/core/siyuan/api');
                await pushErrMsg('❌ 概念定义卡格式错误：需要使用 [[概念]]::定义 格式，且概念必须是文档块引用');
            }
        } catch (error) {
            console.error('[SiYuanMemo][AutoCard] Failed to create concept card:', blockId, error);
            const { pushErrMsg } = await import('@/core/siyuan/api');
            await pushErrMsg(`创建概念卡片失败：${error.message}`);
        }
    }
    
    /**
     * 创建描述符卡片（;; 或 ；；）
     * 
     * @param blockId 块 ID
     * @param content 块内容
     * @param actualSymbol 实际使用的符号（如 ';;' 或 '；；'）
     * @param direction 卡片方向：'forward' 仅正向，'reverse' 仅反向，'both' 双向
     */
    private async createDescriptorCard(
        blockId: string, 
        content: string, 
        actualSymbol?: string,
        direction: 'forward' | 'reverse' | 'both' = 'forward'
    ): Promise<void> {
        try {
            console.log('[SiYuanMemo][AutoCard] Creating descriptor card:', blockId, 'symbol:', actualSymbol, 'direction:', direction);
            
            // 1. 解析属性和描述（根据不同的符号使用不同的正则）
            let match: RegExpMatchArray | null = null;
            if (direction === 'both') {
                match = content.match(this.patterns.descriptorBoth);
            } else if (direction === 'reverse') {
                match = content.match(this.patterns.descriptorReverse);
            } else {
                match = content.match(this.patterns.descriptor);
            }
            
            if (!match) {
                console.error('[SiYuanMemo][AutoCard] Failed to parse descriptor card content:', content);
                return;
            }
            
            const attribute = match[1].trim();
            const description = match[3].trim();  // 调整索引：match[2]是符号，match[3]是描述
            
            if (!attribute || !description) {
                console.error('[SiYuanMemo][AutoCard] Empty attribute or description:', content);
                return;
            }
            
            // 2. ✅ 检查是否有列表项父级
            const hasListParent = await this.hasListItemParent(blockId);
            console.log('[SiYuanMemo][AutoCard] Has list item parent:', hasListParent);
            
            let foundConceptId: string | null = null;
            
            if (hasListParent) {
                // 情况 A：有列表项父级，正常向上探索（最多 4 层）
                console.log('[SiYuanMemo][AutoCard] Case A: Has list parent, searching ancestors...');
                foundConceptId = await this.findConceptInAncestors(blockId, 4);
            } else {
                // 情况 B：无列表项父级，查找最近的标题块或文档块
                console.log('[SiYuanMemo][AutoCard] Case B: No list parent, searching heading/document...');
                foundConceptId = await this.findConceptWithoutListParent(blockId);
            }
            
            if (!foundConceptId) {
                console.log('[SiYuanMemo][AutoCard] No concept card found, creating as basic card');
                // 降级为普通卡片
                await this.createBasicCardFromDescriptor(blockId, attribute, description, actualSymbol);
                return;
            }
            console.log('[SiYuanMemo][AutoCard] Found concept card:', foundConceptId, ', creating Xiuyuan descriptor card');
            
            // 3. 使用 Xiuyuan 创建描述符卡片
            const xiuyuanAppService = await this.getXiuyuanApplicationService();
            if (!xiuyuanAppService) {
                console.error('[SiYuanMemo][AutoCard] XiuyuanApplicationService not available, falling back to basic card');
                await this.createBasicCardFromDescriptor(blockId, attribute, description, actualSymbol);
                return;
            }
            
            const { BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            
            // 4. 根据方向选择预定义模板
            let templateId: string;
            let cardCount: number;
            
            if (direction === 'forward') {
                // 仅正向：使用现有模板
                templateId = 'builtin-concept-descriptor';
                cardCount = 1;
            } else if (direction === 'reverse') {
                // 仅反向：使用预定义模板
                templateId = 'builtin-concept-descriptor-reverse';
                cardCount = 1;
            } else {
                // 双向：使用预定义模板
                templateId = 'builtin-concept-descriptor-both';
                cardCount = 2;
            }
            
            // 5. 🔧 再次检查是否已经创建（避免竞态条件）
            const { getBlockAttrs: getAttrs } = await import('@/core/siyuan/api');
            const currentAttrs = await getAttrs(blockId);
            if (currentAttrs && (currentAttrs['custom-xiuyuan-id'] || currentAttrs['custom-fsrs-xiuyuan-id'])) {
                console.log('[SiYuanMemo][AutoCard] Block already has Xiuyuan card (race condition detected), skipping:', blockId);
                return;
            }
            
            // 6. 创建卡片
            const result = await xiuyuanAppService.createFromBlocks({
                blockIds: [foundConceptId, blockId],
                templateId: templateId,
                fieldMapping: {
                    concept: foundConceptId,
                    descriptor: blockId
                },
                deckId: BUILTIN_DECK_ID,
                cardType: 'descriptor'
            });
            
            if (!result.ok) {
                const error = (result as { ok: false; error: Error }).error;
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error('[SiYuanMemo][AutoCard] Failed to create Xiuyuan descriptor card:', errorMsg);
                // 降级为普通卡片
                await this.createBasicCardFromDescriptor(blockId, attribute, description, actualSymbol);
                return;
            }
            
            console.log('[SiYuanMemo][AutoCard] Descriptor card created successfully:', blockId);
            
            // 7. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            const directionText = direction === 'forward' ? '正向' : direction === 'reverse' ? '反向' : '双向';
            await pushMsg(`✅ 已创建${cardCount}张描述符卡片（${directionText}）`);
        } catch (error) {
            console.error('[SiYuanMemo][AutoCard] Failed to create descriptor card:', blockId, error);
            const { pushErrMsg } = await import('@/core/siyuan/api');
            await pushErrMsg(`创建描述符卡片失败：${error.message}`);
        }
    }
    
    /**
     * 创建普通卡片（从描述符降级）
     * 
     * @param blockId 块 ID
     * @param attribute 属性
     * @param description 描述
     * @param actualSymbol 实际使用的符号（如 ';;' 或 '；；'）
     */
    private async createBasicCardFromDescriptor(blockId: string, attribute: string, description: string, actualSymbol?: string): Promise<void> {
        try {
            console.log('[SiYuanMemo][AutoCard] Creating basic card from descriptor:', blockId, 'symbol:', actualSymbol);
            
            // 1. 使用 CardCreationHelper 创建符号检测卡
            const helper = this.getCardHelper();
            if (!helper) {
                console.error('[SiYuanMemo][AutoCard] CardCreationHelper not available');
                const { pushErrMsg } = await import('@/core/siyuan/api');
                await pushErrMsg('卡片创建服务不可用');
                return;
            }
            
            const result = await helper.createSymbolCard(blockId, {
                cardType: 'descriptor',  // 🆕 明确指定为 descriptor 类型
                metadata: {
                    direction: 'forward',
                    question: attribute,
                    answer: description,
                    cardSource: 'quick-symbol',
                    symbolType: actualSymbol || ';;',
                    degradedFromDescriptor: true
                }
            });
            
            if (!result.ok) {
                throw new Error(`Failed to create symbol card: ${result.error}`);
            }
            
            const card = result.value;
            
            // 2. 添加到 Riff 卡组
            const { addRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            await addRiffCards(BUILTIN_DECK_ID, [blockId]);
            
            // 3. 标记 FSRS 属性（cardType 已经在创建时设置为 descriptor）
            const { markBlockAsCard } = await import('@/core/siyuan/block');
            await markBlockAsCard(blockId, card.id, card.priority, 'descriptor');
            
            console.log('[SiYuanMemo][AutoCard] Basic card created from descriptor:', blockId);
            
            // 6. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            await pushMsg(`✅ 已创建卡片 (;;), 父块非概念，已降级为普通卡片`);
        } catch (error) {
            console.error('[SiYuanMemo][AutoCard] Failed to create basic card from descriptor:', blockId, error);
            throw error;
        }
    }
    
    /**
     * 创建填空卡片（{{}} 或 ==）
     * 
     * 如果有多个填空，使用 Xiuyuan 系统创建多张卡片
     * 
     * @param blockId 块 ID
     * @param content 块内容
     */
    private async createClozeCard(blockId: string, content: string): Promise<void> {
        try {
            console.log('[SiYuanMemo][AutoCard] Creating cloze card:', blockId);
            
            // 1. 提取所有填空（支持 {{}}、== 和思源标记）
            const clozes: Array<{ text: string; type: 'brace' | 'equal' | 'mark' }> = [];
            
            // 提取 {{}} 填空
            let match;
            this.patterns.cloze.lastIndex = 0;
            while ((match = this.patterns.cloze.exec(content)) !== null) {
                clozes.push({
                    text: match[1].trim(),
                    type: 'brace'
                });
            }
            
            // 提取 == 填空
            this.patterns.clozeEqual.lastIndex = 0;
            while ((match = this.patterns.clozeEqual.exec(content)) !== null) {
                clozes.push({
                    text: match[1].trim(),
                    type: 'equal'
                });
            }
            
            // 提取思源标记填空
            this.patterns.clozeMark.lastIndex = 0;
            while ((match = this.patterns.clozeMark.exec(content)) !== null) {
                clozes.push({
                    text: match[1].trim(),
                    type: 'mark'
                });
            }
            
            if (clozes.length === 0) {
                console.error('[SiYuanMemo][AutoCard] No cloze found in content:', content);
                return;
            }
            
            console.log('[SiYuanMemo][AutoCard] Found clozes:', clozes.length, clozes);
            
            // 2. 如果只有一个填空，创建单张卡片
            if (clozes.length === 1) {
                await this.createSingleClozeCard(blockId, content, clozes);
                return;
            }
            
            // 3. 多个填空：使用 Xiuyuan 创建多张卡片
            await this.createMultipleClozeCards(blockId, content, clozes);
        } catch (error) {
            console.error('[SiYuanMemo][AutoCard] Failed to create cloze card:', blockId, error);
            const { pushErrMsg } = await import('@/core/siyuan/api');
            await pushErrMsg(`创建填空卡片失败：${error.message}`);
        }
    }
    
    /**
     * 创建单张填空卡片
     */
    private async createSingleClozeCard(
        blockId: string,
        content: string,
        clozes: Array<{ text: string; type: 'brace' | 'equal' | 'mark' }>
    ): Promise<void> {
        // 使用 CardCreationHelper 创建快速卡片
        const helper = this.getCardHelper();
        if (!helper) {
            console.error('[SiYuanMemo][AutoCard] CardCreationHelper not available');
            const { pushErrMsg } = await import('@/core/siyuan/api');
            await pushErrMsg('卡片创建服务不可用');
            return;
        }
        
        const result = await helper.createQuickCard(blockId, {
            metadata: {
                clozes: clozes.map(c => c.text),
                clozeCount: 1,
                cardSource: 'quick-symbol',
                symbolType: clozes[0].type === 'brace' ? '{{}}' : (clozes[0].type === 'equal' ? '==' : 'mark')
            }
        });
        
        if (!result.ok) {
            console.error('[SiYuanMemo][AutoCard] Failed to create cloze card:', result.error);
            const { pushErrMsg } = await import('@/core/siyuan/api');
            await pushErrMsg(`创建填空卡片失败：${result.error}`);
            return;
        }
        
        const card = result.value;
        
        // 添加到 Riff 卡组
        const { addRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
        await addRiffCards(BUILTIN_DECK_ID, [blockId]);
        
        // 标记 FSRS 属性
        const { markBlockAsCard } = await import('@/core/siyuan/block');
        await markBlockAsCard(blockId, card.id, card.priority, 'item');
        
        console.log('[SiYuanMemo][AutoCard] Single cloze card created:', blockId);
        
        // 显示成功提示
        const { pushMsg } = await import('@/core/siyuan/api');
        const symbolText = clozes[0].type === 'brace' ? '{{}}' : (clozes[0].type === 'equal' ? '==' : '标记');
        await pushMsg(`✅ 已创建填空卡片 (${symbolText})`);
    }
    
    /**
     * 创建多张填空卡片（使用 Xiuyuan）
     * 
     * 使用 builtin-multi-cloze 模板，每个填空生成一张独立的卡片
     */
    private async createMultipleClozeCards(
        blockId: string,
        content: string,
        clozes: Array<{ text: string; type: 'brace' | 'equal' }>
    ): Promise<void> {
        const xiuyuanAppService = await this.getXiuyuanApplicationService();
        if (!xiuyuanAppService) {
            console.error('[SiYuanMemo][AutoCard] XiuyuanApplicationService not available, creating single card');
            await this.createSingleClozeCard(blockId, content, clozes);
            return;
        }
        
        try {
            // 使用 builtin-multi-cloze 模板
            const { BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            
            // ✅ 提取填空的位置信息（需要 start 和 end）
            const clozesWithPosition: Array<{ text: string; start: number; end: number; type: string }> = [];
            
            // 提取 {{}} 填空
            let match;
            const braceRegex = /\{\{([^}]*)\}\}/g;
            while ((match = braceRegex.exec(content)) !== null) {
                clozesWithPosition.push({
                    text: match[1].trim(),
                    start: match.index,
                    end: match.index + match[0].length,
                    type: 'brace'
                });
            }
            
            // 提取 == 填空
            const equalRegex = /==([^=]*)==/g;
            while ((match = equalRegex.exec(content)) !== null) {
                clozesWithPosition.push({
                    text: match[1].trim(),
                    start: match.index,
                    end: match.index + match[0].length,
                    type: 'equal'
                });
            }
            
            // 按位置排序
            clozesWithPosition.sort((a, b) => a.start - b.start);
            
            console.log('[SiYuanMemo][AutoCard] Extracted clozes with positions:', clozesWithPosition);
            
            // ✅ 使用 clozeInfo 参数创建卡片
            const result = await xiuyuanAppService.createFromBlocks({
                blockIds: [blockId],
                templateId: 'builtin-multi-cloze',
                fieldMapping: {
                    content: blockId
                },
                deckId: BUILTIN_DECK_ID,
                clozeInfo: {
                    originalContent: content,
                    clozes: clozesWithPosition
                }
            });
            
            if (!result.ok) {
                console.error('[SiYuanMemo][AutoCard] Failed to create Xiuyuan cloze cards, falling back to single card');
                await this.createSingleClozeCard(blockId, content, clozes);
                return;
            }
            
            console.log('[SiYuanMemo][AutoCard] Multiple cloze cards created:', blockId, 'count:', result.value.cards.length);
            
            // 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            const hasEqual = clozes.some(c => c.type === 'equal');
            const hasBrace = clozes.some(c => c.type === 'brace');
            let symbolText = '';
            if (hasEqual && hasBrace) {
                symbolText = '{{}} / ==';
            } else if (hasEqual) {
                symbolText = '==';
            } else {
                symbolText = '{{}}';
            }
            await pushMsg(`✅ 已创建 ${clozes.length} 张填空卡片 (${symbolText})`);
        } catch (error) {
            console.error('[SiYuanMemo][AutoCard] Error creating multiple cloze cards:', error);
            await this.createSingleClozeCard(blockId, content, clozes);
        }
    }
    
    /**
     * 创建列表模版卡片（>>> + 子列表项）
     * 
     * @param blockId 块 ID
     * @param children 子列表项
     */
    private async createListTemplateCards(blockId: string, children: any[]): Promise<void> {
        try {
            console.log('[SiYuanMemo][AutoCard] Creating list template cards:', blockId, 'children:', children.length);
            
            // 1. 检查是否已制卡
            const cardService = this.getCardService();
            let existingCard = null;
            
            if (cardService) {
                existingCard = cardService.getCardByBlockId(blockId);
            } else {
                existingCard = this.storage.getCardByBlockId(blockId);
            }
            
            if (existingCard) {
                console.log('[SiYuanMemo][AutoCard] Block already has card:', blockId);
                return;
            }
            
            // 2. 获取父块内容（问题）
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            const { kramdown: parentContent } = await getBlockKramdown(blockId);
            if (!parentContent) {
                console.error('[SiYuanMemo][AutoCard] Parent block has no content:', blockId);
                return;
            }
            
            // 提取问题（去掉 >>> 符号）
            const questionMatch = parentContent.match(this.patterns.multiLine);
            if (!questionMatch) {
                console.error('[SiYuanMemo][AutoCard] Failed to parse list template question:', parentContent);
                return;
            }
            // Note: question is extracted but not used directly, as it's part of the parent block
            
            // 3. 解析子列表项（支持 -> 分隔提示和答案）
            const childBlocks = [];
            for (const child of children) {
                const { kramdown: childContent } = await getBlockKramdown(child.id);
                if (!childContent) continue;
                
                // 检查是否使用 -> 分隔符
                const cueMatch = childContent.match(this.patterns.listCue);
                if (cueMatch) {
                    // 使用 -> 分隔：提示 -> 答案
                    childBlocks.push({
                        id: child.id,
                        cue: cueMatch[1].trim(),
                        answer: cueMatch[2].trim()
                    });
                } else {
                    // 没有分隔符，整个内容作为答案
                    childBlocks.push({
                        id: child.id,
                        cue: '',
                        answer: childContent.trim()
                    });
                }
            }
            
            if (childBlocks.length < 2) {
                console.error('[SiYuanMemo][AutoCard] Not enough valid child blocks:', blockId);
                return;
            }
            
            console.log('[SiYuanMemo][AutoCard] Parsed child blocks:', childBlocks);
            
            // 4. 使用 Xiuyuan 创建列表模版卡片
            const xiuyuanAppService = await this.getXiuyuanApplicationService();
            if (!xiuyuanAppService) {
                console.error('[SiYuanMemo][AutoCard] XiuyuanApplicationService not available');
                return;
            }
            
            // 准备块 ID 列表（父块 + 子块）
            const blockIDs = [blockId, ...childBlocks.map(c => c.id)];
            
            // 使用 builtin-list-item 模版
            // TODO: Phase 4 Task 14.3 - 迁移到 CardApplicationService
            // 需要先实现模板支持
            const { BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            const result = await xiuyuanAppService.createFromBlocks({
                blockIds: blockIDs,
                templateId: 'builtin-list-item',
                fieldMapping: {
                    question: blockId,
                    items: childBlocks.map(c => c.id).join(',')
                },
                deckId: BUILTIN_DECK_ID
            });
            
            if (!result.ok) {
                const error = (result as { ok: false; error: Error }).error;
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error('[SiYuanMemo][AutoCard] Failed to create Xiuyuan cards:', errorMsg);
                const { pushErrMsg } = await import('@/core/siyuan/api');
                await pushErrMsg(`创建列表模版卡片失败：${errorMsg}`);
                return;
            }
            
            console.log('[SiYuanMemo][AutoCard] List template cards created successfully:', blockId, 'cards:', result.value.cards?.length);
            
            // 5. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            await pushMsg(`✅ 已创建列表模版卡片 (>>>), ${childBlocks.length} 个子项`);
        } catch (error) {
            console.error('[SiYuanMemo][AutoCard] Failed to create list template cards:', blockId, error);
            const { pushErrMsg } = await import('@/core/siyuan/api');
            await pushErrMsg(`创建列表模版卡片失败：${error.message}`);
        }
    }
    
    /**
     * 确保概念文档块有对应的概念卡
     * 如果概念文档块还不是卡片，自动创建 Xiuyuan 概念卡
     * 
     * @param conceptBlockId 概念文档块 ID
     * @param conceptName 概念名称
     */
    private async ensureConceptDocumentCard(conceptBlockId: string, conceptName: string): Promise<void> {
        try {
            console.log('[SiYuanMemo][AutoCard] Ensuring concept document card:', conceptBlockId, conceptName);
            
            const { sql } = await import('@/core/siyuan/api');
            
            // 1. 检查是否已经是卡片
            const cardQuery = `
                SELECT value 
                FROM attributes 
                WHERE block_id = '${conceptBlockId}' 
                  AND name = 'custom-fsrs-card-id'
            `;
            const cardResult = await sql(cardQuery);
            
            if (cardResult && cardResult.length > 0) {
                console.log('[SiYuanMemo][AutoCard] Concept document already has card:', conceptBlockId);
                return;
            }
            
            // 2. 创建 Xiuyuan 概念卡
            const xiuyuanAppService = await this.getXiuyuanApplicationService();
            if (!xiuyuanAppService) {
                console.error('[SiYuanMemo][AutoCard] XiuyuanApplicationService not available');
                return;
            }
            
            const { BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            
            console.log('[SiYuanMemo][AutoCard] Creating Xiuyuan concept card for:', conceptName);
            
            const result = await xiuyuanAppService.createFromBlocks({
                blockIds: [conceptBlockId],
                templateId: 'builtin-concept-simple',
                fieldMapping: {
                    concept: conceptBlockId
                },
                deckId: BUILTIN_DECK_ID
            });
            
            if (!result.ok) {
                const error = (result as { ok: false; error: Error }).error;
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error('[SiYuanMemo][AutoCard] Failed to create concept card:', errorMsg);
                return;
            }
            
            // 3. 标记为概念卡类型
            const { setBlockAttrs } = await import('@/core/siyuan/api');
            await setBlockAttrs(conceptBlockId, {
                'custom-fsrs-card-type': 'concept'
            });
            
            console.log('[SiYuanMemo][AutoCard] Concept card created for document:', conceptBlockId);
            
            const { pushMsg } = await import('@/core/siyuan/api');
            await pushMsg(`✅ 已为概念「${conceptName}」创建概念卡`);
            
        } catch (error) {
            console.error('[SiYuanMemo][AutoCard] Failed to ensure concept document card:', error);
        }
    }
    
    /**
     * 清理资源
     * 
     * 清除所有定时器和队列
     */
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
        
        // 🆕 清理新增的状态
        this.lastEditTime.clear();
        this.currentEditingBlock = null;
        
        console.log('[SiYuanMemo][AutoCard] Handler disposed');
    }

    /**
     * 从块内容中查找概念卡的块引用
     * @param content 块内容（kramdown 格式）
     * @returns 概念卡 ID，如果没找到返回 null
     */
    private async findConceptCardInBlockRef(content: string): Promise<string | null> {
        try {
            // 提取块引用 ID（格式：((20230101120000-abcdefg 'alias')) 或 ((20230101120000-abcdefg))）
            const refPattern = /\(\((\d{14}-[a-z0-9]{7})/g;
            const matches = [...content.matchAll(refPattern)];

            console.log('[SiYuanMemo][AutoCard] Block reference matches:', matches.length);
            
            if (matches.length === 0) {
                return null;
            }

            // 检查每个引用是否是概念卡
            const { sql } = await import('@/core/siyuan/api');
            for (const match of matches) {
                const refId = match[1];
                console.log('[SiYuanMemo][AutoCard] Checking block reference:', refId);
                
                const cardTypeQuery = `
                    SELECT value 
                    FROM attributes 
                    WHERE block_id = '${refId}' 
                      AND name = 'custom-fsrs-card-type'
                `;
                const result = await sql(cardTypeQuery);
                
                console.log('[SiYuanMemo][AutoCard] Block reference card type:', result?.[0]?.value || 'none');
                
                if (result && result.length > 0 && result[0].value === 'concept') {
                    console.log('[SiYuanMemo][AutoCard] Found concept card in block reference:', refId);
                    return refId;
                }
            }

            return null;
        } catch (error) {
            console.error('[SiYuanMemo][AutoCard] Error finding concept card in block ref:', error);
            return null;
        }
    }
    /**
     * 从块引用中查找或创建概念卡
     * 如果块引用不是概念卡，自动将其转换为概念卡
     * 
     * ✅ 新增限制：只处理指向文档块的块引用
     */
    private async findOrCreateConceptFromBlockRef(content: string): Promise<string | null> {
        try {
            // 提取块引用 ID
            const refPattern = /\(\((\d{14}-[a-z0-9]{7})/g;
            const matches = [...content.matchAll(refPattern)];

            console.log('[SiYuanMemo][AutoCard] Block reference matches:', matches.length);
            
            if (matches.length === 0) {
                return null;
            }

            const { sql, setBlockAttrs, getBlockKramdown } = await import('@/core/siyuan/api');
            
            // 检查每个引用
            for (const match of matches) {
                const refId = match[1];
                console.log('[SiYuanMemo][AutoCard] Checking block reference:', refId);
                
                // ✅ 新增：检查块引用是否指向文档块
                const blockTypeQuery = `
                    SELECT type 
                    FROM blocks 
                    WHERE id = '${refId}' 
                    LIMIT 1
                `;
                const typeResult = await sql(blockTypeQuery);
                
                if (!typeResult || typeResult.length === 0 || typeResult[0].type !== 'd') {
                    console.log('[SiYuanMemo][AutoCard] Block reference is not a document block, skipping:', refId);
                    continue;  // 跳过非文档块的引用
                }
                
                console.log('[SiYuanMemo][AutoCard] Block reference is a document block:', refId);
                
                // 检查是否已经是概念卡
                const cardTypeQuery = `
                    SELECT value 
                    FROM attributes 
                    WHERE block_id = '${refId}' 
                      AND name = 'custom-fsrs-card-type'
                `;
                const result = await sql(cardTypeQuery);
                
                if (result && result.length > 0 && result[0].value === 'concept') {
                    console.log('[SiYuanMemo][AutoCard] Found existing concept card:', refId);
                    return refId;
                }
                
                // 不是概念卡，检查是否包含概念符号
                const { kramdown: refContent } = await getBlockKramdown(refId);
                if (refContent && this.patterns.concept.test(refContent)) {
                    console.log('[SiYuanMemo][AutoCard] Block has concept symbol, already a concept:', refId);
                    return refId;
                }
                
                // 自动将块引用标记为概念卡（不创建实际卡片，只标记类型）
                console.log('[SiYuanMemo][AutoCard] Auto-marking block as concept card:', refId);
                
                // 获取块内容作为概念名称
                const blockQuery = `SELECT content FROM blocks WHERE id = '${refId}' LIMIT 1`;
                const blockResult = await sql(blockQuery);
                
                if (!blockResult || blockResult.length === 0) {
                    console.warn('[SiYuanMemo][AutoCard] Block not found:', refId);
                    continue;
                }
                
                const conceptName = blockResult[0].content;
                console.log('[SiYuanMemo][AutoCard] Marking as concept card:', conceptName);
                
                // 标记为概念卡
                await setBlockAttrs(refId, {
                    'custom-fsrs-card-type': 'concept'
                });
                
                console.log('[SiYuanMemo][AutoCard] Successfully marked as concept card:', refId);
                
                // ✅ 创建空概念卡（使用 CardCreationHelper）
                try {
                    const helper = this.getCardHelper();
                    if (!helper) {
                        console.error('[SiYuanMemo][AutoCard] CardCreationHelper not available');
                        continue;
                    }
                    
                    const result = await helper.createConceptCard(refId, {
                        metadata: {
                            concept: conceptName,
                            cardSource: 'auto-concept',
                            hasDefinition: false  // 标记为空概念卡
                        }
                    });
                    
                    if (!result.ok) {
                        console.error('[SiYuanMemo][AutoCard] Failed to create empty concept card:', result.error);
                        continue;
                    }
                    
                    const card = result.value;
                    
                    // 添加到 Riff 卡组
                    const { addRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
                    await addRiffCards(BUILTIN_DECK_ID, [refId]);
                    
                    // 标记 FSRS 属性
                    const { markBlockAsCard } = await import('@/core/siyuan/block');
                    await markBlockAsCard(refId, card.id, card.priority, 'topic');
                    
                    console.log('[SiYuanMemo][AutoCard] Empty concept card created:', refId);
                } catch (error) {
                    console.error('[SiYuanMemo][AutoCard] Failed to create empty concept card:', error);
                }
                
                // 显示提示
                const { pushMsg } = await import('@/core/siyuan/api');
                await pushMsg(`✅ 自动创建概念卡：${conceptName}`);
                
                return refId;
            }

            return null;
        } catch (error) {
            console.error('[SiYuanMemo][AutoCard] Error finding/creating concept from block ref:', error);
            return null;
        }
    }
    
    /**
     * 检查块是否有列表项块父级
     * @param blockId 块 ID
     * @returns 是否有列表项父级
     */
    private async hasListItemParent(blockId: string): Promise<boolean> {
        const { sql } = await import('@/core/siyuan/api');
        
        let currentId = blockId;
        const maxDepth = 10;  // 向上查找最多 10 层
        
        for (let depth = 0; depth < maxDepth; depth++) {
            const query = `
                SELECT parent_id 
                FROM blocks 
                WHERE id = '${currentId}' 
                LIMIT 1
            `;
            const result = await sql(query);
            
            if (!result || result.length === 0 || !result[0]?.parent_id) {
                break;
            }
            
            const parentId = result[0].parent_id;
            
            // 查询父块类型
            const parentQuery = `
                SELECT type 
                FROM blocks 
                WHERE id = '${parentId}' 
                LIMIT 1
            `;
            const parentResult = await sql(parentQuery);
            
            if (parentResult && parentResult.length > 0) {
                const parentType = parentResult[0].type;
                
                // 如果是列表项块，返回 true
                if (parentType === 'i') {
                    console.log('[SiYuanMemo][AutoCard] Found list item parent at depth', depth, ':', parentId);
                    return true;
                }
                
                // 如果到达文档块，停止查找
                if (parentType === 'd') {
                    console.log('[SiYuanMemo][AutoCard] Reached document block without finding list parent');
                    break;
                }
            }
            
            currentId = parentId;
        }
        
        return false;
    }
    
    /**
     * 无列表项父级时查找概念卡
     * 规则：
     * 1. 向上查找最近的标题块 (type='h') → 标题块作为概念卡
     * 2. 如果没有标题块 → 文档块 (type='d') 作为概念卡
     * 
     * @param blockId 块 ID
     * @returns 概念卡 ID
     */
    private async findConceptWithoutListParent(blockId: string): Promise<string | null> {
        const { sql, setBlockAttrs } = await import('@/core/siyuan/api');
        
        let currentId = blockId;
        let firstHeadingId: string | null = null;
        let documentId: string | null = null;
        const maxDepth = 20;  // 向上查找最多 20 层
        
        for (let depth = 0; depth < maxDepth; depth++) {
            const query = `
                SELECT parent_id 
                FROM blocks 
                WHERE id = '${currentId}' 
                LIMIT 1
            `;
            const result = await sql(query);
            
            if (!result || result.length === 0 || !result[0]?.parent_id) {
                break;
            }
            
            const parentId = result[0].parent_id;
            
            // 查询父块类型
            const parentQuery = `
                SELECT type, content 
                FROM blocks 
                WHERE id = '${parentId}' 
                LIMIT 1
            `;
            const parentResult = await sql(parentQuery);
            
            if (parentResult && parentResult.length > 0) {
                const parentType = parentResult[0].type;
                const parentContent = parentResult[0].content;
                
                // 记录第一个标题块
                if (parentType === 'h' && !firstHeadingId) {
                    firstHeadingId = parentId;
                    console.log('[SiYuanMemo][AutoCard] Found first heading block:', parentId, parentContent);
                }
                
                // 记录文档块
                if (parentType === 'd') {
                    documentId = parentId;
                    console.log('[SiYuanMemo][AutoCard] Found document block:', parentId);
                    break;  // 到达文档块，停止查找
                }
            }
            
            currentId = parentId;
        }
        
        // 决定使用哪个作为概念卡
        let conceptId: string | null = null;
        let conceptType: 'heading' | 'document' | null = null;
        
        if (firstHeadingId) {
            conceptId = firstHeadingId;
            conceptType = 'heading';
            console.log('[SiYuanMemo][AutoCard] Using heading block as concept card:', conceptId);
        } else if (documentId) {
            conceptId = documentId;
            conceptType = 'document';
            console.log('[SiYuanMemo][AutoCard] Using document block as concept card:', conceptId);
        }
        
        if (!conceptId) {
            console.warn('[SiYuanMemo][AutoCard] No concept block found (no heading or document)');
            return null;
        }
        
        // 标记为概念卡
        await setBlockAttrs(conceptId, {
            'custom-fsrs-card-type': 'concept'
        });
        
        // ✅ 创建空概念卡（使用 CardCreationHelper）
        try {
            // 获取概念名称
            const blockQuery = `SELECT content FROM blocks WHERE id = '${conceptId}' LIMIT 1`;
            const blockResult = await sql(blockQuery);
            const conceptName = blockResult && blockResult.length > 0 ? blockResult[0].content : '未知概念';
            
            const helper = this.getCardHelper();
            if (!helper) {
                console.error('[SiYuanMemo][AutoCard] CardCreationHelper not available');
                return null;
            }
            
            const result = await helper.createConceptCard(conceptId, {
                metadata: {
                    concept: conceptName,
                    cardSource: 'auto-concept',
                    hasDefinition: false  // 标记为空概念卡
                }
            });
            
            if (!result.ok) {
                console.error('[SiYuanMemo][AutoCard] Failed to create empty concept card:', result.error);
                return null;
            }
            
            const card = result.value;
            
            // 添加到 Riff 卡组
            const { addRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            await addRiffCards(BUILTIN_DECK_ID, [conceptId]);
            
            // 标记 FSRS 属性
            const { markBlockAsCard } = await import('@/core/siyuan/block');
            await markBlockAsCard(conceptId, card.id, card.priority, 'topic');
            
            console.log('[SiYuanMemo][AutoCard] Empty concept card created:', conceptId);
        } catch (error) {
            console.error('[SiYuanMemo][AutoCard] Failed to create empty concept card:', error);
        }
        
        // 显示提示
        const { pushMsg } = await import('@/core/siyuan/api');
        const conceptTypeName = conceptType === 'heading' ? '标题块' : '文档块';
        await pushMsg(`✅ 自动创建概念卡：${conceptTypeName}`);
        
        return conceptId;
    }
    
    /**
     * 在祖先链中查找概念卡（有列表项父级的情况）
     * 
     * ✅ 优化：只识别文档块的块引用，不识别概念符号 ::
     * 
     * 原因：
     * - 概念符号 :: 是用来创建概念定义卡的，不是用来标识概念的
     * - 描述符卡应该关联到概念文档（文档块），而不是定义块
     * - 语义更清晰，逻辑更简单
     * 
     * @param blockId 块 ID
     * @param maxDepth 最大深度
     * @returns 概念卡 ID（文档块）
     */
    private async findConceptInAncestors(blockId: string, maxDepth: number): Promise<string | null> {
        const { sql, getBlockKramdown } = await import('@/core/siyuan/api');
        
        let currentId = blockId;
        
        for (let depth = 0; depth < maxDepth; depth++) {
            const parentQuery = `SELECT parent_id FROM blocks WHERE id = '${currentId}' LIMIT 1`;
            const parentResult = await sql(parentQuery);
            
            if (!parentResult || parentResult.length === 0 || !parentResult[0]?.parent_id) {
                console.log(`[SiYuanMemo][AutoCard] No parent at depth ${depth}`);
                break;
            }
            
            const parentId = parentResult[0].parent_id;
            console.log(`[SiYuanMemo][AutoCard] Checking parent at depth ${depth}:`, parentId);
            
            // 检查父块内容
            const { kramdown: parentContent } = await getBlockKramdown(parentId);
            console.log(`[SiYuanMemo][AutoCard] Parent content at depth ${depth}:`, parentContent?.substring(0, 100));
            
            if (parentContent) {
                // ✅ 优先检查是否包含 :: 符号（直接的概念卡）
                if (this.patterns.concept.test(parentContent)) {
                    console.log(`[SiYuanMemo][AutoCard] Found concept card with :: symbol at depth ${depth}:`, parentId);
                    
                    // 检查是否已经标记为概念卡
                    const cardTypeQuery = `
                        SELECT value 
                        FROM attributes 
                        WHERE block_id = '${parentId}' 
                          AND name = 'custom-fsrs-card-type'
                    `;
                    const typeResult = await sql(cardTypeQuery);
                    
                    if (typeResult && typeResult.length > 0 && typeResult[0].value === 'concept') {
                        console.log(`[SiYuanMemo][AutoCard] Parent is already marked as concept card`);
                        return parentId;
                    }
                    
                    // 如果还没有标记，说明概念卡还没创建，返回 null 让它先创建概念卡
                    console.log(`[SiYuanMemo][AutoCard] Parent has :: symbol but not yet created as concept card`);
                    return null;
                }
                
                // ✅ 其次检查块引用（必须指向文档块）
                console.log(`[SiYuanMemo][AutoCard] Checking for block reference at depth ${depth}...`);
                const refResult = await this.findOrCreateConceptFromBlockRef(parentContent);
                if (refResult) {
                    console.log(`[SiYuanMemo][AutoCard] Found/created concept card from reference at depth ${depth}:`, refResult);
                    return refResult;
                }
            }
            
            currentId = parentId;
        }
        
        return null;
    }
}
