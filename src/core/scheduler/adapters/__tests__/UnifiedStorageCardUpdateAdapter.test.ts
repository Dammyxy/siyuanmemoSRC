import { describe, expect, it, vi } from 'vitest';
import { UnifiedStorageCardUpdateAdapter } from '../UnifiedStorageCardUpdateAdapter';
import type { FSRSCard } from '@/types/card';
import { CardState, CardType } from '@/types/card';
import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import type { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite';
import { ok } from '@/types/result';

describe('UnifiedStorageCardUpdateAdapter', () => {
  const now = new Date('2026-02-01T08:00:00.000Z').getTime();

  function createCard(id: string, overrides: Partial<FSRSCard> = {}): FSRSCard {
    return {
      id,
      xiuyuanID: `x-${id}`,
      blockId: `b-${id}`,
      due: now,
      stability: 10,
      difficulty: 5,
      reps: 8,
      lapses: 0,
      state: CardState.Review,
      lastReview: now - 10 * 24 * 60 * 60 * 1000,
      elapsedDays: 10,
      scheduledDays: 10,
      priority: 50,
      type: CardType.Item,
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  it('writes scheduler batches through one storage batch update and one SQL persist', async () => {
    const batchUpdateCards = vi.fn(async () => ok(undefined));
    const updateCard = vi.fn();
    const storage = {
      runWriteTransaction: vi.fn(async (_label: string, operation: () => Promise<void>) => {
        await operation();
      }),
      batchUpdateCards,
      updateCard,
    } as unknown as UnifiedStorageManager;
    const sqlCards = {
      upsertCards: vi.fn(),
      persist: vi.fn(async () => undefined),
    } as unknown as SqlUnifiedStorageRepository;
    const adapter = new UnifiedStorageCardUpdateAdapter(storage, undefined, sqlCards);

    const first = createCard('c1', { due: now });
    const duplicateLastWriteWins = createCard('c1', { due: now + 1_000 });
    const second = createCard('c2', { due: now + 2_000 });

    await adapter.batchUpdateCardsWithoutEvents([first, duplicateLastWriteWins, second]);

    const expectedCards = [duplicateLastWriteWins, second];
    expect(batchUpdateCards).toHaveBeenCalledTimes(1);
    expect(batchUpdateCards).toHaveBeenCalledWith(expectedCards, {
      preferIncomingScheduling: true,
      suppressAutosave: true,
    });
    expect(updateCard).not.toHaveBeenCalled();
    expect(sqlCards.upsertCards).toHaveBeenCalledTimes(1);
    expect(sqlCards.upsertCards).toHaveBeenCalledWith(expectedCards);
    expect(sqlCards.persist).toHaveBeenCalledTimes(1);
  });
});
