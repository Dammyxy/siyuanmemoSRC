/**
 * 快速制卡渲染器 - CardFace 值对象
 * 
 * @description 表示卡片的一个面（正面或反面），包含 HTML 内容和隐藏类型
 */

import type { HiddenContentType, CardFaceData } from './types';

/**
 * CardFace 值对象
 * 
 * @description 表示卡片的一个面（正面或反面）
 * 
 * 值对象特性：
 * - 不可变性：一旦创建，内容不可修改
 * - 无标识：通过值比较，而非引用比较
 * - 自包含：包含所有必要的数据和行为
 * 
 * @example
 * ```typescript
 * const frontFace = new CardFace({
 *   html: '<p>问题内容</p>',
 *   hiddenTypes: ['mark']
 * });
 * 
 * const cssClasses = frontFace.getCssClasses();
 * // ['card__block--hidemark']
 * ```
 */
export class CardFace {
  /**
   * HTML 内容
   * @readonly
   */
  readonly html: string;
  
  /**
   * 需要隐藏的内容类型列表
   * @readonly
   */
  readonly hiddenTypes: ReadonlyArray<HiddenContentType>;
  
  /**
   * 构造函数
   * 
   * @param data - 卡片面数据
   * @param data.html - HTML 内容
   * @param data.hiddenTypes - 需要隐藏的内容类型列表
   * 
   * @example
   * ```typescript
   * const face = new CardFace({
   *   html: '<p>内容</p>',
   *   hiddenTypes: ['mark', 'list']
   * });
   * ```
   */
  constructor(data: CardFaceData) {
    this.html = data.html;
    this.hiddenTypes = Object.freeze([...data.hiddenTypes]);
  }
  
  /**
   * 获取 CSS 类数组
   * 
   * @description 将隐藏内容类型映射为对应的 CSS 类名
   * 
   * 映射规则：
   * - 'mark' → 'card__block--hidemark'
   * - 'list' → 'card__block--hideli'
   * - 'heading' → 'card__block--hideh'
   * - 'superblock' → 'card__block--hidesb'
   * 
   * @returns CSS 类名数组
   * 
   * @example
   * ```typescript
   * const face = new CardFace({
   *   html: '<p>内容</p>',
   *   hiddenTypes: ['mark', 'list']
   * });
   * 
   * const classes = face.getCssClasses();
   * // ['card__block--hidemark', 'card__block--hideli']
   * ```
   */
  getCssClasses(): string[] {
    const cssClassMap: Record<HiddenContentType, string> = {
      mark: 'card__block--hidemark',
      list: 'card__block--hideli',
      heading: 'card__block--hideh',
      superblock: 'card__block--hidesb',
    };
    
    return this.hiddenTypes.map(type => cssClassMap[type]);
  }
}
