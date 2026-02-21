/**
 * 快速制卡渲染器 - 基础卡片策略
 * 
 * 本文件实现基础卡片类型的正反面解析逻辑，支持六种符号：
 * - `>>` 或 `》》`: 正向卡片（问题 >> 答案）
 * - `<<` 或 `《《`: 反向卡片（答案 << 问题）
 * - `<>` 或 `《》`: 双向卡片（概念 <> 定义）
 * 
 * @module BasicCardStrategy
 */

import type { ICardFaceStrategy } from './ICardFaceStrategy';
import type { CardFaceData, HiddenContentType, QuickCardMetadata } from '../types';
import { splitBySymbol, shouldHideListItems } from './utils';

/**
 * 基础卡片策略
 * 
 * @description 实现基础快速卡片的解析逻辑，支持 `>>`、`<<`、`<>` 及其中文版本。
 * 
 * 基础卡片的特点：
 * - 不隐藏任何内容
 * - 正反面内容由符号分割
 * - 反面显示完整内容
 * 
 * @example
 * ```typescript
 * const strategy = new BasicCardStrategy();
 * 
 * // 正向卡片（英文符号）
 * const result1 = strategy.parse('什么是 DDD？ >> 领域驱动设计', { symbol: '>>' });
 * // result1.front.html === '什么是 DDD？'
 * // result1.back.html === '领域驱动设计'
 * 
 * // 正向卡片（中文符号）
 * const result1b = strategy.parse('什么是 DDD？》》领域驱动设计', { symbol: '》》' });
 * // result1b.front.html === '什么是 DDD？'
 * // result1b.back.html === '领域驱动设计'
 * 
 * // 反向卡片
 * const result2 = strategy.parse('领域驱动设计 << 什么是 DDD？', { symbol: '<<' });
 * // result2.front.html === '领域驱动设计'
 * // result2.back.html === '什么是 DDD？'
 * 
 * // 双向卡片
 * const result3 = strategy.parse('DDD <> 领域驱动设计', { symbol: '<>' });
 * // result3.front.html === 'DDD'
 * // result3.back.html === '领域驱动设计'
 * ```
 */
export class BasicCardStrategy implements ICardFaceStrategy {
  /**
   * 解析块内容为正反面数据
   * 
   * @description 根据符号类型分割内容，生成正反面数据。
   * 
   * 解析规则：
   * - `>>`: 正面=符号前，反面=符号后
   * - `<<`: 正面=符号后，反面=符号前
   * - `<>`: 正面=符号前，反面=符号后（双向）
   * 
   * @param blockContent - 思源块的原始内容
   * @param metadata - 卡片元数据，包含符号信息
   * 
   * @returns 包含正反面数据的对象
   * 
   * @example
   * ```typescript
   * const strategy = new BasicCardStrategy();
   * const result = strategy.parse('问题 >> 答案', { symbol: '>>' });
   * console.log(result.front.html); // '问题'
   * console.log(result.back.html);  // '答案'
   * ```
   */
  parse(blockContent: string, metadata: QuickCardMetadata): {
    front: CardFaceData;
    back: CardFaceData;
  } {
    const { symbol, typeMarker } = metadata;
    
    console.log('[BasicCardStrategy] parse called:', { symbol, typeMarker, content: blockContent.substring(0, 100) });
    
    const [part1, part2] = splitBySymbol(blockContent, symbol);
    
    console.log('[BasicCardStrategy] Split result:', { 
      part1: part1.substring(0, 50), 
      part2: part2.substring(0, 50) 
    });
    
    // 根据符号类型决定正反面内容
    let frontHtml: string;
    let backHtml: string;
    
    if (symbol === '>>' || symbol === '》》') {
      // 正向：问题 >> 答案 或 问题》》答案
      frontHtml = part1;
      // 反面显示完整内容：问题 + 答案
      backHtml = `${part1}<br/><br/>${part2}`;
    } else if (symbol === '<<' || symbol === '《《') {
      // 反向：答案 << 问题 或 答案《《问题
      frontHtml = part2;
      // 反面显示完整内容：问题 + 答案
      backHtml = `${part2}<br/><br/>${part1}`;
    } else if (symbol === '<>' || symbol === '《》') {
      // 双向：概念 <> 定义 或 概念《》定义
      // 如果有 typeMarker，根据它来决定方向
      if (typeMarker === 'reverse') {
        console.log('[BasicCardStrategy] ✅ Using REVERSE direction for bidirectional card');
        // 反向：定义 -> 概念
        frontHtml = part2;
        backHtml = `${part2}<br/><br/>${part1}`;
      } else {
        console.log('[BasicCardStrategy] Using FORWARD direction for bidirectional card (typeMarker:', typeMarker, ')');
        // 正向（默认）：概念 -> 定义
        frontHtml = part1;
        backHtml = `${part1}<br/><br/>${part2}`;
      }
    } else {
      // 未知符号，使用默认行为
      frontHtml = part1;
      backHtml = `${part1}<br/><br/>${part2}`;
    }
    
    console.log('[BasicCardStrategy] Final result:', {
      frontHtml: frontHtml.substring(0, 50),
      backHtml: backHtml.substring(0, 50),
    });
    
    // 检测是否需要隐藏列表项
    const frontHiddenTypes: HiddenContentType[] = [];
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
        hiddenTypes: [],
      },
    };
  }
  
  /**
   * 判断是否应该隐藏特定类型的内容
   * 
   * @description 基础卡片不隐藏任何内容，始终返回 false。
   * 
   * @param contentType - 内容类型
   * @param metadata - 卡片元数据（未使用）
   * 
   * @returns 始终返回 false
   * 
   * @example
   * ```typescript
   * const strategy = new BasicCardStrategy();
   * console.log(strategy.shouldHideContent('mark', metadata));  // false
   * console.log(strategy.shouldHideContent('list', metadata));  // false
   * ```
   */
  shouldHideContent(
    _contentType: HiddenContentType,
    _metadata: QuickCardMetadata
  ): boolean {
    // 基础卡片不隐藏任何内容
    return false;
  }
}
