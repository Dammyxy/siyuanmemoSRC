/**
 * 快速制卡渲染器 - 描述符卡片策略
 * 
 * 本文件实现描述符卡片类型的正反面解析逻辑，支持 `;;` 符号。
 * 
 * @module DescriptorCardStrategy
 */

import type { ICardFaceStrategy } from './ICardFaceStrategy';
import type { CardFaceData, HiddenContentType, QuickCardMetadata } from '../types';
import { splitBySymbol } from './utils';

/**
 * 描述符卡片策略
 * 
 * @description 实现描述符卡片的解析逻辑，支持 `;;` 符号。
 * 
 * 描述符卡片的特点：
 * - 正面显示描述符名称
 * - 反面显示描述符名称 + 描述内容（用 `<br/>` 分隔）
 * - 支持 Xiuyuan 模版：正面显示"描述符（关于：父块概念）"
 * - 可配置隐藏标记（mark）内容
 * 
 * @example
 * ```typescript
 * const strategy = new DescriptorCardStrategy();
 * 
 * // 基础模式
 * const result1 = strategy.parse('特点;;易于扩展', { symbol: ';;' });
 * // result1.front.html === '特点'
 * // result1.back.html === '特点<br/>易于扩展'
 * 
 * // Xiuyuan 模版
 * const result2 = strategy.parse('特点;;易于扩展', { 
 *   symbol: ';;', 
 *   isXiuyuanTemplate: true,
 *   parentBlockId: '123'
 * });
 * // result2.front.html === '特点（关于：父块概念）'
 * // result2.back.html === '特点<br/>易于扩展'
 * ```
 */
export class DescriptorCardStrategy implements ICardFaceStrategy {
  /**
   * 解析块内容为正反面数据
   * 
   * @description 根据 `;;` 符号分割内容，生成正反面数据。
   * 
   * 解析规则：
   * - 基础模式：
   *   - 正面：描述符名称（符号前的内容）
   *   - 反面：描述符名称 + `<br/>` + 描述内容（符号后的内容）
   * - Xiuyuan 模版：
   *   - 正面：描述符名称（关于：父块概念）
   *   - 反面：描述符名称 + `<br/>` + 描述内容
   * - 正面隐藏标记（mark）内容
   * 
   * @param blockContent - 思源块的原始内容
   * @param metadata - 卡片元数据，包含符号、Xiuyuan 模版信息
   * 
   * @returns 包含正反面数据的对象
   * 
   * @example
   * ```typescript
   * const strategy = new DescriptorCardStrategy();
   * 
   * // 基础模式
   * const result1 = strategy.parse('特点;;易于扩展', { symbol: ';;' });
   * console.log(result1.front.html); // '特点'
   * console.log(result1.back.html);  // '特点<br/>易于扩展'
   * 
   * // Xiuyuan 模版
   * const result2 = strategy.parse('特点;;易于扩展', { 
   *   symbol: ';;', 
   *   isXiuyuanTemplate: true 
   * });
   * console.log(result2.front.html); // '特点（关于：父块概念）'
   * ```
   */
  parse(blockContent: string, metadata: QuickCardMetadata): {
    front: CardFaceData;
    back: CardFaceData;
  } {
    const { symbol, isXiuyuanTemplate } = metadata;
    const [descriptor, description] = splitBySymbol(blockContent, symbol);
    
    // 正面：描述符名称
    let frontHtml = descriptor;
    
    // 如果启用 Xiuyuan 模版，正面显示"描述符（关于：父块概念）"
    if (isXiuyuanTemplate) {
      frontHtml = `${descriptor}（关于：父块概念）`;
    }
    
    // 反面：描述符名称 + 描述内容
    const backHtml = `${descriptor}<br/>${description}`;
    
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
   * @description 描述符卡片在正面隐藏标记（mark）内容。
   * 
   * @param contentType - 内容类型
   * @param metadata - 卡片元数据（未使用）
   * 
   * @returns 如果是 mark 类型返回 true，否则返回 false
   * 
   * @example
   * ```typescript
   * const strategy = new DescriptorCardStrategy();
   * console.log(strategy.shouldHideContent('mark', metadata));  // true
   * console.log(strategy.shouldHideContent('list', metadata));  // false
   * ```
   */
  shouldHideContent(
    contentType: HiddenContentType,
    _metadata: QuickCardMetadata
  ): boolean {
    // 描述符卡片在正面隐藏标记内容
    return contentType === 'mark';
  }
}
