/**
 * CardScheduleService - 卡片调度领域服务
 * 
 * 职责：
 * - 判断卡片是否到期
 * - 计算到期卡片数量
 * - 获取到期卡片列表
 * 
 * 设计原则：
 * - 单一职责：只负责卡片调度相关的业务逻辑
 * - 无状态：所有方法都是纯函数
 * - 领域层：不依赖基础设施层
 * 
 * @see .kiro/specs/ddd-refactoring/long-term-improvements.md - 阶段 1
 */

import type { FSRSCard } from '@/types/card';

/**
 * 卡片状态枚举
 */
export enum CardState {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3,
  Suspended = 4,
}

/**
 * CardScheduleService 类
 * 
 * 提供卡片调度相关的业务逻辑。
 * 
 * 使用示例：
 * ```typescript
 * const service = new CardScheduleService();
 * 
 * // 判断卡片是否到期
 * const isDue = service.isDue(card);
 * 
 * // 过滤到期卡片
 * const dueCards = service.filterDueCards(allCards);
 * 
 * // 计算到期卡片数量
 * const count = service.countDueCards(allCards);
 * ```
 */
export class CardScheduleService {
  /**
   * 判断卡片是否到期
   * 
   * 规则：
   * 1. 暂停的卡片不算到期
   * 2. 到期时间小于等于当前时间的卡片算到期
   * 
   * @param card - 卡片对象
   * @param now - 当前时间（可选，默认为当前时间）
   * @returns 是否到期
   */
  isDue(card: FSRSCard, now: Date = new Date()): boolean {
    // 暂停的卡片不算到期
    if (card.state === CardState.Suspended) {
      return false;
    }
    
    // 到期时间小于等于当前时间
    return card.due <= now.getTime();
  }
  
  /**
   * 过滤到期卡片
   * 
   * @param cards - 卡片列表
   * @param now - 当前时间（可选，默认为当前时间）
   * @returns 到期卡片列表
   */
  filterDueCards(cards: FSRSCard[], now: Date = new Date()): FSRSCard[] {
    return cards.filter(card => this.isDue(card, now));
  }
  
  /**
   * 计算到期卡片数量
   * 
   * @param cards - 卡片列表
   * @param now - 当前时间（可选，默认为当前时间）
   * @returns 到期卡片数量
   */
  countDueCards(cards: FSRSCard[], now: Date = new Date()): number {
    return this.filterDueCards(cards, now).length;
  }
  
  /**
   * 判断卡片是否在指定时间范围内到期
   * 
   * @param card - 卡片对象
   * @param startTime - 开始时间
   * @param endTime - 结束时间
   * @returns 是否在时间范围内到期
   */
  isDueInRange(card: FSRSCard, startTime: Date, endTime: Date): boolean {
    if (card.state === CardState.Suspended) {
      return false;
    }
    
    const dueTime = card.due;
    return dueTime >= startTime.getTime() && dueTime <= endTime.getTime();
  }
  
  /**
   * 过滤在指定时间范围内到期的卡片
   * 
   * @param cards - 卡片列表
   * @param startTime - 开始时间
   * @param endTime - 结束时间
   * @returns 在时间范围内到期的卡片列表
   */
  filterDueCardsInRange(cards: FSRSCard[], startTime: Date, endTime: Date): FSRSCard[] {
    return cards.filter(card => this.isDueInRange(card, startTime, endTime));
  }
  
  /**
   * 按到期时间排序卡片
   * 
   * @param cards - 卡片列表
   * @param ascending - 是否升序（默认为 true）
   * @returns 排序后的卡片列表
   */
  sortByDueTime(cards: FSRSCard[], ascending: boolean = true): FSRSCard[] {
    const sorted = [...cards];
    sorted.sort((a, b) => {
      const diff = a.due - b.due;
      return ascending ? diff : -diff;
    });
    return sorted;
  }
}
