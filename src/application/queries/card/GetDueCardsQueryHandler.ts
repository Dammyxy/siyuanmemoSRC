/**
 * GetDueCardsQueryHandler - 获取到期卡片查询处理器
 *
 * @description
 * 处理获取到期卡片的查询请求。
 * 使用 ICardReadModel 接口访问数据，符合 DDD 架构。
 */

import type { ICardReadModel } from './ICardReadModel';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import type { GetDueCardsQuery, GetDueCardsQueryResult } from './GetDueCardsQuery';
import { ALL_CARD_QUERY_STATES } from '@/types/card-query';

/**
 * GetDueCardsQueryHandler 类
 */
export class GetDueCardsQueryHandler {
  constructor(
    private readModel: ICardReadModel,
    private scheduleService: CardScheduleService
  ) {}

  /**
   * 执行查询
   *
   * @param query - 查询对象
   * @returns 查询结果
   */
  async execute(query: GetDueCardsQuery): Promise<GetDueCardsQueryResult> {
    const now = query.now || new Date();
    const dueCandidates = this.readModel.queryCards({
      dueDate: { lte: now.getTime() },
    });
    const dueCards = this.scheduleService.filterDueCards(dueCandidates, now);
    const total = this.readModel.countCards
      ? this.readModel.countCards({ states: ALL_CARD_QUERY_STATES })
      : this.readModel.queryCards({ states: ALL_CARD_QUERY_STATES }).length;

    return {
      cards: dueCards,
      count: dueCards.length,
      total,
    };
  }
}
