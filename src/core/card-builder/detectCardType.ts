/**
 * Topic/Item 卡片类型检测
 *
 * 基于 SuperMemo 的概念：
 * - Topic: 无答案的内容块（纯阅读材料）
 * - Item: 有答案的卡片（问答卡片）
 */

import { sql } from '@/core/siyuan/api';
import { createLogger } from '@/utils/logger';
import { batchQueryWithConcurrency } from '../../utils/batchQuery';
import { detectAnswerSyntax, detectTypeByStructure, type CardType } from '@/core/card-type/detectionRules';

const logger = createLogger('detectCardType');

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
    logger.error('Failed to get block type:', err);
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
    // 使用 SQL 查询获取 markdown 字段，而不是 getBlockText（会去除标记）
    const blockData = await sql(`
      SELECT markdown, content FROM blocks
      WHERE id = '${blockId}'
      LIMIT 1
    `);

    const markdown = blockData && blockData.length > 0 ? blockData[0].markdown : '';
    const content = blockData && blockData.length > 0 ? blockData[0].content : '';

    const syntaxReason = detectAnswerSyntax(markdown, content, 'basic');
    if (syntaxReason) {
      logger.debug(`Block ${blockId}: item (${syntaxReason})`);
      return true;
    }

    const blockType = await getBlockType(blockId);
    if (!blockType) {
      logger.debug(`Block ${blockId}: topic (block not found)`);
      return false;
    }

    const hasListChildren = blockType === 'i' ? await checkHasChildren(blockId, ['i', 'l']) : false;
    const hasAnyChildren = blockType === 's' ? await checkHasChildren(blockId) : false;
    const cardType = detectTypeByStructure({
      blockType,
      hasListChildren,
      hasAnyChildren,
    });

    logger.debug(`Block ${blockId}: ${cardType} (type: ${blockType})`);
    return cardType === 'item';
  } catch (err: any) {
    const errorMsg = err?.message || String(err);

    if (errorMsg.includes('tree not found') || errorMsg.includes('Not found entity')) {
      logger.warn(`Block ${blockId}: topic (document tree deleted - "${errorMsg}")`);
      return false;
    }

    if (errorMsg.includes('正在进行数据索引') || errorMsg.includes('索引')) {
      logger.warn(`Block ${blockId}: topic (indexing in progress - "${errorMsg}")`);
      return false;
    }

    logger.error(`Block ${blockId}: Detection error - ${errorMsg}`);
    return false;
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
    let typeFilter = '';
    let typeDesc = 'any';

    if (childTypes && childTypes.length > 0) {
      const typeList = childTypes.map((t) => `'${t}'`).join(', ');
      typeFilter = `AND type IN (${typeList})`;
      typeDesc = childTypes.join(',');
    }

    const childBlocks = await sql(`
      SELECT id, type, content
      FROM blocks
      WHERE parent_id = '${blockId}'
      AND type != 'd'
      ${typeFilter}
      LIMIT 5
    `);

    if (childBlocks && childBlocks.length > 0) {
      const childInfo = childBlocks
        .map((b: any) => `${b.type}:${b.content?.substring(0, 20) || '(empty)'}`)
        .join(', ');
      logger.debug(`Block ${blockId} has ${childBlocks.length} children (type: ${typeDesc}): ${childInfo}`);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * 检测卡片类型
 *
 * @param blockId 块 ID
 * @returns 'topic' | 'item'
 */
export async function detectCardType(blockId: string): Promise<CardType> {
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
  const aFactor = 1.2 + (priority / 100) * 4.8;
  return Math.round(aFactor * 100) / 100;
}

/**
 * 批量检测卡片类型
 *
 * @param blockIds 块 ID 数组
 * @returns Map<blockId, 'topic' | 'item'>
 */
export async function batchDetectCardType(
  blockIds: string[]
): Promise<Map<string, CardType>> {
  const result = new Map<string, CardType>();

  const results = await batchQueryWithConcurrency(
    blockIds,
    { batchSize: 200, maxConcurrency: 3 },
    async (batch) => {
      const promises = batch.map(async (blockId) => {
        const type = await detectCardType(blockId);
        return { blockId, type };
      });
      return await Promise.all(promises);
    }
  );

  results.forEach(({ blockId, type }) => {
    result.set(blockId, type);
  });

  return result;
}

