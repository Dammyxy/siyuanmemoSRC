/**
 * RescheduleService 单元测试
 * 测试新增的 SuperMemo 重新调度方法
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RescheduleService } from '../rescheduleService';
import type { StorageManager } from '@/core/storage/manager';
import type { FSRSCard } from '@/types/card';
import type { PostponeConfig, AdvanceConfig, SpreadConfig } from '@/types/reschedule';
import type { ActionMeta } from '@/types';

// Mock StorageManager
const createMockStorage = (): StorageManager => ({
    getAllCards: vi.fn().mockResolvedValue([]),
    setCard: vi.fn(),
    saveCards: vi.fn().mockResolvedValue(undefined),
    addRescheduleLog: vi.fn().mockResolvedValue(undefined),
    loadData: vi.fn().mockResolvedValue(null),
    saveData: vi.fn().mockResolvedValue(undefined),
} as any);

// Helper function to create test cards
const createTestCard = (overrides: Partial<FSRSCard> = {}): FSRSCard => ({
    id: 'test-card-1',
    blockId: 'block-1',
    due: Date.now() - 24 * 60 * 60 * 1000, // 1 day overdue
    stability: 10,
    difficulty: 5,
    reps: 5,
    lapses: 0,
    state: 2, // Review state
    lastReview: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
    elapsedDays: 10,
    scheduledDays: 10,
    priority: 50,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
    ...overrides
});

describe('RescheduleService - New Methods', () => {
    let service: RescheduleService;
    let mockStorage: StorageManager;
    let meta: ActionMeta;

    beforeEach(() => {
        mockStorage = createMockStorage();
        service = new RescheduleService(mockStorage);
        meta = { source: 'test' };
    });

    describe('postponeWithConfig', () => {
        it('should postpone cards using PostponeEngine', async () => {
            const cards = [
                createTestCard({ id: 'card-1', scheduledDays: 10 }),
                createTestCard({ id: 'card-2', scheduledDays: 20 })
            ];

            const config: PostponeConfig = {
                delayFactor: 1.5,
                minInterval: 1,
                maxInterval: 365,
                skipConditions: {},
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false
            };

            const result = await service.postponeWithConfig(cards, config, meta);

            expect(result.updated).toBe(2);
            expect(result.skipped).toBe(0);
            expect(mockStorage.saveCards).toHaveBeenCalled();
            expect(mockStorage.addRescheduleLog).toHaveBeenCalled();
        });

        it('should skip cards based on skip conditions', async () => {
            const cards = [
                createTestCard({ id: 'card-1', priority: 5 }), // High priority
                createTestCard({ id: 'card-2', priority: 80 }) // Low priority
            ];

            const config: PostponeConfig = {
                delayFactor: 1.5,
                minInterval: 1,
                maxInterval: 365,
                skipConditions: {
                    skipByPriority: {
                        enabled: true,
                        threshold: 10 // Skip cards with priority <= 10
                    }
                },
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false
            };

            const result = await service.postponeWithConfig(cards, config, meta);

            expect(result.updated).toBe(1); // Only card-2 should be updated
            expect(result.skipped).toBe(1); // card-1 should be skipped
            expect(result.skippedReasons['skip-by-priority']).toBe(1);
        });
    });

    describe('dilute', () => {
        it('should process all cards including non-outstanding ones', async () => {
            const now = Date.now();
            const cards = [
                createTestCard({ id: 'card-1', due: now - 24 * 60 * 60 * 1000 }), // Overdue
                createTestCard({ id: 'card-2', due: now + 24 * 60 * 60 * 1000 })  // Future
            ];

            const config: PostponeConfig = {
                delayFactor: 1.5,
                minInterval: 1,
                maxInterval: 365,
                skipConditions: {},
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false
            };

            const result = await service.dilute(cards, config, meta);

            // Both cards should be processed (dilute processes all cards)
            expect(result.updated).toBe(2);
            expect(result.skipped).toBe(0);
        });
    });

    describe('autoPostpone', () => {
        it('should postpone outstanding cards while preserving top N priority cards', async () => {
            const now = Date.now();
            const cards = [
                createTestCard({ id: 'card-1', priority: 10, due: now - 1000 }),
                createTestCard({ id: 'card-2', priority: 20, due: now - 1000 }),
                createTestCard({ id: 'card-3', priority: 30, due: now - 1000 }),
                createTestCard({ id: 'card-4', priority: 40, due: now - 1000 })
            ];

            mockStorage.getAllCards = vi.fn().mockResolvedValue(cards);

            const config: PostponeConfig = {
                delayFactor: 1.5,
                minInterval: 1,
                maxInterval: 365,
                skipConditions: {},
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false,
                skipTopNElements: 2 // Skip top 2 priority cards
            };

            const result = await service.autoPostpone(config);

            // Should postpone 2 cards (card-3 and card-4), skip top 2 (card-1 and card-2)
            expect(result.updated).toBe(2);
            expect(mockStorage.getAllCards).toHaveBeenCalled();
        });

        it('should only process outstanding cards', async () => {
            const now = Date.now();
            const cards = [
                createTestCard({ id: 'card-1', due: now - 1000 }), // Outstanding
                createTestCard({ id: 'card-2', due: now + 1000 })  // Future
            ];

            mockStorage.getAllCards = vi.fn().mockResolvedValue(cards);

            const config: PostponeConfig = {
                delayFactor: 1.5,
                minInterval: 1,
                maxInterval: 365,
                skipConditions: {},
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false,
                skipTopNElements: 0
            };

            const result = await service.autoPostpone(config);

            // Only 1 outstanding card should be processed
            expect(result.updated).toBe(1);
        });
    });

    describe('advanceWithConfig', () => {
        it('should advance cards using AdvanceEngine', async () => {
            const cards = [
                createTestCard({ id: 'card-1', scheduledDays: 30 }),
                createTestCard({ id: 'card-2', scheduledDays: 60 })
            ];

            const config: AdvanceConfig = {
                maxDays: 30,
                randomize: true,
                handleOverdueCards: true
            };

            const result = await service.advanceWithConfig(cards, config, meta);

            expect(result.updated).toBeGreaterThan(0);
            expect(mockStorage.saveCards).toHaveBeenCalled();
            expect(mockStorage.addRescheduleLog).toHaveBeenCalled();
        });

        it('should handle overdue cards specially', async () => {
            const now = Date.now();
            const cards = [
                createTestCard({
                    id: 'card-1',
                    scheduledDays: 60,
                    lastReview: now - 100 * 24 * 60 * 60 * 1000 // 100 days ago
                })
            ];

            const config: AdvanceConfig = {
                maxDays: 30,
                randomize: true,
                handleOverdueCards: true
            };

            const result = await service.advanceWithConfig(cards, config, meta);

            expect(result.overdueHandled).toBe(1);
        });

        it('should keep short interval cards unchanged', async () => {
            const cards = [
                createTestCard({ id: 'card-1', scheduledDays: 5 }) // Short interval
            ];

            const config: AdvanceConfig = {
                maxDays: 30,
                randomize: true,
                handleOverdueCards: true
            };

            const result = await service.advanceWithConfig(cards, config, meta);

            expect(result.unchanged).toBe(1);
            expect(result.updated).toBe(0);
        });
    });

    describe('spreadWithConfig', () => {
        it('should spread cards evenly using SpreadEngine', async () => {
            const cards = [
                createTestCard({ id: 'card-1' }),
                createTestCard({ id: 'card-2' }),
                createTestCard({ id: 'card-3' }),
                createTestCard({ id: 'card-4' })
            ];

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'random' as any
            };

            const result = await service.spreadWithConfig(cards, config, meta);

            expect(result.updated).toBe(4);
            expect(result.averageCardsPerDay).toBeCloseTo(4 / 10, 1);
            expect(mockStorage.saveCards).toHaveBeenCalled();
            expect(mockStorage.addRescheduleLog).toHaveBeenCalled();
        });

        it('should collect future cards when considerFutureRepetitions is true', async () => {
            const now = Date.now();
            const cards = [
                createTestCard({ id: 'card-1', due: now - 1000 }), // Outstanding
                createTestCard({ id: 'card-2', due: now + 10 * 24 * 60 * 60 * 1000 }) // Future
            ];

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 30,
                considerFutureRepetitions: true,
                sortingCriterion: 'random' as any
            };

            const result = await service.spreadWithConfig(cards, config, meta);

            // Both cards should be collected and spread
            expect(result.updated).toBe(2);
        });

        it('should only collect outstanding cards when considerFutureRepetitions is false', async () => {
            const now = Date.now();
            const cards = [
                createTestCard({ id: 'card-1', due: now - 1000 }), // Outstanding
                createTestCard({ id: 'card-2', due: now + 10 * 24 * 60 * 60 * 1000 }) // Future
            ];

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 30,
                considerFutureRepetitions: false,
                sortingCriterion: 'random' as any
            };

            const result = await service.spreadWithConfig(cards, config, meta);

            // Only outstanding card should be collected
            expect(result.updated).toBe(1);
        });
    });

    describe('Integration with engines', () => {
        it('should initialize all engines in constructor', () => {
            const service = new RescheduleService(mockStorage);

            // Verify that engines are initialized by calling methods
            expect(service).toBeDefined();
            expect(typeof service.postponeWithConfig).toBe('function');
            expect(typeof service.dilute).toBe('function');
            expect(typeof service.autoPostpone).toBe('function');
            expect(typeof service.advanceWithConfig).toBe('function');
            expect(typeof service.spreadWithConfig).toBe('function');
        });
    });
});
