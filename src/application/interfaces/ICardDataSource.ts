/**
 * ICardDataSource - 卡片数据源接口
 * 
 * 定义数据源的标准契约，UI 层依赖此接口而非具体实现。
 * 这是 DDD 架构中的依赖倒置原则（DIP）的体现。
 * 
 * 职责：
 * - 定义数据获取的标准方法
 * - 定义操作的标准方法
 * - 为不同的数据源实现提供统一接口
 * 
 * 实现类：
 * - DeckDataSource - 全部卡片数据源
 * - QueryDataSource - SQL 查询数据源
 * - QueueDataSource - 队列数据源
 * 
 * @see .kiro/specs/ddd-refactoring/COMPREHENSIVE-DDD-REFACTORING-PLAN.md - 阶段 1
 * @see .kiro/specs/ddd-refactoring/interface-unification-plan.md - 接口统一方案
 */

import type { BrowserCard } from '@/ui/browser/types';

/**
 * 排序模型
 */
export interface SortModel {
  /** 列 ID */
  colId: string;
  /** 排序方向 */
  sort: 'asc' | 'desc';
}

/**
 * 过滤模型
 */
export interface FilterModel {
  [key: string]: unknown;
}

/**
 * 获取数据行的选项
 */
export interface FetchRowsOptions {
  /** 排序模型 */
  sortModel: SortModel[];
  /** 过滤模型 */
  filterModel: FilterModel;
  /** 起始行（可选，用于分页） */
  /** Required semantic in production infinite-row browser path. */
  startRow?: number;
  /** 结束行（可选，用于分页） */
  /** Required semantic in production infinite-row browser path. */
  endRow?: number;
}

/**
 * 获取数据行的结果
 */
export interface FetchRowsResult {
  /** 数据行 */
  rows: BrowserCard[];
  /** 总数量 */
  totalCount: number;
}

/**
 * 卡片浏览器操作
 */
export interface CardBrowserAction {
  /** 操作 ID */
  id: string;
  /** 操作标签 */
  label: string;
  /** 操作图标 */
  icon?: string;
  /** 快捷键 */
  shortcut?: string;
  /** 是否危险操作（显示为红色或需要确认） */
  danger?: boolean;
  /** 是否保持选择（执行后不清除选择） */
  keepSelection?: boolean;
  /** 子菜单 */
  submenu?: CardBrowserAction[];
}

/**
 * 卡片数据源接口
 * 
 * 所有数据源实现都必须实现此接口。
 * UI 层只依赖此接口，不依赖具体实现。
 * 
 * 使用适配器模式统一不同的数据源（Deck、Queue、Query）。
 * 这使得 CardBrowser 无需关心数据来源是 Riff 卡片还是队列。
 */
export interface ICardDataSource {
  /**
   * 数据源唯一标识
   * 
   * 用于标识数据源类型（如 'deck', 'query', 'queue'）。
   */
  readonly id: string;
  
  /**
   * 数据源显示标签
   * 
   * 用于 UI 显示（如 'All Cards', 'SQL Query', 'Retrieval Practice'）。
   */
  readonly label: string;
  
  /**
   * 获取数据行
   * 
   * 支持服务端排序/过滤（如果数据源允许）。
   * 
   * @param options - 获取选项（排序、过滤、分页等）
   * @returns 数据行结果（包含数据和总数）
   */
  // NOTE: production browser flow requires paging semantics via options.startRow/endRow.
  fetchRows(options: FetchRowsOptions): Promise<FetchRowsResult>;
  
  /**
   * 获取支持的操作
   * 
   * 返回当前数据源支持的所有操作。
   * 例如：QueueDataSource 可能有 "Remove from Queue"，
   * DeckDataSource 有 "Suspend"。
   * 
   * @returns 操作列表
   */
  getSupportedActions(): CardBrowserAction[];
  
  /**
   * 执行操作
   * 
   * 对选中的卡片执行指定操作。
   * 
   * @param actionId - 操作 ID
   * @param selectedRows - 选中的卡片
   * @param context - 上下文信息（可选）
   */
  performAction(actionId: string, selectedRows: BrowserCard[], context?: unknown): Promise<unknown>;
  
  /**
   * 获取统计信息（可选）
   * 
   * 返回状态栏显示的统计信息。
   * 
   * @returns 统计信息字符串
   */
  getStats?(): Promise<string>;
}
