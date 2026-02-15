/**
 * 快速制卡渲染器 - QuickCard 实体
 * 
 * @description 表示一张快速制卡，包含正反面内容和元数据
 */

import { CardFace } from './CardFace';
import type { QuickCardType, QuickCardMetadata, HiddenContentType } from './types';

/**
 * QuickCard 实体
 * 
 * @description 表示一张快速制卡，包含正反面内容和元数据
 * 
 * 实体特性：
 * - 有唯一标识：通过 id 和 blockId 标识
 * - 有生命周期：可以被创建、修改、删除
 * - 包含业务逻辑：提供获取面、判断隐藏内容等方法
 * 
 * @example
 * ```typescript
 * const card = new QuickCard({
 *   id: 'card-123',
 *   blockId: 'block-456',
 *   type: 'basic',
 *   frontContent: new CardFace({ html: '问题', hiddenTypes: [] }),
 *   backContent: new CardFace({ html: '答案', hiddenTypes: [] }),
 *   metadata: { symbol: '>>' }
 * });
 * 
 * const frontFace = card.getFace('front');
 * const shouldHide = card.shouldHideContent('mark');
 * ```
 */
export class QuickCard {
  /**
   * 卡片唯一标识
   * @readonly
   */
  readonly id: string;
  
  /**
   * 思源块 ID
   * @readonly
   */
  readonly blockId: string;
  
  /**
   * 卡片类型
   * @readonly
   */
  readonly type: QuickCardType;
  
  /**
   * 正面内容
   * @readonly
   */
  readonly frontContent: CardFace;
  
  /**
   * 反面内容
   * @readonly
   */
  readonly backContent: CardFace;
  
  /**
   * 元数据
   * @readonly
   */
  readonly metadata: QuickCardMetadata;
  
  /**
   * 构造函数
   * 
   * @param props - 卡片属性
   * @param props.id - 卡片唯一标识
   * @param props.blockId - 思源块 ID
   * @param props.type - 卡片类型
   * @param props.frontContent - 正面内容
   * @param props.backContent - 反面内容
   * @param props.metadata - 元数据
   * 
   * @example
   * ```typescript
   * const card = new QuickCard({
   *   id: 'card-123',
   *   blockId: 'block-456',
   *   type: 'basic',
   *   frontContent: new CardFace({ html: '问题', hiddenTypes: [] }),
   *   backContent: new CardFace({ html: '答案', hiddenTypes: [] }),
   *   metadata: { symbol: '>>' }
   * });
   * ```
   */
  constructor(props: {
    id: string;
    blockId: string;
    type: QuickCardType;
    frontContent: CardFace;
    backContent: CardFace;
    metadata: QuickCardMetadata;
  }) {
    this.id = props.id;
    this.blockId = props.blockId;
    this.type = props.type;
    this.frontContent = props.frontContent;
    this.backContent = props.backContent;
    this.metadata = props.metadata;
  }
  
  /**
   * 获取指定面的内容
   * 
   * @param side - 面的类型（'front' 或 'back'）
   * @returns 指定面的 CardFace 对象
   * 
   * @example
   * ```typescript
   * const card = new QuickCard({ ... });
   * 
   * const frontFace = card.getFace('front');
   * const backFace = card.getFace('back');
   * ```
   */
  getFace(side: 'front' | 'back'): CardFace {
    return side === 'front' ? this.frontContent : this.backContent;
  }
  
  /**
   * 判断是否应该隐藏指定类型的内容
   * 
   * @param contentType - 内容类型
   * @returns 是否应该隐藏该类型的内容
   * 
   * @description
   * 根据正面内容的 hiddenTypes 判断是否应该隐藏指定类型的内容。
   * 这个方法主要用于判断卡片正面是否需要隐藏某些内容。
   * 
   * @example
   * ```typescript
   * const card = new QuickCard({
   *   frontContent: new CardFace({ 
   *     html: '内容', 
   *     hiddenTypes: ['mark', 'list'] 
   *   }),
   *   ...
   * });
   * 
   * card.shouldHideContent('mark');  // true
   * card.shouldHideContent('heading');  // false
   * ```
   */
  shouldHideContent(contentType: HiddenContentType): boolean {
    return this.frontContent.hiddenTypes.includes(contentType);
  }
}
