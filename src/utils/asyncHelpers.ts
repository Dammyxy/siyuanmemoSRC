/**
 * 异步操作辅助工具
 * 
 * 提供常见的异步操作优化模式
 */

/**
 * 并行执行异步操作（带并发控制）
 * 
 * @param items 要处理的项列表
 * @param fn 处理函数
 * @param concurrency 最大并发数
 * @returns 处理结果数组
 * 
 * @example
 * ```typescript
 * const results = await parallelMap(
 *   cardIds,
 *   async (id) => await fetchCard(id),
 *   5 // 最多同时处理 5 个
 * );
 * ```
 */
export async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 10
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await fn(items[currentIndex], currentIndex);
    }
  }

  // 创建并发 worker
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * 并行过滤（异步版本）
 * 
 * @param items 要过滤的项列表
 * @param predicate 过滤函数
 * @param concurrency 最大并发数
 * @returns 过滤后的数组
 * 
 * @example
 * ```typescript
 * const conceptCards = await parallelFilter(
 *   blockIds,
 *   async (id) => await isConceptCard(id),
 *   10
 * );
 * ```
 */
export async function parallelFilter<T>(
  items: T[],
  predicate: (item: T, index: number) => Promise<boolean>,
  concurrency = 10
): Promise<T[]> {
  const results = await parallelMap(
    items,
    async (item, index) => ({
      item,
      keep: await predicate(item, index),
    }),
    concurrency
  );

  return results.filter(r => r.keep).map(r => r.item);
}

/**
 * 批量执行异步操作
 * 
 * @param items 要处理的项列表
 * @param fn 处理函数（接收一批项）
 * @param batchSize 批次大小
 * @returns 所有批次的合并结果
 * 
 * @example
 * ```typescript
 * const allCards = await batchProcess(
 *   cardIds,
 *   async (batch) => await fetchCardsByIds(batch),
 *   50
 * );
 * ```
 */
export async function batchProcess<T, R>(
  items: T[],
  fn: (batch: T[]) => Promise<R[]>,
  batchSize = 100
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await fn(batch);
    results.push(...batchResults);
  }

  return results;
}

/**
 * 重试异步操作
 * 
 * @param fn 要执行的函数
 * @param options 重试选项
 * @returns 函数执行结果
 * 
 * @example
 * ```typescript
 * const data = await retry(
 *   async () => await fetchData(),
 *   { maxAttempts: 3, delay: 1000 }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delay?: number;
    backoff?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 2,
    onRetry,
  } = options;

  let lastError: Error;
  let currentDelay = delay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxAttempts) {
        onRetry?.(lastError, attempt);
        await sleep(currentDelay);
        currentDelay *= backoff;
      }
    }
  }

  throw lastError!;
}

/**
 * 超时控制
 * 
 * @param promise 要执行的 Promise
 * @param timeoutMs 超时时间（毫秒）
 * @param timeoutError 超时错误信息
 * @returns Promise 结果
 * 
 * @example
 * ```typescript
 * const data = await timeout(
 *   fetchData(),
 *   5000,
 *   'Fetch timeout'
 * );
 * ```
 */
export async function timeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError = 'Operation timeout'
): Promise<T> {
  return Promise.race([
    promise,
    sleep(timeoutMs).then(() => {
      throw new Error(timeoutError);
    }),
  ]);
}

/**
 * 延迟执行
 * 
 * @param ms 延迟时间（毫秒）
 * @returns Promise
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 串行执行异步操作
 * 
 * @param items 要处理的项列表
 * @param fn 处理函数
 * @returns 处理结果数组
 * 
 * @example
 * ```typescript
 * const results = await sequential(
 *   operations,
 *   async (op) => await executeOperation(op)
 * );
 * ```
 */
export async function sequential<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i++) {
    results.push(await fn(items[i], i));
  }

  return results;
}

/**
 * 异步 reduce
 * 
 * @param items 要处理的项列表
 * @param fn reduce 函数
 * @param initialValue 初始值
 * @returns reduce 结果
 * 
 * @example
 * ```typescript
 * const total = await asyncReduce(
 *   cardIds,
 *   async (sum, id) => sum + (await getCardScore(id)),
 *   0
 * );
 * ```
 */
export async function asyncReduce<T, R>(
  items: T[],
  fn: (accumulator: R, item: T, index: number) => Promise<R>,
  initialValue: R
): Promise<R> {
  let accumulator = initialValue;

  for (let i = 0; i < items.length; i++) {
    accumulator = await fn(accumulator, items[i], i);
  }

  return accumulator;
}

/**
 * 分块处理（带进度回调）
 * 
 * @param items 要处理的项列表
 * @param fn 处理函数
 * @param options 选项
 * @returns 处理结果数组
 * 
 * @example
 * ```typescript
 * const results = await chunkProcess(
 *   largeArray,
 *   async (chunk) => await processChunk(chunk),
 *   {
 *     chunkSize: 100,
 *     onProgress: (current, total) => {
 *       console.log(`Progress: ${current}/${total}`);
 *     }
 *   }
 * );
 * ```
 */
export async function chunkProcess<T, R>(
  items: T[],
  fn: (chunk: T[], chunkIndex: number) => Promise<R[]>,
  options: {
    chunkSize?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<R[]> {
  const { chunkSize = 100, onProgress } = options;
  const results: R[] = [];
  const totalChunks = Math.ceil(items.length / chunkSize);

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkIndex = Math.floor(i / chunkSize);
    const chunkResults = await fn(chunk, chunkIndex);
    results.push(...chunkResults);

    onProgress?.(chunkIndex + 1, totalChunks);
  }

  return results;
}
