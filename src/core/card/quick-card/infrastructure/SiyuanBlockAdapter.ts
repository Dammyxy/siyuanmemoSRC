/**
 * 思源块适配器
 * 
 * @description 封装思源 API 调用，获取块数据
 * @layer Infrastructure Layer
 */

import type { SiyuanBlock } from '../domain/types';
import { createLogger } from '@/utils/logger';
import { SiyuanKramdownGateway } from '@/core/card/common/infrastructure/SiyuanKramdownGateway';

const logger = createLogger('QuickCardSiyuanBlockAdapter');

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
  type?: string;
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
  private readonly kramdownGateway = new SiyuanKramdownGateway(logger);

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
        logger.warn(`[SiYuanMemo][SiyuanBlockAdapter] HTTP error: ${infoResponse.status} ${infoResponse.statusText}`);
        return null;
      }

      const infoResult: SiyuanApiResponse<BlockInfoData> = await infoResponse.json();

      if (infoResult.code !== 0) {
        logger.warn(`[SiYuanMemo][SiyuanBlockAdapter] API error: ${infoResult.code} ${infoResult.msg}`);
        return null;
      }

      if (!infoResult.data) {
        logger.warn(`[SiYuanMemo][SiyuanBlockAdapter] Block not found: ${blockId}`);
        return null;
      }

      // 2. 获取块内容（kramdown）
      const kramdown = await this.kramdownGateway.getBlockKramdown(blockId);
      if (kramdown === null) {
        return null;
      }

      // 3. 合并数据
      return {
        id: infoResult.data.id,
        content: kramdown,
        parentID: infoResult.data.parentID,
        type: infoResult.data.type,
      };
    } catch (error) {
      logger.error(`[SiYuanMemo][SiyuanBlockAdapter] Failed to get block ${blockId}:`, error);
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
    return this.kramdownGateway.kramdownToHtml(kramdown, {
      preferSpinBlockDOM: true,
    });
  }
}
