/**
 * Topic/Item 卡片类型检测
 *
 * 基于 SuperMemo 的概念：
 * - Topic: 无答案的内容块（纯阅读材料）
 * - Item: 有答案的卡片（问答卡片）
 */

import { getBlockText } from '@/core/siyuan/block';
import { getBlockAttrs, getBlockInfo, sql } from '@/core/siyuan/api';
import { batchQueryWithConcurrency } from '../../utils/batchQuery';

/**
 * 获取块类型（通过 SQL 查询）
 *
 * getBlockInfo() 可能不返回 type 属性，所以直接查询数据库
 */
async function getBlockType(blockId: string): Promise<string | null> {
    try {
        const result = await sql(`
            SELECT type FROM blocks
            WHERE id = '${blockId}'
            LIMIT 1
        `);
        return result && result.length > 0 ? result[0].type : null;
    } catch (err) {
        console.error(`[SiYuanMemo] Failed to get block type:`, err);
        return null;
    }
}

/**
 * 检测块是否包含答案（Item 判断）
 *
 * 优化原则：
 * 1. 只识别 Item，非 Item 即 Topic
 * 2. 列表项块（'i'）：必须有列表项或列表容器子级才是 Item（父子问答结构）
 * 3. 超级块（'s'）：有任何子级就是 Item（不限制子级类型）
 * 4. 只有 :: 分隔符才是 Item，? 标记的是 Topic
 * 5. 列表项的段落子级不算，只有列表子级才算
 *
 * 注意：思源数据库中块类型使用单字母编码：
 * - 'h' = NodeHeading（标题）
 * - 'i' = NodeListItem（列表项）
 * - 's' = NodeSuperBlock（超级块）
 * - 'p' = NodeParagraph（段落）
 * - 'l' = NodeList（列表容器）
 */
export async function hasAnswerBlocks(blockId: string): Promise<boolean> {
    try {
        // 0. 获取块的原始内容（包含 markdown 标记）
        // 使用 SQL 查询获取 markdown 字段，而不是 getBlockText（会去除标记）
        const blockData = await sql(`
            SELECT markdown, content FROM blocks
            WHERE id = '${blockId}'
            LIMIT 1
        `);
        
        const markdown = blockData && blockData.length > 0 ? blockData[0].markdown : '';
        const content = blockData && blockData.length > 0 ? blockData[0].content : '';
        
        // 1. 内容包含标记语法（==文本==）→ Item
        // 标记通常用于强调答案或重要内容，是 Item 的特征
        if (/==([^=]+)==/.test(markdown) || /==([^=]+)==/.test(content)) {
            console.log(`[SiYuanMemo] Block ${blockId}: Item (mark syntax == found)`);
            return true;
        }
        
        // 2. 内容包含 :: 分隔符 → Item（明确的问答卡片）
        if (/::/.test(content)) {
            console.log(`[SiYuanMemo] Block ${blockId}: Item (:: separator found)`);
            return true;
        }

        // 2. 获取块类型（通过 SQL 查询）
        const type = await getBlockType(blockId);
        if (!type) {
            console.log(`[SiYuanMemo] Block ${blockId}: Topic (block not found)`);
            return false;
        }

        // 3. 标题块（'h'）→ Item（结构化知识）
        if (type === 'h') {
            console.log(`[SiYuanMemo] Block ${blockId}: Item (type: h = NodeHeading)`);
            return true;
        }

        // 4. 列表项块（'i'）→ 必须有列表项或列表容器子级才是 Item
        // 注意：不是列表容器（'l' = NodeList），而是列表项（'i' = NodeListItem）
        // 只有列表子级才算（列表项或列表容器），段落子级忽略
        if (type === 'i') {
            const hasChildren = await checkHasChildren(blockId, ['i', 'l']);  // ← 检查列表项或列表容器
            console.log(`[SiYuanMemo] Block ${blockId}: ${hasChildren ? 'Item' : 'Topic'} (type: i = NodeListItem, hasListChildren: ${hasChildren})`);
            return hasChildren;
        }

        // 5. 超级块（'s'）→ 有任何子级就是 Item
        // 不限制子级类型（段落、列表项、标题等都可以）
        if (type === 's') {
            const hasChildren = await checkHasChildren(blockId);  // ← 不传类型，检查任何子级
            console.log(`[SiYuanMemo] Block ${blockId}: ${hasChildren ? 'Item' : 'Topic'} (type: s = NodeSuperBlock, hasAnyChildren: ${hasChildren})`);
            return hasChildren;
        }

        // 6. 其他 → Topic（纯段落'p'、列表容器'l'、无子级的列表项/超级块等）
        console.log(`[SiYuanMemo] Block ${blockId}: Topic (type: ${type}, no answer blocks)`);
        return false;
    } catch (err: any) {
        const errorMsg = err?.message || String(err);

        // 区分不同类型的错误
        if (errorMsg.includes('tree not found') || errorMsg.includes('Not found entity')) {
            console.warn(`[SiYuanMemo] Block ${blockId}: Topic (document tree deleted - "${errorMsg}")`);
            return false; // 已删除的文档默认为 Topic
        }

        if (errorMsg.includes('正在进行数据索引') || errorMsg.includes('索引')) {
            console.warn(`[SiYuanMemo] Block ${blockId}: Topic (indexing in progress - "${errorMsg}")`);
            return false; // 正在索引的文档默认为 Topic
        }

        console.error(`[SiYuanMemo] Block ${blockId}: Detection error - ${errorMsg}`);
        return false; // 其他错误也默认为 Topic
    }
}

/**
 * 检查块是否有特定类型的子级
 *
 * @param blockId 块 ID
 * @param childTypes 需要检查的子级类型数组（如 ['i', 'l'] = 列表项或列表容器）
 * @returns 是否有指定类型的子级
 */
async function checkHasChildren(blockId: string, childTypes?: string[]): Promise<boolean> {
    try {
        // ✅ 改进：排除删除的块，只查询可见块
        let typeFilter = '';
        let typeDesc = 'any';

        if (childTypes && childTypes.length > 0) {
            // 支持多个类型（如 'i', 'l'）
            const typeList = childTypes.map(t => `'${t}'`).join(', ');
            typeFilter = `AND type IN (${typeList})`;
            typeDesc = childTypes.join(',');
        }

        const childBlocks = await sql(`
            SELECT id, type, content
            FROM blocks
            WHERE parent_id = '${blockId}'
            AND type != 'd'  -- 排除删除的块
            ${typeFilter}    -- 可选：只检查特定类型的子级
            LIMIT 5
        `);

        if (childBlocks && childBlocks.length > 0) {
            // ✅ 显示子级信息（诊断）
            const childInfo = childBlocks.map((b: any) => `${b.type}:${b.content?.substring(0, 20) || '(empty)'}`).join(', ');
            console.log(`[SiYuanMemo] Block ${blockId} has ${childBlocks.length} children (type: ${typeDesc}): ${childInfo}`);
            return true;
        }

        return false;
    } catch (err) {
        return false;
    }
}

/**
 * 检测卡片类型
 *
 * @param blockId 块 ID
 * @returns 'topic' | 'item'
 */
export async function detectCardType(blockId: string): Promise<'topic' | 'item'> {
    const hasAnswer = await hasAnswerBlocks(blockId);
    return hasAnswer ? 'item' : 'topic';
}

/**
 * 初始化 A-Factor（从优先级推导）
 *
 * SuperMemo A-Factor 范围：1.2 - 6.0
 * 映射关系：优先级 0-100 → A-Factor 1.2-6.0
 *
 * @param priority 优先级（0-100）
 * @returns A-Factor（1.2-6.0）
 */
export function initializeAFactor(priority: number): number {
    // 优先级 0-100 → A-Factor 1.2-6.0
    // 公式：aFactor = 1.2 + (priority / 100) * 4.8
    const aFactor = 1.2 + (priority / 100) * 4.8;
    return Math.round(aFactor * 100) / 100; // 保留两位小数
}

/**
 * 批量检测卡片类型
 *
 * @param blockIds 块 ID 数组
 * @returns Map<blockId, 'topic' | 'item'>
 */
export async function batchDetectCardType(
    blockIds: string[]
): Promise<Map<string, 'topic' | 'item'>> {
    const result = new Map<string, 'topic' | 'item'>()

    // 使用优化的批量查询（批量大小 200，最大并发 3）
    const results = await batchQueryWithConcurrency(
        blockIds,
        { batchSize: 200, maxConcurrency: 3 },
        async (batch) => {
            const promises = batch.map(async (blockId) => {
                const type = await detectCardType(blockId)
                return { blockId, type }
            })
            return await Promise.all(promises)
        },
    )

    results.forEach(({ blockId, type }) => {
        result.set(blockId, type)
    })

    return result
}
