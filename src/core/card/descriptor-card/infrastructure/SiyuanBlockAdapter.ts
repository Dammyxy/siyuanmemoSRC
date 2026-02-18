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
        console.warn('[SiYuanMemo][SiyuanBlockAdapter] Block not found:', blockId);
        return null;
      }

      const block = results[0];
      console.log('[SiYuanMemo][SiyuanBlockAdapter] getBlock result:', {
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
      console.error('[SiYuanMemo][SiyuanBlockAdapter] Error getting block:', error);
      return null;
    }
  }

  /**
   * 获取块的 kramdown 内容
   * 使用 /api/block/getBlockKramdown 获取
   */
  async getBlockKramdown(blockId: string): Promise<string | null> {
    try {
      const response = await fetch('/api/block/getBlockKramdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: blockId }),
      });

      if (!response.ok) {
        console.error('[SiYuanMemo][SiyuanBlockAdapter] Failed to get kramdown:', response.statusText);
        return null;
      }

      const data = await response.json();
      if (data.code !== 0 || !data.data) {
        console.error('[SiYuanMemo][SiyuanBlockAdapter] Invalid kramdown response:', data);
        return null;
      }

      return data.data.kramdown || '';
    } catch (error) {
      console.error('[SiYuanMemo][SiyuanBlockAdapter] Error getting kramdown:', error);
      return null;
    }
  }

  /**
   * 将 kramdown 转换为 HTML
   * 使用思源的 Lute 引擎
   */
  kramdownToHtml(kramdown: string): string {
    try {
      const Lute = (window as any).Lute;
      if (!Lute || typeof Lute.New !== 'function') {
        console.error('[SiYuanMemo][SiyuanBlockAdapter] Lute not available');
        return kramdown; // 降级：直接返回 kramdown
      }

      const lute = Lute.New();
      // 移除 kramdown 末尾的属性行（{: ...}）
      const lines = kramdown.split('\n');
      const contentLines = lines.filter(line => !line.trim().startsWith('{:'));
      const content = contentLines.join('\n');
      
      // 转换为 HTML
      const html = lute.Md2BlockDOM(content);
      return html;
    } catch (error) {
      console.error('[SiYuanMemo][SiyuanBlockAdapter] Error converting kramdown to HTML:', error);
      return kramdown; // 降级：直接返回 kramdown
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
      console.error('[SiYuanMemo][SiyuanBlockAdapter] Error getting parent block ID:', error);
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
      console.error('[SiYuanMemo][SiyuanBlockAdapter] Error getting block attribute:', error);
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
      console.error('[SiYuanMemo][SiyuanBlockAdapter] Error querying sibling descriptors:', error);
      return [];
    }
  }
}
