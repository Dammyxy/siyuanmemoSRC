/**
 * Topic/Item 卡片类型检测
 *
 * 基于 SuperMemo 的概念：
 * - Topic: 无答案的内容块（纯阅读材料）
 * - Item: 有答案的卡片（问答卡片）
 */

import { getBlockText } from '@/core/siyuan/block';
import { getBlockAttrs, getBlockInfo, sql } from '@/core/siyuan/api';

/**
 * 检测块是否包含答案（Item 判断）
 *
 * Item 判断条件（满足任一即为 Item）：
 * 1. 内容包含 `::` 或 `?` 分隔符（QA 卡片）
 * 2. 列表块且有子块
 * 3. 标题块
 * 4. 超级块且有子块
 * 5. 已标记闪卡
 */
export async function hasAnswerBlocks(blockId: string): Promise<boolean> {
    try {
        // 1. 检查内容分隔符
        const content = await getBlockText(blockId);
        if (/(::|\?)/.test(content)) return true;

        // 2. 获取块信息
        const blockInfo = await getBlockInfo(blockId);
        if (!blockInfo) return false;

        const type = blockInfo.type; // 例如：NodeParagraph, NodeHeading, NodeList, NodeSuperBlock

        // 3. 检查块类型
        // 标题块 → Item（表示结构化知识）
        if (type === 'NodeHeading') {
            return true;
        }

        // 4. 列表块且有子块 → Item
        if (type === 'NodeList' || type === 'NodeListItem') {
            // 使用 SQL 查询检查是否有子块
            const childBlocks = await sql(`
                SELECT id FROM blocks
                WHERE parent_id = '${blockId}'
                LIMIT 1
            `);
            if (childBlocks && childBlocks.length > 0) {
                return true;
            }
        }

        // 5. 超级块且有子块 → Item
        if (type === 'NodeSuperBlock') {
            const childBlocks = await sql(`
                SELECT id FROM blocks
                WHERE parent_id = '${blockId}'
                LIMIT 1
            `);
            if (childBlocks && childBlocks.length > 0) {
                return true;
            }
        }

        // 6. 检查是否有 Riff 标记
        const attrs = await getBlockAttrs(blockId);
        if (attrs['custom-riff-decks']) {
            return true;
        }

        return false;
    } catch (err) {
        console.error('[FSRS] Failed to detect card type:', err);
        return false; // 默认为 Topic
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
    const result = new Map<string, 'topic' | 'item'>();

    // 批量处理（避免并发过多）
    const batchSize = 10;
    for (let i = 0; i < blockIds.length; i += batchSize) {
        const batch = blockIds.slice(i, i + batchSize);
        const promises = batch.map(async (blockId) => {
            const type = await detectCardType(blockId);
            return { blockId, type };
        });
        const batchResults = await Promise.all(promises);
        batchResults.forEach(({ blockId, type }) => {
            result.set(blockId, type);
        });
    }

    return result;
}
