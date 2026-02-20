/**
 * RetrievalPracticeQueue - 检索练习队列领域对象
 * 
 * @module RetrievalPracticeQueue
 * @description
 * 检索练习队列的领域对象实现，负责管理检索练习队列的业务逻辑和状态。
 * 
 * **职责**：
 * - 管理队列的内存状态（手动添加的卡片列表）
 * - 实现队列的业务逻辑（添加、移除、复习等）
 * - 通过 QueuePersistenceService 持久化状态
 * - 不直接依赖 StorageManager（符合依赖倒置原则）
 * 
 * **设计原则**：
 * - 领域对象自治：自己管理状态和业务逻辑
 * - 依赖注入：通过构造函数接收基础设施服务
 * - 单一职责：只负责检索练习队列的业务逻辑
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.5, 4.6**
 */

import type { IReviewQueue, QueueObserver, QueueStats, QueueUIConfig, QueueType } from '../../types/unified-data-source';
import type { FSRSCard } from '../../types/card';
import type { QueueItem } from '../../core/queue/types';
import type { IQueuePersistenceService } from '../../infrastructure/services/QueuePersistenceService';

/**
 * 检索练习队列持久化数据结构
 */
interface RetrievalPracticeQueueData {
  /** 手动添加的卡片 ID 列表 */
  manuallyAddedCards: string[];
  /** 数据版本 */
  version: number;
}

/**
 * 检索练习队列领域对象
 * 
 * 动态队列，自动获取到期的项目卡片，支持手动添加卡片。
 * 
 * 队列行为：
 * - 自动包含所有到期的项目卡片（cardType === 'item' | 'concept' | 'descriptor'）
 * - 支持手动添加卡片（包括未到期卡片）
 * - 手动添加的卡片会被持久化
 * - 评分 3/4：更新到期日期，从队列移除
 * - 评分 1/2：保持今天到期，保留在队列中，自动添加到最终训练
 */
export class RetrievalPracticeQueue implements IReviewQueue {
  /** 队列名称 */
  public readonly name = 'RetrievalPracticeQueue';
  
  /** 队列类型 */
  public readonly type: QueueType = 'retrieval-practice' as QueueType;
  
  /** 持久化服务的键名 */
  private static readonly STORAGE_KEY = 'retrievalPracticeQueue';
  
  /** 数据版本 */
  private static readonly DATA_VERSION = 1;
  
  /** 手动添加的卡片 ID 集合 */
  private manuallyAddedCards: Set<string> = new Set();
  
  /** 临时黑名单（不持久化） */
  private temporaryBlacklist: Set<string> = new Set();
  
  /** 观察者列表 */
  private observers: QueueObserver[] = [];
  
  /** 自定义排序的卡片顺序 */
  private customOrder: string[] | null = null;
  
  /**
   * 构造函数
   * 
   * @param queuePersistence 队列持久化服务（依赖注入）
   */
  constructor(
    private readonly queuePersistence: IQueuePersistenceService
  ) {}
  
  /**
   * 从持久化服务加载状态
   * 
   * 加载手动添加的卡片列表。
   * 如果没有保存的数据，初始化为空集合。
   * 
   * @see 需求 4.2, 4.5
   */
  async load(): Promise<void> {
    try {
      const data = this.queuePersistence.get<RetrievalPracticeQueueData>(
        RetrievalPracticeQueue.STORAGE_KEY
      );
      
      if (data && data.manuallyAddedCards) {
        this.manuallyAddedCards = new Set(data.manuallyAddedCards);
        console.log(`[RetrievalPracticeQueue] Loaded ${this.manuallyAddedCards.size} manually added cards`);
      } else {
        this.manuallyAddedCards = new Set();
        console.log('[RetrievalPracticeQueue] No saved data found, starting with empty queue');
      }
    } catch (error) {
      console.error('[RetrievalPracticeQueue] Failed to load state:', error);
      this.manuallyAddedCards = new Set();
    }
  }
  
  /**
   * 保存状态到持久化服务
   * 
   * 保存手动添加的卡片列表。
   * 使用键名 "retrievalPracticeQueue"。
   * 
   * @see 需求 4.2, 4.5, 4.6
   */
  async save(): Promise<void> {
    try {
      const data: RetrievalPracticeQueueData = {
        manuallyAddedCards: Array.from(this.manuallyAddedCards),
        version: RetrievalPracticeQueue.DATA_VERSION
      };
      
      await this.queuePersistence.set(
        RetrievalPracticeQueue.STORAGE_KEY,
        data
      );
      
      console.log(`[RetrievalPracticeQueue] Saved ${this.manuallyAddedCards.size} manually added cards`);
    } catch (error) {
      console.error('[RetrievalPracticeQueue] Failed to save state:', error);
      throw error;
    }
  }
  
  /**
   * 获取队列类型
   */
  getType(): QueueType {
    return this.type;
  }
  
  /**
   * 获取队列中的所有卡片
   * 
   * TODO: 此方法需要访问 UnifiedStorageManager 来获取卡片数据
   * 当前实现返回空数组，需要在集成时完善
   */
  async getCards(): Promise<FSRSCard[]> {
    // TODO: 实现获取到期卡片的逻辑
    // 1. 获取所有到期的项目卡片（cardType === 'item' | 'concept' | 'descriptor'）
    // 2. 获取手动添加的卡片
    // 3. 合并并去重
    // 4. 过滤临时黑名单中的卡片
    // 5. 按到期日期和优先级排序
    // 6. 应用自定义排序（如果存在）
    console.warn('[RetrievalPracticeQueue] getCards() not fully implemented yet');
    return [];
  }
  
  /**
   * 获取队列中的所有卡片（包括过滤后的结果）
   */
  async getAllCards(): Promise<FSRSCard[]> {
    return this.getCards();
  }
  
  /**
   * 获取下一张卡片
   */
  async getNextCard(): Promise<FSRSCard | null> {
    const cards = await this.getCards();
    return cards.length > 0 ? cards[0] : null;
  }
  
  /**
   * 添加卡片到队列
   * 
   * 将卡片 ID 添加到手动添加的卡片集合中，并持久化。
   * 支持添加未到期的卡片，用于提前复习。
   * 
   * 如果卡片在临时黑名单中，会自动从黑名单中移除。
   * 
   * @param card 卡片对象、QueueItem 或卡片 ID
   * @param source 添加来源（'manual' 或 'auto-failed'）
   * @see 需求 4.1, 4.2, 4.5
   */
  async addCard(card: FSRSCard | QueueItem | string, source?: 'manual' | 'auto-failed'): Promise<void> {
    try {
      const cardId = this.resolveCardId(card);
      
      // 从临时黑名单中移除（如果存在）
      this.temporaryBlacklist.delete(cardId);
      
      // 添加到手动添加的卡片集合
      this.manuallyAddedCards.add(cardId);
      
      // 持久化
      await this.save();
      
      // 通知观察者
      this.notifyObservers();
      
      console.log(`[RetrievalPracticeQueue] Card ${cardId} added (source: ${source || 'manual'})`);
    } catch (error) {
      console.error('[RetrievalPracticeQueue] Failed to add card:', error);
      throw error;
    }
  }
  
  /**
   * 从队列中移除卡片
   * 
   * 移除逻辑：
   * 1. 从手动添加的卡片集合中移除（如果存在）
   * 2. 将卡片 ID 加入临时黑名单
   * 3. 持久化手动添加的卡片列表
   * 
   * 注意：临时黑名单不持久化，应用重启后自动清空。
   * 
   * @param cardIdOrBlockId 卡片 ID 或块 ID
   * @see 需求 4.1, 4.2
   */
  async removeCard(cardIdOrBlockId: string): Promise<void> {
    try {
      // 从手动添加的卡片集合中移除
      const wasManuallyAdded = this.manuallyAddedCards.has(cardIdOrBlockId);
      this.manuallyAddedCards.delete(cardIdOrBlockId);
      
      // 加入临时黑名单
      this.temporaryBlacklist.add(cardIdOrBlockId);
      
      // 持久化（如果有变化）
      if (wasManuallyAdded) {
        await this.save();
      }
      
      // 通知观察者
      this.notifyObservers();
      
      console.log(`[RetrievalPracticeQueue] Card ${cardIdOrBlockId} removed`);
    } catch (error) {
      console.error('[RetrievalPracticeQueue] Failed to remove card:', error);
      // 即使出错，也要尝试加入临时黑名单
      this.temporaryBlacklist.add(cardIdOrBlockId);
      throw error;
    }
  }
  
  /**
   * 更新卡片
   * 
   * TODO: 此方法需要访问 UnifiedStorageManager 来更新卡片数据
   */
  async updateCard(_card: FSRSCard): Promise<void> {
    console.warn('[RetrievalPracticeQueue] updateCard() not implemented yet');
  }
  
  /**
   * 处理卡片复习
   * 
   * TODO: 此方法需要访问 SchedulerRouter 来更新卡片调度数据
   * 
   * @param cardId 卡片 ID
   * @param rating 评分 (1-4)
   */
  async handleReview(_cardId: string, _rating: number): Promise<void> {
    console.warn('[RetrievalPracticeQueue] handleReview() not implemented yet');
  }
  
  /**
   * 跳过卡片
   * 
   * 将卡片移到队列末尾，不影响调度数据。
   * 
   * @param cardId 卡片 ID
   */
  async skip(cardId: string): Promise<void> {
    // 跳过操作不需要修改持久化状态
    // 只需要在内存中调整顺序
    console.log(`[RetrievalPracticeQueue] Card ${cardId} skipped`);
  }
  
  /**
   * 获取队列统计信息
   */
  async getStats(): Promise<QueueStats> {
    const cards = await this.getCards();
    return {
      total: cards.length,
      due: cards.length,
      new: 0,
      learning: 0,
      reviewed: 0
    };
  }
  
  /**
   * 获取队列 UI 配置
   */
  getUIConfig(): QueueUIConfig {
    return {
      displayName: '检索练习',
      buttons: [
        { type: 'rating', label: 'Again', value: 1 },
        { type: 'rating', label: 'Hard', value: 2 },
        { type: 'rating', label: 'Good', value: 3 },
        { type: 'rating', label: 'Easy', value: 4 }
      ],
      showSkipButton: true,
      showProgressBar: true
    };
  }
  
  /**
   * 判断是否为动态队列
   * 
   * 检索练习队列是动态队列，自动获取到期卡片。
   */
  isDynamic(): boolean {
    return true;
  }
  
  /**
   * 刷新队列
   */
  async refresh(): Promise<void> {
    // 刷新操作会重新获取卡片
    await this.getCards();
    this.notifyObservers();
  }
  
  /**
   * 清空队列
   * 
   * 清空手动添加的卡片列表和临时黑名单。
   */
  async clear(): Promise<void> {
    this.manuallyAddedCards.clear();
    this.temporaryBlacklist.clear();
    this.customOrder = null;
    await this.save();
    this.notifyObservers();
    console.log('[RetrievalPracticeQueue] Queue cleared');
  }
  
  /**
   * 获取队列大小
   */
  async getSize(): Promise<number> {
    const cards = await this.getCards();
    return cards.length;
  }
  
  /**
   * 判断队列是否为空
   */
  async isEmpty(): Promise<boolean> {
    const size = await this.getSize();
    return size === 0;
  }
  
  /**
   * 排序队列
   */
  async sort(_compareFn?: (a: FSRSCard, b: FSRSCard) => number): Promise<void> {
    // 排序操作不需要持久化
    console.log('[RetrievalPracticeQueue] Sort operation (in-memory only)');
  }
  
  /**
   * 过滤队列
   */
  async filter(predicate: (card: FSRSCard) => boolean): Promise<FSRSCard[]> {
    const cards = await this.getCards();
    return cards.filter(predicate);
  }
  
  /**
   * 订阅队列变更
   */
  subscribe(observer: QueueObserver): void {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
    }
  }
  
  /**
   * 取消订阅队列变更
   */
  unsubscribe(observer: QueueObserver): void {
    const index = this.observers.indexOf(observer);
    if (index !== -1) {
      this.observers.splice(index, 1);
    }
  }
  
  /**
   * 通知所有订阅者
   */
  notifyObservers(): void {
    for (const observer of this.observers) {
      observer.onQueueUpdate(this);
    }
  }
  
  /**
   * 重新排序队列
   * 
   * 动态队列支持临时排序覆盖，影响 getCards() 的返回顺序（不持久化）。
   * 
   * @param orderedCards 按新顺序排列的卡片数组
   */
  async reorder(orderedCards: FSRSCard[]): Promise<boolean> {
    try {
      this.customOrder = orderedCards.map(card => card.id);
      this.notifyObservers();
      console.log(`[RetrievalPracticeQueue] Custom order applied (${this.customOrder.length} cards)`);
      return true;
    } catch (error) {
      console.error('[RetrievalPracticeQueue] Failed to reorder:', error);
      return false;
    }
  }
  
  /**
   * 清除自定义排序
   * 
   * 恢复到默认排序（按到期日期和优先级）。
   */
  clearCustomOrder(): void {
    this.customOrder = null;
    this.notifyObservers();
    console.log('[RetrievalPracticeQueue] Custom order cleared');
  }
  
  // ========================================================================
  // 私有辅助方法
  // ========================================================================
  
  /**
   * 解析卡片 ID
   * 
   * 从不同类型的输入中提取卡片 ID。
   * 
   * @param card 卡片对象、QueueItem 或卡片 ID
   * @returns 卡片 ID
   */
  private resolveCardId(card: FSRSCard | QueueItem | string): string {
    if (typeof card === 'string') {
      return card;
    }
    if ('id' in card && card.id) {
      return card.id;
    }
    if ('cardID' in card && card.cardID) {
      return String(card.cardID);
    }
    throw new Error('Invalid card input: cannot resolve card ID');
  }
}
