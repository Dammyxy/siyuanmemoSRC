/**
 * GetDueCardsQuery - 获取到期卡片查询
 * 
 * 这是一个查询对象，用于封装获取到期卡片的请求参数。
 * 
 * @see .kiro/specs/ddd-refactoring/long-term-improvements.md - 阶段 2
 */

import type { FSRSCard } from '@/types';

/**
 * GetDueCardsQuery - 获取到期卡片查询
 * 
 * 使用示例：
 * ```typescript
 * const query: GetDueCardsQuery = {
 *   now: new Date(),
 * };
 * 
 * const result = await handler.execute(query);
 * console.log(`到期卡片数量：${result.count}`);
 * ```
 */
export interface GetDueCardsQuery {
  /**
   * 当前时间（可选，用于测试）
   * 
   * 如果不提供，将使用当前系统时间。
   */
  now?: Date;
}

/**
 * GetDueCardsQueryResult - 查询结果
 * 
 * 包含到期卡片列表和统计信息。
 */
export interface GetDueCardsQueryResult {
  /**
   * 到期卡片列表
   */
  cards: FSRSCard[];
  
  /**
   * 到期卡片数量
   */
  count: number;
  
  /**
   * 总卡片数量
   */
  total: number;
}
