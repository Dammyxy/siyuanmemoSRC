/**
 * 思源块适配器（描述符卡专用）
 * 
 * 职责：
 * - 调用思源 API 获取块数据
 * - 获取块的 HTML 内容
 * - 查询块属性
 */

import { sql } from '@/core/siyuan';

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
  /**
   * 获取块信息
   */
  async getBlock(blockId: string): Promise<SiyuanBlock | null> {
    try {
      const response = await fetch('/api/block/getBlockInfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: blockId }),
      });

      if (!response.ok) {
        console.error('[SiyuanBlockAdapter] Failed to get block info:', response.statusText);
        return null;
      }

      const data = await response.json();
      if (data.code !== 0 || !data.data) {
        console.error('[SiyuanBlockAdapter] Invalid response:', data);
        return null;
      }

      return {
        id: blockId,
        content: data.data.content || '',
        parentId: data.data.parentID,
      };
    } catch (error) {
      console.error('[SiyuanBlockAdapter] Error getting block:', error);
      return null;
    }
  }

  /**
   * 获取块的 HTML 内容
   * 使用 /api/export/exportMdContent 导出为 HTML
   */
  async getBlockHtml(blockId: string): Promise<string | null> {
    try {
      const response = await fetch('/api/export/exportMdContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: blockId }),
      });

      if (!response.ok) {
        console.error('[SiyuanBlockAdapter] Failed to export HTML:', response.statusText);
        return null;
      }

      const data = await response.json();
      if (data.code !== 0 || !data.data) {
        console.error('[SiyuanBlockAdapter] Invalid export response:', data);
        return null;
      }

      return data.data.content || '';
    } catch (error) {
      console.error('[SiyuanBlockAdapter] Error exporting HTML:', error);
      return null;
    }
  }

  /**
   * 获取父块 ID
   */
  async getParentBlockId(blockId: string): Promise<string | null> {
    try {
      const block = await this.getBlock(blockId);
      return block?.parentId || null;
    } catch (error) {
      console.error('[SiyuanBlockAdapter] Error getting parent block ID:', error);
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
      console.error('[SiyuanBlockAdapter] Error getting block attribute:', error);
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
        LEFT JOIN attributes a ON b.id = a.block_id AND a.name = 'custom-fsrs-card-type'
        WHERE b.parent_id = '${parentBlockId}'
          AND b.id != '${currentDescriptorId}'
          AND a.value = 'descriptor'
        ORDER BY b.created ASC
      `;

      const results = await sql(query);
      return results || [];
    } catch (error) {
      console.error('[SiyuanBlockAdapter] Error querying sibling descriptors:', error);
      return [];
    }
  }
}
