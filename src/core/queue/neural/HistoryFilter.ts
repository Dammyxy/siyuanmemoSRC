/**
 * HistoryFilter - 历史过滤器
 * 
 * 管理访问历史，防止短期内重复访问相同节点。
 * 使用 Set 提供 O(1) 查找性能，使用数组维护插入顺序支持 FIFO 淘汰。
 * 
 * Requirements: 2.6, 2.7, 2.8
 */
export class HistoryFilter {
  /** 历史记录集合，提供 O(1) 查找 */
  private history: Set<string>;
  
  /** 容量上限 */
  private readonly capacity: number;
  
  /** 插入顺序数组，用于 FIFO 淘汰 */
  private insertionOrder: string[];

  /**
   * 构造函数
   * @param capacity 历史容量上限，默认 50
   */
  constructor(capacity: number = 50) {
    if (capacity < 1) {
      throw new Error(`Invalid capacity: ${capacity}. Capacity must be at least 1.`);
    }
    this.capacity = capacity;
    this.history = new Set<string>();
    this.insertionOrder = [];
  }

  /**
   * 添加卡片 ID 到历史记录
   * 如果达到容量上限，自动淘汰最早的记录
   * 
   * @param cardId 卡片 ID
   */
  add(cardId: string): void {
    if (!cardId) {
      return;
    }

    // 如果已存在，先移除（更新位置）
    if (this.history.has(cardId)) {
      const index = this.insertionOrder.indexOf(cardId);
      if (index !== -1) {
        this.insertionOrder.splice(index, 1);
      }
    }

    // 添加到历史记录
    this.history.add(cardId);
    this.insertionOrder.push(cardId);

    // 检查容量，超出则淘汰最早的
    if (this.history.size > this.capacity) {
      this.evictOldest();
    }
  }

  /**
   * 检查卡片 ID 是否在历史记录中
   * 
   * @param cardId 卡片 ID
   * @returns 是否存在
   */
  has(cardId: string): boolean {
    return this.history.has(cardId);
  }

  /**
   * 过滤候选列表，排除历史记录中的卡片
   * 
   * @param items 候选列表
   * @returns 过滤后的列表
   */
  filter<T extends { id: string }>(items: T[]): T[] {
    return items.filter(item => !this.history.has(item.id));
  }

  /**
   * 清空历史记录
   */
  clear(): void {
    this.history.clear();
    this.insertionOrder = [];
  }

  /**
   * 获取当前历史记录大小
   * 
   * @returns 历史记录数量
   */
  size(): number {
    return this.history.size;
  }

  /**
   * 获取容量上限
   * 
   * @returns 容量上限
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * 淘汰最早加入的记录（FIFO）
   * 
   * @private
   */
  private evictOldest(): void {
    if (this.insertionOrder.length === 0) {
      return;
    }

    // 移除最早的记录
    const oldest = this.insertionOrder.shift();
    if (oldest) {
      this.history.delete(oldest);
    }
  }

  /**
   * 获取历史记录快照（用于调试和持久化）
   * 
   * @returns 历史记录数组
   */
  snapshot(): string[] {
    return [...this.insertionOrder];
  }

  /**
   * 从快照恢复历史记录
   * 
   * @param snapshot 历史记录数组
   */
  restore(snapshot: string[]): void {
    this.clear();
    
    // 只恢复最近的 capacity 条记录
    const toRestore = snapshot.slice(-this.capacity);
    
    for (const cardId of toRestore) {
      if (cardId) {
        this.history.add(cardId);
        this.insertionOrder.push(cardId);
      }
    }
  }
}
