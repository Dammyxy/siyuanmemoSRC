﻿/**
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

import type { ITransactionHandler, Transaction } from '../TransactionWebSocketService';
import type FSRSPlugin from '@/index';
import { getBlockKramdown, sql } from '@/core/siyuan/api';

/**
 * 自动制卡处理器（统一版）
 * 
 * 监听块内容变化，检测快速制卡符号，创建对应类型的卡片
 */
export class AutoCardHandler implements ITransactionHandler {
    private plugin: FSRSPlugin;
    
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
        concept: /^(.+?)\s*(::|：：)\s*(.+)$/,         // 概念 :: 或 ：： 定义
        descriptor: /^(.+?)\s*(;;|；；)\s*(.+)$/,      // 属性 ;; 或 ；； 描述
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
        console.log('[SiyuanMemo][AutoCard] Handler initialized');
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
        const quickCardSettings = this.plugin.storage.getSettings().quickCard;
        if (!quickCardSettings?.enabled) {
            return;
        }
        
        for (const tx of transactions) {
            if (!tx.doOperations) continue;
            
            for (const op of tx.doOperations) {
                const blockId = op.id;
                
                // 只处理 insert 和 update 操作
                if (op.action === 'update' || op.action === 'insert') {
                    // 🆕 检测块失焦事件（切换到其他块）
                    if (this.currentEditingBlock && this.currentEditingBlock !== blockId) {
                        console.log('[SiyuanMemo][AutoCard] Block unfocused:', this.currentEditingBlock);
                        // 立即处理失焦的块
                        this.processBlockImmediately(this.currentEditingBlock);
                    }
                    
                    // 更新当前编辑的块
                    this.currentEditingBlock = blockId;
                    
                    console.log('[SiyuanMemo][AutoCard] Current editing block:', blockId);
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
        const quickCardSettings = this.plugin.storage.getSettings().quickCard;
        const debounceDelay = quickCardSettings?.debounceDelay?.quick || this.QUICK_DEBOUNCE;
        
        // 🆕 如果防抖时间设置为 0，则完全禁用防抖（只依赖失焦检测）
        if (debounceDelay === 0) {
            console.log('[SiyuanMemo][AutoCard] Debounce disabled, only blur detection will trigger');
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
        const quickCardSettings = this.plugin.storage.getSettings().quickCard;
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
        
        console.log('[SiyuanMemo][AutoCard] Processing quick queue, count:', blocks.length);
        
        for (const blockId of blocks) {
            // 避免重复处理
            if (this.processing.has(blockId)) {
                console.log('[SiyuanMemo][AutoCard] Block already processing:', blockId);
                continue;
            }
            
            this.processing.add(blockId);
            
            try {
                await this.checkQuickSymbols(blockId);
            } catch (error) {
                console.error('[SiyuanMemo][AutoCard] Failed to check quick symbols:', blockId, error);
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
        
        console.log('[SiyuanMemo][AutoCard] Processing list queue, count:', blocks.length);
        
        for (const blockId of blocks) {
            // 避免重复处理
            if (this.processing.has(blockId)) {
                console.log('[SiyuanMemo][AutoCard] Block already processing:', blockId);
                continue;
            }
            
            this.processing.add(blockId);
            
            try {
                await this.checkListTemplate(blockId);
            } catch (error) {
                console.error('[SiyuanMemo][AutoCard] Failed to check list template:', blockId, error);
            } finally {
                this.processing.delete(blockId);
            }
        }
        
        // 批量保存
        await this.plugin.storage.saveCards();
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
            const quickCardSettings = this.plugin.storage.getSettings().quickCard;
            if (!quickCardSettings?.enabled) {
                return;
            }
            
            // 1. 获取块内容
            const { kramdown } = await getBlockKramdown(blockId);
            if (!kramdown) {
                console.log('[SiyuanMemo][AutoCard] Block has no content:', blockId);
                return;
            }
            
            console.log('[SiyuanMemo][AutoCard] Checking quick symbols:', blockId, 'content:', kramdown);
            
            // 2. 检查是否已制卡
            const existingCard = this.plugin.storage.getCardByBlockId(blockId);
            if (existingCard) {
                console.log('[SiyuanMemo][AutoCard] Block already has card:', blockId);
                return;
            }
            
            // 🆕 3. 批量检测所有符号（方案 3）
            const detectedSymbols = this.detectAllSymbols(kramdown, quickCardSettings);
            
            if (detectedSymbols.length === 0) {
                console.log('[SiyuanMemo][AutoCard] No quick symbol detected:', blockId);
                return;
            }
            
            console.log('[SiyuanMemo][AutoCard] Detected symbols:', detectedSymbols);
            
            // 移除 IAL，用于后续的卡片创建
            const cleanContent = kramdown.replace(/\{:[^}]*\}/g, '').trim();
            
            // 🆕 4. 批量创建卡片
            for (const symbol of detectedSymbols) {
                try {
                    await this.createCardBySymbol(blockId, symbol, cleanContent);
                } catch (error) {
                    console.error('[SiyuanMemo][AutoCard] Failed to create card for symbol:', symbol.type, error);
                }
            }
        } catch (error) {
            console.error('[SiyuanMemo][AutoCard] Error checking quick symbols:', blockId, error);
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
        type: 'basic-both' | 'basic-forward' | 'basic-backward' | 'concept' | 'descriptor' | 'cloze';
        match: RegExpMatchArray;
    }> {
        const symbols: Array<{
            type: 'basic-both' | 'basic-forward' | 'basic-backward' | 'concept' | 'descriptor' | 'cloze';
            match: RegExpMatchArray;
        }> = [];
        
        // 先移除 IAL 属性块，避免干扰正则匹配
        let cleanContent = content.replace(/\{:[^}]*\}/g, '').trim();
        
        // 🆕 移除被反引号包裹的内容（代码块），避免误触发符号检测
        // 例如：`这里有个 :: 符号` 不应该触发概念卡片
        // 支持单行代码 `code` 和多行代码块 ```code```
        cleanContent = cleanContent.replace(/`[^`]*`/g, '');
        cleanContent = cleanContent.replace(/```[\s\S]*?```/g, '');
        
        // 检测顺序（优先级从高到低）
        // 注意：排除 >>> 符号（它在列表模版队列中处理）
        
        // 1. 双向卡片 <>
        if (settings.enabledSymbols.basic && this.patterns.basicBoth.test(cleanContent)) {
            const match = cleanContent.match(this.patterns.basicBoth);
            if (match) symbols.push({ type: 'basic-both', match });
        }
        
        // 2. 正向卡片 >> (排除 >>>)
        if (settings.enabledSymbols.basic && this.patterns.basicForward.test(cleanContent) && !this.patterns.multiLine.test(cleanContent)) {
            const match = cleanContent.match(this.patterns.basicForward);
            if (match) symbols.push({ type: 'basic-forward', match });
        }
        
        // 3. 反向卡片 <<
        if (settings.enabledSymbols.basic && this.patterns.basicBackward.test(cleanContent)) {
            const match = cleanContent.match(this.patterns.basicBackward);
            if (match) symbols.push({ type: 'basic-backward', match });
        }
        
        // 4. 概念卡片 :: (已禁用 - 2026-02-17)
        // if (settings.enabledSymbols.concept && this.patterns.concept.test(cleanContent)) {
        //     const match = cleanContent.match(this.patterns.concept);
        //     if (match) symbols.push({ type: 'concept', match });
        // }
        
        // 5. 描述符卡片 ;;
        if (settings.enabledSymbols.descriptor && this.patterns.descriptor.test(cleanContent)) {
            const match = cleanContent.match(this.patterns.descriptor);
            if (match) symbols.push({ type: 'descriptor', match });
        }
        
        // 6. 填空卡片 {{}} 或 == 或思源标记
        if (settings.enabledSymbols.cloze && (this.patterns.cloze.test(cleanContent) || this.patterns.clozeEqual.test(cleanContent) || this.patterns.clozeMark.test(cleanContent))) {
            const match = cleanContent.match(this.patterns.cloze) || cleanContent.match(this.patterns.clozeEqual) || cleanContent.match(this.patterns.clozeMark);
            if (match) symbols.push({ type: 'cloze', match });
        }
        
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
                await this.createConceptCard(blockId, content, actualSymbol);
                break;
            case 'descriptor':
                await this.createDescriptorCard(blockId, content, actualSymbol);
                break;
            case 'cloze':
                await this.createClozeCard(blockId, content);
                break;
            default:
                console.warn('[SiyuanMemo][AutoCard] Unknown symbol type:', symbol.type);
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
        console.log('[SiyuanMemo][AutoCard] Processing block immediately:', blockId);
        
        // 从队列中移除（避免重复处理）
        this.quickQueue.delete(blockId);
        this.listQueue.delete(blockId);
        
        // 避免重复处理
        if (this.processing.has(blockId)) {
            console.log('[SiyuanMemo][AutoCard] Block already processing:', blockId);
            return;
        }
        
        this.processing.add(blockId);
        
        try {
            // 检测快速符号
            await this.checkQuickSymbols(blockId);
            
            // 检测列表模版
            await this.checkListTemplate(blockId);
        } catch (error) {
            console.error('[SiyuanMemo][AutoCard] Failed to process block immediately:', blockId, error);
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
            const quickCardSettings = this.plugin.storage.getSettings().quickCard;
            if (!quickCardSettings?.enabled || !quickCardSettings.enabledSymbols.multiLine) {
                return;
            }
            
            // 1. 获取块内容
            const { kramdown } = await getBlockKramdown(blockId);
            if (!kramdown) {
                console.log('[SiyuanMemo][AutoCard] Block has no content:', blockId);
                return;
            }
            
            console.log('[SiyuanMemo][AutoCard] Checking list template:', blockId, 'content:', kramdown);
            
            // 2. 检测 >>> 符号
            if (!this.patterns.multiLine.test(kramdown)) {
                console.log('[SiyuanMemo][AutoCard] No list template symbol detected:', blockId);
                return;
            }
            
            // 3. 检查是否为列表项
            const typeResult = await sql(`
                SELECT type FROM blocks WHERE id = '${blockId}' LIMIT 1
            `);
            
            if (!typeResult || typeResult.length === 0 || typeResult[0]?.type !== 'i') {
                console.log('[SiyuanMemo][AutoCard] Block is not a list item:', blockId);
                return;
            }
            
            // 4. 检查子列表项数量
            const childrenResult = await sql(`
                SELECT id FROM blocks
                WHERE parent_id = '${blockId}' AND type = 'i'
            `);
            
            if (!childrenResult || childrenResult.length < 2) {
                console.log('[SiyuanMemo][AutoCard] Not enough child list items:', blockId, 'count:', childrenResult?.length || 0);
                return;
            }
            
            console.log('[SiyuanMemo][AutoCard] List template detected:', blockId, 'children:', childrenResult.length);
            
            // 5. 创建列表模版卡片
            await this.createListTemplateCards(blockId, childrenResult);
        } catch (error) {
            console.error('[SiyuanMemo][AutoCard] Error checking list template:', blockId, error);
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
            console.log('[SiyuanMemo][AutoCard] Creating basic card:', blockId, direction, 'symbol:', actualSymbol);
            
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
                console.error('[SiyuanMemo][AutoCard] Failed to parse basic card content:', content);
                return;
            }
            
            // 2. 创建 FSRS Card
            const { createDefaultCard } = await import('@/types/card');
            const card = createDefaultCard(blockId);
            
            // 3. 设置卡片元数据
            card.meta = {
                ...card.meta,
                direction,
                question,
                answer,
                cardSource: 'quick-symbol',
                symbolType: actualSymbol || (direction === 'forward' ? '>>' : '<<')
            };
            
            // 4. 添加到 Riff 卡组
            const { addRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            await addRiffCards(BUILTIN_DECK_ID, [blockId]);
            console.log('[SiyuanMemo][AutoCard] Added to Riff deck:', blockId);
            
            // 5. 标记 FSRS 属性
            const { markBlockAsCard } = await import('@/core/siyuan/block');
            await markBlockAsCard(blockId, card.id, card.priority, 'item');
            console.log('[SiyuanMemo][AutoCard] Marked block as card:', blockId);
            
            // 6. 保存到存储
            this.plugin.storage.setCard(card);
            await this.plugin.storage.saveCards();
            
            console.log('[SiyuanMemo][AutoCard] Basic card created successfully:', blockId, direction);
            
            // 7. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            const symbolText = direction === 'forward' ? '>>' : '<<';
            await pushMsg(`✅ 已创建${direction === 'forward' ? '正向' : '反向'}卡片 (${symbolText})`);
        } catch (error) {
            console.error('[SiyuanMemo][AutoCard] Failed to create basic card:', blockId, error);
            const { pushErrMsg } = await import('@/core/siyuan/api');
            await pushErrMsg(`创建基础卡片失败：${error.message}`);
        }
    }
    
    /**
     * 创建双向卡片（使用 Xiuyuan 系统）
     * 
     * 双向卡片会通过 Xiuyuan 的 builtin-quick-bidirectional 模板创建两张卡片：
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
            console.log('[SiyuanMemo][AutoCard] Creating bidirectional card using Xiuyuan:', blockId);
            
            // 1. 检查 XiuyuanService 是否可用
            const xiuyuanService = this.plugin.xiuyuanService;
            if (!xiuyuanService) {
                console.error('[SiyuanMemo][AutoCard] XiuyuanService not available, falling back to single card');
                // 降级：只创建正向卡片
                const { createDefaultCard } = await import('@/types/card');
                const card = createDefaultCard(blockId);
                card.meta = {
                    ...card.meta,
                    direction: 'forward',
                    question: term,
                    answer: definition,
                    cardSource: 'quick-symbol',
                    symbolType: '<>'
                };
                
                const { addRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
                await addRiffCards(BUILTIN_DECK_ID, [blockId]);
                
                const { markBlockAsCard } = await import('@/core/siyuan/block');
                await markBlockAsCard(blockId, card.id, card.priority, 'item');
                
                this.plugin.storage.setCard(card);
                await this.plugin.storage.saveCards();
                
                const { pushMsg } = await import('@/core/siyuan/api');
                await pushMsg(`✅ 已创建双向卡片 (<>) - 仅正向`);
                return;
            }
            
            // 2. 使用 Xiuyuan 的 builtin-quick-bidirectional 模板
            // 注意：content 字段映射到同一个块，渲染时会解析 <> 符号
            const { BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            const result = await xiuyuanService.createFromBlocks(
                [blockId],  // 只有一个块
                'builtin-quick-bidirectional',  // 使用快速制卡双向模板
                {
                    content: blockId  // content 字段映射到当前块
                },
                BUILTIN_DECK_ID
            );
            
            if (!result.ok) {
                throw new Error('Failed to create bidirectional card via Xiuyuan');
            }
            
            console.log('[SiyuanMemo][AutoCard] Bidirectional card created via Xiuyuan:', {
                xiuyuanID: result.value.xiuyuan.id,
                cardCount: result.value.cards.length,
                blockId
            });
            
            // 3. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            await pushMsg(`✅ 已创建双向卡片 (<>) - 共 ${result.value.cards.length} 张卡片`);
        } catch (error) {
            console.error('[SiyuanMemo][AutoCard] Failed to create bidirectional card:', blockId, error);
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
     */
    private async createConceptCard(blockId: string, content: string, actualSymbol?: string): Promise<void> {
        try {
            console.log('[SiyuanMemo][AutoCard] Creating concept card:', blockId, 'symbol:', actualSymbol);
            
            // 1. 解析概念和定义
            const match = content.match(this.patterns.concept);
            if (!match) {
                console.error('[SiyuanMemo][AutoCard] Failed to parse concept card content:', content);
                return;
            }
            
            const concept = match[1].trim();
            const definition = match[3].trim();  // 调整索引：match[2]是符号，match[3]是定义
            
            if (!concept || !definition) {
                console.error('[SiyuanMemo][AutoCard] Empty concept or definition:', content);
                return;
            }
            
            // 2. 创建 FSRS Card
            const { createDefaultCard, CardType } = await import('@/types/card');
            const card = createDefaultCard(blockId);
            
            // 3. 标记为 Concept 类型
            card.type = CardType.Concept;
            
            // 4. 设置卡片元数据（默认双向）
            card.meta = {
                ...card.meta,
                direction: 'both',
                concept,
                definition,
                cardSource: 'quick-symbol',
                symbolType: actualSymbol || '::'
            };
            
            // 5. 添加到 Riff 卡组
            const { addRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            await addRiffCards(BUILTIN_DECK_ID, [blockId]);
            console.log('[SiyuanMemo][AutoCard] Added to Riff deck:', blockId);
            
            // 6. 标记 FSRS 属性（标记为 topic，因为 concept 不是有效的类型）
            const { markBlockAsCard } = await import('@/core/siyuan/block');
            await markBlockAsCard(blockId, card.id, card.priority, 'topic');
            console.log('[SiyuanMemo][AutoCard] Marked block as concept card:', blockId);
            
            // 7. 检测并标记卡片类型（concept）
            // 🆕 使用 CardType 枚举标记为概念卡
            const { setBlockAttrs } = await import('@/core/siyuan/api');
            await setBlockAttrs(blockId, {
                'custom-card-type-marker': 'concept'
            });
            
            // 8. 保存到存储
            this.plugin.storage.setCard(card);
            await this.plugin.storage.saveCards();
            
            console.log('[SiyuanMemo][AutoCard] Concept card created successfully:', blockId);
            
            // 9. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            await pushMsg(`✅ 已创建概念卡片 (::)`);
        } catch (error) {
            console.error('[SiyuanMemo][AutoCard] Failed to create concept card:', blockId, error);
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
     */
    private async createDescriptorCard(blockId: string, content: string, actualSymbol?: string): Promise<void> {
        try {
            console.log('[SiyuanMemo][AutoCard] Creating descriptor card:', blockId, 'symbol:', actualSymbol);
            
            // 1. 解析属性和描述
            const match = content.match(this.patterns.descriptor);
            if (!match) {
                console.error('[SiyuanMemo][AutoCard] Failed to parse descriptor card content:', content);
                return;
            }
            
            const attribute = match[1].trim();
            const description = match[3].trim();  // 调整索引：match[2]是符号，match[3]是描述
            
            if (!attribute || !description) {
                console.error('[SiyuanMemo][AutoCard] Empty attribute or description:', content);
                return;
            }
            
            // 2. 检查父块是否为概念（支持多层向上查找）
            const { sql } = await import('@/core/siyuan/api');
            
            // 向上查找最多 4 层，寻找概念卡
            let currentId = blockId;
            let foundConceptId: string | null = null;
            const maxDepth = 4;
            
            for (let depth = 0; depth < maxDepth; depth++) {
                const parentQuery = `SELECT parent_id FROM blocks WHERE id = '${currentId}' LIMIT 1`;
                const parentResult = await sql(parentQuery);
                
                if (!parentResult || parentResult.length === 0 || !parentResult[0]?.parent_id) {
                    console.log(`[SiyuanMemo][AutoCard] No parent at depth ${depth}`);
                    break;
                }
                
                const parentId = parentResult[0].parent_id;
                console.log(`[SiyuanMemo][AutoCard] Checking parent at depth ${depth}:`, parentId);
                
                // 检查父块是否是概念卡（两种方式）
                const { getBlockKramdown } = await import('@/core/siyuan/api');
                const { kramdown: parentContent } = await getBlockKramdown(parentId);
                
                console.log(`[SiyuanMemo][AutoCard] Parent content at depth ${depth}:`, parentContent?.substring(0, 100));
                
                // 方式1：父块本身包含概念符号（::）
                let isParentConcept = parentContent && this.patterns.concept.test(parentContent);
                
                console.log(`[SiyuanMemo][AutoCard] Parent has concept symbol (::) at depth ${depth}:`, isParentConcept);
                
                if (isParentConcept) {
                    foundConceptId = parentId;
                    console.log(`[SiyuanMemo][AutoCard] Found concept card at depth ${depth}:`, parentId);
                    break;
                }
                
                // 方式2：父块包含块引用
                if (parentContent) {
                    console.log(`[SiyuanMemo][AutoCard] Checking for block reference at depth ${depth}...`);
                    const refResult = await this.findOrCreateConceptFromBlockRef(parentContent);
                    if (refResult) {
                        foundConceptId = refResult;
                        console.log(`[SiyuanMemo][AutoCard] Found/created concept card from reference at depth ${depth}:`, refResult);
                        break;
                    }
                }
                
                currentId = parentId;
            }
            
            if (!foundConceptId) {
                console.log('[SiyuanMemo][AutoCard] No concept card found in ancestor chain, creating as basic card');
                // 降级为普通卡片
                await this.createBasicCardFromDescriptor(blockId, attribute, description, actualSymbol);
                return;
            }
            
            console.log('[SiyuanMemo][AutoCard] Found concept card, creating Xiuyuan descriptor card');
            
            // 3. 使用 Xiuyuan 创建描述符卡片
            const xiuyuanService = this.plugin.xiuyuanService;
            if (!xiuyuanService) {
                console.error('[SiyuanMemo][AutoCard] XiuyuanService not available, falling back to basic card');
                await this.createBasicCardFromDescriptor(blockId, attribute, description, actualSymbol);
                return;
            }
            
            // 使用 builtin-concept-descriptor 模版
            const { BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            const result = await xiuyuanService.createFromBlocks(
                [foundConceptId, blockId],  // 使用找到的概念卡 ID
                'builtin-concept-descriptor',
                {
                    concept: foundConceptId,  // 使用找到的概念卡 ID
                    descriptor: blockId
                },
                BUILTIN_DECK_ID
            );
            
            if (!result.ok) {
                const error = (result as { ok: false; error: Error }).error;
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error('[SiyuanMemo][AutoCard] Failed to create Xiuyuan descriptor card:', errorMsg);
                // 降级为普通卡片
                await this.createBasicCardFromDescriptor(blockId, attribute, description, actualSymbol);
                return;
            }
            
            // 🆕 标记为描述符卡类型
            const { setBlockAttrs } = await import('@/core/siyuan/api');
            await setBlockAttrs(blockId, {
                'custom-fsrs-card-type': 'descriptor'
            });
            
            console.log('[SiyuanMemo][AutoCard] Descriptor card created successfully:', blockId);
            
            // 4. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            await pushMsg(`✅ 已创建描述符卡片 (;;)`);
        } catch (error) {
            console.error('[SiyuanMemo][AutoCard] Failed to create descriptor card:', blockId, error);
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
            console.log('[SiyuanMemo][AutoCard] Creating basic card from descriptor:', blockId, 'symbol:', actualSymbol);
            
            // 1. 创建 FSRS Card
            const { createDefaultCard } = await import('@/types/card');
            const card = createDefaultCard(blockId);
            
            // 2. 设置卡片元数据（作为正向卡片）
            card.meta = {
                ...card.meta,
                direction: 'forward',
                question: attribute,
                answer: description,
                cardSource: 'quick-symbol',
                symbolType: actualSymbol || ';;',
                degradedFromDescriptor: true
            };
            
            // 3. 添加到 Riff 卡组
            const { addRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            await addRiffCards(BUILTIN_DECK_ID, [blockId]);
            
            // 4. 标记 FSRS 属性
            const { markBlockAsCard } = await import('@/core/siyuan/block');
            await markBlockAsCard(blockId, card.id, card.priority, 'item');
            
            // 5. 保存到存储
            this.plugin.storage.setCard(card);
            await this.plugin.storage.saveCards();
            
            console.log('[SiyuanMemo][AutoCard] Basic card created from descriptor:', blockId);
            
            // 6. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            await pushMsg(`✅ 已创建卡片 (;;), 父块非概念，已降级为普通卡片`);
        } catch (error) {
            console.error('[SiyuanMemo][AutoCard] Failed to create basic card from descriptor:', blockId, error);
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
            console.log('[SiyuanMemo][AutoCard] Creating cloze card:', blockId);
            
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
                console.error('[SiyuanMemo][AutoCard] No cloze found in content:', content);
                return;
            }
            
            console.log('[SiyuanMemo][AutoCard] Found clozes:', clozes.length, clozes);
            
            // 2. 如果只有一个填空，创建单张卡片
            if (clozes.length === 1) {
                await this.createSingleClozeCard(blockId, content, clozes);
                return;
            }
            
            // 3. 多个填空：使用 Xiuyuan 创建多张卡片
            await this.createMultipleClozeCards(blockId, content, clozes);
        } catch (error) {
            console.error('[SiyuanMemo][AutoCard] Failed to create cloze card:', blockId, error);
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
        // 创建 FSRS Card
        const { createDefaultCard } = await import('@/types/card');
        const card = createDefaultCard(blockId);
        
        // 设置卡片元数据
        card.meta = {
            ...card.meta,
            clozes: clozes.map(c => c.text),
            clozeCount: 1,
            cardSource: 'quick-symbol',
            symbolType: clozes[0].type === 'brace' ? '{{}}' : (clozes[0].type === 'equal' ? '==' : 'mark')
        };
        
        // 添加到 Riff 卡组
        const { addRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
        await addRiffCards(BUILTIN_DECK_ID, [blockId]);
        
        // 标记 FSRS 属性
        const { markBlockAsCard } = await import('@/core/siyuan/block');
        await markBlockAsCard(blockId, card.id, card.priority, 'item');
        
        // 保存到存储
        this.plugin.storage.setCard(card);
        await this.plugin.storage.saveCards();
        
        console.log('[SiyuanMemo][AutoCard] Single cloze card created:', blockId);
        
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
        const xiuyuanService = this.plugin.xiuyuanService;
        if (!xiuyuanService) {
            console.error('[SiyuanMemo][AutoCard] XiuyuanService not available, creating single card');
            await this.createSingleClozeCard(blockId, content, clozes);
            return;
        }
        
        try {
            // 使用 builtin-multi-cloze 模板
            // 注意：需要动态设置 cardRules，每个填空一个 rule
            const { BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            
            // 获取模板并动态设置 cardRules
            const template = xiuyuanService.getTemplate('builtin-multi-cloze');
            if (!template) {
                console.error('[SiyuanMemo][AutoCard] builtin-multi-cloze template not found');
                await this.createSingleClozeCard(blockId, content, clozes);
                return;
            }
            
            // 动态生成 cardRules（每个填空一张卡片）
            const dynamicTemplate = {
                ...template,
                cardRules: clozes.map((_, index) => ({
                    typeMarker: `cloze-${index}`,
                    frontFields: ['content'],
                    backFields: ['content'],
                })),
            };
            
            // 临时注册动态模板
            const tempTemplateId = `builtin-multi-cloze-${blockId}`;
            const tempTemplate = {
                ...dynamicTemplate,
                id: tempTemplateId,
            };
            xiuyuanService.createTemplate(tempTemplate);
            
            // 使用动态模板创建卡片
            const result = await xiuyuanService.createFromBlocks(
                [blockId],
                tempTemplateId,
                {
                    content: blockId
                },
                BUILTIN_DECK_ID
            );
            
            if (!result.ok) {
                console.error('[SiyuanMemo][AutoCard] Failed to create Xiuyuan cloze cards, falling back to single card');
                await this.createSingleClozeCard(blockId, content, clozes);
                return;
            }
            
            console.log('[SiyuanMemo][AutoCard] Multiple cloze cards created:', blockId, 'count:', result.value.cards.length);
            
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
            console.error('[SiyuanMemo][AutoCard] Error creating multiple cloze cards:', error);
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
            console.log('[SiyuanMemo][AutoCard] Creating list template cards:', blockId, 'children:', children.length);
            
            // 1. 检查是否已制卡
            const existingCard = this.plugin.storage.getCardByBlockId(blockId);
            if (existingCard) {
                console.log('[SiyuanMemo][AutoCard] Block already has card:', blockId);
                return;
            }
            
            // 2. 获取父块内容（问题）
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            const { kramdown: parentContent } = await getBlockKramdown(blockId);
            if (!parentContent) {
                console.error('[SiyuanMemo][AutoCard] Parent block has no content:', blockId);
                return;
            }
            
            // 提取问题（去掉 >>> 符号）
            const questionMatch = parentContent.match(this.patterns.multiLine);
            if (!questionMatch) {
                console.error('[SiyuanMemo][AutoCard] Failed to parse list template question:', parentContent);
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
                console.error('[SiyuanMemo][AutoCard] Not enough valid child blocks:', blockId);
                return;
            }
            
            console.log('[SiyuanMemo][AutoCard] Parsed child blocks:', childBlocks);
            
            // 4. 使用 Xiuyuan 创建列表模版卡片
            const xiuyuanService = this.plugin.xiuyuanService;
            if (!xiuyuanService) {
                console.error('[SiyuanMemo][AutoCard] XiuyuanService not available');
                return;
            }
            
            // 准备块 ID 列表（父块 + 子块）
            const blockIDs = [blockId, ...childBlocks.map(c => c.id)];
            
            // 使用 builtin-list-item 模版
            const { BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            const result = await xiuyuanService.createFromBlocks(
                blockIDs,
                'builtin-list-item',
                {
                    question: blockId,
                    items: childBlocks.map(c => c.id).join(',')
                },
                BUILTIN_DECK_ID
            );
            
            if (!result.ok) {
                const error = (result as { ok: false; error: Error }).error;
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error('[SiyuanMemo][AutoCard] Failed to create Xiuyuan cards:', errorMsg);
                const { pushErrMsg } = await import('@/core/siyuan/api');
                await pushErrMsg(`创建列表模版卡片失败：${errorMsg}`);
                return;
            }
            
            console.log('[SiyuanMemo][AutoCard] List template cards created successfully:', blockId, 'cards:', result.value.cards?.length);
            
            // 5. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            await pushMsg(`✅ 已创建列表模版卡片 (>>>), ${childBlocks.length} 个子项`);
        } catch (error) {
            console.error('[SiyuanMemo][AutoCard] Failed to create list template cards:', blockId, error);
            const { pushErrMsg } = await import('@/core/siyuan/api');
            await pushErrMsg(`创建列表模版卡片失败：${error.message}`);
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
        
        console.log('[SiyuanMemo][AutoCard] Handler disposed');
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

            console.log('[SiyuanMemo][AutoCard] Block reference matches:', matches.length);
            
            if (matches.length === 0) {
                return null;
            }

            // 检查每个引用是否是概念卡
            const { sql } = await import('@/core/siyuan/api');
            for (const match of matches) {
                const refId = match[1];
                console.log('[SiyuanMemo][AutoCard] Checking block reference:', refId);
                
                const cardTypeQuery = `
                    SELECT value 
                    FROM attributes 
                    WHERE block_id = '${refId}' 
                      AND name = 'custom-fsrs-card-type'
                `;
                const result = await sql(cardTypeQuery);
                
                console.log('[SiyuanMemo][AutoCard] Block reference card type:', result?.[0]?.value || 'none');
                
                if (result && result.length > 0 && result[0].value === 'concept') {
                    console.log('[SiyuanMemo][AutoCard] Found concept card in block reference:', refId);
                    return refId;
                }
            }

            return null;
        } catch (error) {
            console.error('[SiyuanMemo][AutoCard] Error finding concept card in block ref:', error);
            return null;
        }
    }
    /**
     * 从块引用中查找或创建概念卡
     * 如果块引用不是概念卡，自动将其转换为概念卡
     */
    private async findOrCreateConceptFromBlockRef(content: string): Promise<string | null> {
        try {
            // 提取块引用 ID
            const refPattern = /\(\((\d{14}-[a-z0-9]{7})/g;
            const matches = [...content.matchAll(refPattern)];

            console.log('[SiyuanMemo][AutoCard] Block reference matches:', matches.length);
            
            if (matches.length === 0) {
                return null;
            }

            const { sql, setBlockAttrs, getBlockKramdown } = await import('@/core/siyuan/api');
            
            // 检查每个引用
            for (const match of matches) {
                const refId = match[1];
                console.log('[SiyuanMemo][AutoCard] Checking block reference:', refId);
                
                // 检查是否已经是概念卡
                const cardTypeQuery = `
                    SELECT value 
                    FROM attributes 
                    WHERE block_id = '${refId}' 
                      AND name = 'custom-fsrs-card-type'
                `;
                const result = await sql(cardTypeQuery);
                
                if (result && result.length > 0 && result[0].value === 'concept') {
                    console.log('[SiyuanMemo][AutoCard] Found existing concept card:', refId);
                    return refId;
                }
                
                // 不是概念卡，检查是否包含概念符号
                const { kramdown: refContent } = await getBlockKramdown(refId);
                if (refContent && this.patterns.concept.test(refContent)) {
                    console.log('[SiyuanMemo][AutoCard] Block has concept symbol, already a concept:', refId);
                    return refId;
                }
                
                // 🆕 自动将块引用标记为概念卡（不创建实际卡片，只标记类型）
                console.log('[SiyuanMemo][AutoCard] Auto-marking block as concept card:', refId);
                
                // 获取块内容作为概念名称
                const blockQuery = `SELECT content FROM blocks WHERE id = '${refId}' LIMIT 1`;
                const blockResult = await sql(blockQuery);
                
                if (!blockResult || blockResult.length === 0) {
                    console.warn('[SiyuanMemo][AutoCard] Block not found:', refId);
                    continue;
                }
                
                const conceptName = blockResult[0].content;
                console.log('[SiyuanMemo][AutoCard] Marking as concept card:', conceptName);
                
                // 直接标记为概念卡（不需要创建 Xiuyuan 卡片）
                await setBlockAttrs(refId, {
                    'custom-fsrs-card-type': 'concept'
                });
                
                console.log('[SiyuanMemo][AutoCard] Successfully marked as concept card:', refId);
                
                // 显示提示
                const { pushMsg } = await import('@/core/siyuan/api');
                await pushMsg(`✅ 自动标记为概念卡：${conceptName}`);
                
                return refId;
            }

            return null;
        } catch (error) {
            console.error('[SiyuanMemo][AutoCard] Error finding/creating concept from block ref:', error);
            return null;
        }
    }
}
