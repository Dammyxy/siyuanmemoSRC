/**
 * Feature: architecture-optimization
 * Task 8.6: 批量操作性能测试
 * 
 * 测试批量查询相比顺序查询的性能提升
 * 
 * 验证: 需求 2.5
 */

import { describe, expect, it } from 'vitest'
import { batchQueryWithConcurrency } from '../batchQuery'

/**
 * 测量函数执行时间（毫秒）
 */
async function measureTime(fn: () => Promise<any>): Promise<number> {
  const start = performance.now()
  await fn()
  return performance.now() - start
}

/**
 * 生成指定数量的测试 ID
 */
function generateIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `block-id-${i}`)
}

/**
 * 模拟数据库查询函数
 * 每个查询有固定的延迟，模拟真实的数据库查询
 */
async function simulateDbQuery(ids: string[]): Promise<Array<{ id: string; data: string }>> {
  // 模拟数据库查询延迟（每个 ID 约 0.5ms）
  await new Promise(resolve => setTimeout(resolve, ids.length * 0.5))
  return ids.map(id => ({ id, data: `data-for-${id}` }))
}

/**
 * 顺序查询：一个一个查询
 */
async function sequentialQuery(ids: string[]): Promise<Array<{ id: string; data: string }>> {
  const results: Array<{ id: string; data: string }> = []
  for (const id of ids) {
    const result = await simulateDbQuery([id])
    results.push(...result)
  }
  return results
}

describe('批量操作性能测试', () => {
  it('批量查询应该比顺序查询快至少 30% (600 个 ID)', async () => {
    // Given: 600 个 blockID
    const blockIds = generateIds(600)
    
    // When: 使用顺序查询
    const sequentialTime = await measureTime(async () => {
      await sequentialQuery(blockIds)
    })
    
    console.log(`顺序查询耗时: ${sequentialTime.toFixed(2)}ms`)
    
    // And: 使用批量查询（批量大小 200，最大并发 3）
    const batchTime = await measureTime(async () => {
      await batchQueryWithConcurrency(
        blockIds,
        { batchSize: 200, maxConcurrency: 3 },
        simulateDbQuery,
      )
    })
    
    console.log(`批量查询耗时: ${batchTime.toFixed(2)}ms`)
    
    // Then: 批量查询应该更快
    const improvement = (sequentialTime - batchTime) / sequentialTime
    const improvementPercent = (improvement * 100).toFixed(1)
    
    console.log(`性能提升: ${improvementPercent}%`)
    
    // 验证性能提升至少 30%
    expect(improvement).toBeGreaterThanOrEqual(0.3)
    expect(batchTime).toBeLessThan(sequentialTime)
  }, 60000) // 60秒超时

  it('批量查询应该返回与顺序查询相同的结果', async () => {
    // Given: 600 个 blockID
    const blockIds = generateIds(600)
    
    // When: 顺序查询
    const sequentialResults = await sequentialQuery(blockIds)
    
    // And: 批量查询
    const batchResults = await batchQueryWithConcurrency(
      blockIds,
      { batchSize: 200, maxConcurrency: 3 },
      simulateDbQuery,
    )
    
    // Then: 结果应该相同（忽略顺序）
    const sortedSequential = [...sequentialResults].sort((a, b) => a.id.localeCompare(b.id))
    const sortedBatch = [...batchResults].sort((a, b) => a.id.localeCompare(b.id))
    
    expect(sortedBatch).toEqual(sortedSequential)
    expect(batchResults.length).toBe(600)
  }, 60000)

  it('批量查询在不同批量大小下的性能表现', async () => {
    // Given: 600 个 blockID
    const blockIds = generateIds(600)
    
    // When: 测试不同的批量大小
    const configs = [
      { batchSize: 100, maxConcurrency: 3, name: '100/3' },
      { batchSize: 200, maxConcurrency: 3, name: '200/3' },
      { batchSize: 300, maxConcurrency: 3, name: '300/3' },
    ]
    
    const results: Array<{ config: string; time: number }> = []
    
    for (const config of configs) {
      const time = await measureTime(async () => {
        await batchQueryWithConcurrency(
          blockIds,
          { batchSize: config.batchSize, maxConcurrency: config.maxConcurrency },
          simulateDbQuery,
        )
      })
      
      results.push({ config: config.name, time })
      console.log(`配置 ${config.name}: ${time.toFixed(2)}ms`)
    }
    
    // Then: 所有批量查询配置都应该完成
    expect(results.length).toBe(3)
    results.forEach(result => {
      expect(result.time).toBeGreaterThan(0)
      expect(result.time).toBeLessThan(10000) // 应该在 10 秒内完成
    })
  }, 60000)

  it('批量查询在不同并发数下的性能表现', async () => {
    // Given: 600 个 blockID
    const blockIds = generateIds(600)
    
    // When: 测试不同的并发数
    const configs = [
      { batchSize: 200, maxConcurrency: 1, name: '200/1' },
      { batchSize: 200, maxConcurrency: 2, name: '200/2' },
      { batchSize: 200, maxConcurrency: 3, name: '200/3' },
      { batchSize: 200, maxConcurrency: 5, name: '200/5' },
    ]
    
    const results: Array<{ config: string; time: number }> = []
    
    for (const config of configs) {
      const time = await measureTime(async () => {
        await batchQueryWithConcurrency(
          blockIds,
          { batchSize: config.batchSize, maxConcurrency: config.maxConcurrency },
          simulateDbQuery,
        )
      })
      
      results.push({ config: config.name, time })
      console.log(`配置 ${config.name}: ${time.toFixed(2)}ms`)
    }
    
    // Then: 更高的并发数应该带来更好的性能
    expect(results.length).toBe(4)
    
    // 并发数为 1 的应该最慢
    const concurrency1 = results.find(r => r.config === '200/1')!
    const concurrency3 = results.find(r => r.config === '200/3')!
    
    expect(concurrency3.time).toBeLessThan(concurrency1.time)
  }, 60000)

  it('批量查询应该正确处理大量数据', async () => {
    // Given: 1000 个 blockID（测试更大的数据集）
    const blockIds = generateIds(1000)
    
    // When: 批量查询
    const results = await batchQueryWithConcurrency(
      blockIds,
      { batchSize: 200, maxConcurrency: 3 },
      simulateDbQuery,
    )
    
    // Then: 应该返回所有结果
    expect(results.length).toBe(1000)
    
    // And: 每个 ID 都应该有对应的结果
    const resultIds = new Set(results.map(r => r.id))
    expect(resultIds.size).toBe(1000)
    
    blockIds.forEach(id => {
      expect(resultIds.has(id)).toBe(true)
    })
  }, 60000)
})
