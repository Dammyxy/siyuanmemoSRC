/**
 * GetDueCardsQueryHandler - 获取到期卡片查询处理器
 * 
 * 职责：
 * - 执行获取到期卡片的查询
 * - 使用 CardScheduleService 进行业务逻辑处理
 * - 返回查询结果
 * 
 * @see .kiro/specs/ddd-refactoring/long-term-improvements.md - 阶段 2
 */

import type { StorageManager } from '@/core/storage/manager';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import type { GetDueCardsQuery, GetDueCardsQueryResult } from './GetDueCardsQuery';

/**
 * GetDueCardsQueryHandler 类
 * 
 * 处理获取到期卡片的查询请求。
 * 
 * 使用示例：
 * ```typescript
 * const handler = new GetDueCardsQueryHandler(storageManager, scheduleService);
 * 
 * const query: GetDueCardsQuery = {
 *   now: new Date(),
 * };
 * 
 * const result = await handler.execute(query);
 * console.log(`到期卡片数量：${result.count} / ${result.total}`);
 * ```
 */
export class GetDueCardsQueryHandler {
  /**
   * 创建查询处理器实例
   * 
   * @param storageManager - 存储管理器
   * @param scheduleService - 卡片调度服务
   */
  constructor(
    private storageManager: StorageManager,
    private scheduleService: CardScheduleService
  ) {}
  
  /**
   * 执行查询
   * 
   * @param query - 查询对象
   * @returns 查询结果
   */
  async execute(query: GetDueCardsQuery): Promise<GetDueCardsQueryResult> {
    // 获取所有卡片
    const allCards = this.storageManager.getAllCards();
    
    // 使用领域服务过滤到期卡片
    const dueCards = this.scheduleService.filterDueCards(
      allCards, 
      query.now || new Date()
    );
    
    // 返回查询结果
    return {
      cards: dueCards,
      count: dueCards.length,
      total: allCards.length,
    };
  }
}
