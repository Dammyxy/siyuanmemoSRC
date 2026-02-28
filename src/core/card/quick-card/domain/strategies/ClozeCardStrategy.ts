/**
 * 快速制卡渲染器 - 填空卡片策略
 * 
 * 本文件实现填空卡片类型的正反面解析逻辑，支持 `{{}}`、`==` 和思源标记符号。
 * 
 * @module ClozeCardStrategy
 */

import type { ICardFaceStrategy } from './ICardFaceStrategy';
import type { CardFaceData, HiddenContentType, QuickCardMetadata } from '../types';
import { removeIAL } from './utils';
import { createLogger } from '@/utils/logger';
import { ClozeDetector } from '@/utils/cloze-detector';

const logger = createLogger('ClozeCardStrategy');

/**
 * 填空卡片策略
 * 
 * @description 实现填空卡片的解析逻辑，支持 `{{}}`、`==` 和思源标记符号。
 * 
 * 填空卡片的特点：
 * - 正面将 `{{填空}}`、`==填空==` 或 `<span data-type="mark">填空</span>` 替换为 `[...]`
 * - 反面将填空替换为 `<mark>填空</mark>`
 * - 正面隐藏标记（mark）内容
 * - 支持多个填空
 * - 支持混合使用三种符号
 * - 支持多填空卡片（根据 typeMarker 只隐藏特定填空）
 * 
 * @example
 * ```typescript
 * const strategy = new ClozeCardStrategy();
 * 
 * // 使用 {{}} 符号
 * const result1 = strategy.parse('DDD 的核心是{{领域模型}}', { symbol: '{{}}' });
 * // result1.front.html === 'DDD 的核心是[...]'
 * // result1.back.html === 'DDD 的核心是<mark>领域模型</mark>'
 * 
 * // 使用 == 符号
 * const result2 = strategy.parse('DDD 的核心是==领域模型==', { symbol: '==' });
 * // result2.front.html === 'DDD 的核心是[...]'
 * // result2.back.html === 'DDD 的核心是<mark>领域模型</mark>'
 * 
 * // 使用思源标记
 * const result3 = strategy.parse('DDD 的核心是<span data-type="mark">领域模型</span>', { symbol: 'mark' });
 * // result3.front.html === 'DDD 的核心是[...]'
 * // result3.back.html === 'DDD 的核心是<mark>领域模型</mark>'
 * 
 * // 多填空卡片（只隐藏第 2 个填空）
 * const result4 = strategy.parse('{{A}}、{{B}}、{{C}}', { symbol: '{{}}', typeMarker: 'cloze-1' });
 * // result4.front.html === '<mark>A</mark>、[...]、<mark>C</mark>'
 * // result4.back.html === '<mark>A</mark>、<mark>B</mark>、<mark>C</mark>'
 * ```
 */
export class ClozeCardStrategy implements ICardFaceStrategy {
  /**
   * 提取所有填空
   * 
   * @param content - 块内容
   * @returns 填空列表，包含文本和位置信息
   */
  private extractClozes(content: string): Array<{ text: string; start: number; end: number; type: 'brace' | 'equal' | 'mark' | 'latex' }> {
    return ClozeDetector.extractClozes(content);
  }
  
  /**
   * 解析块内容为正反面数据
   * 
   * @description 将 `{{}}` 或 `==` 包裹的内容转换为填空或高亮标记。
   * 
   * 解析规则：
   * - 如果有 typeMarker（如 cloze-0, cloze-1），只隐藏对应索引的填空
   * - 如果没有 typeMarker，隐藏所有填空
   * - 正面：将填空替换为 `[...]` 或 `<mark>内容</mark>`
   * - 反面：将所有填空替换为 `<mark>内容</mark>`
   * 
   * @param blockContent - 思源块的原始内容
   * @param metadata - 卡片元数据
   * 
   * @returns 包含正反面数据的对象
   */
  parse(blockContent: string, metadata: QuickCardMetadata): {
    front: CardFaceData;
    back: CardFaceData;
  } {
    // 先移除 IAL 属性块
    const cleanContent = removeIAL(blockContent);
    
    // 提取所有填空
    const clozes = this.extractClozes(cleanContent);
    
    // 检查是否是多填空卡片（有 typeMarker 且格式为 cloze-N）
    const isMultiCloze = metadata.typeMarker && /^cloze-\d+$/.test(metadata.typeMarker);
    const targetIndex = isMultiCloze ? parseInt(metadata.typeMarker!.replace('cloze-', '')) : -1;
    
    logger.debug('parse', {
      typeMarker: metadata.typeMarker,
      isMultiCloze,
      targetIndex,
      clozeCount: clozes.length,
    });
    
    // 构建正面和反面 HTML
    let frontHtml = cleanContent;
    let backHtml = cleanContent;
    
    // 从后往前替换，避免位置偏移
    for (let i = clozes.length - 1; i >= 0; i--) {
      const cloze = clozes[i];
      const isLatexCloze = cloze.type === 'latex';
      const latexFrontPlaceholder = '\\boxed{\\text{[...]}}';
      const frontPlaceholder = isLatexCloze ? latexFrontPlaceholder : '<mark>[...]</mark>';
      const backAnswer = isLatexCloze ? cloze.text : `<mark>${cloze.text}</mark>`;
      
      if (isMultiCloze) {
        // 多填空模式：只隐藏目标索引的填空
        if (i === targetIndex) {
          // 目标填空：正面显示淡绿色背景的 [...]，反面高亮显示答案
          frontHtml = frontHtml.substring(0, cloze.start) + frontPlaceholder + frontHtml.substring(cloze.end);
          backHtml = backHtml.substring(0, cloze.start) + backAnswer + backHtml.substring(cloze.end);
        } else {
          // 其他填空：正反面都显示普通文本（不高亮）
          frontHtml = frontHtml.substring(0, cloze.start) + cloze.text + frontHtml.substring(cloze.end);
          backHtml = backHtml.substring(0, cloze.start) + cloze.text + backHtml.substring(cloze.end);
        }
      } else {
        // 单填空模式：隐藏所有填空
        frontHtml = frontHtml.substring(0, cloze.start) + (isLatexCloze ? latexFrontPlaceholder : '[...]') + frontHtml.substring(cloze.end);
        backHtml = backHtml.substring(0, cloze.start) + backAnswer + backHtml.substring(cloze.end);
      }
    }
    
    return {
      front: {
        html: frontHtml,
        hiddenTypes: [], // 不使用 hiddenTypes，因为我们已经手动处理了
      },
      back: {
        html: backHtml,
        hiddenTypes: [],
      },
    };
  }
  
  /**
   * 判断是否应该隐藏特定类型的内容
   * 
   * @description 填空卡片不使用 hiddenTypes 机制，因为已经在 parse 中处理了。
   * 
   * @param contentType - 内容类型
   * @param metadata - 卡片元数据（未使用）
   * 
   * @returns 始终返回 false
   */
  shouldHideContent(
    _contentType: HiddenContentType,
    _metadata: QuickCardMetadata
  ): boolean {
    // 不使用 hiddenTypes 机制
    return false;
  }
}
