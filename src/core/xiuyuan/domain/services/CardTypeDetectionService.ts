/**
 * CardTypeDetectionService - 卡片类型检测领域服务
 *
 * 智能检测卡片类型（Topic/Item）：
 * - 文档块 -> topic
 * - 有答案语法（==, {{}}, ::, ;;, 方向符）-> item
 * - 标题块 -> item
 * - 列表项有列表子级 -> item
 * - 超级块有子级 -> item
 * - 其他 -> topic
 */

import { sql } from '@/core/siyuan/api';
import { createLogger } from '@/utils/logger';
import { batchQueryWithConcurrency } from '@/utils/batchQuery';
import { detectAnswerSyntax, detectTypeByStructure, type CardType } from '@/core/card-type/detectionRules';

const logger = createLogger('CardTypeDetectionService');

export type { CardType } from '@/core/card-type/detectionRules';

/**
 * 卡片类型检测领域服务
 */
export class CardTypeDetectionService {
  /**
   * 检测单个卡片的类型
   */
  async detectCardType(blockId: string): Promise<CardType> {
    try {
      const blockData = await sql(`
        SELECT type, markdown, content FROM blocks
        WHERE id = '${blockId}'
        LIMIT 1
      `);

      if (!blockData || blockData.length === 0) {
        logger.debug(`Block ${blockId}: topic (block not found)`);
        return 'topic';
      }

      const blockType = blockData[0].type;
      const markdown = blockData[0].markdown || '';
      const content = blockData[0].content || '';

      if (blockType === 'd') {
        logger.debug(`Block ${blockId}: topic (document block)`);
        return 'topic';
      }

      const syntaxReason = detectAnswerSyntax(markdown, content, 'extended');
      if (syntaxReason) {
        logger.debug(`Block ${blockId}: item (${syntaxReason})`);
        return 'item';
      }

      const hasListChildren = blockType === 'i' ? await this.checkHasChildren(blockId, ['i', 'l']) : false;
      const hasAnyChildren = blockType === 's' ? await this.checkHasChildren(blockId) : false;
      const cardType = detectTypeByStructure({
        blockType,
        hasListChildren,
        hasAnyChildren,
      });

      logger.debug(`Block ${blockId}: ${cardType} (type: ${blockType})`);
      return cardType;
    } catch (err) {
      logger.error(`Detection error for ${blockId}:`, err);
      return 'topic';
    }
  }

  /**
   * 批量检测卡片类型
   */
  async batchDetectCardTypes(blockIds: string[]): Promise<Map<string, CardType>> {
    const typeMap = new Map<string, CardType>();

    const results = await batchQueryWithConcurrency(
      blockIds,
      { batchSize: 100, maxConcurrency: 3 },
      async (batch) => {
        const rows = await Promise.all(
          batch.map(async (blockId) => ({
            blockId,
            type: await this.detectCardType(blockId),
          }))
        );
        return rows;
      }
    );

    for (const { blockId, type } of results) {
      typeMap.set(blockId, type);
    }

    logger.debug(`Detected ${typeMap.size} card types`);
    return typeMap;
  }

  /**
   * 检查块是否有特定类型的子级
   */
  private async checkHasChildren(blockId: string, childTypes?: string[]): Promise<boolean> {
    try {
      let typeFilter = '';
      if (childTypes && childTypes.length > 0) {
        const typeList = childTypes.map((t) => `'${t}'`).join(', ');
        typeFilter = `AND type IN (${typeList})`;
      }

      const childBlocks = await sql(`
        SELECT id, type
        FROM blocks
        WHERE parent_id = '${blockId}'
        AND type != 'd'
        ${typeFilter}
        LIMIT 1
      `);

      return Boolean(childBlocks && childBlocks.length > 0);
    } catch (err) {
      logger.error(`Failed to check children for ${blockId}:`, err);
      return false;
    }
  }
}

