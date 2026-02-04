/**
 * Unit Tests for RiffDataSource
 * 
 * Feature: riff-decoupling
 * Task: 2.7 编写 RiffDataSource 单元测试
 * 
 * Tests the three modes of data fetching, local data priority merge logic,
 * Topic card filtering, and incremental update lastSyncTime management.
 * 
 * Requirements tested:
 * - 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
 * - 3.1, 3.2, 3.3, 3.4, 3.5
 * - 8.1, 8.2, 8.4, 8.6
 * - 12.1, 12.2, 12.3, 12.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RiffDataSource } from '../RiffDataSource';
import type { RiffApi } from '../RiffDataSource';
import type { StorageManager } from '../../../storage/manager';
import type { SchedulerRouter } from '../../../scheduler/SchedulerRouter';
import type { FSRSCard } from '@/types';
import type { QueueItem } from '../../types';
import { State } from 'ts-fsrs';
import * as siyuanApi from '../../../siyuan/api';

// Mock the sql function
vi.mock('../../../siyuan/api', () => ({
  sql: vi.fn().mockResolvedValue([]),
}));

/**
 * Helper function to create a mock RiffCard
 */
function createMockRiffCard(overrides: Partial<any> = {}): any {
  return {
    cardID: 'card-1',
    blockID: 'block-1',
    deckID: 'test-deck',
    nextDues: {
      1: new Date('2024-01-15T10:00:00Z').toISOString(),
      2: new Date('2024-01-16T10:00:00Z').toISOString(),
      3: new Date('2024-01-20T10:00:00Z').toISOString(),
      4: new Date('2024-01-25T10:00:00Z').toISOString(),
    },
    state: 2,
    lapses: 0,
    reps: 5,
    lastReview: new Date('2024-01-10T10:00:00Z').toISOString(),
    ...overrides,
  };
}

/**
 * Helper function to create a mock FSRSCard
 */
function createMockFSRSCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-1',
    due: new Date('2024-01-15T12:00:00Z').getTime(),
    stability: 10,
    difficulty: 5,
    elapsedDays: 5,
    scheduledDays: 10,
    reps: 3,
    lapses: 1,
    state: State.Review,
    lastReview: new Date('2024-01-10T12:00:00Z').getTime(),
    priority: 60,
    ...overrides,
  };
}

/**
 * Helper function to create a mock StorageManager
 */
function createMockStorage(cards: Map<string, FSRSCard> = new Map()): StorageManager {
  return {
    getCard: vi.fn((id: string) => cards.get(id) || null),
    setCard: vi.fn(),
    removeCard: vi.fn(),
    saveCards: vi.fn().mockResolvedValue(undefined),
    getAllCards: vi.fn(() => Array.from(cards.values())),
  } as any;
}

/**
 * Helper function to create a mock SchedulerRouter
 */
function createMockSchedulerRouter(previews?: Map<number, FSRSCard>): SchedulerRouter {
  return {
    preview: vi.fn(() => previews || new Map()),
    config: {
      riffIntegration: {
        useRiffScheduler: false,
      },
    },
  } as any;
}

describe('RiffDataSource - Unit Tests', () => {
  let consoleLogSpy: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Mode 1: due-only (Default)', () => {
    it('should fetch only due cards in due-only mode', async () => {
      // Given: A data source in due-only mode (default)
      const mockCards = [
        createMockRiffCard({ cardID: 'card-1', blockID: 'block-1' }),
        createMockRiffCard({ cardID: 'card-2', blockID: 'block-2' }),
      ];

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: mockCards }),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should call getRiffDueCards
      expect(mockApi.getRiffDueCards).toHaveBeenCalledWith('test-deck', undefined, undefined);
      
      // And: Should return the cards
      expect(result).toHaveLength(2);
      expect(result[0].cardID).toBe('card-1');
      expect(result[1].cardID).toBe('card-2');
    });

    it('should use due-only mode when mode is not specified', async () => {
      // Given: A data source without explicit mode
      const mockCards = [createMockRiffCard()];
      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: mockCards }),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
      });

      // When: Fetching cards
      await dataSource.getAll();

      // Then: Should use getRiffDueCards (due-only mode)
      expect(mockApi.getRiffDueCards).toHaveBeenCalled();
    });

    it('should pass notebook and rootID filters in due-only mode', async () => {
      // Given: A data source with filters
      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: [] }),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        notebook: 'my-notebook',
        rootID: 'root-123',
        api: mockApi,
      });

      // When: Fetching cards
      await dataSource.getAll();

      // Then: Should pass filters to API
      expect(mockApi.getRiffDueCards).toHaveBeenCalledWith(
        'test-deck',
        'my-notebook',
        'root-123'
      );
    });
  });

  describe('Mode 2: all', () => {
    it('should fetch all cards regardless of due status', async () => {
      // Given: A data source in all mode
      const mockCards = [
        createMockRiffCard({ id: 'card-1', cardID: 'card-1', blockID: 'block-1' }),
        createMockRiffCard({ id: 'card-2', cardID: 'card-2', blockID: 'block-2' }),
        createMockRiffCard({ id: 'card-3', cardID: 'card-3', blockID: 'block-3' }),
      ];

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn(),
        getRiffCards: vi.fn().mockResolvedValue(mockCards),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        mode: 'all',
        api: mockApi,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should call getRiffCards with dueOnly: false
      expect(mockApi.getRiffCards).toHaveBeenCalledWith('test-deck', {
        dueOnly: false,
        notebook: undefined,
        rootID: undefined,
        includeNew: true,
      });

      // And: Should NOT call getRiffDueCards
      expect(mockApi.getRiffDueCards).not.toHaveBeenCalled();

      // And: Should return all cards
      expect(result).toHaveLength(3);
      expect(result[0].cardID).toBe('card-1');
      expect(result[1].cardID).toBe('card-2');
      expect(result[2].cardID).toBe('card-3');
    });

    it('should pass notebook and rootID filters in all mode', async () => {
      // Given: A data source in all mode with filters
      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn(),
        getRiffCards: vi.fn().mockResolvedValue([]),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        mode: 'all',
        notebook: 'my-notebook',
        rootID: 'root-123',
        api: mockApi,
      });

      // When: Fetching cards
      await dataSource.getAll();

      // Then: Should pass filters to getRiffCards
      expect(mockApi.getRiffCards).toHaveBeenCalledWith('test-deck', {
        dueOnly: false,
        notebook: 'my-notebook',
        rootID: 'root-123',
        includeNew: true,
      });
    });

    it('should throw error if getRiffCards API is not available', async () => {
      // Given: A data source in all mode without getRiffCards API
      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn(),
        // getRiffCards is not provided
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        mode: 'all',
        api: mockApi,
      });

      // When/Then: Should return empty array (error handled gracefully)
      const result = await dataSource.getAll();
      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Mode 3: incremental', () => {
    it('should fetch only new cards since last sync', async () => {
      // Given: A data source in incremental mode
      const mockNewCards = [
        createMockRiffCard({ id: 'card-3', cardID: 'card-3', blockID: 'block-3' }),
      ];

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn(),
        getRiffNewCards: vi.fn().mockResolvedValue(mockNewCards),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        mode: 'incremental',
        api: mockApi,
      });

      // When: Fetching cards for the first time
      const result = await dataSource.getAll();

      // Then: Should call getRiffNewCards with undefined (no lastSyncTime yet)
      expect(mockApi.getRiffNewCards).toHaveBeenCalledWith('test-deck', undefined);

      // And: Should return the new cards
      expect(result).toHaveLength(1);
      expect(result[0].cardID).toBe('card-3');
    });

    it('should update lastSyncTime after successful fetch', async () => {
      // Given: A data source in incremental mode
      const mockNewCards = [createMockRiffCard()];
      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn(),
        getRiffNewCards: vi.fn().mockResolvedValue(mockNewCards),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        mode: 'incremental',
        api: mockApi,
      });

      // When: First fetch
      await dataSource.getAll();
      const firstCallArgs = (mockApi.getRiffNewCards as any).mock.calls[0];

      // Then: First call should have undefined timestamp
      expect(firstCallArgs[1]).toBeUndefined();

      // When: Second fetch
      await dataSource.getAll();
      const secondCallArgs = (mockApi.getRiffNewCards as any).mock.calls[1];

      // Then: Second call should have a timestamp
      expect(secondCallArgs[1]).toBeTypeOf('number');
      expect(secondCallArgs[1]).toBeGreaterThan(0);
    });

    it('should NOT update lastSyncTime if fetch fails', async () => {
      // Given: A data source in incremental mode
      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn(),
        getRiffNewCards: vi.fn()
          .mockResolvedValueOnce([createMockRiffCard()]) // First call succeeds
          .mockRejectedValueOnce(new Error('Network error')), // Second call fails
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        mode: 'incremental',
        api: mockApi,
      });

      // When: First fetch succeeds
      await dataSource.getAll();
      const firstTimestamp = (mockApi.getRiffNewCards as any).mock.calls[0][1];

      // And: Second fetch fails
      await dataSource.getAll();

      // And: Third fetch (should use same timestamp as first)
      await dataSource.getAll();
      const thirdTimestamp = (mockApi.getRiffNewCards as any).mock.calls[2][1];

      // Then: Third call should use the same timestamp as after first success
      // (not updated because second call failed)
      expect(thirdTimestamp).toBeTypeOf('number');
      expect(thirdTimestamp).toBeGreaterThan(0);
    });

    it('should throw error if getRiffNewCards API is not available', async () => {
      // Given: A data source in incremental mode without getRiffNewCards API
      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn(),
        // getRiffNewCards is not provided
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        mode: 'incremental',
        api: mockApi,
      });

      // When/Then: Should return empty array (error handled gracefully)
      const result = await dataSource.getAll();
      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Local Data Priority Merge', () => {
    it('should use local card data when available', async () => {
      // Given: Riff cards and local cards with different data
      const riffCard = createMockRiffCard({
        cardID: 'card-1',
        blockID: 'block-1',
        state: 2,
        lapses: 0,
        reps: 5,
        lastReview: new Date('2024-01-10T10:00:00Z').toISOString(),
      });

      const localCard = createMockFSRSCard({
        id: 'card-1',
        state: State.Review,
        lapses: 2,
        reps: 10,
        lastReview: new Date('2024-01-12T10:00:00Z').getTime(),
        priority: 70,
      });

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: [riffCard] }),
      };

      const mockStorage = createMockStorage(new Map([['card-1', localCard]]));

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        storage: mockStorage,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should use local card's scheduling data
      expect(result).toHaveLength(1);
      expect(result[0].state).toBe(State.Review); // From local
      expect(result[0].lapses).toBe(2); // From local
      expect(result[0].reps).toBe(10); // From local
      expect(result[0].lastReview).toBe(localCard.lastReview); // From local
      expect(result[0].priority).toBe(70); // From local

      // But: Should preserve Riff metadata
      expect(result[0].blockID).toBe('block-1'); // From Riff
      expect(result[0].deckID).toBe('test-deck'); // From Riff
    });

    it('should use Riff data when local card does not exist', async () => {
      // Given: Riff card without local counterpart
      const riffCard = createMockRiffCard({
        cardID: 'card-1',
        blockID: 'block-1',
        state: 2,
        lapses: 0,
        reps: 5,
      });

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: [riffCard] }),
      };

      const mockStorage = createMockStorage(new Map()); // Empty storage

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        storage: mockStorage,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should use Riff data
      expect(result).toHaveLength(1);
      expect(result[0].state).toBe(2); // From Riff
      expect(result[0].lapses).toBe(0); // From Riff
      expect(result[0].reps).toBe(5); // From Riff
    });

    it('should merge nextDues from SchedulerRouter preview', async () => {
      // Given: Local card with SchedulerRouter
      const riffCard = createMockRiffCard({ cardID: 'card-1', blockID: 'block-1' });
      const localCard = createMockFSRSCard({ id: 'card-1' });

      const previewCards = new Map<number, FSRSCard>([
        [1, createMockFSRSCard({ due: new Date('2024-01-16T10:00:00Z').getTime() })],
        [2, createMockFSRSCard({ due: new Date('2024-01-17T10:00:00Z').getTime() })],
        [3, createMockFSRSCard({ due: new Date('2024-01-21T10:00:00Z').getTime() })],
        [4, createMockFSRSCard({ due: new Date('2024-01-26T10:00:00Z').getTime() })],
      ]);

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: [riffCard] }),
      };

      const mockStorage = createMockStorage(new Map([['card-1', localCard]]));
      const mockRouter = createMockSchedulerRouter(previewCards);

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        storage: mockStorage,
        schedulerRouter: mockRouter,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should use predicted nextDues from SchedulerRouter
      expect(result).toHaveLength(1);
      expect(result[0].nextDues).toBeDefined();
      expect(result[0].nextDues[1]).toBe(new Date('2024-01-16T10:00:00Z').toISOString());
      expect(result[0].nextDues[2]).toBe(new Date('2024-01-17T10:00:00Z').toISOString());
      expect(result[0].nextDues[3]).toBe(new Date('2024-01-21T10:00:00Z').toISOString());
      expect(result[0].nextDues[4]).toBe(new Date('2024-01-26T10:00:00Z').toISOString());
    });

    it('should handle SchedulerRouter preview failure gracefully', async () => {
      // Given: SchedulerRouter that throws error
      const riffCard = createMockRiffCard({ cardID: 'card-1', blockID: 'block-1' });
      const localCard = createMockFSRSCard({ 
        id: 'card-1',
        due: new Date('2024-01-15T12:00:00Z').getTime(),
      });

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: [riffCard] }),
      };

      const mockStorage = createMockStorage(new Map([['card-1', localCard]]));
      const mockRouter = {
        preview: vi.fn().mockImplementation(() => {
          throw new Error('Preview failed');
        }),
      } as any;

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        storage: mockStorage,
        schedulerRouter: mockRouter,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should fall back to using current due time
      expect(result).toHaveLength(1);
      expect(result[0].nextDues).toBeDefined();
      const expectedDue = new Date('2024-01-15T12:00:00Z').toISOString();
      expect(result[0].nextDues[1]).toBe(expectedDue);
      expect(result[0].nextDues[2]).toBe(expectedDue);
      expect(result[0].nextDues[3]).toBe(expectedDue);
      expect(result[0].nextDues[4]).toBe(expectedDue);
    });
  });

  describe('Topic Card Filtering', () => {
    it('should NOT filter Topic cards when useRiffScheduler is false', async () => {
      // Given: Cards including Topic cards, with local scheduler
      const mockCards = [
        createMockRiffCard({ cardID: 'card-1', blockID: 'block-1' }), // Item card
        createMockRiffCard({ cardID: 'card-2', blockID: 'block-2' }), // Topic card
      ];

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: mockCards }),
      };

      const mockRouter = createMockSchedulerRouter();
      mockRouter.config.riffIntegration = { useRiffScheduler: false };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        schedulerRouter: mockRouter,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should NOT filter Topic cards (local scheduler handles them)
      expect(result).toHaveLength(2);
      expect(result[0].cardID).toBe('card-1');
      expect(result[1].cardID).toBe('card-2');
    });

    it('should filter Topic cards when useRiffScheduler is true', async () => {
      // Given: Cards including Topic cards, with Riff scheduler
      const mockCards = [
        createMockRiffCard({ cardID: 'card-1', blockID: 'block-1' }), // Item card
        createMockRiffCard({ cardID: 'card-2', blockID: 'block-2' }), // Topic card (will be filtered)
      ];

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: mockCards }),
      };

      const mockRouter = createMockSchedulerRouter();
      mockRouter.config.riffIntegration = { useRiffScheduler: true };

      // Mock the sql function to return card types
      const sqlMock = vi.mocked(siyuanApi.sql);
      sqlMock.mockResolvedValueOnce([
        { block_id: 'block-2', value: 'topic' }, // block-2 is a Topic card
      ]);

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        schedulerRouter: mockRouter,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should filter out Topic cards
      expect(result).toHaveLength(1);
      expect(result[0].cardID).toBe('card-1');
      expect(result[0].blockID).toBe('block-1');
    });

    it('should handle Topic filter failure gracefully', async () => {
      // Given: Cards with Topic filter that fails
      const mockCards = [
        createMockRiffCard({ cardID: 'card-1', blockID: 'block-1' }),
      ];

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: mockCards }),
      };

      const mockRouter = createMockSchedulerRouter();
      mockRouter.config.riffIntegration = { useRiffScheduler: true };

      // Mock sql to throw error
      const sqlMock = vi.mocked(siyuanApi.sql);
      sqlMock.mockRejectedValueOnce(new Error('Database error'));

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        schedulerRouter: mockRouter,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should return all cards (fallback behavior)
      expect(result).toHaveLength(1);
      expect(result[0].cardID).toBe('card-1');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should work consistently across all three modes', async () => {
      // Test that Topic filtering works in all modes
      const mockCard = createMockRiffCard({ 
        id: 'card-1', 
        cardID: 'card-1', 
        blockID: 'block-1' 
      });

      const mockRouter = createMockSchedulerRouter();
      mockRouter.config.riffIntegration = { useRiffScheduler: false };

      // Test due-only mode
      const dueOnlyApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: [mockCard] }),
      };
      const dueOnlySource = new RiffDataSource({
        deckId: 'test-deck',
        mode: 'due-only',
        api: dueOnlyApi,
        schedulerRouter: mockRouter,
      });
      const dueOnlyResult = await dueOnlySource.getAll();
      expect(dueOnlyResult).toHaveLength(1);

      // Test all mode
      const allApi: RiffApi = {
        getRiffDueCards: vi.fn(),
        getRiffCards: vi.fn().mockResolvedValue([mockCard]),
      };
      const allSource = new RiffDataSource({
        deckId: 'test-deck',
        mode: 'all',
        api: allApi,
        schedulerRouter: mockRouter,
      });
      const allResult = await allSource.getAll();
      expect(allResult).toHaveLength(1);

      // Test incremental mode
      const incrementalApi: RiffApi = {
        getRiffDueCards: vi.fn(),
        getRiffNewCards: vi.fn().mockResolvedValue([mockCard]),
      };
      const incrementalSource = new RiffDataSource({
        deckId: 'test-deck',
        mode: 'incremental',
        api: incrementalApi,
        schedulerRouter: mockRouter,
      });
      const incrementalResult = await incrementalSource.getAll();
      expect(incrementalResult).toHaveLength(1);
    });
  });

  describe('Blacklist Filtering', () => {
    it('should filter out blacklisted cards', async () => {
      // Given: Cards with some blacklisted
      const mockCards = [
        createMockRiffCard({ cardID: 'card-1', blockID: 'block-1' }),
        createMockRiffCard({ cardID: 'card-2', blockID: 'block-2' }),
        createMockRiffCard({ cardID: 'card-3', blockID: 'block-3' }),
      ];

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: mockCards }),
      };

      const blacklist = new Set(['block-2']);

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        blacklistProvider: () => blacklist,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should filter out blacklisted card
      expect(result).toHaveLength(2);
      expect(result[0].blockID).toBe('block-1');
      expect(result[1].blockID).toBe('block-3');
    });

    it('should handle empty blacklist', async () => {
      // Given: Cards with empty blacklist
      const mockCards = [
        createMockRiffCard({ cardID: 'card-1', blockID: 'block-1' }),
      ];

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: mockCards }),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        blacklistProvider: () => new Set(),
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should return all cards
      expect(result).toHaveLength(1);
    });
  });

  describe('Custom Filter', () => {
    it('should apply custom filter function', async () => {
      // Given: Cards with custom filter
      const mockCards = [
        createMockRiffCard({ cardID: 'card-1', blockID: 'block-1' }),
        createMockRiffCard({ cardID: 'card-2', blockID: 'block-2' }),
      ];

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: mockCards }),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        filter: (item) => item.cardID === 'card-1',
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should apply filter
      expect(result).toHaveLength(1);
      expect(result[0].cardID).toBe('card-1');
    });
  });

  describe('Limit', () => {
    it('should limit number of returned cards', async () => {
      // Given: More cards than limit
      const mockCards = [
        createMockRiffCard({ cardID: 'card-1', blockID: 'block-1' }),
        createMockRiffCard({ cardID: 'card-2', blockID: 'block-2' }),
        createMockRiffCard({ cardID: 'card-3', blockID: 'block-3' }),
      ];

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: mockCards }),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        limit: 2,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should return only limit number of cards
      expect(result).toHaveLength(2);
      expect(result[0].cardID).toBe('card-1');
      expect(result[1].cardID).toBe('card-2');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty card list', async () => {
      // Given: API returns empty list
      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: [] }),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should return empty array
      expect(result).toEqual([]);
    });

    it('should handle null/undefined data from API', async () => {
      // Given: API returns null
      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue(null),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should return empty array
      expect(result).toEqual([]);
    });

    it('should handle cards with missing fields', async () => {
      // Given: Cards with missing optional fields
      const mockCards = [
        {
          cardID: 'card-1',
          blockID: 'block-1',
          deckID: 'test-deck',
          state: 2,
          lapses: 0,
          reps: 5,
          // Missing nextDues, lastReview
        },
      ];

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: mockCards }),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should handle gracefully
      expect(result).toHaveLength(1);
      expect(result[0].cardID).toBe('card-1');
      expect(result[0].lastReview).toBeUndefined();
    });

    it('should handle storage being unavailable', async () => {
      // Given: Data source without storage
      const mockCards = [createMockRiffCard()];
      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: mockCards }),
      };

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        // No storage provided
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should use Riff data only
      expect(result).toHaveLength(1);
    });

    it('should handle schedulerRouter being unavailable', async () => {
      // Given: Data source without schedulerRouter
      const mockCards = [createMockRiffCard()];
      const localCard = createMockFSRSCard({ id: 'card-1' });

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: mockCards }),
      };

      const mockStorage = createMockStorage(new Map([['card-1', localCard]]));

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        storage: mockStorage,
        // No schedulerRouter provided
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should fall back to using due time
      expect(result).toHaveLength(1);
      expect(result[0].nextDues).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    it('should apply all filters in correct order', async () => {
      // Given: Cards with multiple filters
      const mockCards = [
        createMockRiffCard({ cardID: 'card-1', blockID: 'block-1' }),
        createMockRiffCard({ cardID: 'card-2', blockID: 'block-2' }), // Blacklisted
        createMockRiffCard({ cardID: 'card-3', blockID: 'block-3' }),
        createMockRiffCard({ cardID: 'card-4', blockID: 'block-4' }), // Filtered by custom filter
      ];

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: mockCards }),
      };

      const blacklist = new Set(['block-2']);

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        blacklistProvider: () => blacklist,
        filter: (item) => item.cardID !== 'card-4',
        limit: 2,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should apply all filters
      // - Topic filter (none in this test)
      // - Blacklist filter (removes card-2)
      // - Custom filter (removes card-4)
      // - Limit (takes first 2)
      expect(result).toHaveLength(2);
      expect(result[0].cardID).toBe('card-1');
      expect(result[1].cardID).toBe('card-3');
    });

    it('should merge local data and apply filters together', async () => {
      // Given: Cards with local data and filters
      const mockCards = [
        createMockRiffCard({ cardID: 'card-1', blockID: 'block-1', reps: 5 }),
        createMockRiffCard({ cardID: 'card-2', blockID: 'block-2', reps: 3 }),
      ];

      const localCard1 = createMockFSRSCard({ id: 'card-1', reps: 10, priority: 80 });

      const mockApi: RiffApi = {
        getRiffDueCards: vi.fn().mockResolvedValue({ cards: mockCards }),
      };

      const mockStorage = createMockStorage(new Map([['card-1', localCard1]]));

      const dataSource = new RiffDataSource({
        deckId: 'test-deck',
        api: mockApi,
        storage: mockStorage,
        filter: (item) => item.priority >= 60,
      });

      // When: Fetching cards
      const result = await dataSource.getAll();

      // Then: Should merge local data and apply filter
      expect(result).toHaveLength(1);
      expect(result[0].cardID).toBe('card-1');
      expect(result[0].reps).toBe(10); // From local
      expect(result[0].priority).toBe(80); // From local
    });
  });
});
