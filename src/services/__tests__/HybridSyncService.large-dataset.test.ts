/**
 * HybridSyncService 大数据量性能测试
 * 
 * 测试 HybridSyncService 在大数据量场景下的性能表现
 * 
 * 测试场景：
 * 1. 10000+ 张卡片的增量同步
 * 2. 10000+ 张卡片的全量同步
 * 3. 大量黑名单（5000+ 条）的过滤性能
 * 4. 大量本地卡片（20000+ 张）的检查性能
 * 5. 内存使用和 GC 压力测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HybridSyncService, type HybridSyncConfig } from '../HybridSyncService';
import type { StorageManager } from '@/core/storage/manager';
import type { FSRSCard } from '@/types';
import * as riffApi from '@/core/siyuan/riff';
import * as cardBuilder from '@/core/card-builder';
import * as siyuanApi from '@/core/siyuan/api';

// Mock Riff API
vi.mock('@/core/siyuan/riff', () => ({
    getRiffCards: vi.fn(),
    getRiffNewCards: vi.fn(),
    removeRiffCards: vi.fn(),
}));

// Mock card-builder
vi.mock('@/core/card-builder', () => ({
    batchDetectCardType: vi.fn(),
    initializeAFactor: vi.fn(() => 2.5),
}));

// Mock siyuan API
vi.mock('@/core/siyuan/api', () => ({
    setBlockAttrs: vi.fn(),
}));

/**
 * Helper: 生成测试用的 Riff 卡片
 */
function generateRiffCards(count: number, startIndex: number = 0): any[] {
    const cards: any[] = [];
    const now = new Date();
    
    for (let i = 0; i < count; i++) {
        const id = `card-${startIndex + i}`;
        cards.push({
            id,
            riffCard: {
                id,
                blockID: id,
                deckID: 'test-deck',
                due: new Date(now.getTime() + i * 1000).toISOString(),
                reps: 0,
                lapses: 0,
                state: 0,
                lastReview: '',
                stability: 0,
                difficulty: 0,
                elapsedDays: 0,
                scheduledDays: 0,
                priority: 50,
            },
        });
    }
    
    return cards;
}

/**
 * Helper: 生成测试用的 FSRSCard
 */
function generateFSRSCards(count: number, startIndex: number = 0): FSRSCard[] {
    const cards: FSRSCard[] = [];
    const now = Date.now();
    
    for (let i = 0; i < count; i++) {
        const id = `card-${startIndex + i}`;
        cards.push({
            id: id as any,
            blockId: id as any,
            due: now + i * 1000,
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: 0,
            lastReview: now - 86400000,
            deckID: 'test-deck',
        });
    }
    
    return cards;
}

/**
 * Helper: 创建 mock storage
 */
function createMockStorage(existingCards: FSRSCard[] = [], blacklist: Set<string> = new Set()): StorageManager {
    const cardsMap = new Map(existingCards.map(card => [card.id, card]));
    
    return {
        getCard: vi.fn((id: string) => cardsMap.get(id)),
        setCard: vi.fn((card: FSRSCard) => {
            cardsMap.set(card.id, card);
        }),
        removeCard: vi.fn((id: string) => {
            cardsMap.delete(id);
        }),
        getAllCards: vi.fn(() => Array.from(cardsMap.values())),
        saveCards: vi.fn().mockResolvedValue(undefined),
        getRiffBlacklist: vi.fn(() => blacklist),
        addToRiffBlacklist: vi.fn((id: string) => {
            blacklist.add(id);
        }),
        removeFromRiffBlacklist: vi.fn((id: string) => {
            blacklist.delete(id);
        }),
        saveRiffBlacklist: vi.fn().mockResolvedValue(undefined),
    } as any;
}

/**
 * Helper: 创建默认配置
 */
function createDefaultConfig(storage: StorageManager): HybridSyncConfig {
    return {
        deckId: 'test-deck',
        storage,
        incrementalSync: {
            enabled: true,
            triggers: ['plugin-start'],
            useBlacklist: true,
            autoDetectCardType: false,
        },
        fullSync: {
            enabled: false,
            interval: 86400000,
            cleanupBlacklist: true,
        },
        deleteSync: {
            enabled: true,
            useBlacklistFallback: true,
        },
    };
}

describe('HybridSyncService - 大数据量性能测试', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(cardBuilder.batchDetectCardType).mockResolvedValue(new Map());
        vi.mocked(siyuanApi.setBlockAttrs).mockResolvedValue(undefined as any);
    });
    
    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('1. 增量同步 - 大数据量', () => {
        it('应该在 < 5s 内同步 10000 张新卡片', async () => {
            const mockStorage = createMockStorage();
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(10000);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(10000);
            expect(duration).toBeLessThan(5000);
            console.log(`[大数据量] 同步 10000 张新卡片: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });

        it('应该在 < 10s 内同步 20000 张新卡片', async () => {
            const mockStorage = createMockStorage();
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(20000);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(20000);
            expect(duration).toBeLessThan(10000);
            console.log(`[大数据量] 同步 20000 张新卡片: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });

        it('应该高效处理 10000 张新卡片 + 5000 条黑名单', async () => {
            // 创建 5000 条黑名单
            const blacklist = new Set<string>();
            for (let i = 0; i < 5000; i++) {
                blacklist.add(`card-${i}`);
            }
            
            const mockStorage = createMockStorage([], blacklist);
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(10000);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(5000); // 前 5000 张在黑名单中
            expect(duration).toBeLessThan(5000);
            console.log(`[大数据量] 10000 张新卡片 + 5000 条黑名单: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });

        it('应该高效处理 10000 张新卡片 + 20000 张本地卡片', async () => {
            const existingCards = generateFSRSCards(20000);
            const mockStorage = createMockStorage(existingCards);
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            // 新卡片从 20000 开始
            const newCards = generateRiffCards(10000, 20000);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(10000);
            expect(duration).toBeLessThan(5000);
            console.log(`[大数据量] 10000 张新卡片 + 20000 张本地卡片: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });
    });

    describe('2. 全量同步 - 大数据量', () => {
        it('应该在 < 10s 内完成 10000 张卡片的全量同步', async () => {
            const existingCards = generateFSRSCards(10000);
            const mockStorage = createMockStorage(existingCards);
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const riffCards = generateRiffCards(10000);
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffCards);
            
            const startTime = performance.now();
            const result = await service.fullSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(duration).toBeLessThan(10000);
            console.log(`[大数据量] 全量同步 10000 张卡片: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });

        it('应该高效检测 10000 张卡片中的新增和删除', async () => {
            // 本地有 10000 张卡片（0-9999）
            const existingCards = generateFSRSCards(10000);
            const mockStorage = createMockStorage(existingCards);
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            // Riff 有 10000 张卡片（5000-14999）
            // 新增：10000-14999（5000 张）
            // 删除：0-4999（5000 张）
            const riffCards = generateRiffCards(10000, 5000);
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffCards);
            
            const startTime = performance.now();
            const result = await service.fullSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(5000);
            expect(result.deletedCount).toBe(5000);
            expect(duration).toBeLessThan(10000);
            console.log(`[大数据量] 全量同步检测 5000 新增 + 5000 删除: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });

        it('应该高效清理大量黑名单（5000+ 条）', async () => {
            const existingCards = generateFSRSCards(10000);
            
            // 创建 5000 条黑名单，其中 2500 条在 Riff 中不存在
            const blacklist = new Set<string>();
            for (let i = 0; i < 5000; i++) {
                blacklist.add(`blacklisted-${i}`);
            }
            
            const mockStorage = createMockStorage(existingCards, blacklist);
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const riffCards = generateRiffCards(10000);
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffCards);
            
            const startTime = performance.now();
            const result = await service.fullSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.blacklistCleanedCount).toBe(5000); // 所有黑名单都不在 Riff 中
            expect(duration).toBeLessThan(10000);
            console.log(`[大数据量] 全量同步清理 5000 条黑名单: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });

        it('应该处理极端场景：20000 张本地 + 20000 张 Riff', async () => {
            const existingCards = generateFSRSCards(20000);
            const mockStorage = createMockStorage(existingCards);
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const riffCards = generateRiffCards(20000);
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffCards);
            
            const startTime = performance.now();
            const result = await service.fullSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(duration).toBeLessThan(15000); // 允许 15 秒
            console.log(`[大数据量] 全量同步 20000 本地 + 20000 Riff: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });
    });

    describe('3. 内存和性能压力测试', () => {
        it('应该在多次大数据量同步后保持性能', async () => {
            const mockStorage = createMockStorage();
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const durations: number[] = [];
            
            // 连续同步 5 次，每次 10000 张卡片
            for (let i = 0; i < 5; i++) {
                const newCards = generateRiffCards(10000, i * 10000);
                vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
                
                const startTime = performance.now();
                await service.incrementalSync();
                const duration = performance.now() - startTime;
                durations.push(duration);
                
                console.log(`[压力测试] 第 ${i + 1} 次同步 10000 张卡片: ${duration.toFixed(2)}ms`);
            }
            
            const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
            const maxDuration = Math.max(...durations);
            const minDuration = Math.min(...durations);
            
            console.log(`[压力测试] 5 次同步统计:`);
            console.log(`  平均: ${avgDuration.toFixed(2)}ms`);
            console.log(`  最小: ${minDuration.toFixed(2)}ms`);
            console.log(`  最大: ${maxDuration.toFixed(2)}ms`);
            
            // 所有同步都应该在合理时间内完成
            expect(maxDuration).toBeLessThan(10000);
            
            // 性能不应该显著下降（最大不超过最小的 3 倍）
            expect(maxDuration / minDuration).toBeLessThan(3);
            
            service.stop();
        });

        it('应该高效处理混合操作：增量 + 全量 + 删除', async () => {
            const existingCards = generateFSRSCards(10000);
            const mockStorage = createMockStorage(existingCards);
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            // 1. 增量同步 5000 张新卡片
            const newCards = generateRiffCards(5000, 10000);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const t1 = performance.now();
            const incrementalResult = await service.incrementalSync();
            const incrementalDuration = performance.now() - t1;
            
            expect(incrementalResult.success).toBe(true);
            expect(incrementalResult.addedCount).toBe(5000);
            console.log(`[混合操作] 增量同步 5000 张: ${incrementalDuration.toFixed(2)}ms`);
            
            // 2. 全量同步 15000 张卡片
            const riffCards = generateRiffCards(15000);
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffCards);
            
            const t2 = performance.now();
            const fullResult = await service.fullSync();
            const fullDuration = performance.now() - t2;
            
            expect(fullResult.success).toBe(true);
            console.log(`[混合操作] 全量同步 15000 张: ${fullDuration.toFixed(2)}ms`);
            
            // 3. 删除同步 100 张卡片
            vi.mocked(riffApi.removeRiffCards).mockResolvedValue(undefined);
            
            const t3 = performance.now();
            const deletePromises = [];
            for (let i = 0; i < 100; i++) {
                deletePromises.push(service.deleteSync(`card-${i}`));
            }
            await Promise.all(deletePromises);
            const deleteDuration = performance.now() - t3;
            
            console.log(`[混合操作] 删除同步 100 张: ${deleteDuration.toFixed(2)}ms`);
            
            // 总时间应该合理
            const totalDuration = incrementalDuration + fullDuration + deleteDuration;
            expect(totalDuration).toBeLessThan(20000);
            console.log(`[混合操作] 总时间: ${totalDuration.toFixed(2)}ms`);
            
            service.stop();
        });
    });

    describe('4. 性能基准测试', () => {
        it('应该生成大数据量性能报告', async () => {
            const testCases = [
                { name: '10000 张新卡片', newCards: 10000, existing: 0, blacklist: 0 },
                { name: '10000 张 + 5000 黑名单', newCards: 10000, existing: 0, blacklist: 5000 },
                { name: '10000 张 + 20000 本地', newCards: 10000, existing: 20000, blacklist: 0 },
                { name: '20000 张新卡片', newCards: 20000, existing: 0, blacklist: 0 },
                { name: '全量同步 10000 张', newCards: 0, existing: 10000, blacklist: 0, fullSync: true },
                { name: '全量同步 20000 张', newCards: 0, existing: 20000, blacklist: 0, fullSync: true },
            ];
            
            const report: any[] = [];
            
            for (const testCase of testCases) {
                const existingCards = testCase.existing > 0 ? generateFSRSCards(testCase.existing) : [];
                const blacklist = new Set<string>();
                if (testCase.blacklist > 0) {
                    for (let i = 0; i < testCase.blacklist; i++) {
                        blacklist.add(`card-${i}`);
                    }
                }
                
                const mockStorage = createMockStorage(existingCards, blacklist);
                const config = createDefaultConfig(mockStorage);
                const service = new HybridSyncService(config);
                
                let duration: number;
                let result: any;
                
                if (testCase.fullSync) {
                    const riffCards = generateRiffCards(testCase.existing);
                    vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffCards);
                    
                    const startTime = performance.now();
                    result = await service.fullSync();
                    duration = performance.now() - startTime;
                } else {
                    const newCards = generateRiffCards(testCase.newCards, testCase.existing);
                    vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
                    
                    const startTime = performance.now();
                    result = await service.incrementalSync();
                    duration = performance.now() - startTime;
                }
                
                report.push({
                    场景: testCase.name,
                    耗时: `${duration.toFixed(2)}ms`,
                    新增: result.addedCount || 0,
                    删除: result.deletedCount || 0,
                    跳过: result.skippedCount || 0,
                    成功: result.success ? '✓' : '✗',
                });
                
                service.stop();
            }
            
            console.log('\n=== HybridSyncService 大数据量性能报告 ===');
            console.table(report);
            console.log('==========================================\n');
            
            // 验证所有测试都成功
            expect(report.every(r => r.成功 === '✓')).toBe(true);
        });
    });
});
