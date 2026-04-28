/**
 * CardReadModel - 卡片读取模型实现
 * 
 * @description
 * 基于 UnifiedStorageManager 的卡片查询实现。
 * 实现 ICardReadModel 接口，为应用层提供数据访问能力。
 * 
 * **设计原则**：
 * - 实现接口：实现应用层定义的 ICardReadModel 接口
 * - 适配器模式：将 UnifiedStorageManager 适配为 Read Model
 * - 单一职责：只负责读取操作
 * 
 * **架构位置**：
 * - 位于基础设施层（Infrastructure Layer）
 * - 依赖 UnifiedStorageManager（基础设施层）
 * - 被应用层通过接口使用
 */

import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import type { ICardReadModel } from '@/application/queries/card/ICardReadModel';
import type { FSRSCard } from '@/types/card';
import type { StructuredCardQuery } from '@/types/card-query';

/**
 * 卡片读取模型实现
 * 
 * @class CardReadModel
 * @implements {ICardReadModel}
 */
export class CardReadModel implements ICardReadModel {
  /**
   * 构造函数
   * 
   * @param storage - 统一存储管理器
   */
  constructor(
    private readonly storage: UnifiedStorageManager
  ) {}
  
  /**
   * 获取所有卡片
   * 
   * @returns 所有卡片的数组
   */
  getAllCards(): FSRSCard[] {
    return this.storage.getAllCards();
  }

  queryCards(query?: StructuredCardQuery): FSRSCard[] {
    return this.storage.queryCards(query);
  }

  countCards(query?: StructuredCardQuery): number {
    return this.storage.queryCards(query).length;
  }
  
  /**
   * 获取到期卡片
   * 
   * @param limit - 最大返回数量（默认 100）
   * @returns 到期卡片的数组
   */
  getDueCards(limit: number = 100): FSRSCard[] {
    return this.storage.getDueCards(limit);
  }
  
  /**
   * 根据 ID 获取单个卡片
   * 
   * @param cardId - 卡片 ID
   * @returns 卡片对象，如果不存在则返回 undefined
   */
  getCard(cardId: string): FSRSCard | undefined {
    return this.storage.getCard(cardId);
  }
  
  /**
   * 根据块 ID 获取卡片
   * 
   * @param blockId - 块 ID
   * @returns 卡片对象，如果不存在则返回 undefined
   */
  getCardByBlockId(blockId: string): FSRSCard | undefined {
    return this.storage.getCardByBlockId(blockId);
  }
  
  /**
   * 根据块 ID 获取多个卡片
   * 
   * @param blockId - 块 ID
   * @returns 卡片数组
   */
  getCardsByBlockId(blockId: string): FSRSCard[] {
    return this.storage.getCardsByBlockId(blockId);
  }
}
