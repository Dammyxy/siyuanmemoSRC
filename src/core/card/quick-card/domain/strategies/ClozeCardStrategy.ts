/**
 * 快速制卡渲染器 - 填空卡片策略
 * 
 * 本文件实现填空卡片类型的正反面解析逻辑，支持 `{{}}` 符号。
 * 
 * @module ClozeCardStrategy
 */

import type { ICardFaceStrategy } from './ICardFaceStrategy';
import type { CardFaceData, HiddenContentType, QuickCardMetadata } from '../types';
import { removeIAL } from './utils';

/**
 * 填空卡片策略
 * 
 * @description 实现填空卡片的解析逻辑，支持 `{{}}` 符号。
 * 
 * 填空卡片的特点：
 * - 正面将 `{{填空}}` 替换为 `[...]`
 * - 反面将 `{{填空}}` 替换为 `<mark>填空</mark>`
 * - 正面隐藏标记（mark）内容
 * - 支持多个填空
 * 
 * @example
 * ```typescript
 * const strategy = new ClozeCardStrategy();
 * 
 * // 单个填空
 * const result1 = strategy.parse('DDD 的核心是{{领域模型}}', { symbol: '{{}}' });
 * // result1.front.html === 'DDD 的核心是[...]'
 * // result1.back.html === 'DDD 的核心是<mark>领域模型</mark>'
 * 
 * // 多个填空
 * const result2 = strategy.parse('{{DDD}}的核心是{{领域模型}}和{{通用语言}}', { symbol: '{{}}' });
 * // result2.front.html === '[...]的核心是[...]和[...]'
 * // result2.back.html === '<mark>DDD</mark>的核心是<mark>领域模型</mark>和<mark>通用语言</mark>'
 * ```
 */
export class ClozeCardStrategy implements ICardFaceStrategy {
  /**
   * 解析块内容为正反面数据
   * 
   * @description 将 `{{}}` 包裹的内容转换为填空或高亮标记。
   * 
   * 解析规则：
   * - 正面：将所有 `{{内容}}` 替换为 `[...]`
   * - 反面：将所有 `{{内容}}` 替换为 `<mark>内容</mark>`
   * - 正面隐藏标记（mark）内容
   * 
   * @param blockContent - 思源块的原始内容
   * @param metadata - 卡片元数据（未使用）
   * 
   * @returns 包含正反面数据的对象
   * 
   * @example
   * ```typescript
   * const strategy = new ClozeCardStrategy();
   * const result = strategy.parse('DDD 的核心是{{领域模型}}', { symbol: '{{}}' });
   * console.log(result.front.html); // 'DDD 的核心是[...]'
   * console.log(result.back.html);  // 'DDD 的核心是<mark>领域模型</mark>'
   * ```
   */
  parse(blockContent: string, _metadata: QuickCardMetadata): {
    front: CardFaceData;
    back: CardFaceData;
  } {
    // 先移除 IAL 属性块
    const cleanContent = removeIAL(blockContent);
    
    // 正面：将 {{内容}} 替换为 [...]
    const frontHtml = cleanContent.replace(/\{\{[^}]*\}\}/g, '[...]');
    
    // 反面：将 {{内容}} 替换为 <mark>内容</mark>
    const backHtml = cleanContent.replace(/\{\{([^}]*)\}\}/g, '<mark>$1</mark>');
    
    return {
      front: {
        html: frontHtml,
        hiddenTypes: ['mark'], // 正面隐藏标记内容
      },
      back: {
        html: backHtml,
        hiddenTypes: [], // 反面显示所有内容
      },
    };
  }
  
  /**
   * 判断是否应该隐藏特定类型的内容
   * 
   * @description 填空卡片在正面隐藏标记（mark）内容。
   * 
   * @param contentType - 内容类型
   * @param metadata - 卡片元数据（未使用）
   * 
   * @returns 如果是 mark 类型返回 true，否则返回 false
   * 
   * @example
   * ```typescript
   * const strategy = new ClozeCardStrategy();
   * console.log(strategy.shouldHideContent('mark', metadata));  // true
   * console.log(strategy.shouldHideContent('list', metadata));  // false
   * ```
   */
  shouldHideContent(
    contentType: HiddenContentType,
    _metadata: QuickCardMetadata
  ): boolean {
    // 填空卡片在正面隐藏标记内容
    return contentType === 'mark';
  }
}
