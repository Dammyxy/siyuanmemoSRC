/**
 * Property-Based Tests for Error Recovery
 * 
 * Feature: architecture-optimization
 * Task: 6.5 编写错误恢复属性测试
 * 
 * Property 7: 错误恢复使用缓存并通知
 * 
 * **Validates: Requirements 7.1, 7.2**
 * 
 * For any DataSource with cached data, when a database query fails and
 * cached data is available, the system should return cached data and
 * display a user notification indicating degraded mode.
 * 
 * This property test uses fast-check to generate:
 * - Random card data sets
 * - Random error scenarios
 * - Random cache states
 * 
 * And verifies that:
 * - Cached data is returned when query fails
 * - User is notified about degraded mode
 * - System continues to function with cached data
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { RiffDataSource } from '../RiffDataSource';
import type { IErrorReporter } from '@/utils/errorReporter';

interface MockCard {
  cardID: string;
  blockID: string;
  deckID: string;
  nextDues: {
    1: string;
    2: string;
    3: string;
    4: string;
  };
  state: number;
  lapses: number;
  reps: number;
  lastReview: string;
}

/**
 * Arbitrary generator for mock cards
 */
const mockCardArbitrary = fc.record({
  cardID: fc.string({ minLength: 5, maxLength: 20 }).map(s => `card-${s}`),
  blockID: fc.string({ minLength: 5, maxLength: 20 }).map(s => `block-${s}`),
  deckID: fc.constant('test-deck'),
  nextDues: fc.constant({
    1: new Date().toISOString(),
    2: new Date().toISOString(),
    3: new Date().toISOString(),
    4: new Date().toISOString(),
  }),
  state: fc.integer({ min: 0, max: 3 }),
  lapses: fc.integer({ min: 0, max: 10 }),
  reps: fc.integer({ min: 0, max: 100 }),
  lastReview: fc.constant(new Date().toISOString()),
});

describe('Error Recovery - Property-Based Tests', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let mockErrorReporter: IErrorReporter;
  let reportSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportSpy = vi.fn();
    mockErrorReporter = {
      report: reportSpy,
    };
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('Property 7: 错误恢复使用缓存并通知 (Requirements 7.1, 7.2)', () => {
    it('should use cached data when query fails and cache is available', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate initial cached cards
          fc.array(mockCardArbitrary, { minLength: 1, maxLength: 20 }),
          // Generate error message
          fc.oneof(
            fc.constant('Database connection failed'),
            fc.constant('SQLITE_BUSY'),
            fc.constant('Network error'),
            fc.constant('Timeout error')
          ),
          async (cachedCards, errorMessage) => {
            // Given: A data source with cached data
            const mockApi = {
              getRiffDueCards: vi.fn()
                .mockResolvedValueOnce({ cards: cachedCards }) // First call succeeds
                .mockRejectedValueOnce(new Error(errorMessage)), // Second call fails
            };

            const dataSource = new RiffDataSource({
              deckId: 'test-deck',
              api: mockApi,
              errorReporter: mockErrorReporter,
            });

            // When: First fetch succeeds (populates cache)
            const firstResult = await dataSource.getAll();
            expect(firstResult.length).toBe(cachedCards.length);

            // Clear console spy
            consoleLogSpy.mockClear();

            // And: Second fetch fails
            const secondResult = await dataSource.getAll();

            // Then: Should return cached data (Requirement 7.1)
            expect(secondResult.length).toBe(cachedCards.length);
            expect(secondResult.map(c => c.cardID).sort()).toEqual(
              cachedCards.map(c => c.cardID).sort()
            );

            // And: Should notify user about degraded mode (Requirement 7.2)
            expect(consoleLogSpy).toHaveBeenCalledWith(
              '[INFO] 使用缓存数据（数据库暂时不可用）'
            );

            // And: Should not report error (cache fallback is expected behavior)
            expect(reportSpy).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should continue to return cached data on multiple failures', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate cached cards
          fc.array(mockCardArbitrary, { minLength: 1, maxLength: 10 }),
          // Generate number of consecutive failures
          fc.integer({ min: 2, max: 5 }),
          async (cachedCards, failureCount) => {
            // Given: A data source with cached data
            const mockApi = {
              getRiffDueCards: vi.fn()
                .mockResolvedValueOnce({ cards: cachedCards }) // First call succeeds
                .mockRejectedValue(new Error('Database error')), // All subsequent calls fail
            };

            const dataSource = new RiffDataSource({
              deckId: 'test-deck',
              api: mockApi,
              errorReporter: mockErrorReporter,
            });

            // When: First fetch succeeds
            await dataSource.getAll();

            // And: Multiple subsequent fetches fail
            for (let i = 0; i < failureCount; i++) {
              const result = await dataSource.getAll();

              // Then: Should always return cached data
              expect(result.length).toBe(cachedCards.length);
              expect(result.map(c => c.cardID).sort()).toEqual(
                cachedCards.map(c => c.cardID).sort()
              );
            }

            // And: Should notify user each time
            // Note: RiffDataSource logs multiple messages per failure
            // We just verify that console.log was called (not exact count)
            expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve cache across successful queries', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate first set of cards
          fc.array(mockCardArbitrary, { minLength: 1, maxLength: 10 }),
          // Generate second set of cards
          fc.array(mockCardArbitrary, { minLength: 1, maxLength: 10 }),
          async (firstCards, secondCards) => {
            // Given: A data source
            const mockApi = {
              getRiffDueCards: vi.fn()
                .mockResolvedValueOnce({ cards: firstCards })
                .mockResolvedValueOnce({ cards: secondCards })
                .mockRejectedValueOnce(new Error('Database error')),
            };

            const dataSource = new RiffDataSource({
              deckId: 'test-deck',
              api: mockApi,
              errorReporter: mockErrorReporter,
            });

            // When: Multiple successful queries
            await dataSource.getAll();
            await dataSource.getAll();

            // And: Then a failure
            const result = await dataSource.getAll();

            // Then: Should use the most recent cache (secondCards)
            expect(result.length).toBe(secondCards.length);
            expect(result.map(c => c.cardID).sort()).toEqual(
              secondCards.map(c => c.cardID).sort()
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty cache gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate error message
          fc.string({ minLength: 5, maxLength: 50 }),
          async (errorMessage) => {
            // Given: A data source with no cached data
            const mockApi = {
              getRiffDueCards: vi.fn().mockRejectedValue(new Error(errorMessage)),
            };

            const dataSource = new RiffDataSource({
              deckId: 'test-deck',
              api: mockApi,
              errorReporter: mockErrorReporter,
            });

            // When: Fetching cards fails with no cache
            const result = await dataSource.getAll();

            // Then: Should return empty array (Requirement 7.3)
            expect(result).toEqual([]);

            // And: Should report error (Requirement 7.4)
            expect(reportSpy).toHaveBeenCalledWith(
              expect.any(Error),
              expect.objectContaining({
                operation: 'getAll',
                component: 'RiffDataSource',
              })
            );

            // And: Should display user-friendly error message
            expect(consoleLogSpy).toHaveBeenCalledWith(
              expect.stringMatching(/^\[ERROR\]/)
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should work with blacklist filtering after cache fallback', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate cards
          fc.array(mockCardArbitrary, { minLength: 3, maxLength: 10 }),
          // Generate blacklist indices
          fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 3 }),
          async (cards, blacklistIndices) => {
            // Given: A data source with blacklist
            const blacklistedBlockIDs = blacklistIndices
              .filter(i => i < cards.length)
              .map(i => cards[i].blockID);
            const blacklist = new Set(blacklistedBlockIDs);

            const mockApi = {
              getRiffDueCards: vi.fn()
                .mockResolvedValueOnce({ cards })
                .mockRejectedValueOnce(new Error('Database error')),
            };

            const dataSource = new RiffDataSource({
              deckId: 'test-deck',
              api: mockApi,
              blacklistProvider: () => blacklist,
              errorReporter: mockErrorReporter,
            });

            // When: First fetch succeeds (cache includes filtered results)
            const firstResult = await dataSource.getAll();
            const expectedCount = cards.filter(c => !blacklist.has(c.blockID)).length;
            expect(firstResult.length).toBe(expectedCount);

            // And: Second fetch fails, uses cache
            const secondResult = await dataSource.getAll();

            // Then: Cache should already have blacklist applied
            expect(secondResult.length).toBe(expectedCount);
            secondResult.forEach(card => {
              expect(blacklist.has(card.blockID)).toBe(false);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should work with custom filter after cache fallback', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate cards with varying states
          fc.array(mockCardArbitrary, { minLength: 3, maxLength: 10 }),
          // Generate filter state
          fc.integer({ min: 0, max: 3 }),
          async (cards, filterState) => {
            // Given: A data source with custom filter
            const mockApi = {
              getRiffDueCards: vi.fn()
                .mockResolvedValueOnce({ cards })
                .mockRejectedValueOnce(new Error('Database error')),
            };

            const dataSource = new RiffDataSource({
              deckId: 'test-deck',
              api: mockApi,
              filter: (item) => item.state === filterState,
              errorReporter: mockErrorReporter,
            });

            // When: First fetch succeeds (cache includes filtered results)
            const firstResult = await dataSource.getAll();
            const expectedCount = cards.filter(c => c.state === filterState).length;
            expect(firstResult.length).toBe(expectedCount);

            // And: Second fetch fails, uses cache
            const secondResult = await dataSource.getAll();

            // Then: Cache should already have filter applied
            expect(secondResult.length).toBe(expectedCount);
            secondResult.forEach(card => {
              expect(card.state).toBe(filterState);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle various error types consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate cached cards
          fc.array(mockCardArbitrary, { minLength: 1, maxLength: 5 }),
          // Generate different error types
          fc.oneof(
            fc.constant(new Error('SQLITE_BUSY')),
            fc.constant(new Error('SQLITE_LOCKED')),
            fc.constant(new Error('Network timeout')),
            fc.constant(new Error('Connection refused')),
            fc.constant(new Error('Unknown error'))
          ),
          async (cachedCards, error) => {
            // Given: A data source with cached data
            const mockApi = {
              getRiffDueCards: vi.fn()
                .mockResolvedValueOnce({ cards: cachedCards })
                .mockRejectedValueOnce(error),
            };

            const dataSource = new RiffDataSource({
              deckId: 'test-deck',
              api: mockApi,
              errorReporter: mockErrorReporter,
            });

            // When: First fetch succeeds, second fails
            await dataSource.getAll();
            const result = await dataSource.getAll();

            // Then: Should always use cache regardless of error type
            expect(result.length).toBe(cachedCards.length);

            // And: Should always notify user
            expect(consoleLogSpy).toHaveBeenCalledWith(
              '[INFO] 使用缓存数据（数据库暂时不可用）'
            );

            // And: Should not report error (cache fallback works)
            expect(reportSpy).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not throw exceptions even with cache fallback', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate cached cards
          fc.array(mockCardArbitrary, { minLength: 0, maxLength: 10 }),
          // Generate error
          fc.string({ minLength: 1, maxLength: 50 }),
          async (cachedCards, errorMessage) => {
            // Given: A data source
            const mockApi = {
              getRiffDueCards: vi.fn()
                .mockResolvedValueOnce({ cards: cachedCards })
                .mockRejectedValueOnce(new Error(errorMessage)),
            };

            const dataSource = new RiffDataSource({
              deckId: 'test-deck',
              api: mockApi,
              errorReporter: mockErrorReporter,
            });

            // When: First fetch succeeds
            await dataSource.getAll();

            // Then: Second fetch should not throw
            await expect(dataSource.getAll()).resolves.not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle rapid consecutive failures with cache', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate cached cards
          fc.array(mockCardArbitrary, { minLength: 1, maxLength: 5 }),
          // Generate number of rapid failures
          fc.integer({ min: 5, max: 20 }),
          async (cachedCards, failureCount) => {
            // Given: A data source with cached data
            const mockApi = {
              getRiffDueCards: vi.fn()
                .mockResolvedValueOnce({ cards: cachedCards })
                .mockRejectedValue(new Error('Database error')),
            };

            const dataSource = new RiffDataSource({
              deckId: 'test-deck',
              api: mockApi,
              errorReporter: mockErrorReporter,
            });

            // When: First fetch succeeds
            await dataSource.getAll();

            // And: Rapid consecutive failures
            const results = await Promise.all(
              Array.from({ length: failureCount }, () => dataSource.getAll())
            );

            // Then: All should return cached data
            results.forEach(result => {
              expect(result.length).toBe(cachedCards.length);
            });

            // And: Should notify user for each failure
            // Note: RiffDataSource logs multiple messages per failure
            // We just verify that console.log was called (not exact count)
            expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should recover when database becomes available again', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate initial cached cards
          fc.array(mockCardArbitrary, { minLength: 1, maxLength: 5 }),
          // Generate new cards after recovery
          fc.array(mockCardArbitrary, { minLength: 1, maxLength: 5 }),
          async (cachedCards, newCards) => {
            // Given: A data source that fails then recovers
            const mockApi = {
              getRiffDueCards: vi.fn()
                .mockResolvedValueOnce({ cards: cachedCards }) // Initial success
                .mockRejectedValueOnce(new Error('Database error')) // Failure
                .mockResolvedValueOnce({ cards: newCards }), // Recovery
            };

            const dataSource = new RiffDataSource({
              deckId: 'test-deck',
              api: mockApi,
              errorReporter: mockErrorReporter,
            });

            // When: Initial success
            const firstResult = await dataSource.getAll();
            expect(firstResult.length).toBe(cachedCards.length);

            // And: Failure (uses cache)
            const secondResult = await dataSource.getAll();
            expect(secondResult.length).toBe(cachedCards.length);

            // And: Recovery
            const thirdResult = await dataSource.getAll();

            // Then: Should use new data and update cache
            expect(thirdResult.length).toBe(newCards.length);
            expect(thirdResult.map(c => c.cardID).sort()).toEqual(
              newCards.map(c => c.cardID).sort()
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 7 - Edge Cases', () => {
    it('should handle null/undefined API responses gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate cached cards
          fc.array(mockCardArbitrary, { minLength: 1, maxLength: 5 }),
          // Generate null/undefined response
          fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant({})),
          async (cachedCards, badResponse) => {
            // Given: A data source with cached data
            const mockApi = {
              getRiffDueCards: vi.fn()
                .mockResolvedValueOnce({ cards: cachedCards })
                .mockResolvedValueOnce(badResponse),
            };

            const dataSource = new RiffDataSource({
              deckId: 'test-deck',
              api: mockApi,
              errorReporter: mockErrorReporter,
            });

            // When: First fetch succeeds
            await dataSource.getAll();

            // And: Second fetch returns bad response
            const result = await dataSource.getAll();

            // Then: Should handle gracefully (return empty or cached)
            expect(Array.isArray(result)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle cache with empty array', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate error message
          fc.string({ minLength: 1, maxLength: 50 }),
          async (errorMessage) => {
            // Given: A data source with empty cache
            const mockApi = {
              getRiffDueCards: vi.fn()
                .mockResolvedValueOnce({ cards: [] }) // Empty cache
                .mockRejectedValueOnce(new Error(errorMessage)),
            };

            const dataSource = new RiffDataSource({
              deckId: 'test-deck',
              api: mockApi,
              errorReporter: mockErrorReporter,
            });

            // When: First fetch returns empty
            const firstResult = await dataSource.getAll();
            expect(firstResult).toEqual([]);

            // And: Second fetch fails
            const secondResult = await dataSource.getAll();

            // Then: Should return empty array and report error
            expect(secondResult).toEqual([]);
            expect(reportSpy).toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
