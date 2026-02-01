/**
 * Tests for RiffDataSource Three-Layer Degradation Strategy
 * 
 * Feature: architecture-optimization
 * Task: 6.3 实现三层降级策略
 * 
 * Verifies that RiffDataSource implements the three-layer error recovery strategy:
 * - Layer 1: Normal database query
 * - Layer 2: Use cached data and notify user (Requirements 7.1, 7.2)
 * - Layer 3: Return empty array and report error (Requirements 7.3, 7.4)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RiffDataSource } from '../RiffDataSource';
import type { IErrorReporter } from '@/utils/errorReporter';
import type { QueueItem } from '../../types';

describe('RiffDataSource - Three-Layer Degradation Strategy', () => {
  let mockErrorReporter: IErrorReporter;
  let reportSpy: ReturnType<typeof vi.fn>;
  let consoleLogSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create mock error reporter
    reportSpy = vi.fn();
    mockErrorReporter = {
      report: reportSpy,
    };

    // Spy on console.log to verify user messages (fallback in test environment)
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleLogSpy.mockRestore();
  });

  describe('Layer 1: Normal Database Query', () => {
    it('should successfully fetch cards from Riff API', async () => {
      // Given: A working Riff API
      const mockCards = [
        {
          cardID: 'card-1',
          blockID: 'block-1',
          deckID: 'test-deck',
          nextDues: {
            1: new Date().toISOString(),
            2: new Date().toISOString(),
            3: new Date().toISOString(),
            4: new Date().toISOString(),
          },
          state: 2,
          lapses: 0,
          reps: 5,
          lastReview: new Date().toISOString(),
        },
      ];

      const mockApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: mockCards }),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        errorReporter: mockErrorReporter,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should return the cards
      expect(result).toHaveLength(1);
      expect(result[0].cardID).toBe('card-1');
      expect(result[0].blockID).toBe('block-1');

      // And: Should not show any error messages
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[INFO]')
      );
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]')
      );

      // And: Should not report any errors
      expect(reportSpy).not.toHaveBeenCalled();
    });

    it('should update cache on successful query', async () => {
      // Given: A working Riff API
      const mockCards = [
        {
          cardID: 'card-1',
          blockID: 'block-1',
          deckID: 'test-deck',
          nextDues: {
            1: new Date().toISOString(),
            2: new Date().toISOString(),
            3: new Date().toISOString(),
            4: new Date().toISOString(),
          },
          state: 2,
          lapses: 0,
          reps: 5,
          lastReview: new Date().toISOString(),
        },
      ];

      const mockApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: mockCards }),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        errorReporter: mockErrorReporter,
      });

      // When: Fetching cards successfully
      await dataSource.getAll();

      // Then: Cache should be updated (verified by Layer 2 test)
      // We'll verify this by making the API fail and checking if cached data is returned
      mockApi.getRiffDueCards.mockRejectedValue(new Error('Database error'));

      const cachedResult = await dataSource.getAll();

      // Should return cached data
      expect(cachedResult).toHaveLength(1);
      expect(cachedResult[0].cardID).toBe('card-1');
    });
  });

  describe('Layer 2: Use Cached Data and Notify User (Requirements 7.1, 7.2)', () => {
    it('should use cached data when API fails and cache is available', async () => {
      // Given: A data source with cached data
      const mockCards = [
        {
          cardID: 'card-1',
          blockID: 'block-1',
          deckID: 'test-deck',
          nextDues: {
            1: new Date().toISOString(),
            2: new Date().toISOString(),
            3: new Date().toISOString(),
            4: new Date().toISOString(),
          },
          state: 2,
          lapses: 0,
          reps: 5,
          lastReview: new Date().toISOString(),
        },
      ];

      const mockApi = {
        getRiffDueCards: vi.fn()
          .mockResolvedValueOnce({ cards: mockCards }) // First call succeeds
          .mockRejectedValueOnce(new Error('Database connection failed')), // Second call fails
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        errorReporter: mockErrorReporter,
      });

      // When: First fetch succeeds (populates cache)
      const firstResult = await dataSource.getAll();
      expect(firstResult).toHaveLength(1);

      // Clear the console.log spy
      consoleLogSpy.mockClear();

      // And: Second fetch fails
      const secondResult = await dataSource.getAll();

      // Then: Should return cached data (Requirement 7.1)
      expect(secondResult).toHaveLength(1);
      expect(secondResult[0].cardID).toBe('card-1');

      // And: Should notify user about degraded mode (Requirement 7.2)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[INFO] 使用缓存数据（数据库暂时不可用）'
      );

      // And: Should not report error (cache fallback is expected behavior)
      expect(reportSpy).not.toHaveBeenCalled();
    });

    it('should allow user to continue reviewing with cached data', async () => {
      // Given: A data source with cached data
      const mockCards = [
        {
          cardID: 'card-1',
          blockID: 'block-1',
          deckID: 'test-deck',
          nextDues: {
            1: new Date().toISOString(),
            2: new Date().toISOString(),
            3: new Date().toISOString(),
            4: new Date().toISOString(),
          },
          state: 2,
          lapses: 0,
          reps: 5,
          lastReview: new Date().toISOString(),
        },
        {
          cardID: 'card-2',
          blockID: 'block-2',
          deckID: 'test-deck',
          nextDues: {
            1: new Date().toISOString(),
            2: new Date().toISOString(),
            3: new Date().toISOString(),
            4: new Date().toISOString(),
          },
          state: 2,
          lapses: 1,
          reps: 3,
          lastReview: new Date().toISOString(),
        },
      ];

      const mockApi = {
        getRiffDueCards: vi.fn()
          .mockResolvedValueOnce({ cards: mockCards })
          .mockRejectedValue(new Error('Database error')),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        errorReporter: mockErrorReporter,
      });

      // When: First fetch succeeds
      await dataSource.getAll();

      // And: Subsequent fetches fail but return cached data
      const result1 = await dataSource.getAll();
      const result2 = await dataSource.getAll();

      // Then: User can continue reviewing with cached data
      expect(result1).toHaveLength(2);
      expect(result2).toHaveLength(2);
      expect(result1[0].cardID).toBe('card-1');
      expect(result1[1].cardID).toBe('card-2');
    });
  });

  describe('Layer 3: Return Empty Array and Report Error (Requirements 7.3, 7.4)', () => {
    it('should return empty array when API fails and no cache exists', async () => {
      // Given: A data source with no cached data
      const mockApi = {
        getRiffDueCards: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        errorReporter: mockErrorReporter,
      });

      // When: Fetching cards fails
      const result = await dataSource.getAll();

      // Then: Should return empty array (Requirement 7.3)
      expect(result).toEqual([]);
    });

    it('should report error to error tracking system when no cache exists', async () => {
      // Given: A data source with no cached data
      const error = new Error('Database connection failed');
      const mockApi = {
        getRiffDueCards: vi.fn().mockRejectedValue(error),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        notebook: 'test-notebook',
        rootID: 'test-root',
        api: mockApi,
        errorReporter: mockErrorReporter,
      });

      // When: Fetching cards fails
      await dataSource.getAll();

      // Then: Should report error to error tracking system (Requirement 7.4)
      expect(reportSpy).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          operation: 'getAll',
          component: 'RiffDataSource',
          deckId: 'test-deck',
          notebook: 'test-notebook',
          rootID: 'test-root',
        })
      );
    });

    it('should display user-friendly error message when no cache exists', async () => {
      // Given: A data source with no cached data
      const mockApi = {
        getRiffDueCards: vi.fn().mockRejectedValue(new Error('SQLITE_BUSY')),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        errorReporter: mockErrorReporter,
      });

      // When: Fetching cards fails
      await dataSource.getAll();

      // Then: Should display user-friendly error message (specific to SQLITE_BUSY)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ERROR] 数据库正忙，请稍后重试'
      );
    });

    it('should not throw exception to prevent UI crashes', async () => {
      // Given: A data source that encounters an error
      const mockApi = {
        getRiffDueCards: vi.fn().mockRejectedValue(new Error('Critical database error')),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        errorReporter: mockErrorReporter,
      });

      // When/Then: Should not throw exception
      await expect(dataSource.getAll()).resolves.toEqual([]);
    });

    it('should handle error reporter being undefined gracefully', async () => {
      // Given: A data source without error reporter
      const mockApi = {
        getRiffDueCards: vi.fn().mockRejectedValue(new Error('Database error')),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        // No errorReporter provided
      });

      // When/Then: Should not throw exception
      await expect(dataSource.getAll()).resolves.toEqual([]);

      // And: Should still show user message (specific to database error)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ERROR] 数据库操作失败，请稍后重试'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty cards array from API', async () => {
      // Given: API returns empty cards array
      const mockApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: [] }),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        errorReporter: mockErrorReporter,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should return empty array without errors
      expect(result).toEqual([]);
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[INFO]')
      );
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]')
      );
      expect(reportSpy).not.toHaveBeenCalled();
    });

    it('should handle null data from API', async () => {
      // Given: API returns null
      const mockApi = {
        getRiffDueCards: vi.fn().mockResolvedValue(null),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        errorReporter: mockErrorReporter,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should return empty array without errors
      expect(result).toEqual([]);
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[INFO]')
      );
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]')
      );
      expect(reportSpy).not.toHaveBeenCalled();
    });

    it('should handle API returning data without cards property', async () => {
      // Given: API returns data without cards property
      const mockApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({}),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        errorReporter: mockErrorReporter,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should return empty array without errors
      expect(result).toEqual([]);
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[INFO]')
      );
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]')
      );
      expect(reportSpy).not.toHaveBeenCalled();
    });

    it('should preserve cache across multiple successful queries', async () => {
      // Given: A working API
      const mockCards1 = [
        {
          cardID: 'card-1',
          blockID: 'block-1',
          deckID: 'test-deck',
          nextDues: {
            1: new Date().toISOString(),
            2: new Date().toISOString(),
            3: new Date().toISOString(),
            4: new Date().toISOString(),
          },
          state: 2,
          lapses: 0,
          reps: 5,
          lastReview: new Date().toISOString(),
        },
      ];

      const mockCards2 = [
        {
          cardID: 'card-2',
          blockID: 'block-2',
          deckID: 'test-deck',
          nextDues: {
            1: new Date().toISOString(),
            2: new Date().toISOString(),
            3: new Date().toISOString(),
            4: new Date().toISOString(),
          },
          state: 2,
          lapses: 1,
          reps: 3,
          lastReview: new Date().toISOString(),
        },
      ];

      const mockApi = {
        getRiffDueCards: vi.fn()
          .mockResolvedValueOnce({ cards: mockCards1 })
          .mockResolvedValueOnce({ cards: mockCards2 })
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

      // Then: Should use the most recent cache (mockCards2)
      expect(result).toHaveLength(1);
      expect(result[0].cardID).toBe('card-2');
    });
  });

  describe('Integration with Other Features', () => {
    it('should work with blacklist filtering after cache fallback', async () => {
      // Given: A data source with blacklist and cached data
      const mockCards = [
        {
          cardID: 'card-1',
          blockID: 'block-1',
          deckID: 'test-deck',
          nextDues: {
            1: new Date().toISOString(),
            2: new Date().toISOString(),
            3: new Date().toISOString(),
            4: new Date().toISOString(),
          },
          state: 2,
          lapses: 0,
          reps: 5,
          lastReview: new Date().toISOString(),
        },
        {
          cardID: 'card-2',
          blockID: 'block-2',
          deckID: 'test-deck',
          nextDues: {
            1: new Date().toISOString(),
            2: new Date().toISOString(),
            3: new Date().toISOString(),
            4: new Date().toISOString(),
          },
          state: 2,
          lapses: 1,
          reps: 3,
          lastReview: new Date().toISOString(),
        },
      ];

      const blacklist = new Set(['block-2']);

      const mockApi = {
        getRiffDueCards: vi.fn()
          .mockResolvedValueOnce({ cards: mockCards })
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
      expect(firstResult).toHaveLength(1); // block-2 filtered out

      // And: Second fetch fails, uses cache
      const secondResult = await dataSource.getAll();

      // Then: Cache should already have blacklist applied
      expect(secondResult).toHaveLength(1);
      expect(secondResult[0].blockID).toBe('block-1');
    });

    it('should work with custom filter after cache fallback', async () => {
      // Given: A data source with custom filter and cached data
      const mockCards = [
        {
          cardID: 'card-1',
          blockID: 'block-1',
          deckID: 'test-deck',
          nextDues: {
            1: new Date().toISOString(),
            2: new Date().toISOString(),
            3: new Date().toISOString(),
            4: new Date().toISOString(),
          },
          state: 2,
          lapses: 0,
          reps: 5,
          lastReview: new Date().toISOString(),
        },
        {
          cardID: 'card-2',
          blockID: 'block-2',
          deckID: 'test-deck',
          nextDues: {
            1: new Date().toISOString(),
            2: new Date().toISOString(),
            3: new Date().toISOString(),
            4: new Date().toISOString(),
          },
          state: 2,
          lapses: 1,
          reps: 3,
          lastReview: new Date().toISOString(),
        },
      ];

      const mockApi = {
        getRiffDueCards: vi.fn()
          .mockResolvedValueOnce({ cards: mockCards })
          .mockRejectedValueOnce(new Error('Database error')),
      };

      // Filter by cardID instead of priority (since all Riff cards get priority 50)
      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        filter: (item) => item.cardID === 'card-2',
        errorReporter: mockErrorReporter,
      });

      // When: First fetch succeeds (cache includes filtered results)
      const firstResult = await dataSource.getAll();
      expect(firstResult).toHaveLength(1); // Only card-2

      // And: Second fetch fails, uses cache
      const secondResult = await dataSource.getAll();

      // Then: Cache should already have filter applied
      expect(secondResult).toHaveLength(1);
      expect(secondResult[0].cardID).toBe('card-2');
    });
  });
});
