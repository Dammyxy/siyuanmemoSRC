/**
 * 获取需要隐藏的内容类型
 * 
 * 根据思源笔记的闪卡设置，确定需要隐藏的内容类型。
 * 这个函数参考了原生实现 siyuan/app/src/card/openCard.ts
 * 
 * @returns 需要隐藏的内容类型数组
 * 
 * @example
 * ```typescript
 * const hiddenTypes = getHiddenContentTypes();
 * // 可能返回: ['mark', 'list', 'superBlock', 'heading']
 * ```
 */
export function getHiddenContentTypes(): string[] {
  const hiddenContentTypes: string[] = [];
  
  // 检查全局闪卡设置（参考原生实现 siyuan/app/src/card/openCard.ts）
  if (typeof window !== 'undefined' && (window as any).siyuan?.config?.flashcard) {
    const config = (window as any).siyuan.config.flashcard;
    if (config.mark) hiddenContentTypes.push('mark');
    if (config.list) hiddenContentTypes.push('list');
    if (config.superBlock) hiddenContentTypes.push('superBlock');
    if (config.heading) hiddenContentTypes.push('heading');
  }
  
  return hiddenContentTypes;
}
