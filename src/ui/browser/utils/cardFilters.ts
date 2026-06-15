/**
 * 卡片筛选工具函数
 * 
 * 提供卡片筛选相关的纯函数
 */

export { applyCardTypeFilter } from '@/application/queries/browser/shared/BrowserRowUtils';
export type { NumberCondition } from '@/types/browser';
export { checkNumberCondition, matchesParsedQuery } from '@/types/browser';

/**
 * 提取 SQL 语句（如果输入是 SQL 模式）
 * 
 * @param input - 输入字符串
 * @returns SQL 语句或 null
 */
export function extractSqlStatement(input: string): string | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  
  const lowerInput = trimmed.toLowerCase();
  
  // 检查是否以 SQL 关键字开头
  if (
    lowerInput.startsWith('select ') ||
    lowerInput.startsWith('with ')
  ) {
    return trimmed;
  }
  
  return null;
}
