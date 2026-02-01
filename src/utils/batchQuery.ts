/**
 * 批量查询配置
 */
export interface BatchQueryConfig {
  /** 每批的大小 */
  batchSize: number
  /** 最大并发数 */
  maxConcurrency: number
}

/**
 * 批量查询函数类型
 */
export type BatchQueryFn<TInput, TOutput> = (batch: TInput[]) => Promise<TOutput[]>

import pLimit from 'p-limit'

/**
 * 批量查询函数，支持并发控制
 * 
 * @param items - 要处理的项列表
 * @param config - 批量查询配置
 * @param queryFn - 查询函数，接收一批项并返回结果
 * @returns 所有批次的合并结果
 * 
 * @example
 * ```typescript
 * const cards = await batchQueryWithConcurrency(
 *   blockIds,
 *   { batchSize: 200, maxConcurrency: 3 },
 *   async (batch) => {
 *     const idsStr = batch.map(id => `'${id}'`).join(',')
 *     return await sql(`SELECT * FROM cards WHERE block_id IN (${idsStr})`)
 *   }
 * )
 * ```
 */
export async function batchQueryWithConcurrency<TInput, TOutput>(
  items: TInput[],
  config: BatchQueryConfig,
  queryFn: BatchQueryFn<TInput, TOutput>,
): Promise<TOutput[]> {
  const { batchSize, maxConcurrency } = config

  // 分批
  const batches: TInput[][] = []
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize))
  }

  // 并发控制
  const limit = pLimit(maxConcurrency)
  const promises = batches.map(batch =>
    limit(() => queryFn(batch)),
  )

  // 等待所有批次完成
  const results = await Promise.all(promises)

  // 合并结果
  return results.flat()
}
