/**
 * GetCardQueryHandler - 获取单个卡片查询处理器
 * 
 * @description
 * 处理获取单个卡片的查询请求
 */

import type { StorageManager } from '@/core/storage/manager';
import { GetCardQuery, GetCardQueryResult } from './GetCardQuery';

/**
 * 获取卡片查询处理器
 */
export class GetCardQueryHandler {
  constructor(
    private readonly storageManager: StorageManager
  ) {}

  /**
   * 执行查询
   * 
   * @param query - 查询对象
   * @returns 查询结果，如果卡片不存在则 card 为 null
   */
  async execute(query: GetCardQuery): Promise<GetCardQueryResult> {
    const card = this.storageManager.getCard(query.cardId);
    
    // ✅ DDD 原则：查询不存在的资源是正常业务场景，不应抛出异常
    // 返回 null 让调用者决定如何处理
    return {
      card: card || null
    };
  }
}
