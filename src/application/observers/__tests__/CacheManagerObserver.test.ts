/**
 * CacheManagerObserver 测试
 * 
 * 验证缓存管理观察者的功能和性能。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CacheManagerObserver } from '../CacheManagerObserver';
import type { IReviewQueue, QueueObserver } from '@/types/unified-data-source';

// Mock 队列
class MockQueue implements Partial<IReviewQueue> {
  private observers: QueueObserver[] = [];
  public lastOperation: any = null;
  
  subscribe(observer: QueueObserver): void {
    this.observers.push(observer);
  }
  
  unsubscribe(observer: QueueObserver): void {
    this.observers = this.observers.filter(o => o !== observer);
  }
  
  notifyObservers(): void {
    for (const observer of this.observers) {
      observer.onQueueUpdate(this as any);
    }
  }
  
  simulateCardRemoved(cardId: string): void {
    this.lastOperation = { type: 'card-removed', cardId };
    this.notifyObservers();
  }
  
  simulateCardUpdated(cardId: string): void {
    this.lastOperation = { type: 'card-updated', cardId };
    this.notifyObservers();
  }
  
  simulateQueueCleared(): void {
    this.lastOperation = { type: 'queue-cleared' };
    this.notifyObservers();
  }
}

describe('CacheManagerObserver', () => {
  let cacheManager: CacheManagerObserver;
  let mockQueue: MockQueue;
  
  beforeEach(() => {
    cacheManager = new CacheManagerObserver({
      nextDuesCacheSize: 10,
      cardTypeCacheSize: 5,
      debugMode: false,
    });
    mockQueue = new MockQueue();
    mockQueue.subscribe(cacheManager);
  });
  
  describe('缓存失效策略', () => {
    it('should invalidate cache on card removal', () => {
      // 添加缓存
      const cache = cacheManager.getNextDuesCache();
      cache.set('card-1-key', { 1: '1d', 2: '3d', 3: '7d', 4: '14d' });
      
      expect(cache.has('card-1-key')).toBe(true);
      
      // 删除卡片
      mockQueue.simulateCardRemoved('card-1');
      
      // 缓存应该被清除
      expect(cache.has('card-1-key')).toBe(false);
    });
    
    it('should not invalidate unrelated cache', () => {
      // 添加缓存
      const cache = cacheManager.getNextDuesCache();
      cache.set('card-1-key', { 1: '1d', 2: '3d', 3: '7d', 4: '14d' });
      cache.set('card-2-key', { 1: '1d', 2: '3d', 3: '7d', 4: '14d' });
      
      // 删除 card-1
      mockQueue.simulateCardRemoved('card-1');
      
      // card-2 的缓存应该保留
      expect(cache.has('card-2-key')).toBe(true);
    });
    
    it('should invalidate all cache on queue cleared', () => {
      // 添加缓存
      const nextDuesCache = cacheManager.getNextDuesCache();
      const cardTypeCache = cacheManager.getCardTypeCache();
      
      nextDuesCache.set('card-1-key', { 1: '1d', 2: '3d', 3: '7d', 4: '14d' });
      cardTypeCache.set('card-1', 'item');
      
      expect(nextDuesCache.size).toBe(1);
      expect(cardTypeCache.size).toBe(1);
      
      // 清空队列
      mockQueue.simulateQueueCleared();
      
      // 所有缓存应该被清除
      expect(nextDuesCache.size).toBe(0);
      expect(cardTypeCache.size).toBe(0);
    });
    
    it('should invalidate cache on card update', () => {
      // 添加缓存
      const cache = cacheManager.getNextDuesCache();
      cache.set('card-1-key', { 1: '1d', 2: '3d', 3: '7d', 4: '14d' });
      
      expect(cache.has('card-1-key')).toBe(true);
      
      // 更新卡片
      mockQueue.simulateCardUpdated('card-1');
      
      // 缓存应该被清除
      expect(cache.has('card-1-key')).toBe(false);
    });
  });
  
  describe('缓存管理', () => {
    it('should provide cache statistics', () => {
      const cache = cacheManager.getNextDuesCache();
      cache.set('card-1-key', { 1: '1d', 2: '3d', 3: '7d', 4: '14d' });
      cache.set('card-2-key', { 1: '1d', 2: '3d', 3: '7d', 4: '14d' });
      
      const stats = cacheManager.getStats();
      
      expect(stats.nextDuesCache.size).toBe(2);
      expect(stats.nextDuesCache.maxSize).toBe(10);
    });
    
    it('should clear all caches', () => {
      const nextDuesCache = cacheManager.getNextDuesCache();
      const cardTypeCache = cacheManager.getCardTypeCache();
      
      nextDuesCache.set('card-1-key', { 1: '1d', 2: '3d', 3: '7d', 4: '14d' });
      cardTypeCache.set('card-1', 'item');
      
      cacheManager.clear();
      
      expect(nextDuesCache.size).toBe(0);
      expect(cardTypeCache.size).toBe(0);
      expect(cacheManager.getLastOperation()).toBeNull();
    });
  });
  
  describe('观察者模式', () => {
    it('should subscribe to queue', () => {
      const newCacheManager = new CacheManagerObserver();
      const newQueue = new MockQueue();
      
      newQueue.subscribe(newCacheManager);
      
      // 添加缓存
      const cache = newCacheManager.getNextDuesCache();
      cache.set('card-1-key', { 1: '1d', 2: '3d', 3: '7d', 4: '14d' });
      
      // 触发队列变更
      newQueue.simulateCardRemoved('card-1');
      
      // 缓存应该被清除
      expect(cache.has('card-1-key')).toBe(false);
    });
    
    it('should unsubscribe from queue', () => {
      const newCacheManager = new CacheManagerObserver();
      const newQueue = new MockQueue();
      
      newQueue.subscribe(newCacheManager);
      newQueue.unsubscribe(newCacheManager);
      
      // 添加缓存
      const cache = newCacheManager.getNextDuesCache();
      cache.set('card-1-key', { 1: '1d', 2: '3d', 3: '7d', 4: '14d' });
      
      // 触发队列变更
      newQueue.simulateCardRemoved('card-1');
      
      // 缓存不应该被清除（因为已经取消订阅）
      expect(cache.has('card-1-key')).toBe(true);
    });
  });
});
