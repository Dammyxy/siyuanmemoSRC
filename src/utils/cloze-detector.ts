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
  type: 'brace' | 'equal' | 'mark' | 'latex';
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

    // 提取 LaTeX 填空：\cloze{c1}{text} / \cloze{text}
    this.extractLatexClozes(content, clozes);
    
    // 按位置排序
    clozes.sort((a, b) => a.start - b.start);
    
    return clozes;
  }

  private static extractLatexClozes(content: string, output: ClozeInfo[]): void {
    const commandRegex = /\\+cloze/g;
    let cursor = 0;

    while (cursor < content.length) {
      commandRegex.lastIndex = cursor;
      const match = commandRegex.exec(content);
      if (!match) {
        break;
      }

      const start = match.index;
      const commandEnd = start + match[0].length;
      const firstArg = this.parseBracedArgument(content, commandEnd);
      if (!firstArg) {
        cursor = commandEnd;
        continue;
      }

      const firstArgText = firstArg.content.trim();
      const isNumberedLatexCloze = /^c\d+$/i.test(firstArgText);
      const secondArg = this.parseBracedArgument(content, firstArg.nextIndex);
      const hasSecondArgForNumberedCloze = isNumberedLatexCloze && !!secondArg;
      const targetArg = hasSecondArgForNumberedCloze && secondArg ? secondArg : firstArg;
      const end = hasSecondArgForNumberedCloze && secondArg ? secondArg.nextIndex : firstArg.nextIndex;
      const text = targetArg.content.trim();

      if (text.length > 0) {
        output.push({
          text,
          start,
          end,
          type: 'latex',
        });
      }

      cursor = end;
    }
  }

  private static parseBracedArgument(
    source: string,
    fromIndex: number
  ): { content: string; nextIndex: number } | null {
    let index = fromIndex;

    while (index < source.length && /\s/.test(source[index])) {
      index += 1;
    }

    if (source[index] !== '{') {
      return null;
    }

    const contentStart = index + 1;
    let depth = 1;

    for (let i = contentStart; i < source.length; i += 1) {
      const char = source[i];

      if (char === '\\') {
        i += 1;
        continue;
      }

      if (char === '{') {
        depth += 1;
        continue;
      }

      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return {
            content: source.slice(contentStart, i),
            nextIndex: i + 1,
          };
        }
      }
    }

    return null;
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
