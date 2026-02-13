import { describe, it, expect } from 'vitest';
import { ConfigValidator } from '../ConfigValidator';
import { RescheduleErrorCode } from '@/types/reschedule-error';
import type { PostponeConfig, AdvanceConfig, SpreadConfig } from '@/types/reschedule';

describe('ConfigValidator', () => {
    describe('validatePostponeConfig', () => {
        it('should accept valid config', () => {
            const config: PostponeConfig = {
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
                skipTopNElements: 0
            };

            const error = ConfigValidator.validatePostponeConfig(config);
            expect(error).toBeNull();
        });

        it('should reject invalid delayFactor (too small)', () => {
            const config: PostponeConfig = {
                delayFactor: 0.05,
                minInterval: 1,
                maxInterval: 365,
                skipConditions: {},
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false
            };

            const error = ConfigValidator.validatePostponeConfig(config);
            expect(error).not.toBeNull();
            expect(error?.code).toBe(RescheduleErrorCode.INVALID_CONFIG);
            expect(error?.message).toContain('delayFactor');
        });

        it('should reject invalid delayFactor (too large)', () => {
            const config: PostponeConfig = {
                delayFactor: 15.0,
                minInterval: 1,
                maxInterval: 365,
                skipConditions: {},
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false
            };

            const error = ConfigValidator.validatePostponeConfig(config);
            expect(error).not.toBeNull();
            expect(error?.code).toBe(RescheduleErrorCode.INVALID_CONFIG);
        });

        it('should reject invalid minInterval', () => {
            const config: PostponeConfig = {
                delayFactor: 1.5,
                minInterval: 0,
                maxInterval: 365,
                skipConditions: {},
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false
            };

            const error = ConfigValidator.validatePostponeConfig(config);
            expect(error).not.toBeNull();
            expect(error?.message).toContain('minInterval');
        });

        it('should reject maxInterval < minInterval', () => {
            const config: PostponeConfig = {
                delayFactor: 1.5,
                minInterval: 100,
                maxInterval: 50,
                skipConditions: {},
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false
            };

            const error = ConfigValidator.validatePostponeConfig(config);
            expect(error).not.toBeNull();
            expect(error?.message).toContain('maxInterval');
        });

        it('should reject invalid skipByPriority threshold', () => {
            const config: PostponeConfig = {
                delayFactor: 1.5,
                minInterval: 1,
                maxInterval: 365,
                skipConditions: {
                    skipByPriority: { enabled: true, threshold: 150 }
                },
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false
            };

            const error = ConfigValidator.validatePostponeConfig(config);
            expect(error).not.toBeNull();
            expect(error?.message).toContain('skipByPriority');
        });

        it('should reject invalid skipByRetrievability threshold', () => {
            const config: PostponeConfig = {
                delayFactor: 1.5,
                minInterval: 1,
                maxInterval: 365,
                skipConditions: {
                    skipByRetrievability: { enabled: true, threshold: 1.5 }
                },
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false
            };

            const error = ConfigValidator.validatePostponeConfig(config);
            expect(error).not.toBeNull();
            expect(error?.message).toContain('skipByRetrievability');
        });

        it('should reject invalid skipByAFactor threshold', () => {
            const config: PostponeConfig = {
                delayFactor: 1.5,
                minInterval: 1,
                maxInterval: 365,
                skipConditions: {
                    skipByAFactor: { enabled: true, threshold: 0.5 }
                },
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false
            };

            const error = ConfigValidator.validatePostponeConfig(config);
            expect(error).not.toBeNull();
            expect(error?.message).toContain('skipByAFactor');
        });

        it('should reject negative skipTopNElements', () => {
            const config: PostponeConfig = {
                delayFactor: 1.5,
                minInterval: 1,
                maxInterval: 365,
                skipConditions: {},
                modifyDelayByRetrievability: false,
                modifyDelayByPriority: false,
                skipTopNElements: -5
            };

            const error = ConfigValidator.validatePostponeConfig(config);
            expect(error).not.toBeNull();
            expect(error?.message).toContain('skipTopNElements');
        });
    });

    describe('validateAdvanceConfig', () => {
        it('should accept valid config', () => {
            const config: AdvanceConfig = {
                maxDays: 30,
                randomize: true,
                handleOverdueCards: true
            };

            const error = ConfigValidator.validateAdvanceConfig(config);
            expect(error).toBeNull();
        });

        it('should reject invalid maxDays (too small)', () => {
            const config: AdvanceConfig = {
                maxDays: 0,
                randomize: true,
                handleOverdueCards: true
            };

            const error = ConfigValidator.validateAdvanceConfig(config);
            expect(error).not.toBeNull();
            expect(error?.message).toContain('maxDays');
        });

        it('should reject invalid maxDays (too large)', () => {
            const config: AdvanceConfig = {
                maxDays: 500,
                randomize: true,
                handleOverdueCards: true
            };

            const error = ConfigValidator.validateAdvanceConfig(config);
            expect(error).not.toBeNull();
            expect(error?.message).toContain('maxDays');
        });

        it('should reject non-boolean randomize', () => {
            const config: any = {
                maxDays: 30,
                randomize: 'yes',
                handleOverdueCards: true
            };

            const error = ConfigValidator.validateAdvanceConfig(config);
            expect(error).not.toBeNull();
            expect(error?.message).toContain('randomize');
        });

        it('should reject non-boolean handleOverdueCards', () => {
            const config: any = {
                maxDays: 30,
                randomize: true,
                handleOverdueCards: 1
            };

            const error = ConfigValidator.validateAdvanceConfig(config);
            expect(error).not.toBeNull();
            expect(error?.message).toContain('handleOverdueCards');
        });
    });

    describe('validateSpreadConfig', () => {
        it('should accept valid config', () => {
            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 30,
                considerFutureRepetitions: false,
                sortingCriterion: 'random'
            };

            const error = ConfigValidator.validateSpreadConfig(config);
            expect(error).toBeNull();
        });

        it('should reject invalid collectingPeriod', () => {
            const config: SpreadConfig = {
                collectingPeriod: 0,
                reschedulingPeriod: 30,
                considerFutureRepetitions: false,
                sortingCriterion: 'random'
            };

            const error = ConfigValidator.validateSpreadConfig(config);
            expect(error).not.toBeNull();
            expect(error?.message).toContain('collectingPeriod');
        });

        it('should reject invalid reschedulingPeriod', () => {
            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 500,
                considerFutureRepetitions: false,
                sortingCriterion: 'random'
            };

            const error = ConfigValidator.validateSpreadConfig(config);
            expect(error).not.toBeNull();
            expect(error?.message).toContain('reschedulingPeriod');
        });

        it('should reject invalid sortingCriterion', () => {
            const config: any = {
                collectingPeriod: 30,
                reschedulingPeriod: 30,
                considerFutureRepetitions: false,
                sortingCriterion: 'invalid-criterion'
            };

            const error = ConfigValidator.validateSpreadConfig(config);
            expect(error).not.toBeNull();
            expect(error?.message).toContain('sortingCriterion');
        });

        it('should reject invalid maxCardsPerDay', () => {
            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 30,
                considerFutureRepetitions: false,
                sortingCriterion: 'random',
                maxCardsPerDay: 0
            };

            const error = ConfigValidator.validateSpreadConfig(config);
            expect(error).not.toBeNull();
            expect(error?.message).toContain('maxCardsPerDay');
        });

        it('should accept valid maxCardsPerDay', () => {
            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 30,
                considerFutureRepetitions: false,
                sortingCriterion: 'random',
                maxCardsPerDay: 100
            };

            const error = ConfigValidator.validateSpreadConfig(config);
            expect(error).toBeNull();
        });
    });
});
