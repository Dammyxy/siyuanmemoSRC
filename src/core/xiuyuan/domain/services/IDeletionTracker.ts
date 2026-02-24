/**
 * 删除跟踪器接口（领域服务）
 * 
 * 用于跟踪最近删除的块，防止在同步过程中重新创建（孤儿卡片问题）。
 * 
 * **领域概念**：
 * - 删除操作会触发块属性更新事务
 * - 同步服务可能误认为这些块是新块
 * - 需要在短时间内（5秒）记住哪些块刚被删除
 * 
 * **DDD 原则**：
 * - 领域服务：跨聚合根的业务逻辑
 * - 接口隔离：定义在领域层，实现在基础设施层
 * - 无状态：接口本身不维护状态，由实现类决定
 * 
 * **使用场景**：
 * 1. DeleteCardsUseCase：删除卡片后标记块为已删除
 * 2. XiuyuanSyncService：同步前检查块是否最近被删除
 */
export interface IDeletionTracker {
  /**
   * 标记块为已删除
   * 
   * 在删除卡片后调用，防止同步时重新创建。
   * 标记会在一定时间后自动过期（通常 5 秒）。
   * 
   * @param blockId - 块 ID
   */
  markAsDeleted(blockId: string): void;

  /**
   * 批量标记块为已删除
   * 
   * 性能优化：批量删除时一次性标记多个块。
   * 
   * @param blockIds - 块 ID 列表
   */
  markManyAsDeleted(blockIds: string[]): void;

  /**
   * 检查块是否最近被删除
   * 
   * 在同步前调用，如果返回 true 则跳过该块。
   * 
   * @param blockId - 块 ID
   * @returns 是否最近被删除
   */
  isRecentlyDeleted(blockId: string): boolean;

  /**
   * 清除所有跟踪记录
   * 
   * 用于测试或重置状态。
   */
  clear(): void;
}
