/**
 * 快速制卡渲染器 - 卡片面策略工厂
 * 
 * 本文件实现策略工厂模式，用于创建和管理不同类型卡片的策略实例。
 * 
 * @module CardFaceStrategyFactory
 */

import type { ICardFaceStrategy } from './ICardFaceStrategy';
import type { QuickCardType } from '../types';
import { BasicCardStrategy } from './BasicCardStrategy';
import { ConceptCardStrategy } from './ConceptCardStrategy';
import { ClozeCardStrategy } from './ClozeCardStrategy';
import { DescriptorCardStrategy } from './DescriptorCardStrategy';
import { MultiLineCardStrategy } from './MultiLineCardStrategy';

/**
 * 卡片面策略工厂
 * 
 * @description 使用工厂模式创建和管理卡片策略实例。
 * 
 * 工厂模式的优势：
 * - 集中管理策略实例，避免重复创建
 * - 使用 Map 缓存实例，提高性能
 * - 统一的错误处理
 * - 易于扩展新的卡片类型
 * 
 * @example
 * ```typescript
 * // 获取基础卡片策略
 * const strategy = CardFaceStrategyFactory.create('basic');
 * const result = strategy.parse('问题 >> 答案', { symbol: '>>' });
 * 
 * // 获取概念卡片策略
 * const conceptStrategy = CardFaceStrategyFactory.create('concept');
 * ```
 */
export class CardFaceStrategyFactory {
  /**
   * 策略实例缓存
   * 
   * @description 使用 Map 存储已创建的策略实例，避免重复创建。
   * 
   * 已注册的策略：
   * - basic: BasicCardStrategy（支持 >> << <> 符号）
   * - concept: ConceptCardStrategy（支持 :: 符号）
   * - descriptor: DescriptorCardStrategy（支持 ;; 符号）
   * - cloze: ClozeCardStrategy（支持 {{}} 符号）
   * - multiLine: MultiLineCardStrategy（支持 >>> 符号）
   * 
   * @private
   */
  private static strategies = new Map<QuickCardType, ICardFaceStrategy>([
    ['basic', new BasicCardStrategy()],
    ['concept', new ConceptCardStrategy()],
    ['descriptor', new DescriptorCardStrategy()],
    ['cloze', new ClozeCardStrategy()],
    ['multiLine', new MultiLineCardStrategy()],
  ]);

  /**
   * 创建卡片策略实例
   * 
   * @description 根据卡片类型返回对应的策略实例。
   * 
   * 该方法从缓存的 Map 中获取策略实例，如果类型未注册则抛出错误。
   * 由于策略实例是无状态的，可以安全地复用同一个实例。
   * 
   * @param type - 快速卡片类型
   * 
   * @returns 对应的策略实例
   * 
   * @throws {Error} 当卡片类型未知或未注册时抛出错误
   * 
   * @example
   * ```typescript
   * // 获取基础卡片策略
   * const strategy = CardFaceStrategyFactory.create('basic');
   * 
   * // 使用策略解析卡片
   * const result = strategy.parse('问题 >> 答案', { symbol: '>>' });
   * console.log(result.front.html); // '问题'
   * console.log(result.back.html);  // '答案'
   * ```
   */
  static create(type: QuickCardType): ICardFaceStrategy {
    const strategy = this.strategies.get(type);
    
    if (!strategy) {
      throw new Error(`Unknown card type: ${type}`);
    }
    
    return strategy;
  }
}
