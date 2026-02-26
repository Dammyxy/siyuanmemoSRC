/**
 * 调度器路由接口
 * 
 * 定义调度器路由的标准契约，用于依赖注入。
 * 
 * @remarks
 * 这个接口抽象了调度器的路由逻辑，使得：
 * 1. 应用层不依赖具体的调度器实现
 * 2. 可以轻松扩展新的调度器类型
 * 3. 便于单元测试（可以使用 Mock 实现）
 * 
 * @example
 * ```typescript
 * // 在队列策略中使用
 * class UnifiedQueueStrategy {
 *   constructor(private schedulerRouter: ISchedulerRouter) {}
 *   
 *   getScheduler(type: string) {
 *     return this.schedulerRouter.getScheduler(type);
 *   }
 * }
 * ```
 */
export interface ISchedulerRouter {
  /**
   * 获取指定类型的调度器
   * 
   * @param type - 调度器类型（如 'fsrs', 'sm2' 等）
   * @returns 调度器实例，如果不存在则返回 undefined
   */
  getScheduler(type: string): unknown;
  
  /**
   * 获取所有调度器
   * 
   * @returns 调度器类型到实例的映射
   */
  getAllSchedulers(): Map<string, unknown>;
  
  /**
   * 注册新的调度器
   * 
   * @param type - 调度器类型
   * @param scheduler - 调度器实例
   */
  registerScheduler?(type: string, scheduler: unknown): void;
  
  /**
   * 检查调度器是否存在
   * 
   * @param type - 调度器类型
   * @returns 是否存在
   */
  hasScheduler?(type: string): boolean;
}
