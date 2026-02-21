/**
 * 策略工具函数
 * 
 * @description 提供策略类共享的工具函数
 */

/**
 * 移除 kramdown 中的 IAL (Inline Attribute List) 属性块
 * 
 * @description IAL 格式：`{: id="..." style="..." ...}`
 * 
 * 这些属性块是思源笔记的内部格式，不应该在卡片渲染时显示。
 * 
 * @param content - 原始内容
 * @returns 移除 IAL 后的内容
 * 
 * @example
 * ```typescript
 * const result = removeIAL('文本{: id="123" style="color:red"}');
 * console.log(result); // '文本'
 * 
 * const result2 = removeIAL('测试>>背面{: id="20260215134723-hm26mfn" updated="20260215140726"}');
 * console.log(result2); // '测试>>背面'
 * ```
 */
export function removeIAL(content: string): string {
  // 匹配 IAL 格式：{: ... }
  // 使用非贪婪匹配，避免匹配到多个 IAL 块
  return content.replace(/\{:\s*[^}]*\}/g, '').trim();
}

/**
 * 根据符号分割内容
 * 
 * @description 将内容按符号分割为两部分，并自动移除 IAL 属性块
 * 
 * @param content - 原始内容
 * @param symbol - 分割符号
 * @returns 包含两部分内容的数组 [part1, part2]
 * 
 * @example
 * ```typescript
 * const [q, a] = splitBySymbol('问题 >> 答案', '>>');
 * console.log(q); // '问题'
 * console.log(a); // '答案'
 * 
 * // 带 IAL 属性的情况
 * const [q2, a2] = splitBySymbol('问题 >> 答案{: id="123"}', '>>');
 * console.log(q2); // '问题'
 * console.log(a2); // '答案'
 * ```
 */
export function splitBySymbol(content: string, symbol: string): [string, string] {
  // 先移除 IAL 属性块
  const cleanContent = removeIAL(content);
  
  const index = cleanContent.indexOf(symbol);
  
  if (index === -1) {
    // 如果找不到符号，返回完整内容和空字符串
    return [cleanContent.trim(), ''];
  }
  
  const part1 = cleanContent.substring(0, index).trim();
  const part2 = cleanContent.substring(index + symbol.length).trim();
  
  return [part1, part2];
}

/**
 * 检测是否需要隐藏列表项
 * 
 * @description 根据元数据判断是否需要在正面隐藏列表项子级
 * 
 * @param metadata - 卡片元数据
 * @returns 是否需要隐藏列表项
 * 
 * @example
 * ```typescript
 * const metadata = { hasListChildren: true };
 * console.log(shouldHideListItems(metadata)); // true
 * 
 * const metadata2 = { hasListChildren: false };
 * console.log(shouldHideListItems(metadata2)); // false
 * ```
 */
export function shouldHideListItems(metadata: any): boolean {
  // 如果元数据中包含 hasListChildren 标记，则需要隐藏
  return metadata.hasListChildren === true;
}
