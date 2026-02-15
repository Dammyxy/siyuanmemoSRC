/**
 * 快速制卡渲染器 - 列表模版卡片策略
 * 
 * 本文件实现列表模版卡片类型的正反面解析逻辑，支持 `>>>` 符号。
 * 
 * @module MultiLineCardStrategy
 */

import type { ICardFaceStrategy } from './ICardFaceStrategy';
import type { CardFaceData, HiddenContentType, QuickCardMetadata } from '../types';
import { removeIAL } from './utils';

/**
 * 列表模版卡片策略
 * 
 * @description 实现列表模版卡片的解析逻辑，支持 `>>>` 符号。
 * 
 * 列表模版卡片的特点：
 * - 正面显示父块内容（去除 `>>>` 符号），隐藏子列表项
 * - 反面显示父块内容 + 所有子列表项
 * - 正面应用 `card__block--hideli` CSS 类隐藏列表
 * 
 * @example
 * ```typescript
 * const strategy = new MultiLineCardStrategy();
 * 
 * const result = strategy.parse('>>> DDD 的四层架构\n- 表现层\n- 应用层', { symbol: '>>>' });
 * // result.front.html === 'DDD 的四层架构'
 * // result.back.html === 'DDD 的四层架构\n- 表现层\n- 应用层'
 * // result.front.hiddenTypes === ['list']
 * ```
 */
export class MultiLineCardStrategy implements ICardFaceStrategy {
  /**
   * 解析块内容为正反面数据
   * 
   * @description 去除 `>>>` 符号，生成正反面数据。
   * 
   * 解析规则：
   * - 正面：父块内容（去除 `>>>` 符号）
   * - 反面：完整内容（去除 `>>>` 符号）
   * - 正面隐藏列表（list）内容
   * 
   * @param blockContent - 思源块的原始内容
   * @param metadata - 卡片元数据，包含符号信息
   * 
   * @returns 包含正反面数据的对象
   * 
   * @example
   * ```typescript
   * const strategy = new MultiLineCardStrategy();
   * const result = strategy.parse('>>> DDD 的四层架构', { symbol: '>>>' });
   * console.log(result.front.html); // 'DDD 的四层架构'
   * console.log(result.back.html);  // 'DDD 的四层架构'
   * console.log(result.front.hiddenTypes); // ['list']
   * ```
   */
  parse(blockContent: string, metadata: QuickCardMetadata): {
    front: CardFaceData;
    back: CardFaceData;
  } {
    const { symbol } = metadata;
    
    // 先移除 IAL 属性块，再去除 >>> 符号
    const cleanContent = removeIAL(blockContent);
    const contentWithoutSymbol = cleanContent.replace(symbol, '').trim();
    
    return {
      front: {
        html: contentWithoutSymbol,
        hiddenTypes: ['list'], // 正面隐藏列表内容
      },
      back: {
        html: contentWithoutSymbol,
        hiddenTypes: [], // 反面显示所有内容
      },
    };
  }
  
  /**
   * 判断是否应该隐藏特定类型的内容
   * 
   * @description 列表模版卡片在正面隐藏列表（list）内容。
   * 
   * @param contentType - 内容类型
   * @param metadata - 卡片元数据（未使用）
   * 
   * @returns 如果是 list 类型返回 true，否则返回 false
   * 
   * @example
   * ```typescript
   * const strategy = new MultiLineCardStrategy();
   * console.log(strategy.shouldHideContent('list', metadata));  // true
   * console.log(strategy.shouldHideContent('mark', metadata));  // false
   * ```
   */
  shouldHideContent(
    contentType: HiddenContentType,
    _metadata: QuickCardMetadata
  ): boolean {
    // 列表模版卡片在正面隐藏列表内容
    return contentType === 'list';
  }
}
