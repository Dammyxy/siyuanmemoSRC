/**
 * 快速制卡渲染器 - 概念卡片策略
 * 
 * 本文件实现概念卡片类型的正反面解析逻辑，支持 `::` 符号。
 * 
 * @module ConceptCardStrategy
 */

import type { ICardFaceStrategy } from './ICardFaceStrategy';
import type { CardFaceData, HiddenContentType, QuickCardMetadata } from '../types';
import { splitBySymbol, shouldHideListItems } from './utils';

/**
 * 概念卡片策略
 * 
 * @description 实现概念卡片的解析逻辑，支持 `::` 符号。
 * 
 * 概念卡片的特点：
 * - 正面只显示概念名称
 * - 反面显示概念名称 + 定义（用 `<br/>` 分隔）
 * - 可配置隐藏标记（mark）内容
 * 
 * @example
 * ```typescript
 * const strategy = new ConceptCardStrategy();
 * 
 * // 基础概念卡片
 * const result = strategy.parse('DDD::领域驱动设计，一种软件开发方法论', { symbol: '::' });
 * // result.front.html === 'DDD'
 * // result.back.html === 'DDD<br/>领域驱动设计，一种软件开发方法论'
 * 
 * // 隐藏标记
 * console.log(strategy.shouldHideContent('mark', metadata)); // true
 * ```
 */
export class ConceptCardStrategy implements ICardFaceStrategy {
  /**
   * 解析块内容为正反面数据
   * 
   * @description 根据 `::` 符号分割内容，生成正反面数据。
   * 
   * 解析规则：
   * - 正面：概念名称（符号前的内容）
   * - 反面：概念名称 + `<br/>` + 定义（符号后的内容）
   * - 正面隐藏标记（mark）内容
   * 
   * @param blockContent - 思源块的原始内容
   * @param metadata - 卡片元数据，包含符号信息
   * 
   * @returns 包含正反面数据的对象
   * 
   * @example
   * ```typescript
   * const strategy = new ConceptCardStrategy();
   * const result = strategy.parse('DDD::领域驱动设计', { symbol: '::' });
   * console.log(result.front.html); // 'DDD'
   * console.log(result.back.html);  // 'DDD<br/>领域驱动设计'
   * ```
   */
  parse(blockContent: string, metadata: QuickCardMetadata): {
    front: CardFaceData;
    back: CardFaceData;
  } {
    const { symbol } = metadata;
    const [concept, definition] = splitBySymbol(blockContent, symbol);
    
    // 正面：只显示概念名称
    const frontHtml = concept;
    
    // 反面：概念名称 + 定义
    const backHtml = `${concept}<br/>${definition}`;
    
    // 检测是否需要隐藏列表项
    const frontHiddenTypes: HiddenContentType[] = ['mark'];
    if (shouldHideListItems(metadata)) {
      frontHiddenTypes.push('list');
    }
    
    return {
      front: {
        html: frontHtml,
        hiddenTypes: frontHiddenTypes,
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
   * @description 概念卡片在正面隐藏标记（mark）内容。
   * 
   * @param contentType - 内容类型
   * @param metadata - 卡片元数据（未使用）
   * 
   * @returns 如果是 mark 类型返回 true，否则返回 false
   * 
   * @example
   * ```typescript
   * const strategy = new ConceptCardStrategy();
   * console.log(strategy.shouldHideContent('mark', metadata));  // true
   * console.log(strategy.shouldHideContent('list', metadata));  // false
   * ```
   */
  shouldHideContent(
    contentType: HiddenContentType,
    _metadata: QuickCardMetadata
  ): boolean {
    // 概念卡片在正面隐藏标记内容
    return contentType === 'mark';
  }
}
