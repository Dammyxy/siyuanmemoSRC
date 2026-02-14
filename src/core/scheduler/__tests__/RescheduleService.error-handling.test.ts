import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RescheduleService } from '../RescheduleService';
import type { StorageManager } from '@/core/storage';
import type { PostponeConfig, AdvanceConfig, SpreadConfig } from '@/types/reschedule';
import type { FSRSCard } from '@/types/card';

// Mock the siyuan API
vi.mock('@/core/siyuan', () => ({
    riff: {
        BUILTIN_DECK_ID: 'test-deck',
        batchSetRiffCardsDueTime: vi.fn(),
        getRiffCardsByBlockIDs: vi.fn(),
        addRiffCards: vi.fn()
    }
}));

vi.mock('@/core/siyuan/api', () => ({
    pushErrMsg: vi.fn()
}));

describe('RescheduleService Error Handling', () => {
    let service: RescheduleService;
    let mockStorage: StorageManager;

    beforeEach(() => {
        mockStorage = {
            getAllCards: vi.fn().mockResolvedValue([]),
            addRescheduleLog: vi.fn().mockResolvedValue(undefined),
            batchUpdateCards: vi.fn().mockResolvedValue(undefined)
        } as any;

        service = new RescheduleService(mockStorage);
    });

    describe('postponeWithConfig', () => {
        it('should reject invalid config (delayFactor too small)', async () => {
            const invalidConfig: PostponeConfig = {
                delayFactor: 0.05, // Invalid: too small
                minInterval: 1,
                maxInterval: 365,
                skipConditions: {},
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false
            };

            const cards: FSRSCard[] = [];
            const result = await service.postponeWithConfig(cards, invalidConfig, { source: 'test' });

            expect(result.updated).toBe(0);
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
            expect(result.errors![0]).toContain('delayFactor');
        });

        it('should reject invalid config (maxInterval < minInterval)', async () => {
            const invalidConfig: PostponeConfig = {
                delayFactor: 1.5,
                minInterval: 100,
                maxInterval: 50, // Invalid: less than minInterval
                skipConditions: {},
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false
            };

            const cards: FSRSCard[] = [];
            const result = await service.postponeWithConfig(cards, invalidConfig, { source: 'test' });

            expect(result.updated).toBe(0);
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
        });

        it('should accept valid config', async () => {
            const validConfig: PostponeConfig = {
                delayFactor: 1.5,
                minInterval: 1,
                maxInterval: 365,
                skipConditions: {},
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false
            };

            const cards: FSRSCard[] = [];
            const result = await service.postponeWithConfig(cards, validConfig, { source: 'test' });

            // Should not have validation errors
            expect(result.errors).toBeUndefined();
        });
    });

    describe('dilute', () => {
        it('should reject invalid config', async () => {
            const invalidConfig: PostponeConfig = {
                delayFactor: 15.0, // Invalid: too large
                minInterval: 1,
                maxInterval: 365,
                skipConditions: {},
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false
            };

            const cards: FSRSCard[] = [];
            const result = await service.dilute(cards, invalidConfig, { source: 'test' });

            expect(result.updated).toBe(0);
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
        });
    });

    describe('autoPostpone', () => {
        it('should reject invalid config', async () => {
            const invalidConfig: PostponeConfig = {
                delayFactor: 1.5,
                minInterval: 0, // Invalid: must be at least 1
                maxInterval: 365,
                skipConditions: {},
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false
            };

            const result = await service.autoPostpone(invalidConfig);

            expect(result.updated).toBe(0);
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
        });
    });

    describe('advanceWithConfig', () => {
        it('should reject invalid config (maxDays too small)', async () => {
            const invalidConfig: AdvanceConfig = {
                maxDays: 0, // Invalid: must be at least 1
                randomize: true,
                handleOverdueCards: true
            };

            const cards: FSRSCard[] = [];
            const result = await service.advanceWithConfig(cards, invalidConfig, { source: 'test' });

            expect(result.updated).toBe(0);
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
            expect(result.errors![0]).toContain('maxDays');
        });

        it('should reject invalid config (maxDays too large)', async () => {
            const invalidConfig: AdvanceConfig = {
                maxDays: 500, // Invalid: must be <= 365
                randomize: true,
                handleOverdueCards: true
            };

            const cards: FSRSCard[] = [];
            const result = await service.advanceWithConfig(cards, invalidConfig, { source: 'test' });

            expect(result.updated).toBe(0);
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
        });

        it('should accept valid config', async () => {
            const validConfig: AdvanceConfig = {
                maxDays: 30,
                randomize: true,
                handleOverdueCards: true
            };

            const cards: FSRSCard[] = [];
            const result = await service.advanceWithConfig(cards, validConfig, { source: 'test' });

            // Should not have validation errors
            expect(result.errors).toBeUndefined();
        });
    });

    describe('spreadWithConfig', () => {
        it('should reject invalid config (invalid sortingCriterion)', async () => {
            const invalidConfig: any = {
                collectingPeriod: 30,
                reschedulingPeriod: 30,
                considerFutureRepetitions: false,
                sortingCriterion: 'invalid-criterion' // Invalid
            };

            const cards: FSRSCard[] = [];
            const result = await service.spreadWithConfig(cards, invalidConfig, { source: 'test' });

            expect(result.updated).toBe(0);
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
            expect(result.errors![0]).toContain('sortingCriterion');
        });

        it('should reject invalid config (collectingPeriod too large)', async () => {
            const invalidConfig: SpreadConfig = {
                collectingPeriod: 500, // Invalid: must be <= 365
                reschedulingPeriod: 30,
                considerFutureRepetitions: false,
                sortingCriterion: 'random'
            };

            const cards: FSRSCard[] = [];
            const result = await service.spreadWithConfig(cards, invalidConfig, { source: 'test' });

            expect(result.updated).toBe(0);
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
        });

        it('should accept valid config', async () => {
            const validConfig: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 30,
                considerFutureRepetitions: false,
                sortingCriterion: 'random'
            };

            const cards: FSRSCard[] = [];
            const result = await service.spreadWithConfig(cards, validConfig, { source: 'test' });

            // Should not have validation errors
            expect(result.errors).toBeUndefined();
        });
    });
});
