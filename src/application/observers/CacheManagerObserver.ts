/**
 * CacheManagerObserver - 缓存管理观察者
 * 
 * 监听队列变更，智能失效缓存。
 * 
 * 职责：
 * - 监听队列变更事件
 * - 根据操作类型智能失效缓存
 * - 管理 nextDues 计算缓存
 * - 管理卡片类型检测缓存
 * 
 * 设计原则：
 * - 观察者模式：实现 QueueObserver 接口
 * - 精细化失效：根据操作类型决定失效范围
 * - 性能优先：使用 LRU 缓存限制内存占用
 * 
 * @see .kiro/specs/performance/observer-integration.md
 * @see .kiro/specs/performance/dynamic-queue-protection.md
 */

import type { QueueObserver, IReviewQueue } from '@/types/unified-data-source';
import { LRUCache } from '@/utils/performance-helpers';

/**
 * 卡片类型
 */
export type CardType = 'topic' | 'item' | 'quick' | 'descriptor' | 'concept' | 'unknown';

/**
 * 队列操作类型
 */
export interface QueueOperation {
  type: 'card-added' | 'card-updated' | 'card-removed' | 'queue-cleared' | 'queue-rebuilt' | 'unknown';
  cardId?: string;
  cardIds?: string[];
}

interface QueueWithLastOperation extends IReviewQueue {
  lastOperation?: unknown;
}

function isQueueOperation(value: unknown): value is QueueOperation {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const operation = value as Record<string, unknown>;
  const validType = operation.type === 'card-added'
    || operation.type === 'card-updated'
    || operation.type === 'card-removed'
    || operation.type === 'queue-cleared'
    || operation.type === 'queue-rebuilt'
    || operation.type === 'unknown';

  if (!validType) {
    return false;
  }

  if (operation.cardId !== undefined && typeof operation.cardId !== 'string') {
    return false;
  }

  if (operation.cardIds !== undefined) {
    if (!Array.isArray(operation.cardIds) || operation.cardIds.some(id => typeof id !== 'string')) {
      return false;
    }
  }

  return true;
}

function extractLastOperation(queue: IReviewQueue): QueueOperation | null {
  const candidate = (queue as QueueWithLastOperation).lastOperation;
  return isQueueOperation(candidate) ? candidate : null;
}

/**
 * CacheManagerObserver 类
 * 
 * 实现队列观察者接口，管理缓存失效。
 * 
 * @example
 * ```typescript
 * const cacheManager = new CacheManagerObserver();
 * queue.subscribe(cacheManager);
 * 
 * // 队列变更时自动失效缓存
 * await queue.remove('card-1');  // 自动触发缓存失效
 * 
 * // 使用缓存
 * const cache = cacheManager.getNextDuesCache();
 * const nextDues = cache.get('card-1-key');
 * ```
 */
export class CacheManagerObserver implements QueueObserver {
  /**
   * nextDues 计算结果缓存
   * 
   * key: `${cardId}-${state}-${due}-${reps}`
   * value: nextDues 对象
   */
  private nextDuesCache: LRUCache<string, Record<number, string>>;
  
  /**
   * 卡片类型检测结果缓存
   * 
   * key: cardId
   * value: CardType
   */
  private cardTypeCache: LRUCache<string, CardType>;
  
  /**
   * 格式化数据缓存
   * 
   * key: cardId
   * value: 格式化后的数据
   */
  private formattedDataCache: LRUCache<string, unknown>;
  
  /**
   * 最后一次队列操作
   */
  private lastOperation: QueueOperation | null = null;
  
  /**
   * 是否启用调试日志
   */
  private debugMode: boolean = false;
  
  /**
   * 构造函数
   * 
   * @param options - 配置选项
   */
  constructor(options?: {
    nextDuesCacheSize?: number;
    cardTypeCacheSize?: number;
    formattedDataCacheSize?: number;
    debugMode?: boolean;
  }) {
    this.nextDuesCache = new LRUCache(options?.nextDuesCacheSize ?? 100);
    this.cardTypeCache = new LRUCache(options?.cardTypeCacheSize ?? 50);
    this.formattedDataCache = new LRUCache(options?.formattedDataCacheSize ?? 50);
    this.debugMode = options?.debugMode ?? false;
  }
  
  /**
   * 队列更新时调用
   * 
   * 根据更新类型决定缓存失效策略。
   * 
   * @param queue - 更新的队列
   */
  onQueueUpdate(queue: IReviewQueue): void {
    // 获取队列的最后一次操作类型
    const lastOperation = extractLastOperation(queue);
    
    if (lastOperation === null) {
      // 未知操作，保守策略：全量失效
      if (this.debugMode) {
        console.log('[CacheManagerObserver] Unknown operation, invalidating all cache');
      }
      this.invalidateAll();
      return;
    }
    
    // 记录操作
    this.lastOperation = lastOperation;
    
    if (this.debugMode) {
      console.log('[CacheManagerObserver] Queue operation:', lastOperation);
    }
    
    // 根据操作类型决定失效策略
    switch (lastOperation.type) {
      case 'card-removed':
        // 卡片被删除：失效该卡片的缓存
        if (lastOperation.cardId) {
          this.invalidateCard(lastOperation.cardId);
        } else if (lastOperation.cardIds) {
          this.invalidateCards(lastOperation.cardIds);
        }
        break;
        
      case 'queue-cleared':
      case 'queue-rebuilt':
        // 队列被清空或重建：全量失效
        this.invalidateAll();
        break;
        
      case 'card-updated':
        // 卡片被更新：失效该卡片的缓存
        if (lastOperation.cardId) {
          this.invalidateCard(lastOperation.cardId);
        } else if (lastOperation.cardIds) {
          this.invalidateCards(lastOperation.cardIds);
        }
        break;
        
      case 'card-added':
        // 新增卡片：不影响现有缓存
        if (this.debugMode) {
          console.log('[CacheManagerObserver] Card added, no cache invalidation needed');
        }
        break;
        
      default:
        // 未知操作，保守策略：全量失效
        if (this.debugMode) {
          console.warn('[CacheManagerObserver] Unknown operation type:', lastOperation.type);
        }
        this.invalidateAll();
    }
  }
  
  /**
   * 失效特定卡片的缓存
   * 
   * @param cardId - 卡片 ID
   */
  private invalidateCard(cardId: string): void {
    if (this.debugMode) {
      console.log('[CacheManagerObserver] Invalidating cache for card:', cardId);
    }
    
    // 删除该卡片的所有 nextDues 缓存
    // 因为缓存键包含卡片状态，所以需要遍历所有键
    const keysToDelete: string[] = [];
    for (const key of this.nextDuesCache.keys()) {
      if (key.startsWith(cardId + '-')) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.nextDuesCache.delete(key);
    }
    
    // 删除卡片类型缓存
    this.cardTypeCache.delete(cardId);
    
    // 删除格式化数据缓存
    this.formattedDataCache.delete(cardId);
    
    if (this.debugMode) {
      console.log('[CacheManagerObserver] Invalidated', keysToDelete.length, 'cache entries');
    }
  }
  
  /**
   * 失效多张卡片的缓存
   * 
   * @param cardIds - 卡片 ID 数组
   */
  private invalidateCards(cardIds: string[]): void {
    if (this.debugMode) {
      console.log('[CacheManagerObserver] Invalidating cache for cards:', cardIds.length);
    }
    
    for (const cardId of cardIds) {
      this.invalidateCard(cardId);
    }
  }
  
  /**
   * 全量失效缓存
   */
  private invalidateAll(): void {
    if (this.debugMode) {
      console.log('[CacheManagerObserver] Invalidating all cache');
    }
    
    this.nextDuesCache.clear();
    this.cardTypeCache.clear();
    this.formattedDataCache.clear();
  }
  
  /**
   * 获取 nextDues 缓存
   * 
   * @returns nextDues 缓存实例
   */
  getNextDuesCache(): LRUCache<string, Record<number, string>> {
    return this.nextDuesCache;
  }
  
  /**
   * 获取卡片类型缓存
   * 
   * @returns 卡片类型缓存实例
   */
  getCardTypeCache(): LRUCache<string, CardType> {
    return this.cardTypeCache;
  }
  
  /**
   * 获取格式化数据缓存
   * 
   * @returns 格式化数据缓存实例
   */
  getFormattedDataCache(): LRUCache<string, unknown> {
    return this.formattedDataCache;
  }
  
  /**
   * 获取最后一次操作
   * 
   * @returns 最后一次操作
   */
  getLastOperation(): QueueOperation | null {
    return this.lastOperation;
  }
  
  /**
   * 获取缓存统计信息
   * 
   * @returns 缓存统计
   */
  getStats() {
    return {
      nextDuesCache: {
        size: this.nextDuesCache.size,
        maxSize: this.nextDuesCache.capacity,
      },
      cardTypeCache: {
        size: this.cardTypeCache.size,
        maxSize: this.cardTypeCache.capacity,
      },
      formattedDataCache: {
        size: this.formattedDataCache.size,
        maxSize: this.formattedDataCache.capacity,
      },
    };
  }
  
  /**
   * 启用或禁用调试模式
   * 
   * @param enabled - 是否启用
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }
  
  /**
   * 清空所有缓存
   */
  clear(): void {
    this.invalidateAll();
    this.lastOperation = null;
  }
}
