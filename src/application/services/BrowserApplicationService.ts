/**
 * BrowserApplicationService - 浏览器应用服务
 * 
 * 职责：
 * - 提供浏览器相关操作的统一入口
 * - 协调查询处理器和用例执行
 * - 作为表现层和应用层之间的桥梁
 * 
 * 设计原则：
 * - 应用服务模式：协调用例执行
 * - 依赖注入：通过构造函数注入依赖
 * - 薄包装：不包含业务逻辑，仅委托给查询处理器和用例
 * - 统一接口：为表现层提供一致的 API
 * 
 * @see .kiro/specs/ddd-refactoring/browser-ddd-migration.md - Phase 2
 */

import type { StorageManager } from '@/core/storage/manager';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import { GetBrowserCardsQueryHandler } from '../queries/browser/GetBrowserCardsQueryHandler';
import type {
  GetBrowserCardsQuery,
  GetBrowserCardsQueryResult,
} from '../queries/browser/GetBrowserCardsQuery';

/**
 * BrowserApplicationService 类
 * 
 * 浏览器相关操作的主要入口点。
 * 
 * 使用示例：
 * ```typescript
 * const browserService = new BrowserApplicationService(
 *   storageManager,
 *   cardScheduleService,
 *   cardFilterService,
 *   cardSortService
 * );
 * 
 * // 获取浏览器卡片
 * const result = await browserService.getBrowserCards({
 *   searchText: 'DDD',
 *   preset: 'due',
 *   sortBy: 'due',
 *   sortOrder: 'asc',
 * });
 * ```
 */
export class BrowserApplicationService {
  private readonly getBrowserCardsQueryHandler: GetBrowserCardsQueryHandler;
  private readonly unifiedDataSourceManager: any;  // UnifiedDataSourceManager
  
  /**
   * 构造函数
   * 
   * @param storageManager - 存储管理器
   * @param cardScheduleService - 卡片调度服务
   * @param cardFilterService - 卡片过滤服务
   * @param cardSortService - 卡片排序服务
   * @param unifiedDataSourceManager - 统一数据源管理器（用于队列模式）
   */
  constructor(
    storageManager: StorageManager,
    cardScheduleService: CardScheduleService,
    cardFilterService: CardFilterService,
    cardSortService: CardSortService,
    unifiedDataSourceManager?: any
  ) {
    // 初始化查询处理器
    this.getBrowserCardsQueryHandler = new GetBrowserCardsQueryHandler(
      storageManager,
      cardScheduleService,
      cardFilterService,
      cardSortService
    );
    
    this.unifiedDataSourceManager = unifiedDataSourceManager;
  }
  
  /**
   * 获取统一数据源管理器
   * 
   * 用于队列模式的数据源工厂。
   * 
   * @returns UnifiedDataSourceManager 实例
   */
  getUnifiedDataSourceManager(): any {
    return this.unifiedDataSourceManager;
  }
  
  /**
   * 获取浏览器卡片列表
   * 
   * @param query - 查询对象
   * @returns 查询结果，包含卡片列表、分页信息和统计信息
   * 
   * @example
   * ```typescript
   * // 获取所有卡片
   * const result = await browserService.getBrowserCards({});
   * 
   * // 获取到期卡片
   * const dueCards = await browserService.getBrowserCards({
   *   preset: 'due',
   * });
   * 
   * // 搜索卡片
   * const searchResults = await browserService.getBrowserCards({
   *   searchText: 'DDD',
   *   sortBy: 'due',
   *   sortOrder: 'asc',
   * });
   * 
   * // 分页查询
   * const page2 = await browserService.getBrowserCards({
   *   page: 2,
   *   pageSize: 50,
   * });
   * ```
   */
  async getBrowserCards(query: GetBrowserCardsQuery = {}): Promise<GetBrowserCardsQueryResult> {
    return this.getBrowserCardsQueryHandler.execute(query);
  }
  
  /**
   * 获取到期卡片数量
   * 
   * @returns 到期卡片数量
   * 
   * @example
   * ```typescript
   * const count = await browserService.getDueCount();
   * console.log(`到期卡片数量：${count}`);
   * ```
   */
  async getDueCount(): Promise<number> {
    const result = await this.getBrowserCards({ preset: 'due', pageSize: 1 });
    return result.total;
  }
  
  /**
   * 获取统计信息
   * 
   * @returns 统计信息
   * 
   * @example
   * ```typescript
   * const stats = await browserService.getStats();
   * console.log(`总卡片数：${stats.totalCards}`);
   * console.log(`到期卡片数：${stats.dueCards}`);
   * ```
   */
  async getStats() {
    const result = await this.getBrowserCards({ pageSize: 1 });
    return result.stats;
  }
  
  // ========================================================================
  // TODO: Phase 4 - 添加命令方法
  // ========================================================================
  
  // /**
  //  * 更新卡片优先级
  //  */
  // async updateCardPriority(command: UpdateCardPriorityCommand): Promise<Result<void>> {
  //   return this.updateCardPriorityUseCase.execute(command);
  // }
  
  // /**
  //  * 批量暂停/恢复卡片
  //  */
  // async suspendCards(command: SuspendCardsCommand): Promise<Result<void>> {
  //   return this.suspendCardsUseCase.execute(command);
  // }
  
  // /**
  //  * 批量删除卡片
  //  */
  // async deleteCards(command: DeleteCardsCommand): Promise<Result<void>> {
  //   return this.deleteCardsUseCase.execute(command);
  // }
}
