/**
 * 快速制卡渲染器 - 卡片面策略接口
 * 
 * 本文件定义了卡片面解析的统一策略接口，用于实现不同类型快速卡片的正反面渲染逻辑。
 * 
 * @module ICardFaceStrategy
 */

import type { CardFaceData, HiddenContentType, QuickCardMetadata } from '../types';

/**
 * 卡片面策略接口
 * 
 * @description 定义卡片面解析的统一接口，所有快速卡片类型的策略都必须实现此接口。
 * 
 * 策略模式允许在运行时根据卡片类型选择不同的解析算法，使得新增卡片类型时
 * 只需实现新的策略类，而不需要修改现有代码。
 * 
 * @example
 * ```typescript
 * class BasicCardStrategy implements ICardFaceStrategy {
 *   parse(blockContent: string, metadata: QuickCardMetadata) {
 *     const [front, back] = blockContent.split(metadata.symbol);
 *     return {
 *       front: { html: front.trim(), hiddenTypes: [] },
 *       back: { html: back.trim(), hiddenTypes: [] }
 *     };
 *   }
 *   
 *   shouldHideContent(contentType: HiddenContentType): boolean {
 *     return false; // 基础卡片不隐藏任何内容
 *   }
 * }
 * ```
 */
export interface ICardFaceStrategy {
  /**
   * 解析块内容为正反面数据
   * 
   * @description 根据卡片类型和符号，将块内容解析为正面和反面的数据。
   * 
   * 解析过程包括：
   * 1. 根据符号分割内容
   * 2. 处理特殊格式（如填空、列表等）
   * 3. 确定每个面需要隐藏的内容类型
   * 4. 生成 HTML 内容
   * 
   * @param blockContent - 思源块的原始内容
   * @param metadata - 卡片元数据，包含符号、父块 ID 等信息
   * 
   * @returns 包含正反面数据的对象
   * 
   * @example
   * ```typescript
   * // 基础卡片示例
   * const result = strategy.parse('什么是 DDD？ >> 领域驱动设计', { symbol: '>>' });
   * // result.front.html === '什么是 DDD？'
   * // result.back.html === '领域驱动设计'
   * 
   * // 填空卡片示例
   * const result = strategy.parse('DDD 的核心是{{领域模型}}', { symbol: '{{}}' });
   * // result.front.html === 'DDD 的核心是[...]'
   * // result.back.html === 'DDD 的核心是<mark>领域模型</mark>'
   * ```
   */
  parse(blockContent: string, metadata: QuickCardMetadata): {
    front: CardFaceData;
    back: CardFaceData;
  };

  /**
   * 判断是否应该隐藏特定类型的内容
   * 
   * @description 根据卡片类型和配置，判断在正面是否应该隐藏特定类型的内容。
   * 
   * 不同卡片类型有不同的隐藏规则：
   * - 基础卡片：不隐藏任何内容
   * - 概念卡片：可配置隐藏标记（mark）
   * - 填空卡片：隐藏标记（mark）
   * - 列表模版：隐藏列表（list）
   * 
   * @param contentType - 内容类型（mark、list、heading、superblock）
   * @param metadata - 卡片元数据，用于特殊判断（如 Xiuyuan 模版）
   * 
   * @returns 如果应该隐藏返回 true，否则返回 false
   * 
   * @example
   * ```typescript
   * // 填空卡片隐藏标记
   * strategy.shouldHideContent('mark', metadata); // true
   * 
   * // 基础卡片不隐藏任何内容
   * strategy.shouldHideContent('mark', metadata); // false
   * 
   * // 列表模版隐藏列表
   * strategy.shouldHideContent('list', metadata); // true
   * ```
   */
  shouldHideContent(
    contentType: HiddenContentType,
    metadata: QuickCardMetadata
  ): boolean;
}
