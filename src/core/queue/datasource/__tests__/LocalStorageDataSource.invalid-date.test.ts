/**
 * Tests for LocalStorageDataSource handling of invalid date values
 * 
 * This test suite verifies that the data source correctly handles
 * invalid timestamps without throwing "Invalid time value" errors.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageDataSource } from '../LocalStorageDataSource';
import { StorageManager } from '../../../storage/manager';
import type { FSRSCard } from '@/types/card';

describe('LocalStorageDataSource - Invalid Date Handling', () => {
  let storage: StorageManager;
  let dataSource: LocalStorageDataSource;

  beforeEach(() => {
    storage = new StorageManager();
  });

  it('should handle cards with invalid due timestamps', async () => {
    // Create a card with an invalid due timestamp
    const invalidCard: FSRSCard = {
      id: 'test-card-1' as any,
      blockId: 'block-1' as any,
      due: NaN, // Invalid timestamp
      state: 1,
      lapses: 0,
      reps: 1,
      lastReview: Date.now(),
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 1,
      priority: 50,
    };

    storage.setCard(invalidCard);

    dataSource = new LocalStorageDataSource({
      storage,
    });

    // Should not throw an error
    const items = await dataSource.getAll();
    
    // Should return the card with null nextDues
    expect(items).toHaveLength(1);
    expect(items[0].nextDues).toBeNull();
  });

  it('should handle cards with Infinity due timestamps', async () => {
    const invalidCard: FSRSCard = {
      id: 'test-card-2' as any,
      blockId: 'block-2' as any,
      due: Infinity, // Invalid timestamp
      state: 1,
      lapses: 0,
      reps: 1,
      lastReview: Date.now(),
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 1,
      priority: 50,
    };

    storage.setCard(invalidCard);

    dataSource = new LocalStorageDataSource({
      storage,
    });

    // Should not throw an error
    const items = await dataSource.getAll();
    
    expect(items).toHaveLength(1);
    expect(items[0].nextDues).toBeNull();
  });

  it('should handle cards with negative Infinity due timestamps', async () => {
    const invalidCard: FSRSCard = {
      id: 'test-card-3' as any,
      blockId: 'block-3' as any,
      due: -Infinity, // Invalid timestamp
      state: 1,
      lapses: 0,
      reps: 1,
      lastReview: Date.now(),
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 1,
      priority: 50,
    };

    storage.setCard(invalidCard);

    dataSource = new LocalStorageDataSource({
      storage,
    });

    // Should not throw an error
    const items = await dataSource.getAll();
    
    expect(items).toHaveLength(1);
    expect(items[0].nextDues).toBeNull();
  });

  it('should handle cards with zero due timestamps', async () => {
    const zeroCard: FSRSCard = {
      id: 'test-card-4' as any,
      blockId: 'block-4' as any,
      due: 0, // Edge case: zero timestamp
      state: 1,
      lapses: 0,
      reps: 1,
      lastReview: Date.now(),
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 1,
      priority: 50,
    };

    storage.setCard(zeroCard);

    dataSource = new LocalStorageDataSource({
      storage,
    });

    // Should not throw an error
    const items = await dataSource.getAll();
    
    expect(items).toHaveLength(1);
    // Zero is treated as invalid, so nextDues should be null
    expect(items[0].nextDues).toBeNull();
  });

  it('should handle mixed valid and invalid cards', async () => {
    const validCard: FSRSCard = {
      id: 'valid-card' as any,
      blockId: 'block-valid' as any,
      due: Date.now() + 86400000, // Valid: tomorrow
      state: 1,
      lapses: 0,
      reps: 1,
      lastReview: Date.now(),
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 1,
      priority: 50,
    };

    const invalidCard: FSRSCard = {
      id: 'invalid-card' as any,
      blockId: 'block-invalid' as any,
      due: NaN, // Invalid
      state: 1,
      lapses: 0,
      reps: 1,
      lastReview: Date.now(),
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 1,
      priority: 50,
    };

    storage.setCard(validCard);
    storage.setCard(invalidCard);

    dataSource = new LocalStorageDataSource({
      storage,
    });

    // Should not throw an error
    const items = await dataSource.getAll();
    
    expect(items).toHaveLength(2);
    
    // Valid card should have nextDues
    const validItem = items.find(item => item.cardID === 'valid-card');
    expect(validItem?.nextDues).not.toBeNull();
    expect(validItem?.nextDues).toHaveProperty('1');
    
    // Invalid card should have null nextDues
    const invalidItem = items.find(item => item.cardID === 'invalid-card');
    expect(invalidItem?.nextDues).toBeNull();
  });

  it('should handle SchedulerRouter returning invalid preview timestamps', async () => {
    const card: FSRSCard = {
      id: 'test-card-5' as any,
      blockId: 'block-5' as any,
      due: Date.now() + 86400000, // Valid due date
      state: 1,
      lapses: 0,
      reps: 1,
      lastReview: Date.now(),
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 1,
      priority: 50,
    };

    storage.setCard(card);

    // Mock SchedulerRouter that returns invalid timestamps
    const mockSchedulerRouter = {
      preview: () => {
        return new Map([
          [1, { ...card, due: NaN }],      // Invalid
          [2, { ...card, due: Infinity }], // Invalid
          [3, { ...card, due: Date.now() + 86400000 }], // Valid
          [4, { ...card, due: Date.now() + 172800000 }], // Valid
        ]);
      },
    } as any;

    dataSource = new LocalStorageDataSource({
      storage,
      schedulerRouter: mockSchedulerRouter,
    });

    // Should not throw an error, should fall back to using card.due
    const items = await dataSource.getAll();
    
    expect(items).toHaveLength(1);
    expect(items[0].nextDues).not.toBeNull();
    // Should use the fallback strategy (card.due for all ratings)
    expect(items[0].nextDues).toHaveProperty('1');
    expect(items[0].nextDues).toHaveProperty('2');
    expect(items[0].nextDues).toHaveProperty('3');
    expect(items[0].nextDues).toHaveProperty('4');
  });
});
