/**
 * InMemoryDeletionTracker - 内存删除跟踪器（基础设施实现）
 * 
 * 使用内存 Set 跟踪最近删除的块，自动过期（5秒）。
 * 
 * **实现特点**：
 * - 轻量级：使用 Set 存储，O(1) 查询
 * - 自动过期：5秒后自动清除
 * - 线程安全：JavaScript 单线程，无需加锁
 * - 不持久化：重启后自动清空
 * 
 * **使用场景**：
 * 防止批量删除后，删除操作触发的 updateAttrs 事务被 RiffSync 检测到，
 * 导致重新创建已删除的 Xiuyuan（孤儿卡片问题）。
 * 
 * **DDD 架构**：
 * - 实现领域服务接口 IDeletionTracker
 * - 位于基础设施层
 * - 通过依赖注入提供给应用层
 */

import { IDeletionTracker } from '../domain/services/IDeletionTracker';

export class InMemoryDeletionTracker implements IDeletionTracker {
  private deletedBlocks = new Set<string>();
  private readonly EXPIRATION_TIME = 5000; // 5秒

  /**
   * 标记块为已删除
   * 
   * 在删除卡片后调用，防止同步时重新创建。
   * 标记会在 5 秒后自动过期。
   * 
   * @param blockId - 块 ID
   */
  markAsDeleted(blockId: string): void {
    this.deletedBlocks.add(blockId);
    
    // 自动过期
    setTimeout(() => {
      this.deletedBlocks.delete(blockId);
    }, this.EXPIRATION_TIME);
  }

  /**
   * 批量标记块为已删除
   * 
   * 性能优化：批量删除时一次性标记多个块。
   * 
   * @param blockIds - 块 ID 列表
   */
  markManyAsDeleted(blockIds: string[]): void {
    for (const blockId of blockIds) {
      this.markAsDeleted(blockId);
    }
  }

  /**
   * 检查块是否最近被删除
   * 
   * 在同步前调用，如果返回 true 则跳过该块。
   * 
   * @param blockId - 块 ID
   * @returns 是否最近被删除
   */
  isRecentlyDeleted(blockId: string): boolean {
    return this.deletedBlocks.has(blockId);
  }

  /**
   * 清除所有跟踪记录
   * 
   * 用于测试或重置状态。
   */
  clear(): void {
    this.deletedBlocks.clear();
  }
}
