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
   * @returns 查询结果
   * @throws Error 如果卡片不存在
   */
  async execute(query: GetCardQuery): Promise<GetCardQueryResult> {
    const card = this.storageManager.getCard(query.cardId);
    
    if (!card) {
      throw new Error(`Card not found: ${query.cardId}`);
    }
    
    return {
      card
    };
  }
}
