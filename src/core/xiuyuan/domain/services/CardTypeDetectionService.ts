/**
 * CardTypeDetectionService - 卡片类型检测领域服务
 * 
 * 智能检测卡片类型（Topic/Item）：
 * - 文档块 → topic
 * - 有挖空符号（==、::）→ item
 * - 标题块 → item
 * - 列表项有子级 → item
 * - 超级块有子级 → item
 * - 其他 → topic
 */

import { sql } from '@/core/siyuan/api';

export type CardType = 'topic' | 'item';

/**
 * 卡片类型检测领域服务
 * 
 * 负责智能检测卡片的类型（Topic/Item），用于快速制卡等场景。
 */
export class CardTypeDetectionService {
    /**
     * 检测单个卡片的类型
     * 
     * @param blockId - 块 ID
     * @returns 卡片类型（'topic' | 'item'）
     */
    async detectCardType(blockId: string): Promise<CardType> {
        try {
            // 1. 获取块类型和内容
            const blockData = await sql(`
                SELECT type, markdown, content FROM blocks
                WHERE id = '${blockId}'
                LIMIT 1
            `);
            
            if (!blockData || blockData.length === 0) {
                console.log(`[CardTypeDetectionService] Block ${blockId}: topic (block not found)`);
                return 'topic';
            }
            
            const type = blockData[0].type;
            const markdown = blockData[0].markdown || '';
            const content = blockData[0].content || '';
            
            // 2. 文档块 → topic
            if (type === 'd') {
                console.log(`[CardTypeDetectionService] Block ${blockId}: topic (type: d = document)`);
                return 'topic';
            }
            
            // 3. 有挖空符号 → item
            // 支持三种挖空语法：
            // - ==文本== (Markdown 标记语法)
            // - {{文本}} (双花括号)
            // - <span data-type="mark">文本</span> (思源原生高亮)
            if (/==([^=]+)==/.test(markdown) || /==([^=]+)==/.test(content)) {
                console.log(`[CardTypeDetectionService] Block ${blockId}: item (mark syntax == found)`);
                return 'item';
            }
            
            if (/\{\{.+?\}\}/.test(content)) {
                console.log(`[CardTypeDetectionService] Block ${blockId}: item (cloze syntax {{}} found)`);
                return 'item';
            }
            
            if (/<span data-type="mark">/.test(markdown) || /<span data-type="mark">/.test(content)) {
                console.log(`[CardTypeDetectionService] Block ${blockId}: item (siyuan mark found)`);
                return 'item';
            }
            
            // 4. 有分隔符 → item
            // - :: (概念卡片)
            // - ;; (描述符卡片)
            // - >> (正向卡片)
            // - << (反向卡片)
            // - <> (双向卡片)
            if (/::/.test(content) || /;;/.test(content)) {
                console.log(`[CardTypeDetectionService] Block ${blockId}: item (separator :: or ;; found)`);
                return 'item';
            }
            
            if (/>>/.test(content) || /<</.test(content) || /<>/.test(content)) {
                console.log(`[CardTypeDetectionService] Block ${blockId}: item (direction symbol found)`);
                return 'item';
            }
            
            // 5. 标题块 → item
            if (type === 'h') {
                console.log(`[CardTypeDetectionService] Block ${blockId}: item (type: h = heading)`);
                return 'item';
            }
            
            // 6. 列表项有列表子级 → item
            if (type === 'i') {
                const hasListChildren = await this.checkHasChildren(blockId, ['i', 'l']);
                console.log(`[CardTypeDetectionService] Block ${blockId}: ${hasListChildren ? 'item' : 'topic'} (type: i = list item, hasListChildren: ${hasListChildren})`);
                return hasListChildren ? 'item' : 'topic';
            }
            
            // 7. 超级块有子级 → item
            if (type === 's') {
                const hasAnyChildren = await this.checkHasChildren(blockId);
                console.log(`[CardTypeDetectionService] Block ${blockId}: ${hasAnyChildren ? 'item' : 'topic'} (type: s = super block, hasAnyChildren: ${hasAnyChildren})`);
                return hasAnyChildren ? 'item' : 'topic';
            }
            
            // 8. 其他 → topic
            console.log(`[CardTypeDetectionService] Block ${blockId}: topic (type: ${type}, no answer blocks)`);
            return 'topic';
        } catch (err) {
            console.error(`[CardTypeDetectionService] Detection error for ${blockId}:`, err);
            return 'topic'; // 出错默认为 topic
        }
    }
    
    /**
     * 批量检测卡片类型
     * 
     * @param blockIds - 块 ID 列表
     * @returns 块 ID 到卡片类型的映射
     */
    async batchDetectCardTypes(blockIds: string[]): Promise<Map<string, CardType>> {
        const typeMap = new Map<string, CardType>();
        
        // 并发检测（每批 10 个，避免过载）
        const BATCH_SIZE = 10;
        for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
            const batch = blockIds.slice(i, i + BATCH_SIZE);
            
            const results = await Promise.all(
                batch.map(async (blockId) => {
                    const type = await this.detectCardType(blockId);
                    return { blockId, type };
                })
            );
            
            for (const { blockId, type } of results) {
                typeMap.set(blockId, type);
            }
        }
        
        console.log(`[CardTypeDetectionService] Detected ${typeMap.size} card types`);
        return typeMap;
    }
    
    /**
     * 检查块是否有特定类型的子级
     * 
     * @param blockId - 块 ID
     * @param childTypes - 需要检查的子级类型数组（如 ['i', 'l'] = 列表项或列表容器）
     * @returns 是否有指定类型的子级
     */
    private async checkHasChildren(blockId: string, childTypes?: string[]): Promise<boolean> {
        try {
            let typeFilter = '';
            if (childTypes && childTypes.length > 0) {
                const typeList = childTypes.map(t => `'${t}'`).join(', ');
                typeFilter = `AND type IN (${typeList})`;
            }
            
            const childBlocks = await sql(`
                SELECT id, type
                FROM blocks
                WHERE parent_id = '${blockId}'
                AND type != 'd'  -- 排除删除的块
                ${typeFilter}
                LIMIT 1
            `);
            
            return childBlocks && childBlocks.length > 0;
        } catch (err) {
            console.error(`[CardTypeDetectionService] Failed to check children for ${blockId}:`, err);
            return false;
        }
    }
}
