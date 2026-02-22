/**
 * 挖空检测工具类
 * 
 * 提供统一的挖空符号检测功能，供 AutoCardHandler 和 DialogManager 复用
 * 
 * @module ClozeDetector
 */

/**
 * 挖空信息
 */
export interface ClozeInfo {
  /** 挖空文本 */
  text: string;
  /** 起始位置 */
  start: number;
  /** 结束位置 */
  end: number;
  /** 挖空类型 */
  type: 'brace' | 'equal' | 'mark';
}

/**
 * 挖空检测工具类
 */
export class ClozeDetector {
  /**
   * 检测内容中的挖空符号
   * 
   * 支持三种挖空符号：
   * - `{{text}}` - 大括号挖空
   * - `==text==` - 等号挖空
   * - `<span data-type="mark">text</span>` - 思源标记挖空
   * 
   * @param content 内容
   * @returns 挖空列表（按位置排序）
   * 
   * @example
   * ```typescript
   * const clozes = ClozeDetector.extractClozes('DDD 是==领域====驱动====设计==');
   * // 返回: [
   * //   { text: '领域', start: 6, end: 10, type: 'equal' },
   * //   { text: '驱动', start: 12, end: 16, type: 'equal' },
   * //   { text: '设计', start: 18, end: 22, type: 'equal' }
   * // ]
   * ```
   */
  static extractClozes(content: string): ClozeInfo[] {
    const clozes: ClozeInfo[] = [];
    
    // 提取 {{}} 填空
    let match;
    const braceRegex = /\{\{([^}]*)\}\}/g;
    while ((match = braceRegex.exec(content)) !== null) {
      clozes.push({
        text: match[1].trim(),
        start: match.index,
        end: match.index + match[0].length,
        type: 'brace'
      });
    }
    
    // 提取 == 填空
    const equalRegex = /==([^=]*)==/g;
    while ((match = equalRegex.exec(content)) !== null) {
      clozes.push({
        text: match[1].trim(),
        start: match.index,
        end: match.index + match[0].length,
        type: 'equal'
      });
    }
    
    // 提取思源标记
    const markRegex = /<span data-type="mark">(.+?)<\/span>/g;
    while ((match = markRegex.exec(content)) !== null) {
      clozes.push({
        text: match[1].trim(),
        start: match.index,
        end: match.index + match[0].length,
        type: 'mark'
      });
    }
    
    // 按位置排序
    clozes.sort((a, b) => a.start - b.start);
    
    return clozes;
  }
  
  /**
   * 检查内容是否包含挖空
   * 
   * @param content 内容
   * @returns 是否包含挖空
   * 
   * @example
   * ```typescript
   * ClozeDetector.hasClozes('DDD 是==领域驱动设计=='); // true
   * ClozeDetector.hasClozes('DDD 是领域驱动设计');     // false
   * ```
   */
  static hasClozes(content: string): boolean {
    return this.extractClozes(content).length > 0;
  }
  
  /**
   * 获取挖空数量
   * 
   * @param content 内容
   * @returns 挖空数量
   * 
   * @example
   * ```typescript
   * ClozeDetector.getClozeCount('==A====B====C=='); // 3
   * ```
   */
  static getClozeCount(content: string): number {
    return this.extractClozes(content).length;
  }
}
