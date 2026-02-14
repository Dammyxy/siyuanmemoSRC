/**
 * PostponeEngine 单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostponeEngine } from '../PostponeEngine';
import type { FSRSCard } from '@/types/card';
import type { PostponeConfig } from '@/types/reschedule';
import type { StorageManager } from '@/core/storage/manager';
import { CardState, CardType } from '@/types/card';

/**
 * 创建 Mock StorageManager
 */
function createMockStorageManager(): StorageManager {
    const cards = new Map<string, FSRSCard>();
    
    return {
        setCard: vi.fn((card: FSRSCard) => {
            cards.set(card.cardId, card);
        }),
        saveCards: vi.fn(async () => {
            // Mock implementation
        }),
        addRescheduleLog: vi.fn(async () => {
            // Mock implementation
        }),
        getCard: vi.fn((cardId: string) => cards.get(cardId)),
        getAllCards: vi.fn(() => Array.from(cards.values()))
    } as any;
}

/**
 * 创建测试卡片
 */
function createTestCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
    const now = Date.now();
    return {
        cardId: overrides.cardId || 'test-card-1',
        blockId: 'block-1',
        due: now - 24 * 60 * 60 * 1000, // 昨天到期
        stability: 10,
        difficulty: 5,
        reps: 5,
        lapses: 0,
        state: CardState.Review,
        lastReview: now - 10 * 24 * 60 * 60 * 1000, // 10 天前复习
        elapsedDays: 10,
        scheduledDays: 10,
        priority: 50,
        type: CardType.Item,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: now - 30 * 24 * 60 * 60 * 1000,
        updatedAt: now,
        ...overrides
    };
}

/**
 * 创建默认配置
 */
function createDefaultConfig(overrides: Partial<PostponeConfig> = {}): PostponeConfig {
    return {
        delayFactor: 1.5,
        minInterval: 1,
        maxInterval: 365,
        skipConditions: {
            skipByPriority: { enabled: false, threshold: 10 },
            skipByInterval: { enabled: false, threshold: 365 },
            skipByRetrievability: { enabled: false, threshold: 0.9 },
            skipByAFactor: { enabled: false, threshold: 1.5 },
            skipByPostponeCount: { enabled: false, threshold: 10 }
        },
        modifyDelayByRetrievability: false,
        modifyDelayByPriority: false,
        skipTopNElements: 0,
        ...overrides
    };
}

describe('PostponeEngine', () => {
    let engine: PostponeEngine;
    let mockStorage: StorageManager;
    
    beforeEach(() => {
        mockStorage = createMockStorageManager();
        engine = new PostponeEngine(mockStorage);
    });
    
    describe('基础 Postpone 算法', () => {
        it('应该正确应用延迟因子', async () => {
            const card = createTestCard({ scheduledDays: 10 });
            const config = createDefaultConfig({ delayFactor: 1.5 });
            
            const result = await engine.execute([card], config, false);
            
            expect(result.updated).toBe(1);
            expect(mockStorage.setCard).toHaveBeenCalled();
            expect(mockStorage.saveCards).toHaveBeenCalled();
            expect(mockStorage.addRescheduleLog).toHaveBeenCalled();
            
            // 验证卡片被正确更新
            const updatedCard = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            expect(updatedCard.scheduledDays).toBe(15); // 10 * 1.5 = 15
        });
        
        it('应该确保至少推迟 1 天', async () => {
            const now = Date.now();
            const card = createTestCard({ 
                scheduledDays: 1,
                due: now - 24 * 60 * 60 * 1000 
            });
            const config = createDefaultConfig({ delayFactor: 1.1 });
            
            await engine.execute([card], config, false);
            
            const updatedCard = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            // 新的 due 应该至少比当前时间晚 1 天
            expect(updatedCard.due).toBeGreaterThanOrEqual(now + 24 * 60 * 60 * 1000);
        });
        
        it('应该尊重最小间隔限制', async () => {
            const card = createTestCard({ scheduledDays: 10 });
            const config = createDefaultConfig({ 
                delayFactor: 0.5, 
                minInterval: 8 
            });
            
            await engine.execute([card], config, false);
            
            const updatedCard = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            // 10 * 0.5 = 5，但最小间隔是 8
            expect(updatedCard.scheduledDays).toBe(8);
        });
        
        it('应该尊重最大间隔限制', async () => {
            const card = createTestCard({ scheduledDays: 100 });
            const config = createDefaultConfig({ 
                delayFactor: 2.0, 
                maxInterval: 150 
            });
            
            await engine.execute([card], config, false);
            
            const updatedCard = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            // 100 * 2.0 = 200，但最大间隔是 150
            expect(updatedCard.scheduledDays).toBe(150);
        });
        
        it('应该更新卡片的所有相关字段', async () => {
            const oldTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
            const card = createTestCard({ 
                scheduledDays: 10,
                postponeCount: 2,
                lastPostponeDate: oldTime,
                updatedAt: oldTime
            });
            const config = createDefaultConfig({ delayFactor: 1.5 });
            
            await engine.execute([card], config, false);
            
            const updated = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            
            // 检查所有字段都被更新
            expect(updated.scheduledDays).toBe(15);
            expect(updated.postponeCount).toBe(3); // 2 + 1
            expect(updated.lastPostponeDate).toBeGreaterThan(card.lastPostponeDate!);
            expect(updated.updatedAt).toBeGreaterThan(card.updatedAt);
            expect(updated.rescheduleHistory).toHaveLength(1);
            expect(updated.rescheduleHistory![0].type).toBe('postpone');
        });
    });
    
    describe('跳过条件', () => {
        it('应该跳过高优先级卡片', async () => {
            const cards = [
                createTestCard({ cardId: 'card-1', priority: 5 }),  // 高优先级，应该跳过
                createTestCard({ cardId: 'card-2', priority: 50 })  // 低优先级，应该处理
            ];
            const config = createDefaultConfig({
                skipConditions: {
                    ...createDefaultConfig().skipConditions,
                    skipByPriority: { enabled: true, threshold: 10 }
                }
            });
            
            const result = await engine.execute(cards, config, false);
            
            expect(result.updated).toBe(1);
            expect(result.skipped).toBe(1);
            expect(result.skippedReasons['skip-by-priority']).toBe(1);
            expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
        });
        
        it('应该跳过长间隔卡片', async () => {
            const cards = [
                createTestCard({ cardId: 'card-1', scheduledDays: 400 }), // 长间隔，应该跳过
                createTestCard({ cardId: 'card-2', scheduledDays: 10 })   // 短间隔，应该处理
            ];
            const config = createDefaultConfig({
                skipConditions: {
                    ...createDefaultConfig().skipConditions,
                    skipByInterval: { enabled: true, threshold: 365 }
                }
            });
            
            const result = await engine.execute(cards, config, false);
            
            expect(result.updated).toBe(1);
            expect(result.skipped).toBe(1);
            expect(result.skippedReasons['skip-by-interval']).toBe(1);
        });
        
        it('应该跳过高 Retrievability 卡片', async () => {
            const now = Date.now();
            const cards = [
                createTestCard({ 
                    cardId: 'card-1',
                    stability: 100, 
                    lastReview: now - 1 * 24 * 60 * 60 * 1000 // 刚复习，R 很高
                }),
                createTestCard({ 
                    cardId: 'card-2',
                    stability: 10, 
                    lastReview: now - 20 * 24 * 60 * 60 * 1000 // 很久没复习，R 很低
                })
            ];
            const config = createDefaultConfig({
                skipConditions: {
                    ...createDefaultConfig().skipConditions,
                    skipByRetrievability: { enabled: true, threshold: 0.9 }
                }
            });
            
            const result = await engine.execute(cards, config, false);
            
            expect(result.updated).toBe(1);
            expect(result.skipped).toBe(1);
            expect(result.skippedReasons['skip-by-retrievability']).toBe(1);
        });
        
        it('应该跳过低 A-Factor 的 Topic 卡片', async () => {
            const cards = [
                createTestCard({ cardId: 'card-1', type: CardType.Topic, aFactor: 1.3 }), // 低 A-Factor，应该跳过
                createTestCard({ cardId: 'card-2', type: CardType.Topic, aFactor: 2.0 })  // 高 A-Factor，应该处理
            ];
            const config = createDefaultConfig({
                skipConditions: {
                    ...createDefaultConfig().skipConditions,
                    skipByAFactor: { enabled: true, threshold: 1.5 }
                }
            });
            
            const result = await engine.execute(cards, config, false);
            
            expect(result.updated).toBe(1);
            expect(result.skipped).toBe(1);
            expect(result.skippedReasons['skip-by-afactor']).toBe(1);
        });
        
        it('应该跳过推迟次数过多的卡片', async () => {
            const cards = [
                createTestCard({ cardId: 'card-1', postponeCount: 15 }), // 推迟次数多，应该跳过
                createTestCard({ cardId: 'card-2', postponeCount: 3 })   // 推迟次数少，应该处理
            ];
            const config = createDefaultConfig({
                skipConditions: {
                    ...createDefaultConfig().skipConditions,
                    skipByPostponeCount: { enabled: true, threshold: 10 }
                }
            });
            
            const result = await engine.execute(cards, config, false);
            
            expect(result.updated).toBe(1);
            expect(result.skipped).toBe(1);
            expect(result.skippedReasons['skip-by-postpone-count']).toBe(1);
        });
        
        it('当所有跳过条件都未启用时应该处理所有 outstanding 卡片', async () => {
            const now = Date.now();
            const cards = [
                createTestCard({ cardId: 'card-1', due: now - 24 * 60 * 60 * 1000 }), // 昨天到期
                createTestCard({ cardId: 'card-2', due: now - 2 * 24 * 60 * 60 * 1000 }), // 前天到期
                createTestCard({ cardId: 'card-3', due: now + 24 * 60 * 60 * 1000 })  // 明天到期，不是 outstanding
            ];
            const config = createDefaultConfig();
            
            const result = await engine.execute(cards, config, false);
            
            expect(result.updated).toBe(2);
            expect(result.skipped).toBe(1);
            expect(result.skippedReasons['not-outstanding']).toBe(1);
            expect(mockStorage.setCard).toHaveBeenCalledTimes(2);
        });
    });
    
    describe('动态延迟因子调整', () => {
        it('应该根据 Retrievability 调整延迟因子', async () => {
            const now = Date.now();
            const lowRCard = createTestCard({ 
                cardId: 'card-low-r',
                scheduledDays: 10,
                stability: 5,
                lastReview: now - 20 * 24 * 60 * 60 * 1000 // R 很低
            });
            const highRCard = createTestCard({ 
                cardId: 'card-high-r',
                scheduledDays: 10,
                stability: 100,
                lastReview: now - 1 * 24 * 60 * 60 * 1000 // R 很高
            });
            const config = createDefaultConfig({ 
                delayFactor: 1.5,
                modifyDelayByRetrievability: true
            });
            
            await engine.execute([lowRCard], config, false);
            const lowRResult = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            
            vi.clearAllMocks();
            
            await engine.execute([highRCard], config, false);
            const highRResult = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            
            // R 低的卡片应该有更大的延迟
            expect(lowRResult.scheduledDays).toBeGreaterThan(highRResult.scheduledDays);
        });
        
        it('应该根据 Priority 调整延迟因子', async () => {
            const lowPriorityCard = createTestCard({ 
                cardId: 'card-low-p',
                scheduledDays: 10,
                priority: 80 // 低优先级（数值大）
            });
            const highPriorityCard = createTestCard({ 
                cardId: 'card-high-p',
                scheduledDays: 10,
                priority: 20 // 高优先级（数值小）
            });
            const config = createDefaultConfig({ 
                delayFactor: 1.5,
                modifyDelayByPriority: true
            });
            
            await engine.execute([lowPriorityCard], config, false);
            const lowPResult = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            
            vi.clearAllMocks();
            
            await engine.execute([highPriorityCard], config, false);
            const highPResult = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            
            // 低优先级的卡片应该有更大的延迟
            expect(lowPResult.scheduledDays).toBeGreaterThan(highPResult.scheduledDays);
        });
        
        it('应该限制调整后的延迟因子在 [0.1, 10.0] 范围内', async () => {
            const card = createTestCard({ scheduledDays: 10 });
            
            // 测试极端情况：非常大的延迟因子
            const config1 = createDefaultConfig({ 
                delayFactor: 15.0, // 超过 10.0
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false
            });
            
            await engine.execute([card], config1, false);
            const result1 = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            
            // 即使配置了 15.0，实际应该被限制在 10.0
            // 10 * 10.0 = 100
            expect(result1.scheduledDays).toBeLessThanOrEqual(100);
        });
    });
    
    describe('Dilute 模式', () => {
        it('应该处理所有卡片（包括未到期的）', async () => {
            const now = Date.now();
            const cards = [
                createTestCard({ cardId: 'card-1', due: now - 24 * 60 * 60 * 1000 }), // 昨天到期
                createTestCard({ cardId: 'card-2', due: now + 24 * 60 * 60 * 1000 }), // 明天到期
                createTestCard({ cardId: 'card-3', due: now + 7 * 24 * 60 * 60 * 1000 }) // 下周到期
            ];
            const config = createDefaultConfig();
            
            const result = await engine.execute(cards, config, true);
            
            // Dilute 模式应该处理所有卡片
            expect(result.updated).toBe(3);
            expect(result.skipped).toBe(0);
            expect(mockStorage.setCard).toHaveBeenCalledTimes(3);
        });
        
        it('应该使用相同的延迟因子和跳过条件', async () => {
            const now = Date.now();
            const cards = [
                createTestCard({ 
                    cardId: 'card-1',
                    due: now + 24 * 60 * 60 * 1000,
                    scheduledDays: 10,
                    priority: 5 // 高优先级
                }),
                createTestCard({ 
                    cardId: 'card-2',
                    due: now + 24 * 60 * 60 * 1000,
                    scheduledDays: 10,
                    priority: 50 // 低优先级
                })
            ];
            const config = createDefaultConfig({
                delayFactor: 1.5,
                skipConditions: {
                    ...createDefaultConfig().skipConditions,
                    skipByPriority: { enabled: true, threshold: 10 }
                }
            });
            
            const result = await engine.execute(cards, config, true);
            
            // 应该跳过高优先级卡片，处理低优先级卡片
            expect(result.updated).toBe(1);
            expect(result.skipped).toBe(1);
            expect(result.skippedReasons['skip-by-priority']).toBe(1);
            
            // 处理的卡片应该应用延迟因子
            const updatedCard = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            expect(updatedCard.scheduledDays).toBe(15); // 10 * 1.5
        });
    });
    
    describe('边界情况', () => {
        it('应该处理 stability 为 0 的卡片', async () => {
            const card = createTestCard({ 
                stability: 0,
                scheduledDays: 10
            });
            const config = createDefaultConfig({ delayFactor: 1.5 });
            
            await expect(engine.execute([card], config, false)).resolves.not.toThrow();
        });
        
        it('应该处理从未复习过的卡片', async () => {
            const card = createTestCard({ 
                lastReview: 0,
                scheduledDays: 10
            });
            const config = createDefaultConfig({ delayFactor: 1.5 });
            
            await engine.execute([card], config, false);
            
            const updatedCard = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            expect(updatedCard.scheduledDays).toBe(15);
        });
        
        it('应该处理空卡片列表', async () => {
            const config = createDefaultConfig();
            
            const result = await engine.execute([], config, false);
            
            expect(result.updated).toBe(0);
            expect(result.skipped).toBe(0);
            expect(mockStorage.setCard).not.toHaveBeenCalled();
            expect(mockStorage.saveCards).not.toHaveBeenCalled();
        });
        
        it('应该处理没有 postponeCount 字段的卡片', async () => {
            const card = createTestCard({ scheduledDays: 10 });
            delete (card as any).postponeCount;
            
            const config = createDefaultConfig();
            
            await engine.execute([card], config, false);
            
            const updatedCard = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            expect(updatedCard.postponeCount).toBe(1); // 应该初始化为 1
        });
    });
    
    describe('批量更新和日志记录', () => {
        it('应该调用 StorageManager 保存卡片', async () => {
            const cards = [
                createTestCard({ cardId: 'card-1' }),
                createTestCard({ cardId: 'card-2' }),
                createTestCard({ cardId: 'card-3' })
            ];
            const config = createDefaultConfig();
            
            await engine.execute(cards, config, false);
            
            expect(mockStorage.setCard).toHaveBeenCalledTimes(3);
            expect(mockStorage.saveCards).toHaveBeenCalledTimes(1);
        });
        
        it('应该记录操作日志', async () => {
            const cards = [
                createTestCard({ cardId: 'card-1', blockId: 'block-1' }),
                createTestCard({ cardId: 'card-2', blockId: 'block-2' })
            ];
            const config = createDefaultConfig();
            
            await engine.execute(cards, config, false, 'browser');
            
            expect(mockStorage.addRescheduleLog).toHaveBeenCalledTimes(1);
            const logCall = vi.mocked(mockStorage.addRescheduleLog).mock.calls[0][0];
            
            expect(logCall.action).toBe('postpone');
            expect(logCall.source).toBe('browser');
            expect(logCall.targets).toHaveLength(2);
            expect(logCall.result.updated).toBe(2);
            expect(logCall.sample).toBeDefined();
            expect(logCall.sample.length).toBeLessThanOrEqual(3);
        });
        
        it('应该在 Dilute 模式下记录正确的操作类型', async () => {
            const cards = [createTestCard({ cardId: 'card-1' })];
            const config = createDefaultConfig();
            
            await engine.execute(cards, config, true, 'command');
            
            const logCall = vi.mocked(mockStorage.addRescheduleLog).mock.calls[0][0];
            expect(logCall.action).toBe('dilute');
            expect(logCall.source).toBe('command');
        });
        
        it('应该在日志中包含样本卡片的详细信息', async () => {
            const cards = [
                createTestCard({ cardId: 'card-1', blockId: 'block-1' }),
                createTestCard({ cardId: 'card-2', blockId: 'block-2' }),
                createTestCard({ cardId: 'card-3', blockId: 'block-3' }),
                createTestCard({ cardId: 'card-4', blockId: 'block-4' })
            ];
            const config = createDefaultConfig();
            
            await engine.execute(cards, config, false);
            
            const logCall = vi.mocked(mockStorage.addRescheduleLog).mock.calls[0][0];
            
            // 应该最多包含 3 个样本
            expect(logCall.sample.length).toBe(3);
            
            // 每个样本应该包含必要的信息
            logCall.sample.forEach(sample => {
                expect(sample.cardId).toBeDefined();
                expect(sample.blockId).toBeDefined();
                expect(sample.newDue).toBeDefined();
            });
        });
    });
});
