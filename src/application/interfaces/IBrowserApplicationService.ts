/**
 * IBrowserApplicationService - 浏览器应用服务接口
 * 
 * 定义浏览器应用服务的标准契约。
 * 这是 DDD 架构中的依赖倒置原则（DIP）的体现。
 * 
 * 职责：
 * - 定义浏览器相关操作的标准方法
 * - 为不同的实现提供统一接口
 * - 隐藏内部实现细节
 * 
 * 实现类：
 * - BrowserApplicationService - 浏览器应用服务实现
 * 
 * @see .kiro/specs/ddd-refactoring/COMPREHENSIVE-DDD-REFACTORING-PLAN.md - 阶段 1
 */

// ✅ 统一接口：使用应用层的 ICardDataSource 接口
import type { ICardDataSource } from './ICardDataSource';
import type {
  GetBrowserCardsQuery,
  GetBrowserCardsQueryResult,
} from '../queries/browser/GetBrowserCardsQuery';
import type { BrowserCard } from '@/types/browser';
import type {
  BrowserDeckPageRequest,
  BrowserDeckPageResult,
  BrowserDeckSnapshotQuery,
  BrowserDeckSnapshotResult,
} from '../queries/browser/browser-deck-query';
import type {
  QueueBrowserSnapshotQuery,
  QueueBrowserSnapshotResult,
} from '../queries/browser/queue-browser-query';
import type {
  BrowserCardTypeFilter,
  CardFilter,
  IReviewQueue,
  IUnifiedDataSourceManagerFacade,
  QueueType,
} from '@/types/unified-data-source';
import type { BrowserSiyuanPort } from '../ports/BrowserSiyuanPort';

export type BrowserQueueId =
  | 'retrieval'
  | 'final-drill'
  | 'incremental-learning'
  | 'filter-group'
  | 'neural-roam'
  | 'neural';

export interface BrowserQueueCountsRequest {
  forceRefresh?: boolean;
  affectedQueueTypes?: QueueType[] | null;
}

/**
 * 数据源创建选项
 */
export interface DataSourceOptions {
  /** 数据源类型 */
  type: 'deck' | 'queue' | 'query';
  /** 预设（如 'due', 'all'） */
  preset?: string;
  /** 查询文本 */
  queryText?: string;
  /** 卡片类型 */
  cardType?: BrowserCardTypeFilter;
  /** 队列 ID */
  queueId?: string;
  /** 插件实例 */
  plugin?: unknown;
}

export interface BrowserDataSourceFactoryContext {
  browserService: IBrowserApplicationService;
  manager: IUnifiedDataSourceManagerFacade | null;
  siyuanApi: BrowserSiyuanPort;
}

export type BrowserDataSourceFactory = (
  options: DataSourceOptions,
  context: BrowserDataSourceFactoryContext,
) => ICardDataSource | null | undefined;

/**
 * 浏览器应用服务接口
 * 
 * 所有浏览器应用服务实现都必须实现此接口。
 * UI 层只依赖此接口，不依赖具体实现。
 */
export interface IBrowserApplicationService {
  /**
   * 获取浏览器卡片列表
   * 
   * @param query - 查询对象
   * @returns 查询结果，包含卡片列表、分页信息和统计信息
   */
  getBrowserCards(query?: GetBrowserCardsQuery): Promise<GetBrowserCardsQueryResult>;

  getDeckQuerySnapshot(query: BrowserDeckSnapshotQuery): Promise<BrowserDeckSnapshotResult>;

  getDeckPage(query: BrowserDeckSnapshotQuery, page: BrowserDeckPageRequest): Promise<BrowserDeckPageResult>;

  getDeckMatchedIds(query: BrowserDeckSnapshotQuery): Promise<string[]>;

  getDeckRowsByIds(ids: string[]): Promise<BrowserCard[]>;

  getQueueQuerySnapshot(query: QueueBrowserSnapshotQuery): Promise<QueueBrowserSnapshotResult>;

  getQueueRowsByIds(queueId: BrowserQueueId, ids: string[]): Promise<BrowserCard[]>;
  
  /**
   * 获取到期卡片数量
   * 
   * @returns 到期卡片数量
   */
  getDueCount(): Promise<number>;
  
  /**
   * 获取统计信息
   * 
   * @returns 统计信息
   */
  getStats(): Promise<unknown>;

  /**
   * Resolve queue instance by browser queue id.
   */
  getQueueById(queueId: string): IReviewQueue | null;

  /**
   * Get queue counts used by hierarchy panel.
   */
  getQueueCounts(request?: BrowserQueueCountsRequest): Promise<Record<string, number>>;

  /**
   * Drop any cached queue counts so the next read reflects the latest queue state.
   */
  invalidateQueueCountsCache(): void;

  /**
   * Set filter on FilterGroup queue.
   */
  setFilterGroupFilter(filter: CardFilter): Promise<boolean>;

  /**
   * Rebuild FilterGroup queue.
   */
  rebuildFilterGroupQueue(): Promise<boolean>;
  
  /**
   * 创建数据源
   * 
   * 工厂方法，用于创建不同类型的数据源。
   * 这是 DDD 架构中推荐的方式，避免 UI 层直接 new 对象。
   * 
   * @param options - 数据源选项
   * @returns 数据源实例
   */
  createDataSource(options: DataSourceOptions): ICardDataSource;
  
  /**
   * 获取统一数据源管理器
   * 
   * 用于队列模式的数据源工厂。
   * 
   * @returns UnifiedDataSourceManager 实例
   */
  getUnifiedDataSourceManager(): IUnifiedDataSourceManagerFacade | null;

  /**
   * 浏览器上下文使用的思源 API 端口。
   */
  getSiyuanApi(): BrowserSiyuanPort;
}
