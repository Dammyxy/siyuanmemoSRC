/**
 * ReviewApplicationService - 复习应用服务
 * 
 * 职责：
 * - 提供复习相关操作的统一入口
 * - 协调调度器和存储的操作
 * - 封装卡片重新调度的业务逻辑
 * 
 * 设计原则：
 * - 应用服务模式：协调多个领域服务和基础设施
 * - 依赖注入：通过构造函数注入依赖
 * - 薄包装：不包含业务逻辑，仅委托给调度器和存储
 * 
 * @see .kiro/specs/ddd-refactoring/ui-components-ddd-complete.md
 */

import type { CardReadPort, CardWritePort } from '@/core/storage/ports';
import type { SchedulerRouter } from '@/core/scheduler';
import type { FSRSCard, Rating } from '@/types';
import type { ReviewSiyuanPort } from '@/application/ports/ReviewSiyuanPort';
import { ReviewSiyuanAdapter } from '@/infrastructure/siyuan/ReviewSiyuanAdapter';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ReviewApplicationService');

/**
 * 重新调度选项
 */
export interface RescheduleOptions {
  /** 调度模式 */
  mode: 'rating' | 'direct';
  /** 评分（rating 模式必需） */
  rating?: Rating;
  /** 到期时间戳 */
  dueTimestamp: number;
}

/**
 * ReviewApplicationService 类
 * 
 * 复习相关操作的主要入口点。
 * 
 * 使用示例：
 * ```typescript
 * const reviewService = new ReviewApplicationService(
 *   storageManager,
 *   schedulerRouter
 * );
 * 
 * // 重新调度卡片（评分模式）
 * await reviewService.rescheduleCard('card-id', {
 *   mode: 'rating',
 *   rating: 'good',
 *   dueTimestamp: Date.now() + 86400000
 * });
 * 
 * // 重新调度卡片（直接模式）
 * await reviewService.rescheduleCard('card-id', {
 *   mode: 'direct',
 *   dueTimestamp: Date.now() + 86400000
 * });
 * ```
 */
export class ReviewApplicationService {
  /**
   * 构造函数
   * 
   * @param storageManager - 存储管理器
   * @param schedulerRouter - 调度器路由
   */
  constructor(
    private readonly storageManager: CardReadPort & CardWritePort,
    private readonly schedulerRouter: SchedulerRouter,
    private readonly siyuanApi: ReviewSiyuanPort = new ReviewSiyuanAdapter(),
  ) {}
  
  /**
   * 重新调度卡片
   * 
   * 根据不同的模式重新调度卡片：
   * - rating 模式：先执行复习评分，再修改到期时间
   * - direct 模式：直接修改到期时间
   * 
   * @param cardId - 卡片 ID
   * @param options - 重新调度选项
   * @returns 更新后的卡片
   * @throws Error - 如果卡片不存在
   * 
   * @example
   * ```typescript
   * // 评分模式：先评分，再设置到期时间
   * await reviewService.rescheduleCard('card-123', {
   *   mode: 'rating',
   *   rating: 'good',
   *   dueTimestamp: Date.now() + 86400000
   * });
   * 
   * // 直接模式：直接设置到期时间
   * await reviewService.rescheduleCard('card-123', {
   *   mode: 'direct',
   *   dueTimestamp: Date.now() + 86400000
   * });
   * ```
   */
  async rescheduleCard(cardId: string, options: RescheduleOptions): Promise<FSRSCard> {
    // 1. 获取卡片
    const card = this.storageManager.getCard(cardId);
    if (!card) {
      throw new Error(`Card not found: ${cardId}`);
    }
    
    let updatedCard: FSRSCard;
    
    // 2. 根据模式处理
    if (options.mode === 'rating' && options.rating) {
      // 评分模式：先执行复习，再修改日期
      updatedCard = await this.schedulerRouter.route(card, options.rating);
      updatedCard.due = options.dueTimestamp;
      updatedCard.updatedAt = Date.now();
      
      logger.info('Schedule with rating:', { rating: options.rating, dueTimestamp: options.dueTimestamp });
    } else {
      // 直接模式：仅修改日期
      updatedCard = { ...card };
      updatedCard.due = options.dueTimestamp;
      updatedCard.updatedAt = Date.now();
      
      logger.info('Schedule direct to:', options.dueTimestamp);
    }
    
    // 3. 保存卡片
    this.storageManager.setCard(updatedCard);
    await this.storageManager.saveCards();
    
    return updatedCard;
  }
  
  /**
   * 批量重新调度卡片
   * 
   * @param cardIds - 卡片 ID 列表
   * @param options - 重新调度选项
   * @returns 更新后的卡片列表
   */
  async rescheduleCards(cardIds: string[], options: RescheduleOptions): Promise<FSRSCard[]> {
    const updatedCards: FSRSCard[] = [];
    
    for (const cardId of cardIds) {
      try {
        const updatedCard = await this.rescheduleCard(cardId, options);
        updatedCards.push(updatedCard);
      } catch (error) {
        logger.error(`Failed to reschedule card ${cardId}:`, error);
      }
    }
    
    return updatedCards;
  }
  
  /**
   * 获取卡片
   * 
   * @param cardId - 卡片 ID
   * @returns 卡片，如果不存在则返回 null
   */
  getCard(cardId: string): FSRSCard | null {
    return this.storageManager.getCard(cardId) || null;
  }
  
  /**
   * 获取卡片（通过块 ID）
   * 
   * @param blockId - 块 ID
   * @returns 卡片，如果不存在则返回 null
   */
  getCardByBlockId(blockId: string): FSRSCard | null {
    if (typeof this.storageManager.getCardByBlockId !== 'function') {
      return null;
    }
    return this.storageManager.getCardByBlockId(blockId) || null;
  }

  getSiyuanApi(): ReviewSiyuanPort {
    return this.siyuanApi;
  }
}
