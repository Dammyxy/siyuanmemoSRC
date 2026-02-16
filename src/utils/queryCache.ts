/**
 * 查询结果缓存工具
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * 简单的 TTL 缓存
 */
export class QueryCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private ttl: number;
  private maxSize: number;

  constructor(ttl = 5000, maxSize = 100) {
    this.ttl = ttl;
    this.maxSize = maxSize;
  }

  /**
   * 获取缓存数据
   */
  get(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    // 检查是否过期
    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * 设置缓存数据
   */
  set(key: string, data: T): void {
    // 限制缓存大小
    if (this.cache.size >= this.maxSize) {
      // 删除最旧的项
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * 删除缓存
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 清理过期缓存
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * LRU 缓存实现
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  /**
   * 获取缓存值
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // 移到最后（最近使用）
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  /**
   * 设置缓存值
   */
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      // 如果已存在，先删除
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 删除最久未使用的项（第一个）
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  /**
   * 删除缓存
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 检查是否存在
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }
}

/**
 * 带缓存的异步函数包装器
 */
export function withCache<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: {
    ttl?: number;
    maxSize?: number;
    keyGenerator?: (...args: Parameters<T>) => string;
  } = {}
): T {
  const {
    ttl = 5000,
    maxSize = 100,
    keyGenerator = (...args) => JSON.stringify(args),
  } = options;

  const cache = new QueryCache<Awaited<ReturnType<T>>>(ttl, maxSize);

  return (async (...args: Parameters<T>) => {
    const key = keyGenerator(...args);

    // 尝试从缓存获取
    const cached = cache.get(key);
    if (cached !== null) {
      return cached;
    }

    // 执行函数并缓存结果
    const result = await fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}
