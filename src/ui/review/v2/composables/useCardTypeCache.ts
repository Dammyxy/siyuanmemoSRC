/**
 * 卡片类型缓存 Composable
 * 缓存卡片类型检测结果，避免重复检测
 */

import { createLogger } from '@/utils/logger';

interface CardTypeResult {
  isConcept: boolean;
  isDescriptor: boolean;
  isQuick: boolean;
}

interface CardTypeCacheOptions {
  maxSize?: number;
  debugMode?: boolean;
}

interface CardTypeCacheStats {
  hits: number;
  misses: number;
  size: number;
}

export function useCardTypeCache(options: CardTypeCacheOptions = {}) {
  const { maxSize = 50, debugMode = false } = options;
  const logger = createLogger('useCardTypeCache');
  
  const cache = new Map<string, CardTypeResult>();
  let stats: CardTypeCacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
  };

  /**
   * 获取缓存的卡片类型
   */
  function getCardType(blockId: string): CardTypeResult | null {
    const result = cache.get(blockId);
    
    if (result) {
      stats.hits++;
      if (debugMode) {
        logger.debug('[useCardTypeCache] Cache hit', blockId, result);
      }
      return result;
    }
    
    stats.misses++;
    if (debugMode) {
      logger.debug('[useCardTypeCache] Cache miss', blockId);
    }
    return null;
  }

  /**
   * 设置卡片类型缓存
   */
  function setCardType(blockId: string, result: CardTypeResult): void {
    // 如果缓存已满，删除最早的条目
    if (cache.size >= maxSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey) {
        cache.delete(firstKey);
      }
    }

    cache.set(blockId, result);
    stats.size = cache.size;

    if (debugMode) {
      logger.debug('[useCardTypeCache] Cache set', blockId, result);
    }
  }

  /**
   * 清空缓存
   */
  function clearCache(): void {
    cache.clear();
    stats.size = 0;
    if (debugMode) {
      logger.debug('[useCardTypeCache] Cache cleared');
    }
  }

  /**
   * 获取缓存统计信息
   */
  function getCacheStats(): CardTypeCacheStats {
    return { ...stats };
  }

  return {
    getCardType,
    setCardType,
    clearCache,
    getCacheStats,
  };
}
