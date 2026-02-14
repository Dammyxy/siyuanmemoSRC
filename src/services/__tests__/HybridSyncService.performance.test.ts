/**
 * HybridSyncService 性能测试
 * 
 * 测试 HybridSyncService 的增量同步功能在不同场景下的性能表现
 * 
 * 性能目标（来自设计文档）：
 * - 增量同步完成 < 1s
 * - 不阻塞 UI
 * - 后台执行
 * 
 * 测试场景：
 * 1. 基本增量同步性能（10/100/1000 张新卡片）
 * 2. 黑名单过滤性能（有/无黑名单，大量黑名单）
 * 3. 本地检查性能（全新/全存在/50%新）
 * 4. 网络请求性能（不同响应时间）
 * 5. 完整流程性能（端到端）
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
            autoDetectCardType: false, // 禁用自动检测以简化性能测试
        },
        fullSync: {
            enabled: false, // 禁用全量同步定时器
            interval: 86400000,
            cleanupBlacklist: true,
        },
        deleteSync: {
            enabled: true,
            useBlacklistFallback: true,
        },
    };
}

describe('HybridSyncService - 性能测试', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Mock card-builder functions
        vi.mocked(cardBuilder.batchDetectCardType).mockResolvedValue(new Map());
        vi.mocked(siyuanApi.setBlockAttrs).mockResolvedValue(undefined as any);
    });
    
    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('1. 基本增量同步性能', () => {
        it('应该在 < 100ms 内同步 10 张新卡片', async () => {
            const mockStorage = createMockStorage();
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(10);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(10);
            expect(duration).toBeLessThan(100);
            console.log(`[性能] 同步 10 张新卡片: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });
        
        it('应该在 < 500ms 内同步 100 张新卡片', async () => {
            const mockStorage = createMockStorage();
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(100);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(100);
            expect(duration).toBeLessThan(500);
            console.log(`[性能] 同步 100 张新卡片: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });
        
        it('应该在 < 1000ms 内同步 1000 张新卡片', async () => {
            const mockStorage = createMockStorage();
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(1000);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1000);
            expect(duration).toBeLessThan(1000);
            console.log(`[性能] 同步 1000 张新卡片: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });

        it('应该在多次调用时保持一致的性能', async () => {
            const mockStorage = createMockStorage();
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const durations: number[] = [];
            
            // 运行 5 次测试
            for (let i = 0; i < 5; i++) {
                const newCards = generateRiffCards(100, i * 100);
                vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
                
                const startTime = performance.now();
                await service.incrementalSync();
                const duration = performance.now() - startTime;
                durations.push(duration);
            }
            
            const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
            const maxDuration = Math.max(...durations);
            const minDuration = Math.min(...durations);
            
            console.log(`[性能] 5 次同步 100 张卡片:`);
            console.log(`  平均: ${avgDuration.toFixed(2)}ms`);
            console.log(`  最小: ${minDuration.toFixed(2)}ms`);
            console.log(`  最大: ${maxDuration.toFixed(2)}ms`);
            
            // 所有调用都应该快速
            expect(maxDuration).toBeLessThan(500);
            
            // 性能波动应该合理（最大不超过最小的 5 倍）
            // 注意：由于 JavaScript 的单线程特性和 GC，性能可能有一定波动
            expect(maxDuration / minDuration).toBeLessThan(5);
            
            service.stop();
        });
    });
    
    describe('2. 黑名单过滤性能', () => {
        it('应该高效处理无黑名单的情况', async () => {
            const mockStorage = createMockStorage([], new Set());
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(1000);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1000);
            expect(duration).toBeLessThan(1000);
            console.log(`[性能] 无黑名单，同步 1000 张卡片: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });

        it('应该高效处理小量黑名单（10 条）', async () => {
            const blacklist = new Set(['card-0', 'card-1', 'card-2', 'card-3', 'card-4', 
                                       'card-5', 'card-6', 'card-7', 'card-8', 'card-9']);
            const mockStorage = createMockStorage([], blacklist);
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(1000);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(990); // 1000 - 10 黑名单
            expect(duration).toBeLessThan(1000);
            console.log(`[性能] 10 条黑名单，同步 1000 张卡片: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });
        
        it('应该高效处理大量黑名单（1000+ 条）', async () => {
            // 创建 1000 条黑名单
            const blacklist = new Set<string>();
            for (let i = 0; i < 1000; i++) {
                blacklist.add(`blacklisted-card-${i}`);
            }
            
            const mockStorage = createMockStorage([], blacklist);
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(1000);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1000); // 黑名单不影响这些卡片
            expect(duration).toBeLessThan(1000);
            console.log(`[性能] 1000 条黑名单，同步 1000 张卡片: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });

        it('应该高效过滤黑名单中的卡片（50% 在黑名单）', async () => {
            // 创建黑名单：偶数 ID 的卡片
            const blacklist = new Set<string>();
            for (let i = 0; i < 1000; i += 2) {
                blacklist.add(`card-${i}`);
            }
            
            const mockStorage = createMockStorage([], blacklist);
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(1000);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(500); // 只添加奇数 ID 的卡片
            expect(duration).toBeLessThan(1000);
            console.log(`[性能] 50% 黑名单过滤，同步 1000 张卡片: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });
        
        it('禁用黑名单时性能应该相似', async () => {
            const blacklist = new Set<string>();
            for (let i = 0; i < 1000; i++) {
                blacklist.add(`blacklisted-card-${i}`);
            }
            
            const mockStorage = createMockStorage([], blacklist);
            const config = createDefaultConfig(mockStorage);
            config.incrementalSync.useBlacklist = false; // 禁用黑名单
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(1000);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1000); // 不过滤黑名单
            expect(duration).toBeLessThan(1000);
            console.log(`[性能] 禁用黑名单，同步 1000 张卡片: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });
    });

    describe('3. 本地检查性能', () => {
        it('应该高效处理所有卡片都是新的情况', async () => {
            const mockStorage = createMockStorage([]); // 本地无卡片
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(1000);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1000);
            expect(result.skippedCount).toBe(0);
            expect(duration).toBeLessThan(1000);
            console.log(`[性能] 全新卡片，同步 1000 张: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });
        
        it('应该高效处理所有卡片都已存在的情况', async () => {
            const existingCards = generateFSRSCards(1000);
            const mockStorage = createMockStorage(existingCards);
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(1000);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(0);
            expect(result.skippedCount).toBe(1000);
            expect(duration).toBeLessThan(1000);
            console.log(`[性能] 全部已存在，检查 1000 张: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });
        
        it('应该高效处理 50% 新卡片的情况', async () => {
            // 本地已有偶数 ID 的卡片
            const existingCards = generateFSRSCards(500, 0).filter((_, i) => i % 2 === 0);
            const mockStorage = createMockStorage(existingCards);
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(1000);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBeGreaterThan(400); // 大约 500 张新卡片
            expect(result.skippedCount).toBeGreaterThan(0);
            expect(duration).toBeLessThan(1000);
            console.log(`[性能] 50% 新卡片，同步 1000 张: ${duration.toFixed(2)}ms (新增 ${result.addedCount}, 跳过 ${result.skippedCount})`);
            
            service.stop();
        });

        it('应该高效处理大量本地卡片（10000+ 张）', async () => {
            const existingCards = generateFSRSCards(10000);
            const mockStorage = createMockStorage(existingCards);
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            // 新卡片从 10000 开始
            const newCards = generateRiffCards(1000, 10000);
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(newCards);
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1000);
            expect(result.skippedCount).toBe(0);
            expect(duration).toBeLessThan(1000);
            console.log(`[性能] 本地 10000 张卡片，同步 1000 张新卡片: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });
    });
    
    describe('4. 网络请求性能（模拟不同响应时间）', () => {
        it('应该处理快速网络响应（< 50ms）', async () => {
            const mockStorage = createMockStorage();
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(100);
            
            // 模拟 50ms 网络延迟
            vi.mocked(riffApi.getRiffNewCards).mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return newCards;
            });
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(100);
            // 总时间应该略大于网络延迟
            expect(duration).toBeGreaterThan(50);
            expect(duration).toBeLessThan(200);
            console.log(`[性能] 50ms 网络延迟，同步 100 张卡片: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });
        
        it('应该处理中等网络响应（200ms）', async () => {
            const mockStorage = createMockStorage();
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(100);
            
            // 模拟 200ms 网络延迟
            vi.mocked(riffApi.getRiffNewCards).mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 200));
                return newCards;
            });
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(100);
            expect(duration).toBeGreaterThan(200);
            expect(duration).toBeLessThan(400);
            console.log(`[性能] 200ms 网络延迟，同步 100 张卡片: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });

        it('应该处理慢速网络响应（500ms）', async () => {
            const mockStorage = createMockStorage();
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(100);
            
            // 模拟 500ms 网络延迟
            vi.mocked(riffApi.getRiffNewCards).mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 500));
                return newCards;
            });
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(100);
            expect(duration).toBeGreaterThan(500);
            expect(duration).toBeLessThan(700);
            console.log(`[性能] 500ms 网络延迟，同步 100 张卡片: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });
        
        it('网络延迟应该是主要性能瓶颈', async () => {
            const mockStorage = createMockStorage();
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(1000);
            const networkDelay = 300;
            
            // 模拟网络延迟
            vi.mocked(riffApi.getRiffNewCards).mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, networkDelay));
                return newCards;
            });
            
            const startTime = performance.now();
            await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            // 处理时间应该主要是网络延迟
            const processingTime = duration - networkDelay;
            console.log(`[性能] 网络延迟 ${networkDelay}ms，总时间 ${duration.toFixed(2)}ms，处理时间 ${processingTime.toFixed(2)}ms`);
            
            // 处理 1000 张卡片的时间应该远小于网络延迟
            expect(processingTime).toBeLessThan(networkDelay);
            
            service.stop();
        });
    });
    
    describe('5. 完整流程性能（端到端）', () => {
        it('应该在 < 1s 内完成完整的增量同步流程', async () => {
            const mockStorage = createMockStorage();
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(1000);
            
            // 模拟真实网络延迟（100ms）
            vi.mocked(riffApi.getRiffNewCards).mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return newCards;
            });
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1000);
            expect(duration).toBeLessThan(1000);
            console.log(`[性能] 完整流程（100ms 网络 + 1000 张卡片）: ${duration.toFixed(2)}ms`);
            
            service.stop();
        });

        it('应该高效处理复杂场景（黑名单 + 本地检查 + 保存）', async () => {
            // 创建复杂场景：
            // - 本地已有 5000 张卡片
            // - 黑名单有 500 条
            // - 新卡片 1000 张，其中 200 张在黑名单，300 张已存在
            
            const existingCards = generateFSRSCards(5000);
            const blacklist = new Set<string>();
            for (let i = 0; i < 200; i++) {
                blacklist.add(`card-${i}`);
            }
            
            const mockStorage = createMockStorage(existingCards, blacklist);
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(1000);
            
            // 模拟网络延迟
            vi.mocked(riffApi.getRiffNewCards).mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return newCards;
            });
            
            const startTime = performance.now();
            const result = await service.incrementalSync();
            const duration = performance.now() - startTime;
            
            expect(result.success).toBe(true);
            expect(duration).toBeLessThan(1000);
            console.log(`[性能] 复杂场景（5000 本地 + 500 黑名单 + 1000 新卡片）: ${duration.toFixed(2)}ms`);
            console.log(`  新增: ${result.addedCount}, 跳过: ${result.skippedCount}`);
            
            service.stop();
        });
        
        it('应该测量各个阶段的性能', async () => {
            const mockStorage = createMockStorage();
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const newCards = generateRiffCards(1000);
            
            let networkTime = 0;
            vi.mocked(riffApi.getRiffNewCards).mockImplementation(async () => {
                const start = performance.now();
                await new Promise(resolve => setTimeout(resolve, 100));
                networkTime = performance.now() - start;
                return newCards;
            });
            
            const totalStart = performance.now();
            await service.incrementalSync();
            const totalTime = performance.now() - totalStart;
            
            const processingTime = totalTime - networkTime;
            
            console.log(`[性能] 各阶段耗时分析（1000 张卡片）:`);
            console.log(`  网络请求: ${networkTime.toFixed(2)}ms (${(networkTime / totalTime * 100).toFixed(1)}%)`);
            console.log(`  数据处理: ${processingTime.toFixed(2)}ms (${(processingTime / totalTime * 100).toFixed(1)}%)`);
            console.log(`  总时间: ${totalTime.toFixed(2)}ms`);
            
            // 数据处理时间应该远小于总时间
            expect(processingTime).toBeLessThan(totalTime * 0.5);
            
            service.stop();
        });

        it('应该在连续多次同步时保持性能', async () => {
            const mockStorage = createMockStorage();
            const config = createDefaultConfig(mockStorage);
            const service = new HybridSyncService(config);
            
            const durations: number[] = [];
            
            // 连续同步 10 次
            for (let i = 0; i < 10; i++) {
                const newCards = generateRiffCards(100, i * 100);
                vi.mocked(riffApi.getRiffNewCards).mockImplementation(async () => {
                    await new Promise(resolve => setTimeout(resolve, 50));
                    return newCards;
                });
                
                const startTime = performance.now();
                await service.incrementalSync();
                const duration = performance.now() - startTime;
                durations.push(duration);
            }
            
            const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
            const maxDuration = Math.max(...durations);
            const minDuration = Math.min(...durations);
            
            console.log(`[性能] 连续 10 次同步（每次 100 张卡片）:`);
            console.log(`  平均: ${avgDuration.toFixed(2)}ms`);
            console.log(`  最小: ${minDuration.toFixed(2)}ms`);
            console.log(`  最大: ${maxDuration.toFixed(2)}ms`);
            
            // 所有同步都应该快速
            expect(maxDuration).toBeLessThan(200);
            
            // 性能应该稳定
            expect(maxDuration / minDuration).toBeLessThan(2);
            
            service.stop();
        });
    });
    
    describe('6. 性能报告', () => {
        it('应该生成综合性能报告', async () => {
            const testCases = [
                { name: '10 张新卡片', count: 10, delay: 50 },
                { name: '100 张新卡片', count: 100, delay: 50 },
                { name: '1000 张新卡片', count: 1000, delay: 100 },
                { name: '1000 张 + 黑名单', count: 1000, delay: 100, blacklist: 500 },
                { name: '1000 张 + 本地 5000', count: 1000, delay: 100, existing: 5000 },
            ];
            
            const report: any[] = [];
            
            for (const testCase of testCases) {
                const existingCards = testCase.existing ? generateFSRSCards(testCase.existing) : [];
                const blacklist = new Set<string>();
                if (testCase.blacklist) {
                    for (let i = 0; i < testCase.blacklist; i++) {
                        blacklist.add(`blacklisted-${i}`);
                    }
                }
                
                const mockStorage = createMockStorage(existingCards, blacklist);
                const config = createDefaultConfig(mockStorage);
                const service = new HybridSyncService(config);
                
                const newCards = generateRiffCards(testCase.count);
                vi.mocked(riffApi.getRiffNewCards).mockImplementation(async () => {
                    await new Promise(resolve => setTimeout(resolve, testCase.delay));
                    return newCards;
                });
                
                const startTime = performance.now();
                const result = await service.incrementalSync();
                const duration = performance.now() - startTime;
                
                report.push({
                    场景: testCase.name,
                    新卡片: testCase.count,
                    网络延迟: `${testCase.delay}ms`,
                    总时间: `${duration.toFixed(2)}ms`,
                    新增: result.addedCount,
                    跳过: result.skippedCount,
                    成功: result.success ? '✓' : '✗',
                });
                
                service.stop();
            }
            
            console.log('\n=== HybridSyncService 增量同步性能报告 ===');
            console.table(report);
            console.log('==========================================\n');
            
            // 验证所有测试都成功
            expect(report.every(r => r.成功 === '✓')).toBe(true);
        });
    });
});
