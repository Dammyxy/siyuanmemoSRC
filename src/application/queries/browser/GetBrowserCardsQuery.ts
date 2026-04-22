/**
 * GetBrowserCardsQuery - 获取浏览器卡片查询
 * 
 * 职责：
 * - 定义浏览器卡片查询的输入参数
 * - 定义查询结果的数据结构
 * 
 * 设计原则：
 * - CQRS：查询与命令分离
 * - DTO：数据传输对象，不包含业务逻辑
 * 
 * @see .kiro/specs/ddd-refactoring/browser-ddd-migration.md - Phase 2
 */

import type { CardState } from '@/core/card/domain/services/CardScheduleService';
import type { SortField, SortOrder } from '@/core/card/domain/services/CardSortService';

/**
 * 浏览器卡片数据结构
 * 
 * 这是表现层使用的卡片数据格式，包含了 UI 需要的所有信息。
 */
export interface BrowserCard {
  // 基本信息
  id: string;              // FSRS 卡片 ID
  fsrsCardId?: string;     // FSRS 卡片 ID（兼容字段）
  blockId: string;         // 块 ID
  deckId: string;          // Deck ID
  rootId: string;          // 根文档 ID
  content: string;         // 卡片内容（截断）
  fullContent: string;     // 完整内容
  
  // 状态信息
  state: CardState;        // 卡片状态
  stateLabel: string;      // 状态标签（用于显示）
  suspended: boolean;      // 是否暂停
  
  // 调度信息
  due: Date;               // 到期时间
  dueFormatted: string;    // 格式化的到期时间
  stability: number;       // 稳定性
  difficulty: number;      // 难度
  retrievability?: number; // 可提取性
  
  // 复习历史
  reps: number;            // 复习次数
  lapses: number;          // 遗忘次数
  elapsedDays: number;     // 已过天数
  scheduledDays: number;   // 计划间隔天数
  interval: number;        // 间隔天数（兼容字段）
  lastReview: Date | null; // 最后复习时间
  lastReviewFormatted: string; // 格式化的最后复习时间
  firstReview: Date | null;    // 首次复习时间
  firstReviewFormatted: string; // 格式化的首次复习时间
  
  // 元数据
  priority: number;        // 优先级（1-100）
  cardType?: string;       // 卡片类型
  aFactor?: number;        // A 因子
  tags: string[];          // 标签列表
  
  // 原始数据（用于特殊处理）
  meta?: Record<string, unknown>;
}

/**
 * 预设过滤器类型
 */
export type PresetFilter = 
  | 'all'        // 所有卡片
  | 'due'        // 到期卡片
  | 'overdue'    // 过期卡片
  | 'leech'      // 难卡
  | 'new'        // 新卡片
  | 'learning'   // 学习中
  | 'current-doc' // 当前文档
  | 'review'     // 复习中
  | 'suspended'; // 已暂停

/**
 * 获取浏览器卡片查询对象
 * 
 * 定义了查询浏览器卡片所需的所有参数。
 */
export interface GetBrowserCardsQuery {
  /** 搜索文本 */
  searchText?: string;
  
  /** 预设过滤器 */
  preset?: PresetFilter;
  
  /** 卡片状态过滤 */
  states?: CardState[];
  
  /** 卡片类型过滤 */
  cardTypes?: string[];
  
  /** Deck ID 过滤 */
  deckIds?: string[];
  
  /** 标签过滤 */
  tags?: string[];
  
  /** 🆕 文档 ID 过滤（根文档 ID） */
  docId?: string;
  
  /** 排序字段 */
  sortBy?: SortField;
  
  /** 排序方向 */
  sortOrder?: SortOrder;
  
  /** 分页：页码（从 1 开始） */
  page?: number;
  
  /** 分页：每页数量 */
  pageSize?: number;
  
  /** 是否强制刷新缓存 */
  forceRefresh?: boolean;
}

/**
 * 浏览器统计信息
 */
export interface BrowserStats {
  /** 总卡片数 */
  totalCards: number;
  
  /** 到期卡片数 */
  dueCards: number;
  
  /** 新卡片数 */
  newCards: number;
  
  /** 学习中卡片数 */
  learningCards: number;
  
  /** 复习中卡片数 */
  reviewCards: number;
  
  /** 已暂停卡片数 */
  suspendedCards: number;

  /** 源块已缺失的孤儿闪卡数 */
  lostCards: number;
}

/**
 * 获取浏览器卡片查询结果
 * 
 * 包含查询到的卡片列表、分页信息和统计信息。
 */
export interface GetBrowserCardsQueryResult {
  /** 卡片列表 */
  cards: BrowserCard[];
  
  /** 总数（过滤后） */
  total: number;
  
  /** 当前页 */
  page: number;
  
  /** 每页数量 */
  pageSize: number;
  
  /** 统计信息（基于所有卡片，不受过滤影响） */
  stats: BrowserStats;
}
