/**
 * 思源块适配器（描述符卡专用）
 * 
 * 职责：
 * - 调用思源 API 获取块数据
 * - 获取块的 HTML 内容
 * - 查询块属性
 */

import { sql } from '@/core/siyuan';
import { createLogger } from '@/utils/logger';
import { SiyuanKramdownGateway } from '@/core/card/common/infrastructure/SiyuanKramdownGateway';

const logger = createLogger('DescriptorSiyuanBlockAdapter');

/**
 * 思源块数据
 */
export interface SiyuanBlock {
  id: string;
  content: string;
  parentId?: string;
}

/**
 * 查询结果块
 */
export interface QueryBlock {
  id: string;
  content: string;
}

export class SiyuanBlockAdapter {
  private readonly kramdownGateway = new SiyuanKramdownGateway(logger);

  /**
   * 获取块信息
   * 使用 SQL 查询获取块的内容和父块 ID
   */
  async getBlock(blockId: string): Promise<SiyuanBlock | null> {
    try {
      const query = `
        SELECT id, content, parent_id
        FROM blocks
        WHERE id = '${blockId}'
      `;

      const results = await sql(query);
      
      if (!results || results.length === 0) {
        logger.warn('[SiYuanMemo][SiyuanBlockAdapter] Block not found:', blockId);
        return null;
      }

      const block = results[0];
      logger.debug('[SiYuanMemo][SiyuanBlockAdapter] getBlock result:', {
        id: block.id,
        content: block.content?.substring(0, 50),
        parentId: block.parent_id
      });

      return {
        id: block.id,
        content: block.content || '',
        parentId: block.parent_id,
      };
    } catch (error) {
      logger.error('[SiYuanMemo][SiyuanBlockAdapter] Error getting block:', error);
      return null;
    }
  }

  /**
   * 获取块的 kramdown 内容
   * 使用 /api/block/getBlockKramdown 获取
   */
  async getBlockKramdown(blockId: string): Promise<string | null> {
    return await this.kramdownGateway.getBlockKramdown(blockId);
  }

  /**
   * 将 kramdown 转换为 HTML
   * 使用思源的 Lute 引擎
   */
  kramdownToHtml(kramdown: string): string {
    return this.kramdownGateway.kramdownToHtml(kramdown, {
      stripAttributeLines: true,
      preferSpinBlockDOM: false,
    });
  }

  /**
   * 获取父块 ID
   */
  async getParentBlockId(blockId: string): Promise<string | null> {
    try {
      const block = await this.getBlock(blockId);
      return block?.parentId || null;
    } catch (error) {
      logger.error('[SiYuanMemo][SiyuanBlockAdapter] Error getting parent block ID:', error);
      return null;
    }
  }

  /**
   * 获取块属性
   */
  async getBlockAttribute(blockId: string, attrName: string): Promise<string | null> {
    try {
      const query = `
        SELECT value 
        FROM attributes 
        WHERE block_id = '${blockId}' 
          AND name = '${attrName}'
      `;

      const results = await sql(query);
      if (results && results.length > 0) {
        return results[0].value;
      }

      return null;
    } catch (error) {
      logger.error('[SiYuanMemo][SiyuanBlockAdapter] Error getting block attribute:', error);
      return null;
    }
  }

  /**
   * 查询同一父块下的其他描述符卡
   */
  async querySiblingDescriptors(
    parentBlockId: string,
    currentDescriptorId: string
  ): Promise<QueryBlock[]> {
    try {
      const query = `
        SELECT b.id, b.content
        FROM blocks b
        WHERE b.parent_id = '${parentBlockId}'
          AND b.id != '${currentDescriptorId}'
          AND (
            b.content LIKE '%;;%'
            OR b.content LIKE '%;<%'
            OR b.content LIKE '%;<>%'
          )
        ORDER BY b.created ASC
      `;

      const results = await sql(query);
      return results || [];
    } catch (error) {
      logger.error('[SiYuanMemo][SiyuanBlockAdapter] Error querying sibling descriptors:', error);
      return [];
    }
  }
}
