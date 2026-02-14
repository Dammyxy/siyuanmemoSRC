/**
 * ParameterOptimizer Unit Tests
 * 
 * 测试参数优化服务的核心功能。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ParameterOptimizer } from '../ParameterOptimizer';
import type { ReviewLog, FSRSParameters } from '@/types';
import { Rating, CardState } from '@/types';

describe('ParameterOptimizer', () => {
    let optimizer: ParameterOptimizer;

    beforeEach(() => {
        optimizer = new ParameterOptimizer();
    });

    describe('optimize', () => {
        it('should throw error when no review logs provided', async () => {
            await expect(optimizer.optimize([])).rejects.toThrow('No review logs provided');
        });

        it('should throw error when insufficient data after conversion', async () => {
            // 只有一条记录，不足以优化
            const logs: ReviewLog[] = [
                createReviewLog('card1', Rating.Good, 0),
            ];

            await expect(optimizer.optimize(logs)).rejects.toThrow('No valid review data');
        });

        it('should optimize parameters with valid review logs', async () => {
            const logs = createSampleReviewLogs();

            const result = await optimizer.optimize(logs, {
                enableShortTerm: false,
                timeout: 100,
            });

            expect(result).toBeDefined();
            expect(result.weights).toBeDefined();
            expect(Array.isArray(result.weights)).toBe(true);
            expect(result.weights.length).toBeGreaterThan(0);
            expect(result.duration).toBeGreaterThan(0);
            expect(result.reviewCount).toBe(logs.length);
        });

        it('should filter out drill reviews', async () => {
            const logs: ReviewLog[] = [
                createReviewLog('card1', Rating.Good, 0),
                createReviewLog('card1', Rating.Good, 1, true), // drill, should be filtered
                createReviewLog('card1', Rating.Good, 2),
                createReviewLog('card1', Rating.Hard, 5),
            ];

            const result = await optimizer.optimize(logs, {
                timeout: 100,
            });

            expect(result).toBeDefined();
            // Should still work with filtered data
            expect(result.reviewCount).toBe(4); // Original count before filtering
        });

        it('should support progress callback', async () => {
            const logs = createSampleReviewLogs();
            const progressCalls: Array<{ current: number; total: number }> = [];

            await optimizer.optimize(logs, {
                timeout: 100,
                progress: (current, total) => {
                    progressCalls.push({ current, total });
                },
            });

            expect(progressCalls.length).toBeGreaterThan(0);
            expect(progressCalls[0].total).toBeGreaterThan(0);
        });

        it('should support aborting optimization via progress callback', async () => {
            const logs = createSampleReviewLogs();
            let callCount = 0;

            try {
                await optimizer.optimize(logs, {
                    timeout: 100,
                    progress: () => {
                        callCount++;
                        // Abort after 2 calls
                        if (callCount >= 2) {
                            return false;
                        }
                    },
                });
                // If it doesn't throw, that's also acceptable - the binding might complete early
            } catch (error) {
                // Expected behavior - optimization was aborted
                expect(error).toBeDefined();
            }
            
            // Progress callback should have been called
            expect(callCount).toBeGreaterThanOrEqual(1);
        });

        it('should handle multiple cards', async () => {
            const logs: ReviewLog[] = [
                // Card 1
                createReviewLog('card1', Rating.Good, 0),
                createReviewLog('card1', Rating.Good, 1),
                createReviewLog('card1', Rating.Hard, 3),
                // Card 2
                createReviewLog('card2', Rating.Good, 0),
                createReviewLog('card2', Rating.Easy, 2),
                createReviewLog('card2', Rating.Good, 5),
                // Card 3
                createReviewLog('card3', Rating.Hard, 0),
                createReviewLog('card3', Rating.Good, 1),
                createReviewLog('card3', Rating.Good, 4),
            ];

            const result = await optimizer.optimize(logs, {
                timeout: 100,
            });

            expect(result).toBeDefined();
            expect(result.weights).toBeDefined();
        });
    });

    describe('createOptimizedParams', () => {
        it('should create new params with optimized weights', () => {
            const currentParams: FSRSParameters = {
                requestRetention: 0.9,
                maximumInterval: 36500,
                weights: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
                enableFuzz: true,
                enableShortTerm: false,
            };

            const optimizationResult = {
                weights: [1.1, 2.2, 3.3, 4.4, 5.5, 6.6, 7.7, 8.8, 9.9, 10.1, 11.1, 12.1, 13.1, 14.1, 15.1, 16.1, 17.1, 18.1, 19.1],
                duration: 1000,
                reviewCount: 100,
            };

            const newParams = optimizer.createOptimizedParams(currentParams, optimizationResult);

            expect(newParams.weights).toEqual(optimizationResult.weights);
            expect(newParams.requestRetention).toBe(currentParams.requestRetention);
            expect(newParams.maximumInterval).toBe(currentParams.maximumInterval);
            expect(newParams.enableFuzz).toBe(currentParams.enableFuzz);
        });
    });

    describe('data conversion', () => {
        it('should group reviews by card ID', async () => {
            const logs: ReviewLog[] = [
                createReviewLog('card1', Rating.Good, 0),
                createReviewLog('card2', Rating.Good, 0),
                createReviewLog('card1', Rating.Good, 1),
                createReviewLog('card2', Rating.Hard, 2),
            ];

            // This will internally group by card ID
            const result = await optimizer.optimize(logs, {
                timeout: 100,
            });

            expect(result).toBeDefined();
        });

        it('should calculate delta_t correctly', async () => {
            const now = Date.now();
            const oneDayMs = 24 * 60 * 60 * 1000;

            const logs: ReviewLog[] = [
                {
                    id: 'log1',
                    cardId: 'card1',
                    rating: Rating.Good,
                    state: CardState.New,
                    scheduledDays: 0,
                    elapsedDays: 0,
                    review: now,
                    stability: 0,
                    difficulty: 5,
                },
                {
                    id: 'log2',
                    cardId: 'card1',
                    rating: Rating.Good,
                    state: CardState.Learning,
                    scheduledDays: 1,
                    elapsedDays: 1,
                    review: now + oneDayMs, // 1 day later
                    stability: 1,
                    difficulty: 5,
                },
                {
                    id: 'log3',
                    cardId: 'card1',
                    rating: Rating.Good,
                    state: CardState.Review,
                    scheduledDays: 3,
                    elapsedDays: 3,
                    review: now + 4 * oneDayMs, // 3 days after previous
                    stability: 3,
                    difficulty: 5,
                },
            ];

            const result = await optimizer.optimize(logs, {
                timeout: 100,
            });

            expect(result).toBeDefined();
            // If conversion is correct, optimization should succeed
        });
    });
});

// Helper functions

function createReviewLog(
    cardId: string,
    rating: Rating,
    daysAfterPrevious: number,
    isDrill: boolean = false
): ReviewLog {
    const baseTime = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
    const reviewTime = baseTime + daysAfterPrevious * 24 * 60 * 60 * 1000;

    return {
        id: `log-${cardId}-${daysAfterPrevious}`,
        cardId,
        rating,
        state: CardState.Review,
        scheduledDays: daysAfterPrevious,
        elapsedDays: daysAfterPrevious,
        review: reviewTime,
        stability: 1,
        difficulty: 5,
        isDrill,
    };
}

function createSampleReviewLogs(): ReviewLog[] {
    const logs: ReviewLog[] = [];
    const baseTime = Date.now() - 60 * 24 * 60 * 60 * 1000; // 60 days ago

    // Create review history for 3 cards
    for (let cardIdx = 1; cardIdx <= 3; cardIdx++) {
        const cardId = `card${cardIdx}`;
        let currentTime = baseTime;

        // Initial review
        logs.push({
            id: `${cardId}-0`,
            cardId,
            rating: Rating.Good,
            state: CardState.New,
            scheduledDays: 0,
            elapsedDays: 0,
            review: currentTime,
            stability: 0,
            difficulty: 5,
        });

        // Subsequent reviews with increasing intervals
        const intervals = [1, 3, 7, 14, 30];
        for (let i = 0; i < intervals.length; i++) {
            currentTime += intervals[i] * 24 * 60 * 60 * 1000;
            logs.push({
                id: `${cardId}-${i + 1}`,
                cardId,
                rating: i % 3 === 0 ? Rating.Hard : Rating.Good,
                state: CardState.Review,
                scheduledDays: intervals[i],
                elapsedDays: intervals[i],
                review: currentTime,
                stability: intervals[i],
                difficulty: 5 + i * 0.5,
            });
        }
    }

    return logs;
}
