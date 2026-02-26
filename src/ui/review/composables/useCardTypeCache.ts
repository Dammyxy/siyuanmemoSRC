/**
 * useCardTypeCache - 卡片类型检测缓存
 * 
 * 缓存卡片类型检测结果，避免重复检测。
 * 
 * 职责：
 * - 缓存快速卡片检测结果
 * - 缓存描述符卡检测结果
 * - 缓存概念定义卡检测结果
 * - 自动清理过期缓存
 * 
 * 性能优化：
 * - 使用 LRU 缓存限制内存占用
 * - 避免重复的异步检测操作
 * - 提供缓存统计信息
 * 
 * @see .kiro/specs/performance/performance-optimization-plan.md - Phase 3
 */

import { ref, onUnmounted } from 'vue';
import { LRUCache } from '@/utils/performance-helpers';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useCardTypeCache');

/**
 * 卡片类型检测结果
 */
export interface CardTypeDetectionResult {
  isQuick: boolean;
  isDescriptor: boolean;
  isConcept: boolean;
}

/**
 * 卡片类型缓存 Composable
 * 
 * @param options - 配置选项
 * @returns 缓存管理方法
 * 
 * @example
 * ```typescript
 * const { getCardType, setCardType, clearCache } = useCardTypeCache();
 * 
 * // 检查缓存
 * const cached = getCardType('block-123');
 * if (cached) {
 *   logger.info('From cache:', cached);
 * } else {
 *   // 执行检测
 *   const result = await detectCardType('block-123');
 *   setCardType('block-123', result);
 * }
 * ```
 */
export function useCardTypeCache(options?: {
  maxSize?: number;
  debugMode?: boolean;
}) {
  const maxSize = options?.maxSize ?? 50;
  const debugMode = options?.debugMode ?? false;
  
  // 创建 LRU 缓存
  const cache = ref(new LRUCache<string, CardTypeDetectionResult>(maxSize));
  
  /**
   * 获取卡片类型（从缓存）
   * 
   * @param blockId - 块 ID
   * @returns 卡片类型检测结果，如果不存在则返回 undefined
   */
  function getCardType(blockId: string): CardTypeDetectionResult | undefined {
    const result = cache.value.get(blockId);
    
    if (debugMode && result) {
      logger.info('[useCardTypeCache] Cache hit:', blockId, result);
    }
    
    return result;
  }
  
  /**
   * 设置卡片类型（到缓存）
   * 
   * @param blockId - 块 ID
   * @param result - 卡片类型检测结果
   */
  function setCardType(blockId: string, result: CardTypeDetectionResult): void {
    cache.value.set(blockId, result);
    
    if (debugMode) {
      logger.info('[useCardTypeCache] Cache set:', blockId, result);
    }
  }
  
  /**
   * 检查缓存是否存在
   * 
   * @param blockId - 块 ID
   * @returns 是否存在
   */
  function hasCardType(blockId: string): boolean {
    return cache.value.has(blockId);
  }
  
  /**
   * 删除缓存
   * 
   * @param blockId - 块 ID
   */
  function deleteCardType(blockId: string): void {
    cache.value.delete(blockId);
    
    if (debugMode) {
      logger.info('[useCardTypeCache] Cache deleted:', blockId);
    }
  }
  
  /**
   * 清空所有缓存
   */
  function clearCache(): void {
    cache.value.clear();
    
    if (debugMode) {
      logger.info('[useCardTypeCache] Cache cleared');
    }
  }
  
  /**
   * 获取缓存统计
   * 
   * @returns 缓存统计信息
   */
  function getCacheStats() {
    return {
      size: cache.value.size,
      maxSize,
    };
  }
  
  // 组件卸载时清空缓存
  onUnmounted(() => {
    clearCache();
  });
  
  return {
    getCardType,
    setCardType,
    hasCardType,
    deleteCardType,
    clearCache,
    getCacheStats,
  };
}
