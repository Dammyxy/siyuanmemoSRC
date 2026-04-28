/**
 * ICardReadModel - 卡片读取模型接口
 * 
 * @description
 * 用于查询操作的数据访问接口，符合 CQRS 模式。
 * 应用层通过此接口访问卡片数据，不直接依赖基础设施层。
 * 
 * **设计原则**：
 * - CQRS 模式：读写分离，查询使用 Read Model
 * - 依赖倒置：应用层定义接口，基础设施层实现
 * - 单一职责：只负责读取操作，不包含写入逻辑
 * 
 * **架构位置**：
 * - 定义在应用层（Application Layer）
 * - 实现在基础设施层（Infrastructure Layer）
 * - 被查询处理器（Query Handlers）使用
 */

import type { FSRSCard } from '@/types/card';
import type { StructuredCardQuery } from '@/types/card-query';

/**
 * 卡片读取模型接口
 * 
 * @interface ICardReadModel
 */
export interface ICardReadModel {
  /**
   * 获取所有卡片
   * 
   * @returns 所有卡片的数组
   * 
   * @example
   * ```typescript
   * const cards = readModel.getAllCards();
   * console.log(`Total cards: ${cards.length}`);
   * ```
   */
  getAllCards(): FSRSCard[];

  /**
   * Query cards through the indexed storage read path.
   */
  queryCards(query?: StructuredCardQuery): FSRSCard[];

  /**
   * Count cards through the read model without hydrating rows when supported.
   */
  countCards?(query?: StructuredCardQuery): number;
  
  /**
   * 获取到期卡片
   * 
   * @param limit - 最大返回数量（可选）
   * @returns 到期卡片的数组
   * 
   * @example
   * ```typescript
   * const dueCards = readModel.getDueCards(100);
   * console.log(`Due cards: ${dueCards.length}`);
   * ```
   */
  getDueCards(limit?: number): FSRSCard[];
  
  /**
   * 根据 ID 获取单个卡片
   * 
   * @param cardId - 卡片 ID
   * @returns 卡片对象，如果不存在则返回 undefined
   * 
   * @example
   * ```typescript
   * const card = readModel.getCard('card-123');
   * if (card) {
   *   console.log('Card found:', card.id);
   * }
   * ```
   */
  getCard(cardId: string): FSRSCard | undefined;
  
  /**
   * 根据块 ID 获取卡片
   * 
   * @param blockId - 块 ID
   * @returns 卡片对象，如果不存在则返回 undefined
   * 
   * @example
   * ```typescript
   * const card = readModel.getCardByBlockId('20240101120000-abc123');
   * ```
   */
  getCardByBlockId(blockId: string): FSRSCard | undefined;
  
  /**
   * 根据块 ID 获取多个卡片
   * 
   * @param blockId - 块 ID
   * @returns 卡片数组
   * 
   * @description
   * 一个块可能对应多张卡片（例如：正反卡片）
   * 
   * @example
   * ```typescript
   * const cards = readModel.getCardsByBlockId('20240101120000-abc123');
   * console.log(`Found ${cards.length} cards for this block`);
   * ```
   */
  getCardsByBlockId(blockId: string): FSRSCard[];
}
