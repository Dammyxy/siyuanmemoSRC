/**
 * GetCardsQueryHandler - 获取卡片列表查询处理器
 *
 * @description
 * 处理获取卡片列表的查询请求，支持过滤。
 * 使用 ICardReadModel 接口访问数据，符合 DDD 架构。
 */

import type { ICardReadModel } from './ICardReadModel';
import { CardState } from '@/types/card';
import type { CardFilter, GetCardsQuery, GetCardsQueryResult } from './GetCardsQuery';
import type { StructuredCardQuery } from '@/types/card-query';

/**
 * 获取卡片列表查询处理器
 */
export class GetCardsQueryHandler {
  constructor(
    private readonly readModel: ICardReadModel
  ) {}

  /**
   * 执行查询
   *
   * @param query - 查询对象
   * @returns 查询结果
   */
  async execute(query: GetCardsQuery): Promise<GetCardsQueryResult> {
    let cards = this.readModel.queryCards(this.buildStructuredQuery(query.filter));

    if (query.filter?.deckId) {
      const deckId = query.filter.deckId;
      cards = cards.filter(card => {
        const metaDeckId = (card.meta && typeof card.meta === 'object')
          ? String((card.meta as Record<string, unknown>).deckId || '')
          : '';
        return metaDeckId === deckId;
      });
    }

    return {
      cards,
      total: cards.length
    };
  }

  private buildStructuredQuery(filter?: CardFilter): StructuredCardQuery | undefined {
    if (!filter) {
      return undefined;
    }

    const states = new Set<number>();
    if (filter.state !== undefined) {
      states.add(filter.state);
    }
    for (const state of filter.states || []) {
      states.add(state);
    }
    for (const status of filter.cardStatus || []) {
      switch (status) {
        case 'new':
          states.add(CardState.New);
          break;
        case 'learning':
          states.add(CardState.Learning);
          break;
        case 'review':
          states.add(CardState.Review);
          break;
        case 'relearning':
          states.add(CardState.Relearning);
          break;
      }
    }

    const hasDueDate = !!filter.dueDate?.lte || !!filter.dueDate?.gte;

    return {
      blockIds: filter.blockIds,
      cardTypes: filter.cardTypes,
      states: states.size > 0 ? [...states] : undefined,
      dueDate: hasDueDate
        ? {
            lte: filter.dueDate?.lte?.getTime(),
            gte: filter.dueDate?.gte?.getTime(),
          }
        : undefined,
      tags: filter.tags,
      priority: filter.priority,
      customFilter: filter.customFilter,
    };
  }
}
