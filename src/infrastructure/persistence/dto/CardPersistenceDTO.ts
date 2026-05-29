/**
 * CardPersistenceDTO - 卡片持久化数据传输对象
 * 
 * @module CardPersistenceDTO
 * @description
 * 用于 MessagePack 存储的优化数据结构。
 * 
 * **设计原则**：
 * 1. 扁平化常用字段（xiuyuanID, templateID）到顶层，便于索引和查询
 * 2. 保留 meta 字段用于扩展，向后兼容
 * 3. 使用基础类型（number, string），避免复杂对象
 * 
 * **与 FSRSCard 的区别**：
 * - FSRSCard: 领域模型，包含业务逻辑和验证
 * - CardPersistenceDTO: 持久化模型，纯数据结构，优化存储
 * 
 * @see FSRSCard - 领域模型
 * @see CardMapper - 映射器
 */

import type { CardFaceKey, CardState, CardType } from '../../../types/card';
import type { RescheduleHistoryEntry } from '../../../types/reschedule';

/**
 * 卡片持久化 DTO
 * 
 * 优化点：
 * 1. Xiuyuan 字段提取到顶层（xiuyuanID, templateID, frontBlockIDs, backBlockIDs）
 * 2. 时间字段统一使用 number（时间戳）
 * 3. 枚举字段保持原样（CardState, CardType）
 * 4. 可选字段明确标记（?）
 */
export interface CardPersistenceDTO {
  // ==================== 标识 ====================
  id: string;
  blockId: string;
  faceKey?: CardFaceKey;

  // ==================== FSRS 核心字段 ====================
  due: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: CardState;
  lastReview: number;
  elapsedDays: number;
  scheduledDays: number;
  learning_step?: number;

  // ==================== 扩展功能 ====================
  priority: number;
  type: CardType;
  tags: string[];
  cardTypeMarker?: 'concept' | 'descriptor';
  neuralRoamSeed?: boolean;

  // ==================== 难点攻克 ====================
  leechCount: number;
  isLeech: boolean;

  // ==================== 跳过/留言 ====================
  skipped: boolean;
  skipNote?: string;
  skipUntil?: number;

  // ==================== 增量阅读 ====================
  sourceUrl?: string;
  extractedFrom?: string;

  // ==================== 元数据 ====================
  createdAt: number;
  updatedAt: number;

  // ==================== Topic/Item 区分 ====================
  aFactor?: number;

  // ==================== 调度器相关 ====================
  schedulerType?: 'fsrs-v6' | 'a-factor-v2' | 'riff' | string;
  syncToRiff?: boolean;
  riffCardId?: string;
  schedulerMeta?: {
    topic?: {
      afs: number[];
      of: number;
      optimalInterval: number;
    };
  };

  // ==================== 重新调度相关 ====================
  postponeCount?: number;
  lastPostponeDate?: number;
  rescheduleHistory?: RescheduleHistoryEntry[];

  // ==================== 🆕 Xiuyuan 字段（提取到顶层）====================
  /**
   * Xiuyuan ID（从 meta 提取）
   * 
   * 提取原因：
   * - 高频查询字段（getCardsByXiuyuanId）
   * - 便于建立索引
   * - 避免解析 meta 对象
   */
  xiuyuanID?: string;

  /**
   * 模板 ID（从 meta 提取）
   */
  templateID?: string;

  /**
   * 正面块 ID 列表（从 meta 提取）
   */
  frontBlockIDs?: string[];

  /**
   * 背面块 ID 列表（从 meta 提取）
   */
  backBlockIDs?: string[];

  /**
   * 字段映射（从 meta 提取）
   * 
   * 示例：{ "question": "block-1", "answer": "block-2" }
   */
  fieldMapping?: Record<string, string>;

  /**
   * Xiuyuan 独立优先级（从 meta 提取）
   * 
   * 注意：与 FSRSCard.priority 不同
   * - FSRSCard.priority: 卡片优先级（0-100）
   * - xiuyuanPriority: Xiuyuan 独立优先级（可能不同）
   */
  xiuyuanPriority?: number;

  // ==================== 扩展元数据（保留向后兼容）====================
  /**
   * 扩展元数据
   * 
   * 用途：
   * - 存储未来可能添加的字段
   * - 向后兼容旧数据
   * - 插件扩展字段
   * 
   * 注意：常用字段应提取到顶层，避免频繁解析 meta
   */
  meta?: Record<string, unknown>;
}

/**
 * Xiuyuan 持久化 DTO
 */
export interface XiuyuanPersistenceDTO {
  id: string;
  blockIDs: string[];
  fields: Array<{
    name: string;
    blockID: string;
    marker?: string;
  }>;
  templateID: string;
  createdAt: number;
  updatedAt: number;
  meta?: Record<string, unknown>;
}

/**
 * 统一存储数据结构（持久化格式）
 */
export interface UnifiedStorePersistenceDTO {
  version: number;
  xiuyuans: Record<string, XiuyuanPersistenceDTO>;
  cards: Record<string, CardPersistenceDTO>;
}
