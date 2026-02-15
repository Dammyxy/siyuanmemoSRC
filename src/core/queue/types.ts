import type { IQueueCommand } from './abstraction/Command';
import type { QueueCardRef } from './abstraction/QueueCardRef.ts';
import type { BlockID, CardID } from '../../types/branded';

export type QueueId = 'retrieval' | 'final-drill' | 'neural-roam' | 'filter-group';

/**
 * 卡片状态枚举
 * 
 * 定义了 FSRS 算法中卡片的四种状态：
 * - New: 新卡片，从未复习过
 * - Learning: 学习中，正在初次学习阶段
 * - Review: 复习中，已经进入长期记忆复习阶段
 * - Relearning: 重新学习，因遗忘而需要重新学习
 */
export enum CardState {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3
}

/**
 * Queue Interface - Basic queue operations
 * 
 * Defines the fundamental operations that any queue implementation should support.
 * This interface provides a simpler alternative to IQueueStrategy for basic queue needs.
 * 
 * **Type Constraint**: TItem must extend QueueItem to ensure all items have
 * the required blockID field for proper identification and tracking. This
 * satisfies Requirement 6.2: "WHEN defining IQueue interface, THE System SHALL
 * constrain TItem to extend QueueItem"
 * 
 * @template TItem - The item type managed by this queue (must extend QueueItem)
 * 
 * @see IQueueStrategy for a more feature-rich queue interface
 * @see Requirement 6.2 - Generic type constraints for IQueue interface
 * 
 * @example
 * ```typescript
 * class SimpleQueue implements QueueInterface<ReviewCard> {
 *   private items: ReviewCard[] = [];
 *   
 *   async addItem(item: ReviewCard): Promise<void> {
 *     this.items.push(item);
 *   }
 *   
 *   async getNextItem(): Promise<ReviewCard | null> {
 *     return this.items.shift() || null;
 *   }
 *   
 *   async removeItem(item: ReviewCard): Promise<boolean> {
 *     const index = this.items.findIndex(i => i.blockId === item.blockId);
 *     if (index !== -1) {
 *       this.items.splice(index, 1);
 *       return true;
 *     }
 *     return false;
 *   }
 *   
 *   async size(): Promise<number> {
 *     return this.items.length;
 *   }
 *   
 *   async isEmpty(): Promise<boolean> {
 *     return this.items.length === 0;
 *   }
 * }
 * ```
 */
export interface QueueInterface<TItem extends QueueItem> {
  addItem(item: TItem): Promise<void> | void;
  getNextItem(): Promise<TItem | null> | TItem | null;
  removeItem(item: TItem): Promise<boolean> | boolean;
  size(): Promise<number> | number;
  isEmpty(): Promise<boolean> | boolean;
  reorder?(orderedItems: TItem[]): Promise<boolean> | boolean;
}

/**
 * Queue Item Base Interface
 * 
 * Defines the base structure for all queue items in the system.
 * This interface ensures type safety by requiring essential fields
 * that all queue items must have, particularly the `blockID` field.
 * 
 * **Purpose**: 
 * - Provides a lightweight data structure for queue operations
 * - Contains core fields required for FSRS scheduling
 * - Enables compile-time type checking to prevent missing required fields
 * 
 * **Design Decision**:
 * The `blockID` field is required (non-optional) to ensure that every queue item
 * can be uniquely identified and tracked throughout the system. This satisfies
 * Requirement 6.1: "THE System SHALL define a QueueItem interface requiring blockID field"
 * 
 * @remarks
 * This interface serves as the foundation for more specific item types like `ReviewCard`.
 * Optional fields (state, stability, etc.) allow flexibility for different queue types
 * while maintaining a consistent base structure.
 * 
 * @example
 * ```typescript
 * // Basic queue item with required fields
 * const item: QueueItem = {
 *   id: 'card-123',
 *   blockId: 'block-123',  // Required field
 *   deckId: 'deck-123',
 *   priority: 50,
 * };
 * 
 * // Queue item with FSRS scheduling fields
 * const scheduledItem: QueueItem = {
 *   id: 'card-456',
 *   blockId: 'block-456',  // Required field
 *   deckId: 'deck-123',
 *   priority: 50,
 *   state: 2,              // CardState.Review
 *   stability: 10.5,
 *   difficulty: 5.2,
 *   reps: 3,
 *   lapses: 0,
 * };
 * ```
 * 
 * @see ReviewCard for a more specific interface with all FSRS fields required
 * @see Requirement 6.1 - QueueItem interface requiring blockID field
 */
export interface QueueItem {
  // === Identity Fields (Required) ===
  
  /** Card ID - Unique identifier for the card in the Riff system */
  id: string;
  
  /** 
   * Block ID - Unique identifier for the block in SiYuan notes
   * 
   * **Required Field**: This field is mandatory for all queue items to ensure
   * proper identification and tracking throughout the system.
   * 
   * @see Requirement 6.1
   */
  blockId: string;
  
  /** Deck ID - Identifier for the deck this card belongs to */
  deckId?: string;
  
  /** 
   * Priority - Normalized priority value (0-100)
   * - 0 = Highest priority
   * - 100 = Lowest priority
   * - Default: 50 if undefined
   */
  priority?: number;
  
  // === Riff Native Fields (Optional) ===
  
  /** Next due dates for different rating buttons (Riff-specific) */
  nextDues?: Record<1 | 2 | 3 | 4, string>;
  
  // === FSRS Scheduling Fields (Optional) ===
  
  /** 
   * Card state in the FSRS algorithm
   * - 0 = New (never reviewed)
   * - 1 = Learning (initial learning phase)
   * - 2 = Review (long-term memory review)
   * - 3 = Relearning (forgotten, needs relearning)
   * 
   * @see CardState enum
   */
  state?: number;
  
  /** Stability (S) - Memory stability parameter in FSRS algorithm */
  stability?: number;
  
  /** Difficulty (D) - Difficulty parameter in FSRS algorithm (range: 1-10) */
  difficulty?: number;
  
  /** Review count - Total number of times this card has been reviewed */
  reps?: number;
  
  /** Lapse count - Number of times this card was forgotten */
  lapses?: number;
  
  /** Last review timestamp in milliseconds */
  lastReview?: number;
  
  /** Elapsed days since last review */
  elapsedDays?: number;
  
  /** Scheduled days - Planned interval from last review to next review */
  scheduledDays?: number;
  
  // === Extension Fields (Optional) ===
  
  /** Update timestamp in milliseconds */
  updatedAt?: number;
  
  /** 
   * Metadata - Extensible field for custom data
   * 
   * Allows queue implementations to store additional information
   * without modifying the base interface.
   */
  meta?: Record<string, unknown>;
}

/**
 * 复习卡片接口
 * 
 * 定义了复习卡片的所有必需字段，提供完整的类型安全。
 * 这是系统中最核心的数据类型，用于消除关键路径中的 `any` 类型。
 * 
 * @remarks
 * ReviewCard 扩展自 QueueItem，确保所有必需的 FSRS 调度字段都是非可选的。
 * 这样可以在编译时捕获缺失字段的错误，提高代码的可靠性。
 * 
 * @example
 * ```typescript
 * const card: ReviewCard = {
 *   blockId: createBlockID('20230101120000-abc123'),
 *   id: createCardID('20230101120000-abc123'),
 *   deckId: '20230101000000-deck01',
 *   priority: 50,
 *   due: Date.now(),
 *   lapses: 0,
 *   state: CardState.New,
 *   stability: 1,
 *   difficulty: 5,
 *   elapsed_days: 0,
 *   scheduled_days: 1,
 *   reps: 0,
 *   last_review: Date.now()
 * };
 * ```
 */
export interface ReviewCard extends QueueItem {
  /** 块 ID - 思源笔记中的块标识符 (Branded Type) */
  blockId: BlockID;
  
  /** 卡片 ID - Riff 系统中的卡片标识符 (Branded Type) */
  id: CardID;
  
  /** 到期时间戳 (毫秒) - 卡片应该被复习的时间 */
  due: number;
  
  /** 遗忘次数 - 卡片被标记为"重来"或"困难"的次数 */
  lapses: number;
  
  /** 卡片状态 - 使用 CardState 枚举值 */
  state: CardState;
  
  /** 稳定性 (S) - FSRS 算法中的记忆稳定性参数 */
  stability: number;
  
  /** 难度 (D) - FSRS 算法中的难度参数，范围 1-10 */
  difficulty: number;
  
  /** 距上次复习经过的天数 */
  elapsed_days: number;
  
  /** 预定的间隔天数 - 本次复习到下次复习的计划间隔 */
  scheduled_days: number;
  
  /** 复习次数 - 卡片被复习的总次数 */
  reps: number;
  
  /** 上次复习时间戳 (毫秒) */
  last_review: number;
}

/**
 * SQL 查询结果接口 - 卡片属性行
 * 
 * 用于类型化 SQL 查询结果，当查询块属性表时使用。
 * 这个接口匹配 `SELECT block_id, value FROM attributes WHERE ...` 查询的结构。
 * 
 * @remarks
 * 这个接口提供了类型安全，避免在处理 SQL 查询结果时使用 `any` 类型。
 * 思源笔记的 SQL API 返回的字段名可能是 snake_case (block_id) 或 camelCase (blockID)，
 * 因此代码中通常需要同时检查两种格式。
 * 
 * @example
 * ```typescript
 * const rows = await sql(`
 *   SELECT block_id, value 
 *   FROM attributes 
 *   WHERE name = 'custom-riff-decks' 
 *   AND block_id IN ('id1', 'id2')
 * `) as CardAttributeRow[];
 * 
 * for (const row of rows) {
 *   const blockId = row.block_id || row.blockID;
 *   const cardId = createCardID(row.value);
 *   // ... process data
 * }
 * ```
 * 
 * @see Requirement 3.3 - 定义 SQL 查询结果时，系统应使用与查询结构匹配的类型化接口
 */
export interface CardAttributeRow {
  /** 块 ID (snake_case 格式) - 思源笔记块的唯一标识符 */
  block_id: string;
  
  /** 属性值 - 对应 attributes 表中的 value 字段 */
  value: string;
  
  /** 块 ID (camelCase 格式) - 某些 API 返回此格式 */
  blockID?: string;
  
  /** 属性名称 - 可选字段，某些查询会返回 */
  name?: string;
}

/**
 * SQL 查询结果接口 - 完整卡片数据行
 * 
 * 用于类型化 SQL 查询结果，当查询完整的卡片数据时使用。
 * 这个接口匹配包含所有 FSRS 调度字段的复杂查询结构。
 * 
 * @remarks
 * 这个接口用于需要一次性获取卡片所有数据的场景，例如批量加载卡片进行复习。
 * 字段名使用 snake_case 格式，与数据库列名保持一致。
 * 
 * @example
 * ```typescript
 * const rows = await sql(`
 *   SELECT 
 *     block_id, card_id, due, stability, difficulty,
 *     elapsed_days, scheduled_days, reps, lapses, state, last_review
 *   FROM cards
 *   WHERE deck_id = 'deck123'
 * `) as CardDataRow[];
 * 
 * const cards: ReviewCard[] = rows.map(row => ({
 *   blockID: createBlockID(row.block_id),
 *   cardID: createCardID(row.card_id),
 *   due: row.due,
 *   stability: row.stability,
 *   difficulty: row.difficulty,
 *   elapsed_days: row.elapsed_days,
 *   scheduled_days: row.scheduled_days,
 *   reps: row.reps,
 *   lapses: row.lapses,
 *   state: row.state,
 *   last_review: row.last_review,
 *   // ... other required fields
 * }));
 * ```
 * 
 * @see Requirement 3.3 - 定义 SQL 查询结果时，系统应使用与查询结构匹配的类型化接口
 */
export interface CardDataRow {
  /** 块 ID - 思源笔记块的唯一标识符 */
  block_id: string;
  
  /** 卡片 ID - Riff 系统中的卡片标识符 */
  card_id: string;
  
  /** 到期时间戳 (毫秒) - 卡片应该被复习的时间 */
  due: number;
  
  /** 稳定性 (S) - FSRS 算法中的记忆稳定性参数 */
  stability: number;
  
  /** 难度 (D) - FSRS 算法中的难度参数，范围 1-10 */
  difficulty: number;
  
  /** 距上次复习经过的天数 */
  elapsed_days: number;
  
  /** 预定的间隔天数 - 本次复习到下次复习的计划间隔 */
  scheduled_days: number;
  
  /** 复习次数 - 卡片被复习的总次数 */
  reps: number;
  
  /** 遗忘次数 - 卡片被标记为"重来"或"困难"的次数 */
  lapses: number;
  
  /** 卡片状态 - 0=New, 1=Learning, 2=Review, 3=Relearning */
  state: number;
  
  /** 上次复习时间戳 (毫秒) */
  last_review: number;
}

export type QueueOp = 'add' | 'next' | 'remove' | 'size' | 'isEmpty' | 'setStrategy';

export interface QueueEvent {
  op: QueueOp;
  queueId: QueueId;
  durationMs: number;
  sizeBefore?: number;
  sizeAfter?: number;
  ok: boolean;
  error?: unknown;
  payload?: unknown;
}

export interface QueueState {
  queueId: QueueId;
  size: number;
  empty: boolean;
}

export type QueueStats = {
  size: number;
  label?: string;
  extra?: string;
};

export type QueueUIConfig = {
  statsType: 'infinite' | 'queue-size' | 'riff-counts';
  showRatingButtons: boolean;
  allowSkip: boolean;
  hiddenContentTypes?: string[];
  customButtons?: Array<{
    actionId: string;
    label: string;
    icon?: string;
    danger?: boolean;
    variant?: 'ghost' | 'info';
  }>;
  menuCommands?: IQueueCommand<unknown>[];
};
