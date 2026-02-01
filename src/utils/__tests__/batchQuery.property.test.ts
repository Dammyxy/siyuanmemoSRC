/**
 * Feature: architecture-optimization
 * Property 4: 批量操作结果正确性
 * 
 * 对于任意输入项列表和批量查询函数，使用批量并发处理得到的结果集
 * 应该与顺序处理得到的结果集完全相同（忽略顺序）。
 * 
 * 验证: 需求 2.4
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { batchQueryWithConcurrency } from '../batchQuery'

describe('Property 4: 批量操作结果正确性', () => {
  it('批量并发处理结果应与顺序处理结果相同', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成任意数量的输入项（1-100个）
        fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 1, maxLength: 100 }),
        // 生成批量大小（10-50）
        fc.integer({ min: 10, max: 50 }),
        // 生成最大并发数（1-5）
        fc.integer({ min: 1, max: 5 }),
        async (items, batchSize, maxConcurrency) => {
          // Given: 一个简单的查询函数（将每个数字乘以2）
          const queryFn = async (batch: number[]): Promise<number[]> => {
            // 模拟异步操作
            await new Promise(resolve => setTimeout(resolve, 1))
            return batch.map(x => x * 2)
          }

          // When: 使用批量并发处理
          const batchResults = await batchQueryWithConcurrency(
            items,
            { batchSize, maxConcurrency },
            queryFn,
          )

          // And: 使用顺序处理
          const sequentialResults: number[] = []
          for (const item of items) {
            const result = await queryFn([item])
            sequentialResults.push(...result)
          }

          // Then: 结果应该相同（忽略顺序）
          const sortedBatch = [...batchResults].sort((a, b) => a - b)
          const sortedSequential = [...sequentialResults].sort((a, b) => a - b)
          
          return JSON.stringify(sortedBatch) === JSON.stringify(sortedSequential)
        },
      ),
      { numRuns: 20 }, // 减少迭代次数以避免超时
    )
  }, 30000) // 增加超时到30秒

  it('批量处理应保持所有项的完整性', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成任意字符串数组
        fc.array(fc.string(), { minLength: 1, maxLength: 50 }),
        fc.integer({ min: 5, max: 20 }),
        fc.integer({ min: 1, max: 3 }),
        async (items, batchSize, maxConcurrency) => {
          // Given: 一个查询函数（返回字符串长度）
          const queryFn = async (batch: string[]): Promise<{ str: string; len: number }[]> => {
            await new Promise(resolve => setTimeout(resolve, 1))
            return batch.map(str => ({ str, len: str.length }))
          }

          // When: 批量处理
          const results = await batchQueryWithConcurrency(
            items,
            { batchSize, maxConcurrency },
            queryFn,
          )

          // Then: 应该处理所有项
          if (results.length !== items.length) return false

          // And: 每个结果应该对应一个输入项
          const resultStrings = results.map(r => r.str).sort()
          const inputStrings = [...items].sort()
          if (JSON.stringify(resultStrings) !== JSON.stringify(inputStrings)) return false

          // And: 长度计算应该正确
          return results.every(({ str, len }) => len === str.length)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('批量处理应处理空输入', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 5 }),
        async (batchSize, maxConcurrency) => {
          // Given: 空输入数组
          const items: number[] = []
          const queryFn = async (batch: number[]): Promise<number[]> => {
            return batch.map(x => x * 2)
          }

          // When: 批量处理
          const results = await batchQueryWithConcurrency(
            items,
            { batchSize, maxConcurrency },
            queryFn,
          )

          // Then: 应该返回空数组
          return results.length === 0
        },
      ),
      { numRuns: 50 },
    )
  })

  it('批量处理应正确处理单个批次', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成小于批量大小的数组
        fc.array(fc.integer(), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 20, max: 50 }),
        fc.integer({ min: 1, max: 5 }),
        async (items, batchSize, maxConcurrency) => {
          // Given: 项数少于批量大小
          const queryFn = async (batch: number[]): Promise<number[]> => {
            await new Promise(resolve => setTimeout(resolve, 1))
            return batch.map(x => x + 1)
          }

          // When: 批量处理
          const results = await batchQueryWithConcurrency(
            items,
            { batchSize, maxConcurrency },
            queryFn,
          )

          // Then: 应该正确处理所有项
          if (results.length !== items.length) return false
          return results.every((result, index) => result === items[index] + 1)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('批量处理应正确处理多个完整批次', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }), // 批次数量
        fc.integer({ min: 10, max: 20 }), // 批量大小
        fc.integer({ min: 1, max: 3 }), // 最大并发
        async (batchCount, batchSize, maxConcurrency) => {
          // Given: 恰好填满多个批次的项
          const items = Array.from({ length: batchCount * batchSize }, (_, i) => i)
          const queryFn = async (batch: number[]): Promise<number[]> => {
            await new Promise(resolve => setTimeout(resolve, 1))
            return batch.map(x => x * 3)
          }

          // When: 批量处理
          const results = await batchQueryWithConcurrency(
            items,
            { batchSize, maxConcurrency },
            queryFn,
          )

          // Then: 应该处理所有项
          if (results.length !== items.length) return false
          
          // And: 结果应该正确
          const sortedResults = [...results].sort((a, b) => a - b)
          const expectedResults = items.map(x => x * 3).sort((a, b) => a - b)
          return JSON.stringify(sortedResults) === JSON.stringify(expectedResults)
        },
      ),
      { numRuns: 50 },
    )
  })
})
