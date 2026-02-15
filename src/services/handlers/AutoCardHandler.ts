/**
 * 自动制卡处理器（统一版）
 * 
 * 职责：
 * - 检测块内容变化（insert/update）
 * - 管理两个独立的防抖队列
 * - 创建各种类型的卡片
 * 
 * 两个队列：
 * 1. 快速符号队列（300ms 防抖）：>>, ::, ;;, {{}}
 * 2. 列表模版队列（2000ms 防抖）：>>> + 子列表项
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
    
    private readonly QUICK_DEBOUNCE = 300;   // 快速符号：300ms
    private readonly LIST_DEBOUNCE = 2000;   // 列表模版：2000ms
    
    // 符号正则表达式（私有）
    private patterns = {
        concept: /^(.+?)\s*::\s*(.+)$/,         // 概念 :: 定义
        descriptor: /^(.+?)\s*;;\s*(.+)$/,      // 属性 ;; 描述
        basicBoth: /^(.+?)\s*<>\s*(.+)$/,       // 问题 <> 答案
        basicForward: /^(.+?)\s*>>\s*(.+)$/,    // 问题 >> 答案
        basicBackward: /^(.+?)\s*<<\s*(.+)$/,   // 答案 << 问题
        cloze: /\{\{(.+?)\}\}/g,                // {{填空}}
        multiLine: /(.+?)\s*>>>\s*$/,           // 问题 >>>
        listCue: /^(.+?)\s*->\s*(.+)$/,         // 提示 -> 答案（列表模版子项）
    };
    
    constructor(plugin: FSRSPlugin) {
        this.plugin = plugin;
        console.log('[AutoCard] Handler initialized');
    }
    
    /**
     * 处理 transactions
     * 
     * 检测块内容变化（insert/update），加入对应的队列
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
                // 只处理 insert 和 update 操作
                if (op.action === 'insert' || op.action === 'update') {
                    const blockId = op.id;
                    
                    // 加入两个队列（后续会判断具体类型）
                    this.queueQuickCheck(blockId);
                    this.queueListCheck(blockId);
                    
                    console.log('[AutoCard] Block queued:', blockId, 'action:', op.action);
                }
            }
        }
    }
    
    /**
     * 快速符号检测队列（300ms 防抖）
     * 
     * 用于检测：>>, <<, <>, ::, ;;, {{}}
     * 
     * @param blockId 块 ID
     */
    private queueQuickCheck(blockId: string): void {
        this.quickQueue.add(blockId);
        
        if (this.quickTimer) {
            clearTimeout(this.quickTimer);
        }
        
        // 从设置中获取防抖时间
        const quickCardSettings = this.plugin.storage.getSettings().quickCard;
        const debounceDelay = quickCardSettings?.debounceDelay?.quick || this.QUICK_DEBOUNCE;
        
        this.quickTimer = setTimeout(() => {
            this.processQuickQueue();
        }, debounceDelay);
    }
    
    /**
     * 列表模版检测队列（2000ms 防抖）
     * 
     * 用于检测：>>> + 子列表项
     * 
     * @param blockId 块 ID
     */
    private queueListCheck(blockId: string): void {
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
    }
    
    /**
     * 处理快速符号队列
     * 
     * 批量处理队列中的所有块
     */
    private async processQuickQueue(): Promise<void> {
        const blocks = Array.from(this.quickQueue);
        this.quickQueue.clear();
        
        console.log('[AutoCard] Processing quick queue, count:', blocks.length);
        
        for (const blockId of blocks) {
            // 避免重复处理
            if (this.processing.has(blockId)) {
                console.log('[AutoCard] Block already processing:', blockId);
                continue;
            }
            
            this.processing.add(blockId);
            
            try {
                await this.checkQuickSymbols(blockId);
            } catch (error) {
                console.error('[AutoCard] Failed to check quick symbols:', blockId, error);
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
        
        console.log('[AutoCard] Processing list queue, count:', blocks.length);
        
        for (const blockId of blocks) {
            // 避免重复处理
            if (this.processing.has(blockId)) {
                console.log('[AutoCard] Block already processing:', blockId);
                continue;
            }
            
            this.processing.add(blockId);
            
            try {
                await this.checkListTemplate(blockId);
            } catch (error) {
                console.error('[AutoCard] Failed to check list template:', blockId, error);
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
                console.log('[AutoCard] Block has no content:', blockId);
                return;
            }
            
            console.log('[AutoCard] Checking quick symbols:', blockId, 'content:', kramdown);
            
            // 2. 检查是否已制卡
            const existingCard = this.plugin.storage.getCardByBlockId(blockId);
            if (existingCard) {
                console.log('[AutoCard] Block already has card:', blockId);
                return;
            }
            
            // 3. 检测符号并创建卡片（排除 >>>）
            // 优先级顺序：<> > >> > << > :: > ;; > {{}}
            if (quickCardSettings.enabledSymbols.basic && this.patterns.basicBoth.test(kramdown)) {
                console.log('[AutoCard] Detected basic both symbol:', blockId);
                await this.createBasicCard(blockId, 'both', kramdown);
            } else if (quickCardSettings.enabledSymbols.basic && this.patterns.basicForward.test(kramdown) && !this.patterns.multiLine.test(kramdown)) {
                // 排除 >>> 符号（它在列表模版队列中处理）
                console.log('[AutoCard] Detected basic forward symbol:', blockId);
                await this.createBasicCard(blockId, 'forward', kramdown);
            } else if (quickCardSettings.enabledSymbols.basic && this.patterns.basicBackward.test(kramdown)) {
                console.log('[AutoCard] Detected basic backward symbol:', blockId);
                await this.createBasicCard(blockId, 'backward', kramdown);
            } else if (quickCardSettings.enabledSymbols.concept && this.patterns.concept.test(kramdown)) {
                console.log('[AutoCard] Detected concept symbol:', blockId);
                await this.createConceptCard(blockId, kramdown);
            } else if (quickCardSettings.enabledSymbols.descriptor && this.patterns.descriptor.test(kramdown)) {
                console.log('[AutoCard] Detected descriptor symbol:', blockId);
                await this.createDescriptorCard(blockId, kramdown);
            } else if (quickCardSettings.enabledSymbols.cloze && this.patterns.cloze.test(kramdown)) {
                console.log('[AutoCard] Detected cloze symbol:', blockId);
                await this.createClozeCard(blockId, kramdown);
            } else {
                console.log('[AutoCard] No quick symbol detected:', blockId);
            }
        } catch (error) {
            console.error('[AutoCard] Error checking quick symbols:', blockId, error);
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
                console.log('[AutoCard] Block has no content:', blockId);
                return;
            }
            
            console.log('[AutoCard] Checking list template:', blockId, 'content:', kramdown);
            
            // 2. 检测 >>> 符号
            if (!this.patterns.multiLine.test(kramdown)) {
                console.log('[AutoCard] No list template symbol detected:', blockId);
                return;
            }
            
            // 3. 检查是否为列表项
            const typeResult = await sql(`
                SELECT type FROM blocks WHERE id = '${blockId}' LIMIT 1
            `);
            
            if (!typeResult || typeResult.length === 0 || typeResult[0]?.type !== 'i') {
                console.log('[AutoCard] Block is not a list item:', blockId);
                return;
            }
            
            // 4. 检查子列表项数量
            const childrenResult = await sql(`
                SELECT id FROM blocks
                WHERE parent_id = '${blockId}' AND type = 'i'
            `);
            
            if (!childrenResult || childrenResult.length < 2) {
                console.log('[AutoCard] Not enough child list items:', blockId, 'count:', childrenResult?.length || 0);
                return;
            }
            
            console.log('[AutoCard] List template detected:', blockId, 'children:', childrenResult.length);
            
            // 5. 创建列表模版卡片
            await this.createListTemplateCards(blockId, childrenResult);
        } catch (error) {
            console.error('[AutoCard] Error checking list template:', blockId, error);
        }
    }
    
    // ==================== 卡片创建方法 ====================
    
    /**
     * 创建基础卡片（>>, <<, <>）
     * 
     * @param blockId 块 ID
     * @param direction 方向（forward/backward/both）
     * @param content 块内容
     */
    private async createBasicCard(blockId: string, direction: string, content: string): Promise<void> {
        try {
            console.log('[AutoCard] Creating basic card:', blockId, direction);
            
            // 1. 解析问题和答案
            let question = '';
            let answer = '';
            
            if (direction === 'forward') {
                const match = content.match(this.patterns.basicForward);
                if (match) {
                    question = match[1].trim();
                    answer = match[2].trim();
                }
            } else if (direction === 'backward') {
                const match = content.match(this.patterns.basicBackward);
                if (match) {
                    answer = match[1].trim();
                    question = match[2].trim();
                }
            } else if (direction === 'both') {
                const match = content.match(this.patterns.basicBoth);
                if (match) {
                    question = match[1].trim();
                    answer = match[2].trim();
                }
            }
            
            if (!question || !answer) {
                console.error('[AutoCard] Failed to parse basic card content:', content);
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
                symbolType: direction === 'forward' ? '>>' : direction === 'backward' ? '<<' : '<>'
            };
            
            // 4. 添加到 Riff 卡组
            const { addRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            await addRiffCards(BUILTIN_DECK_ID, [blockId]);
            console.log('[AutoCard] Added to Riff deck:', blockId);
            
            // 5. 标记 FSRS 属性
            const { markBlockAsCard } = await import('@/core/siyuan/block');
            await markBlockAsCard(blockId, card.id, card.priority, 'item');
            console.log('[AutoCard] Marked block as card:', blockId);
            
            // 6. 保存到存储
            this.plugin.storage.setCard(card);
            await this.plugin.storage.saveCards();
            
            console.log('[AutoCard] Basic card created successfully:', blockId, direction);
            
            // 7. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            const symbolText = direction === 'forward' ? '>>' : direction === 'backward' ? '<<' : '<>';
            await pushMsg(`✅ 已创建${direction === 'both' ? '双向' : direction === 'forward' ? '正向' : '反向'}卡片 (${symbolText})`);
        } catch (error) {
            console.error('[AutoCard] Failed to create basic card:', blockId, error);
            const { pushErrMsg } = await import('@/core/siyuan/api');
            await pushErrMsg(`创建基础卡片失败：${error.message}`);
        }
    }
    
    /**
     * 创建概念卡片（::）
     * 
     * @param blockId 块 ID
     * @param content 块内容
     */
    private async createConceptCard(blockId: string, content: string): Promise<void> {
        try {
            console.log('[AutoCard] Creating concept card:', blockId);
            
            // 1. 解析概念和定义
            const match = content.match(this.patterns.concept);
            if (!match) {
                console.error('[AutoCard] Failed to parse concept card content:', content);
                return;
            }
            
            const concept = match[1].trim();
            const definition = match[2].trim();
            
            if (!concept || !definition) {
                console.error('[AutoCard] Empty concept or definition:', content);
                return;
            }
            
            // 2. 创建 FSRS Card
            const { createDefaultCard, CardType } = await import('@/types/card');
            const card = createDefaultCard(blockId);
            
            // 3. 标记为 Topic 类型
            card.type = CardType.Topic;
            
            // 4. 设置卡片元数据（默认双向）
            card.meta = {
                ...card.meta,
                direction: 'both',
                concept,
                definition,
                cardSource: 'quick-symbol',
                symbolType: '::'
            };
            
            // 5. 初始化 A-Factor（Topic 卡片特有）
            card.aFactor = 2.5; // 默认 A-Factor
            
            // 6. 添加到 Riff 卡组
            const { addRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            await addRiffCards(BUILTIN_DECK_ID, [blockId]);
            console.log('[AutoCard] Added to Riff deck:', blockId);
            
            // 7. 标记 FSRS 属性（标记为 topic）
            const { markBlockAsCard } = await import('@/core/siyuan/block');
            await markBlockAsCard(blockId, card.id, card.priority, 'topic');
            console.log('[AutoCard] Marked block as topic card:', blockId);
            
            // 8. 检测并标记卡片类型（concept）
            card.cardTypeMarker = 'concept';
            
            // 9. 保存到存储
            this.plugin.storage.setCard(card);
            await this.plugin.storage.saveCards();
            
            console.log('[AutoCard] Concept card created successfully:', blockId);
            
            // 10. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            await pushMsg(`✅ 已创建概念卡片 (::)`);
        } catch (error) {
            console.error('[AutoCard] Failed to create concept card:', blockId, error);
            const { pushErrMsg } = await import('@/core/siyuan/api');
            await pushErrMsg(`创建概念卡片失败：${error.message}`);
        }
    }
    
    /**
     * 创建描述符卡片（;;）
     * 
     * @param blockId 块 ID
     * @param content 块内容
     */
    private async createDescriptorCard(blockId: string, content: string): Promise<void> {
        try {
            console.log('[AutoCard] Creating descriptor card:', blockId);
            
            // 1. 解析属性和描述
            const match = content.match(this.patterns.descriptor);
            if (!match) {
                console.error('[AutoCard] Failed to parse descriptor card content:', content);
                return;
            }
            
            const attribute = match[1].trim();
            const description = match[2].trim();
            
            if (!attribute || !description) {
                console.error('[AutoCard] Empty attribute or description:', content);
                return;
            }
            
            // 2. 检查父块是否为概念
            const { sql } = await import('@/core/siyuan/api');
            const parentResult = await sql(`
                SELECT parent_id FROM blocks WHERE id = '${blockId}' LIMIT 1
            `);
            
            if (!parentResult || parentResult.length === 0 || !parentResult[0]?.parent_id) {
                console.log('[AutoCard] No parent block, creating as basic card');
                // 降级为普通卡片
                await this.createBasicCardFromDescriptor(blockId, attribute, description);
                return;
            }
            
            const parentId = parentResult[0].parent_id;
            
            // 检查父块是否有概念符号（::）
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            const { kramdown: parentContent } = await getBlockKramdown(parentId);
            
            const isParentConcept = parentContent && this.patterns.concept.test(parentContent);
            
            if (!isParentConcept) {
                console.log('[AutoCard] Parent is not a concept, creating as basic card');
                // 降级为普通卡片
                await this.createBasicCardFromDescriptor(blockId, attribute, description);
                return;
            }
            
            console.log('[AutoCard] Parent is a concept, creating Xiuyuan descriptor card');
            
            // 3. 使用 Xiuyuan 创建描述符卡片
            const xiuyuanService = this.plugin.xiuyuanService;
            if (!xiuyuanService) {
                console.error('[AutoCard] XiuyuanService not available, falling back to basic card');
                await this.createBasicCardFromDescriptor(blockId, attribute, description);
                return;
            }
            
            // 使用 builtin-concept-descriptor 模版
            const { BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            const result = await xiuyuanService.createFromBlocks(
                [parentId, blockId],
                'builtin-concept-descriptor',
                {
                    concept: parentId,
                    descriptor: blockId
                },
                BUILTIN_DECK_ID
            );
            
            if (!result.ok) {
                const error = (result as { ok: false; error: Error }).error;
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error('[AutoCard] Failed to create Xiuyuan descriptor card:', errorMsg);
                // 降级为普通卡片
                await this.createBasicCardFromDescriptor(blockId, attribute, description);
                return;
            }
            
            console.log('[AutoCard] Descriptor card created successfully:', blockId);
            
            // 4. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            await pushMsg(`✅ 已创建描述符卡片 (;;)`);
        } catch (error) {
            console.error('[AutoCard] Failed to create descriptor card:', blockId, error);
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
     */
    private async createBasicCardFromDescriptor(blockId: string, attribute: string, description: string): Promise<void> {
        try {
            console.log('[AutoCard] Creating basic card from descriptor:', blockId);
            
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
                symbolType: ';;',
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
            
            console.log('[AutoCard] Basic card created from descriptor:', blockId);
            
            // 6. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            await pushMsg(`✅ 已创建卡片 (;;), 父块非概念，已降级为普通卡片`);
        } catch (error) {
            console.error('[AutoCard] Failed to create basic card from descriptor:', blockId, error);
            throw error;
        }
    }
    
    /**
     * 创建填空卡片（{{}}）
     * 
     * @param blockId 块 ID
     * @param content 块内容
     */
    private async createClozeCard(blockId: string, content: string): Promise<void> {
        try {
            console.log('[AutoCard] Creating cloze card:', blockId);
            
            // 1. 提取所有填空
            const clozes: string[] = [];
            const clozePositions: Array<{ start: number; end: number; text: string }> = [];
            let match;
            
            // 重置正则表达式的 lastIndex
            this.patterns.cloze.lastIndex = 0;
            
            while ((match = this.patterns.cloze.exec(content)) !== null) {
                const clozeText = match[1].trim();
                clozes.push(clozeText);
                clozePositions.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    text: clozeText
                });
            }
            
            if (clozes.length === 0) {
                console.error('[AutoCard] No cloze found in content:', content);
                return;
            }
            
            console.log('[AutoCard] Found clozes:', clozes.length, clozes);
            
            // 2. 创建 FSRS Card
            const { createDefaultCard } = await import('@/types/card');
            const card = createDefaultCard(blockId);
            
            // 3. 设置卡片元数据
            card.meta = {
                ...card.meta,
                clozes,
                clozePositions,
                clozeCount: clozes.length,
                cardSource: 'quick-symbol',
                symbolType: '{{}}'
            };
            
            // 4. 添加到 Riff 卡组
            const { addRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            await addRiffCards(BUILTIN_DECK_ID, [blockId]);
            console.log('[AutoCard] Added to Riff deck:', blockId);
            
            // 5. 标记 FSRS 属性
            const { markBlockAsCard } = await import('@/core/siyuan/block');
            await markBlockAsCard(blockId, card.id, card.priority, 'item');
            console.log('[AutoCard] Marked block as card:', blockId);
            
            // 6. 保存到存储
            this.plugin.storage.setCard(card);
            await this.plugin.storage.saveCards();
            
            console.log('[AutoCard] Cloze card created successfully:', blockId, 'clozes:', clozes.length);
            
            // 7. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            await pushMsg(`✅ 已创建填空卡片 ({{}}), ${clozes.length} 个填空`);
        } catch (error) {
            console.error('[AutoCard] Failed to create cloze card:', blockId, error);
            const { pushErrMsg } = await import('@/core/siyuan/api');
            await pushErrMsg(`创建填空卡片失败：${error.message}`);
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
            console.log('[AutoCard] Creating list template cards:', blockId, 'children:', children.length);
            
            // 1. 检查是否已制卡
            const existingCard = this.plugin.storage.getCardByBlockId(blockId);
            if (existingCard) {
                console.log('[AutoCard] Block already has card:', blockId);
                return;
            }
            
            // 2. 获取父块内容（问题）
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            const { kramdown: parentContent } = await getBlockKramdown(blockId);
            if (!parentContent) {
                console.error('[AutoCard] Parent block has no content:', blockId);
                return;
            }
            
            // 提取问题（去掉 >>> 符号）
            const questionMatch = parentContent.match(this.patterns.multiLine);
            if (!questionMatch) {
                console.error('[AutoCard] Failed to parse list template question:', parentContent);
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
                console.error('[AutoCard] Not enough valid child blocks:', blockId);
                return;
            }
            
            console.log('[AutoCard] Parsed child blocks:', childBlocks);
            
            // 4. 使用 Xiuyuan 创建列表模版卡片
            const xiuyuanService = this.plugin.xiuyuanService;
            if (!xiuyuanService) {
                console.error('[AutoCard] XiuyuanService not available');
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
                console.error('[AutoCard] Failed to create Xiuyuan cards:', errorMsg);
                const { pushErrMsg } = await import('@/core/siyuan/api');
                await pushErrMsg(`创建列表模版卡片失败：${errorMsg}`);
                return;
            }
            
            console.log('[AutoCard] List template cards created successfully:', blockId, 'cards:', result.value.cards?.length);
            
            // 5. 显示成功提示
            const { pushMsg } = await import('@/core/siyuan/api');
            await pushMsg(`✅ 已创建列表模版卡片 (>>>), ${childBlocks.length} 个子项`);
        } catch (error) {
            console.error('[AutoCard] Failed to create list template cards:', blockId, error);
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
        
        console.log('[AutoCard] Handler disposed');
    }
}
