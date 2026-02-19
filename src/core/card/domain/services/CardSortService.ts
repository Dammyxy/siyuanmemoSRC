/**
 * CardSortService - 卡片排序领域服务
 * 
 * 职责：
 * - 按到期时间排序
 * - 按创建时间排序
 * - 按修改时间排序
 * - 按稳定性排序
 * - 按难度排序
 * - 按优先级排序
 * 
 * 设计原则：
 * - 单一职责：只负责卡片排序相关的业务逻辑
 * - 无状态：所有方法都是纯函数
 * - 领域层：不依赖基础设施层
 * 
 * @see .kiro/specs/ddd-refactoring/browser-ddd-migration.md - Phase 1
 */

import type { Card } from '@/services/StorageManager';

/**
 * 排序字段类型
 */
export type SortField = 
  | 'due'           // 到期时间
  | 'created'       // 创建时间
  | 'modified'      // 修改时间
  | 'stability'     // 稳定性
  | 'difficulty'    // 难度
  | 'priority'      // 优先级
  | 'reps'          // 复习次数
  | 'lapses'        // 遗忘次数
  | 'interval';     // 间隔天数

/**
 * 排序方向
 */
export type SortOrder = 'asc' | 'desc';

/**
 * CardSortService 类
 * 
 * 提供卡片排序相关的业务逻辑。
 * 
 * 使用示例：
 * ```typescript
 * const service = new CardSortService();
 * 
 * // 按到期时间升序排序
 * const sorted = service.sort(cards, 'due', 'asc');
 * 
 * // 按稳定性降序排序
 * const sorted2 = service.sort(cards, 'stability', 'desc');
 * 
 * // 多字段排序
 * const sorted3 = service.sortMultiple(cards, [
 *   { field: 'priority', order: 'desc' },
 *   { field: 'due', order: 'asc' }
 * ]);
 * ```
 */
export class CardSortService {
  /**
   * 按指定字段排序卡片
   * 
   * @param cards - 卡片列表
   * @param sortBy - 排序字段
   * @param sortOrder - 排序方向（默认为升序）
   * @returns 排序后的卡片列表（不修改原数组）
   */
  sort(
    cards: Card[],
    sortBy: SortField,
    sortOrder: SortOrder = 'asc'
  ): Card[] {
    const sorted = [...cards];
    const multiplier = sortOrder === 'asc' ? 1 : -1;
    
    sorted.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'due':
          comparison = a.due - b.due;
          break;
          
        case 'created':
          // 从块 ID 中提取创建时间（前 14 位是时间戳）
          comparison = this.compareBlockIdTime(a.blockId, b.blockId);
          break;
          
        case 'modified':
          // 使用 lastReview 作为修改时间
          comparison = (a.lastReview || 0) - (b.lastReview || 0);
          break;
          
        case 'stability':
          comparison = a.stability - b.stability;
          break;
          
        case 'difficulty':
          comparison = a.difficulty - b.difficulty;
          break;
          
        case 'priority':
          // 优先级从 meta 中获取，默认为 50
          const priorityA = this.getPriority(a);
          const priorityB = this.getPriority(b);
          comparison = priorityA - priorityB;
          break;
          
        case 'reps':
          comparison = a.reps - b.reps;
          break;
          
        case 'lapses':
          comparison = a.lapses - b.lapses;
          break;
          
        case 'interval':
          comparison = (a.scheduledDays || 0) - (b.scheduledDays || 0);
          break;
          
        default:
          comparison = 0;
      }
      
      return comparison * multiplier;
    });
    
    return sorted;
  }
  
  /**
   * 多字段排序
   * 
   * 按照指定的多个字段依次排序。
   * 
   * @param cards - 卡片列表
   * @param sortRules - 排序规则列表
   * @returns 排序后的卡片列表
   * 
   * @example
   * ```typescript
   * // 先按优先级降序，再按到期时间升序
   * const sorted = service.sortMultiple(cards, [
   *   { field: 'priority', order: 'desc' },
   *   { field: 'due', order: 'asc' }
   * ]);
   * ```
   */
  sortMultiple(
    cards: Card[],
    sortRules: Array<{ field: SortField; order: SortOrder }>
  ): Card[] {
    if (!sortRules || sortRules.length === 0) {
      return cards;
    }
    
    const sorted = [...cards];
    
    sorted.sort((a, b) => {
      for (const rule of sortRules) {
        const multiplier = rule.order === 'asc' ? 1 : -1;
        let comparison = 0;
        
        switch (rule.field) {
          case 'due':
            comparison = a.due - b.due;
            break;
          case 'created':
            comparison = this.compareBlockIdTime(a.blockId, b.blockId);
            break;
          case 'modified':
            comparison = (a.lastReview || 0) - (b.lastReview || 0);
            break;
          case 'stability':
            comparison = a.stability - b.stability;
            break;
          case 'difficulty':
            comparison = a.difficulty - b.difficulty;
            break;
          case 'priority':
            comparison = this.getPriority(a) - this.getPriority(b);
            break;
          case 'reps':
            comparison = a.reps - b.reps;
            break;
          case 'lapses':
            comparison = a.lapses - b.lapses;
            break;
          case 'interval':
            comparison = (a.scheduledDays || 0) - (b.scheduledDays || 0);
            break;
        }
        
        if (comparison !== 0) {
          return comparison * multiplier;
        }
      }
      
      return 0;
    });
    
    return sorted;
  }
  
  /**
   * 按到期时间排序（快捷方法）
   * 
   * @param cards - 卡片列表
   * @param ascending - 是否升序（默认为 true）
   * @returns 排序后的卡片列表
   */
  sortByDueTime(cards: Card[], ascending: boolean = true): Card[] {
    return this.sort(cards, 'due', ascending ? 'asc' : 'desc');
  }
  
  /**
   * 按稳定性排序（快捷方法）
   * 
   * @param cards - 卡片列表
   * @param ascending - 是否升序（默认为 true）
   * @returns 排序后的卡片列表
   */
  sortByStability(cards: Card[], ascending: boolean = true): Card[] {
    return this.sort(cards, 'stability', ascending ? 'asc' : 'desc');
  }
  
  /**
   * 按难度排序（快捷方法）
   * 
   * @param cards - 卡片列表
   * @param ascending - 是否升序（默认为 true）
   * @returns 排序后的卡片列表
   */
  sortByDifficulty(cards: Card[], ascending: boolean = true): Card[] {
    return this.sort(cards, 'difficulty', ascending ? 'asc' : 'desc');
  }
  
  /**
   * 按优先级排序（快捷方法）
   * 
   * @param cards - 卡片列表
   * @param ascending - 是否升序（默认为 false，高优先级在前）
   * @returns 排序后的卡片列表
   */
  sortByPriority(cards: Card[], ascending: boolean = false): Card[] {
    return this.sort(cards, 'priority', ascending ? 'asc' : 'desc');
  }
  
  // ========================================================================
  // 私有辅助方法
  // ========================================================================
  
  /**
   * 从块 ID 中提取时间戳并比较
   * 
   * 思源笔记的块 ID 格式：YYYYMMDDHHMMSS-xxxxxxx
   * 前 14 位是时间戳
   * 
   * @param blockIdA - 块 ID A
   * @param blockIdB - 块 ID B
   * @returns 比较结果
   */
  private compareBlockIdTime(blockIdA: string, blockIdB: string): number {
    const timeA = blockIdA.substring(0, 14);
    const timeB = blockIdB.substring(0, 14);
    return timeA.localeCompare(timeB);
  }
  
  /**
   * 获取卡片的优先级
   * 
   * @param card - 卡片对象
   * @returns 优先级（默认为 50）
   */
  private getPriority(card: Card): number {
    const priority = card.meta?.priority as number | undefined;
    return priority !== undefined ? priority : 50;
  }
}
