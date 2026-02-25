/**
 * UpdateFSRSCardCommand - 更新 FSRS 卡片命令
 * 
 * @description
 * 用于更新 FSRS 卡片的所有字段。
 * 支持部分更新（只更新提供的字段）。
 * 
 * **使用场景**：
 * - 更新卡片的复习数据（due, stability, difficulty 等）
 * - 更新卡片的元数据（priority, meta 等）
 * - 批量更新多个字段
 * 
 * **设计原则**：
 * - 使用 Partial 类型支持部分更新
 * - 只更新提供的字段，未提供的字段保持不变
 * - 不支持更新 id 和 blockId（这些是不可变的）
 * 
 * @example
 * ```typescript
 * // 更新复习数据
 * const command: UpdateFSRSCardCommand = {
 *   cardId: 'card-123',
 *   updates: {
 *     due: new Date('2024-01-01'),
 *     stability: 10.5,
 *     difficulty: 5.2,
 *     state: CardState.Review
 *   }
 * };
 * 
 * // 只更新优先级
 * const command: UpdateFSRSCardCommand = {
 *   cardId: 'card-123',
 *   updates: {
 *     priority: 10
 *   }
 * };
 * 
 * // 更新元数据
 * const command: UpdateFSRSCardCommand = {
 *   cardId: 'card-123',
 *   updates: {
 *     meta: {
 *       ...existingMeta,
 *       customField: 'value'
 *     }
 *   }
 * };
 * ```
 */

import type { CardState, FSRSCard } from '@/types';
import { CardType } from '@/types';

/**
 * 更新 FSRS 卡片命令
 */
export interface UpdateFSRSCardCommand {
  /** 卡片 ID（必需） */
  cardId: string;
  
  /** 
   * 要更新的字段（部分更新）
   * 
   * 只需要提供要更新的字段，未提供的字段保持不变。
   * 不能更新 id 和 blockId（这些是不可变的）。
   */
  updates: Partial<{
    /** 下次复习时间 */
    due: Date;
    
    /** 稳定性（FSRS 参数） */
    stability: number;
    
    /** 难度（FSRS 参数） */
    difficulty: number;
    
    /** 已经过的天数 */
    elapsed_days: number;
    
    /** 计划的天数 */
    scheduled_days: number;
    
    /** 复习次数 */
    reps: number;
    
    /** 失误次数 */
    lapses: number;
    
    /** 卡片状态 */
    state: CardState;
    
    /** 最后复习时间 */
    last_review: Date;
    
    /** 优先级（1-10） */
    priority: number;

    /** 卡片类型 */
    type: CardType;
    
    /** 元数据（自定义字段） */
    meta: Record<string, unknown>;
  }>;
}

/**
 * 更新 FSRS 卡片命令结果
 */
export interface UpdateFSRSCardCommandResult {
  /** 更新后的卡片 */
  card: FSRSCard;
}
