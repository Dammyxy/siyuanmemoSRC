/**
 * Unit tests for LocalStorageDataSource
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalStorageDataSource } from '../LocalStorageDataSource';
import type { StorageManager } from '../../../storage/manager';
import type { SchedulerRouter } from '../../../scheduler/SchedulerRouter';
import type { FSRSCard } from '@/types/card';

describe('LocalStorageDataSource', () => {
  let mockStorage: StorageManager;
  let mockSchedulerRouter: SchedulerRouter;

  beforeEach(() => {
    // Mock StorageManager
    mockStorage = {
      getAllCards: vi.fn(),
      getCard: vi.fn(),
      setCard: vi.fn(),
      removeCard: vi.fn(),
      saveCards: vi.fn(),
    } as any;

    // Mock SchedulerRouter
    mockSchedulerRouter = {
      preview: vi.fn(),
    } as any;
  });

  describe('constructor', () => {
    it('should create instance with required options', () => {
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
      });

      expect(dataSource).toBeDefined();
    });

    it('should create instance with all options', () => {
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        filter: (card) => card.due <= Date.now(),
        sort: (a, b) => a.due - b.due,
        schedulerRouter: mockSchedulerRouter,
      });

      expect(dataSource).toBeDefined();
    });
  });

  describe('getAll', () => {
    it('should return empty array when no cards in storage', async () => {
      vi.mocked(mockStorage.getAllCards).mockReturnValue([]);

      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
      });

      const result = await dataSource.getAll();

      expect(result).toEqual([]);
      expect(mockStorage.getAllCards).toHaveBeenCalledTimes(1);
    });

    it('should return all cards from storage', async () => {
      const mockCards: FSRSCard[] = [
        {
          id: 'card-1',
          blockId: 'block-1',
          due: Date.now(),
          stability: 1,
          difficulty: 5,
          elapsedDays: 0,
          scheduledDays: 1,
          reps: 0,
          lapses: 0,
          state: 0,
          lastReview: Date.now(),
          priority: 50,
        } as FSRSCard,
        {
          id: 'card-2',
          blockId: 'block-2',
          due: Date.now() + 86400000,
          stability: 2,
          difficulty: 6,
          elapsedDays: 1,
          scheduledDays: 2,
          reps: 1,
          lapses: 0,
          state: 1,
          lastReview: Date.now(),
          priority: 60,
        } as FSRSCard,
      ];

      vi.mocked(mockStorage.getAllCards).mockReturnValue(mockCards);

      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
      });

      const result = await dataSource.getAll();

      expect(result).toHaveLength(2);
      expect(result[0].cardID).toBe('card-1');
      expect(result[0].blockID).toBe('block-1');
      expect(result[0].priority).toBe(50);
      expect(result[1].cardID).toBe('card-2');
      expect(result[1].blockID).toBe('block-2');
      expect(result[1].priority).toBe(60);
    });

    it('should apply filter function', async () => {
      const now = Date.now();
      const mockCards: FSRSCard[] = [
        {
          id: 'card-1',
          blockId: 'block-1',
          due: now - 1000, // Due (past)
          state: 0,
        } as FSRSCard,
        {
          id: 'card-2',
          blockId: 'block-2',
          due: now + 86400000, // Not due (future)
          state: 0,
        } as FSRSCard,
      ];

      vi.mocked(mockStorage.getAllCards).mockReturnValue(mockCards);

      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        filter: (card) => card.due <= now,
      });

      const result = await dataSource.getAll();

      expect(result).toHaveLength(1);
      expect(result[0].cardID).toBe('card-1');
    });

    it('should apply sort function', async () => {
      const mockCards: FSRSCard[] = [
        {
          id: 'card-1',
          blockId: 'block-1',
          priority: 80,
        } as FSRSCard,
        {
          id: 'card-2',
          blockId: 'block-2',
          priority: 20,
        } as FSRSCard,
        {
          id: 'card-3',
          blockId: 'block-3',
          priority: 50,
        } as FSRSCard,
      ];

      vi.mocked(mockStorage.getAllCards).mockReturnValue(mockCards);

      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        sort: (a, b) => (a.priority ?? 50) - (b.priority ?? 50),
      });

      const result = await dataSource.getAll();

      expect(result).toHaveLength(3);
      expect(result[0].priority).toBe(20);
      expect(result[1].priority).toBe(50);
      expect(result[2].priority).toBe(80);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(mockStorage.getAllCards).mockImplementation(() => {
        throw new Error('Storage error');
      });

      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
      });

      const result = await dataSource.getAll();

      expect(result).toEqual([]);
    });
  });

  describe('convertToQueueItem', () => {
    it('should convert FSRSCard to QueueItem with default priority', async () => {
      const mockCard: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        deckID: 'deck-1',
        due: Date.now(),
        state: 0,
        lapses: 0,
        reps: 0,
        lastReview: Date.now(),
      } as FSRSCard;

      vi.mocked(mockStorage.getAllCards).mockReturnValue([mockCard]);

      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
      });

      const result = await dataSource.getAll();

      expect(result[0].cardID).toBe('card-1');
      expect(result[0].blockID).toBe('block-1');
      expect(result[0].deckID).toBe('deck-1');
      expect(result[0].priority).toBe(50); // Default priority
      expect(result[0].state).toBe(0);
      expect(result[0].lapses).toBe(0);
      expect(result[0].reps).toBe(0);
    });

    it('should use card priority if available', async () => {
      const mockCard: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        priority: 75,
      } as FSRSCard;

      vi.mocked(mockStorage.getAllCards).mockReturnValue([mockCard]);

      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
      });

      const result = await dataSource.getAll();

      expect(result[0].priority).toBe(75);
    });
  });

  describe('extractNextDues', () => {
    it('should extract nextDues using SchedulerRouter', async () => {
      const now = Date.now();
      const mockCard: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        due: now,
      } as FSRSCard;

      const mockPreviews = new Map([
        [1, { due: now + 60000 } as FSRSCard],      // 1 minute
        [2, { due: now + 600000 } as FSRSCard],     // 10 minutes
        [3, { due: now + 86400000 } as FSRSCard],   // 1 day
        [4, { due: now + 259200000 } as FSRSCard],  // 3 days
      ]);

      vi.mocked(mockSchedulerRouter.preview).mockReturnValue(mockPreviews);
      vi.mocked(mockStorage.getAllCards).mockReturnValue([mockCard]);

      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        schedulerRouter: mockSchedulerRouter,
      });

      const result = await dataSource.getAll();

      expect(result[0].nextDues).toBeDefined();
      expect(result[0].nextDues![1]).toBe(new Date(now + 60000).toISOString());
      expect(result[0].nextDues![2]).toBe(new Date(now + 600000).toISOString());
      expect(result[0].nextDues![3]).toBe(new Date(now + 86400000).toISOString());
      expect(result[0].nextDues![4]).toBe(new Date(now + 259200000).toISOString());
      expect(mockSchedulerRouter.preview).toHaveBeenCalledWith(mockCard);
    });

    it('should use current due time as fallback when SchedulerRouter fails', async () => {
      const now = Date.now();
      const mockCard: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        due: now,
      } as FSRSCard;

      vi.mocked(mockSchedulerRouter.preview).mockImplementation(() => {
        throw new Error('Preview failed');
      });
      vi.mocked(mockStorage.getAllCards).mockReturnValue([mockCard]);

      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        schedulerRouter: mockSchedulerRouter,
      });

      const result = await dataSource.getAll();

      expect(result[0].nextDues).toBeDefined();
      const dueISO = new Date(now).toISOString();
      expect(result[0].nextDues![1]).toBe(dueISO);
      expect(result[0].nextDues![2]).toBe(dueISO);
      expect(result[0].nextDues![3]).toBe(dueISO);
      expect(result[0].nextDues![4]).toBe(dueISO);
    });

    it('should use current due time when no SchedulerRouter provided', async () => {
      const now = Date.now();
      const mockCard: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        due: now,
      } as FSRSCard;

      vi.mocked(mockStorage.getAllCards).mockReturnValue([mockCard]);

      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
      });

      const result = await dataSource.getAll();

      expect(result[0].nextDues).toBeDefined();
      const dueISO = new Date(now).toISOString();
      expect(result[0].nextDues![1]).toBe(dueISO);
      expect(result[0].nextDues![2]).toBe(dueISO);
      expect(result[0].nextDues![3]).toBe(dueISO);
      expect(result[0].nextDues![4]).toBe(dueISO);
    });

    it('should return null when no due time available', async () => {
      const mockCard: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        // No due time
      } as FSRSCard;

      vi.mocked(mockStorage.getAllCards).mockReturnValue([mockCard]);

      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
      });

      const result = await dataSource.getAll();

      expect(result[0].nextDues).toBeNull();
    });
  });

  describe('add', () => {
    it('should log warning and return ok(0)', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
      });

      const result = await dataSource.add([
        {
          cardID: 'card-1',
          blockID: 'block-1',
          deckID: 'deck-1',
          priority: 50,
        },
      ]);

      expect(result.ok).toBe(true);
      expect(result.value).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        '[LocalStorageDataSource] Add not supported, use StorageManager directly'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('remove', () => {
    it('should log warning and return ok(0)', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
      });

      const result = await dataSource.remove([
        {
          cardID: 'card-1',
          blockID: 'block-1',
          deckID: 'deck-1',
          priority: 50,
        },
      ]);

      expect(result.ok).toBe(true);
      expect(result.value).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        '[LocalStorageDataSource] Remove not supported, use StorageManager directly'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Observer pattern', () => {
    it('should extend ObservableDataSource', () => {
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
      });

      expect(dataSource.addObserver).toBeDefined();
      expect(dataSource.removeObserver).toBeDefined();
    });

    it('should support observer registration', () => {
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
      });

      const observer = {
        onDataChanged: vi.fn(),
      };

      dataSource.addObserver(observer);
      // Observer is registered, but won't be notified since add/remove are no-ops
    });
  });

  describe('Performance', () => {
    it('should handle large number of cards efficiently', async () => {
      const mockCards: FSRSCard[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `card-${i}`,
        blockId: `block-${i}`,
        due: Date.now() + i * 1000,
        priority: i % 100,
        state: 0,
        lapses: 0,
        reps: 0,
      } as FSRSCard));

      vi.mocked(mockStorage.getAllCards).mockReturnValue(mockCards);

      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
      });

      const startTime = Date.now();
      const result = await dataSource.getAll();
      const duration = Date.now() - startTime;

      expect(result).toHaveLength(1000);
      expect(duration).toBeLessThan(100); // Should complete in < 100ms
    });
  });
});
