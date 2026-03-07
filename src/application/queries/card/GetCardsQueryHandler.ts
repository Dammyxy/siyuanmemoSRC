/**
 * GetCardsQueryHandler - 获取卡片列表查询处理器
 * 
 * @description
 * 处理获取卡片列表的查询请求，支持过滤。
 * 使用 ICardReadModel 接口访问数据，符合 DDD 架构。
 */

import type { ICardReadModel } from './ICardReadModel';
import { GetCardsQuery, GetCardsQueryResult } from './GetCardsQuery';

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
    // 获取所有卡片
    let cards = this.readModel.getAllCards();
    
    // 应用过滤器
    if (query.filter) {
      const filter = query.filter;
      
      // 按状态过滤
      if (filter.state !== undefined) {
        cards = cards.filter(card => card.state === filter.state);
      }
      
      // 按 deckId 过滤
      if (filter.deckId) {
        cards = cards.filter(card => {
          const deckId = (card.meta && typeof card.meta === 'object')
            ? String((card.meta as Record<string, unknown>).deckId || '')
            : '';
          return deckId === filter.deckId;
        });
      }
      
      // 按标签过滤
      if (filter.tags && filter.tags.length > 0) {
        cards = cards.filter(card => {
          const cardTags = card.tags || [];
          return filter.tags!.some(tag => cardTags.includes(tag));
        });
      }
      
      // 自定义过滤函数
      if (filter.customFilter) {
        cards = cards.filter(filter.customFilter);
      }
    }
    
    return {
      cards,
      total: cards.length
    };
  }
}
