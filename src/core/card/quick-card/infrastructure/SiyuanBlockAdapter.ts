/**
 * 思源块适配器
 * 
 * @description 封装思源 API 调用，获取块数据
 * @layer Infrastructure Layer
 */

import type { SiyuanBlock } from '../domain/types';

/**
 * 思源 API 响应结构
 */
interface SiyuanApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

/**
 * getBlockInfo API 返回的数据结构
 */
interface BlockInfoData {
  id: string;
  rootID: string;
  parentID?: string;
  box: string;
  path: string;
}

/**
 * getBlockKramdown API 返回的数据结构
 */
interface BlockKramdownData {
  id: string;
  kramdown: string;
}

/**
 * 思源块适配器
 * 
 * @description 负责与思源 API 交互，获取块数据
 * @example
 * ```typescript
 * const adapter = new SiyuanBlockAdapter();
 * const block = await adapter.getBlock('20230101120000-abcdefg');
 * if (block) {
 *   console.log(block.content);
 * }
 * ```
 */
export class SiyuanBlockAdapter {
  /**
   * 获取块数据
   * 
   * @param blockId - 块 ID
   * @returns 块数据，如果块不存在或发生错误则返回 null
   * 
   * @example
   * ```typescript
   * const block = await adapter.getBlock('20230101120000-abcdefg');
   * if (block) {
   *   console.log(`Block content: ${block.content}`);
   * } else {
   *   console.log('Block not found');
   * }
   * ```
   */
  async getBlock(blockId: string): Promise<SiyuanBlock | null> {
    try {
      // 1. 获取块信息（包含 parentID）
      const infoResponse = await fetch('/api/block/getBlockInfo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: blockId }),
      });

      if (!infoResponse.ok) {
        console.warn(`[SiYuanMemo][SiyuanBlockAdapter] HTTP error: ${infoResponse.status} ${infoResponse.statusText}`);
        return null;
      }

      const infoResult: SiyuanApiResponse<BlockInfoData> = await infoResponse.json();

      if (infoResult.code !== 0) {
        console.warn(`[SiYuanMemo][SiyuanBlockAdapter] API error: ${infoResult.code} ${infoResult.msg}`);
        return null;
      }

      if (!infoResult.data) {
        console.warn(`[SiYuanMemo][SiyuanBlockAdapter] Block not found: ${blockId}`);
        return null;
      }

      // 2. 获取块内容（kramdown）
      const kramdownResponse = await fetch('/api/block/getBlockKramdown', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: blockId }),
      });

      if (!kramdownResponse.ok) {
        console.warn(`[SiYuanMemo][SiyuanBlockAdapter] Failed to get kramdown: ${kramdownResponse.status}`);
        return null;
      }

      const kramdownResult: SiyuanApiResponse<BlockKramdownData> = await kramdownResponse.json();

      if (kramdownResult.code !== 0 || !kramdownResult.data) {
        console.warn(`[SiYuanMemo][SiyuanBlockAdapter] Failed to get kramdown for block: ${blockId}`);
        return null;
      }

      // 3. 合并数据
      return {
        id: infoResult.data.id,
        content: kramdownResult.data.kramdown,
        parentID: infoResult.data.parentID,
      };
    } catch (error) {
      console.error(`[SiYuanMemo][SiyuanBlockAdapter] Failed to get block ${blockId}:`, error);
      return null;
    }
  }

  /**
   * 将 kramdown 转换为 HTML
   * 
   * @param kramdown - kramdown 内容
   * @returns HTML 字符串
   * 
   * @example
   * ```typescript
   * const html = adapter.kramdownToHtml('**bold** text');
   * console.log(html); // '<strong>bold</strong> text'
   * ```
   */
  kramdownToHtml(kramdown: string): string {
    try {
      console.log('[SiYuanMemo][SiyuanBlockAdapter] kramdownToHtml called with:', kramdown.substring(0, 100));
      
      // 使用 Lute 渲染 kramdown
      const lute = (window as any).Lute?.New();
      if (!lute) {
        console.warn('[SiYuanMemo][SiyuanBlockAdapter] Lute not available, returning raw kramdown');
        return kramdown;
      }
      
      // 🔧 尝试使用 SpinBlockDOM 方法，它会处理块引用
      let html: string;
      if (typeof lute.SpinBlockDOM === 'function') {
        console.log('[SiYuanMemo][SiyuanBlockAdapter] Using SpinBlockDOM');
        html = lute.SpinBlockDOM(kramdown);
      } else if (typeof lute.Md2BlockDOM === 'function') {
        console.log('[SiYuanMemo][SiyuanBlockAdapter] Using Md2BlockDOM');
        html = lute.Md2BlockDOM(kramdown);
      } else {
        console.warn('[SiYuanMemo][SiyuanBlockAdapter] No suitable Lute method found');
        return kramdown;
      }
      
      console.log('[SiYuanMemo][SiyuanBlockAdapter] Rendered HTML:', html?.substring(0, 200));
      
      return html || kramdown;
    } catch (error) {
      console.error('[SiYuanMemo][SiyuanBlockAdapter] Failed to render kramdown:', error);
      return kramdown;
    }
  }
}
