/**
 * Performance Optimization Helpers
 * 性能优化工具函数
 * 
 * 提供防抖、节流、LRU 缓存等性能优化工具。
 * 
 * @see .kiro/specs/performance/performance-optimization-plan.md
 */

/**
 * 防抖函数
 * 
 * 在事件被触发 n 秒后再执行回调，如果在这 n 秒内又被触发，则重新计时。
 * 
 * @param fn - 要防抖的函数
 * @param delay - 延迟时间（毫秒）
 * @returns 防抖后的函数
 * 
 * @example
 * ```typescript
 * const debouncedSearch = debounce((query: string) => {
 *   console.log('Searching:', query);
 * }, 300);
 * 
 * debouncedSearch('hello');  // 不会立即执行
 * debouncedSearch('world');  // 取消上次，重新计时
 * // 300ms 后执行，输出 "Searching: world"
 * ```
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return function(this: any, ...args: Parameters<T>) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 节流函数
 * 
 * 规定在一个单位时间内，只能触发一次函数。如果这个单位时间内触发多次函数，只有一次生效。
 * 
 * @param fn - 要节流的函数
 * @param delay - 延迟时间（毫秒）
 * @returns 节流后的函数
 * 
 * @example
 * ```typescript
 * const throttledScroll = throttle(() => {
 *   console.log('Scrolling...');
 * }, 1000);
 * 
 * window.addEventListener('scroll', throttledScroll);
 * // 每秒最多执行一次
 * ```
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  
  return function(this: any, ...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn.apply(this, args);
    }
  };
}

/**
 * LRU (Least Recently Used) 缓存
 * 
 * 当缓存满时，删除最久未使用的项。
 * 
 * @example
 * ```typescript
 * const cache = new LRUCache<string, User>(100);
 * 
 * cache.set('user1', { id: '1', name: 'Alice' });
 * const user = cache.get('user1');  // { id: '1', name: 'Alice' }
 * 
 * cache.clear();  // 清空缓存
 * ```
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  
  /**
   * 构造函数
   * 
   * @param maxSize - 最大缓存数量
   */
  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }
  
  /**
   * 获取缓存值
   * 
   * @param key - 缓存键
   * @returns 缓存值，如果不存在则返回 undefined
   */
  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    
    // 移到最后（最近使用）
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    
    return value;
  }
  
  /**
   * 设置缓存值
   * 
   * @param key - 缓存键
   * @param value - 缓存值
   */
  set(key: K, value: V): void {
    // 删除旧值
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // 添加新值
    this.cache.set(key, value);
    
    // 检查大小
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
  
  /**
   * 检查缓存是否存在
   * 
   * @param key - 缓存键
   * @returns 是否存在
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }
  
  /**
   * 删除缓存
   * 
   * @param key - 缓存键
   * @returns 是否删除成功
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
   * 
   * @returns 缓存数量
   */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * 带过期时间的缓存
 * 
 * @example
 * ```typescript
 * const cache = new TTLCache<string, User>(5000);  // 5秒过期
 * 
 * cache.set('user1', { id: '1', name: 'Alice' });
 * const user = cache.get('user1');  // { id: '1', name: 'Alice' }
 * 
 * // 5秒后
 * const expired = cache.get('user1');  // undefined
 * ```
 */
export class TTLCache<K, V> {
  private cache = new Map<K, { value: V; timestamp: number }>();
  private ttl: number;
  
  /**
   * 构造函数
   * 
   * @param ttl - 过期时间（毫秒）
   */
  constructor(ttl: number) {
    this.ttl = ttl;
  }
  
  /**
   * 获取缓存值
   * 
   * @param key - 缓存键
   * @returns 缓存值，如果不存在或已过期则返回 undefined
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.value;
  }
  
  /**
   * 设置缓存值
   * 
   * @param key - 缓存键
   * @param value - 缓存值
   */
  set(key: K, value: V): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }
  
  /**
   * 检查缓存是否存在且未过期
   * 
   * @param key - 缓存键
   * @returns 是否存在且未过期
   */
  has(key: K): boolean {
    return this.get(key) !== undefined;
  }
  
  /**
   * 删除缓存
   * 
   * @param key - 缓存键
   * @returns 是否删除成功
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
   * 清理过期缓存
   * 
   * @returns 清理的数量
   */
  cleanup(): number {
    const now = Date.now();
    let count = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        count++;
      }
    }
    
    return count;
  }
  
  /**
   * 获取缓存大小
   * 
   * @returns 缓存数量
   */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * 请求去重
 * 
 * 防止同一个请求在短时间内重复发送。
 * 
 * @example
 * ```typescript
 * const deduplicator = new RequestDeduplicator<string, User>();
 * 
 * // 同时发起多个相同请求
 * const [user1, user2, user3] = await Promise.all([
 *   deduplicator.execute('user1', () => fetchUser('user1')),
 *   deduplicator.execute('user1', () => fetchUser('user1')),
 *   deduplicator.execute('user1', () => fetchUser('user1')),
 * ]);
 * 
 * // 只会发送一次请求，三个结果相同
 * ```
 */
export class RequestDeduplicator<K, V> {
  private pending = new Map<K, Promise<V>>();
  
  /**
   * 执行请求
   * 
   * 如果相同的请求正在进行中，则返回正在进行的请求。
   * 
   * @param key - 请求键
   * @param fn - 请求函数
   * @returns 请求结果
   */
  async execute(key: K, fn: () => Promise<V>): Promise<V> {
    // 检查是否有正在进行的请求
    if (this.pending.has(key)) {
      return this.pending.get(key)!;
    }
    
    // 创建新请求
    const promise = fn().finally(() => {
      this.pending.delete(key);
    });
    
    this.pending.set(key, promise);
    
    return promise;
  }
  
  /**
   * 取消请求
   * 
   * @param key - 请求键
   */
  cancel(key: K): void {
    this.pending.delete(key);
  }
  
  /**
   * 清空所有请求
   */
  clear(): void {
    this.pending.clear();
  }
}

/**
 * 批量操作
 * 
 * 将多个操作合并为一次批量操作，减少请求次数。
 * 
 * @example
 * ```typescript
 * const batcher = new Batcher<string, User>(
 *   async (ids) => {
 *     // 批量获取用户
 *     return fetchUsers(ids);
 *   },
 *   { delay: 100, maxSize: 50 }
 * );
 * 
 * // 多个请求会被合并
 * const user1 = await batcher.add('user1');
 * const user2 = await batcher.add('user2');
 * const user3 = await batcher.add('user3');
 * // 100ms 后一次性获取 user1, user2, user3
 * ```
 */
export class Batcher<K, V> {
  private queue: Array<{ key: K; resolve: (value: V) => void; reject: (error: any) => void }> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private delay: number;
  private maxSize: number;
  private batchFn: (keys: K[]) => Promise<V[]>;
  
  /**
   * 构造函数
   * 
   * @param batchFn - 批量操作函数
   * @param options - 选项
   */
  constructor(
    batchFn: (keys: K[]) => Promise<V[]>,
    options: { delay?: number; maxSize?: number } = {}
  ) {
    this.batchFn = batchFn;
    this.delay = options.delay ?? 100;
    this.maxSize = options.maxSize ?? 50;
  }
  
  /**
   * 添加操作
   * 
   * @param key - 操作键
   * @returns 操作结果
   */
  add(key: K): Promise<V> {
    return new Promise((resolve, reject) => {
      this.queue.push({ key, resolve, reject });
      
      // 检查是否达到最大批量大小
      if (this.queue.length >= this.maxSize) {
        this.flush();
      } else {
        // 设置定时器
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.flush(), this.delay);
      }
    });
  }
  
  /**
   * 立即执行批量操作
   */
  private async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    if (this.queue.length === 0) return;
    
    const batch = this.queue.splice(0, this.queue.length);
    const keys = batch.map(item => item.key);
    
    try {
      const results = await this.batchFn(keys);
      
      for (let i = 0; i < batch.length; i++) {
        batch[i].resolve(results[i]);
      }
    } catch (error) {
      for (const item of batch) {
        item.reject(error);
      }
    }
  }
}

/**
 * 延迟执行
 * 
 * 使用 requestIdleCallback 或 setTimeout 延迟执行非关键任务。
 * 
 * @param fn - 要执行的函数
 * @param options - 选项
 * @returns Promise
 * 
 * @example
 * ```typescript
 * // 在浏览器空闲时执行
 * await runWhenIdle(() => {
 *   console.log('Running in idle time');
 * });
 * ```
 */
export function runWhenIdle(
  fn: () => void,
  options: { timeout?: number } = {}
): Promise<void> {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(
        () => {
          fn();
          resolve();
        },
        { timeout: options.timeout }
      );
    } else {
      setTimeout(() => {
        fn();
        resolve();
      }, 0);
    }
  });
}

/**
 * 分批处理
 * 
 * 将大数组分批处理，避免阻塞主线程。
 * 
 * @param items - 要处理的数组
 * @param batchSize - 每批大小
 * @param processFn - 处理函数
 * @param options - 选项
 * @returns Promise
 * 
 * @example
 * ```typescript
 * const items = Array.from({ length: 10000 }, (_, i) => i);
 * 
 * await processBatch(
 *   items,
 *   100,
 *   (batch) => {
 *     // 处理每批数据
 *     console.log('Processing batch:', batch.length);
 *   },
 *   { delay: 10 }
 * );
 * ```
 */
export async function processBatch<T>(
  items: T[],
  batchSize: number,
  processFn: (batch: T[]) => void | Promise<void>,
  options: { delay?: number; useIdleCallback?: boolean } = {}
): Promise<void> {
  const delay = options.delay ?? 0;
  const useIdleCallback = options.useIdleCallback ?? false;
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    await processFn(batch);
    
    // 让出主线程
    if (useIdleCallback) {
      await runWhenIdle(() => {});
    } else if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
