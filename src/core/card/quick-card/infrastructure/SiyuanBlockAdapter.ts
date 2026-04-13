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
const QUICK_ATTRIBUTE_ONLY_LINE = /^(?:[*+-]\s*)?\{:\s*[^}]*\}\s*$/;
const QUICK_TRAILING_ATTRIBUTE_TAIL = /\s+\{:\s*[^}]*\}\s*$/;
const VISIBLE_MEDIA_SELECTOR = 'img,svg,video,audio,canvas,iframe,math,.katex,[data-type="NodeMathBlock"]';

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
    return this.renderQuickFaceHtml(kramdown);
  }

  /**
   * 为 quick-card face 提供安全渲染：
   * 1. 清理属性尾巴/属性行
   * 2. 优先 SpinBlockDOM
   * 3. 若结果结构性空白，重试 Md2BlockDOM
   * 4. 若仍为空白，回退到清理后的原始 kramdown
   */
  renderQuickFaceHtml(kramdown: string): string {
    const normalized = this.normalizeQuickKramdown(kramdown);
    if (!normalized) {
      return '';
    }

    const spinHtml = this.kramdownGateway.kramdownToHtml(normalized, {
      stripAttributeLines: true,
      preferSpinBlockDOM: true,
    });
    if (!this.isStructurallyBlankHtml(spinHtml)) {
      return spinHtml;
    }

    logger.debug('[SiYuanMemo][SiyuanBlockAdapter] SpinBlockDOM produced structurally blank quick-card HTML, retrying Md2BlockDOM', {
      preview: normalized.substring(0, 120),
    });

    const mdHtml = this.kramdownGateway.kramdownToHtml(normalized, {
      stripAttributeLines: true,
      preferSpinBlockDOM: false,
    });
    if (!this.isStructurallyBlankHtml(mdHtml)) {
      return mdHtml;
    }

    logger.warn('[SiYuanMemo][SiyuanBlockAdapter] Both quick-card renderers produced structurally blank HTML, falling back to normalized kramdown', {
      preview: normalized.substring(0, 120),
    });
    return normalized;
  }

  private normalizeQuickKramdown(kramdown: string): string {
    return kramdown
      .split(/\r?\n/)
      .filter((line) => !QUICK_ATTRIBUTE_ONLY_LINE.test(line.trim()))
      .map((line) => line.replace(QUICK_TRAILING_ATTRIBUTE_TAIL, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private isStructurallyBlankHtml(html: string): boolean {
    if (!html || html.trim().length === 0) {
      return true;
    }

    if (typeof DOMParser === 'undefined') {
      return this.isStructurallyBlankHtmlByString(html);
    }

    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('.protyle-action, .protyle-attr, script, style, template').forEach((node) => node.remove());

      if (doc.body.querySelector(VISIBLE_MEDIA_SELECTOR)) {
        return false;
      }

      const visibleText = (doc.body.textContent || '')
        .replace(/[\s\u00A0\u200B-\u200D\uFEFF]+/g, '')
        .trim();
      return visibleText.length === 0;
    } catch (error) {
      logger.warn('[SiYuanMemo][SiyuanBlockAdapter] Failed to inspect quick-card HTML structure, using string fallback', error);
      return this.isStructurallyBlankHtmlByString(html);
    }
  }

  private isStructurallyBlankHtmlByString(html: string): boolean {
    const textOnly = html
      .replace(/<div[^>]*class="[^"]*protyle-action[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div[^>]*class="[^"]*protyle-attr[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, '')
      .replace(/[\s\u00A0\u200B-\u200D\uFEFF]+/g, '')
      .trim();
    return textOnly.length === 0;
  }
}
