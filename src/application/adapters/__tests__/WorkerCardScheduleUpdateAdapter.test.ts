import { describe, expect, it, vi } from 'vitest';
import {
  STORAGE_DURABILITY_RECEIPT_VERSION,
  type BackendCardScheduleBatchUpdateRequest,
} from '../../../../packages/contracts/src/backend-rpc';
import { WorkerCardScheduleUpdateAdapter } from '../WorkerCardScheduleUpdateAdapter';
import { CardState, CardType, type FSRSCard } from '@/types/card';

describe('WorkerCardScheduleUpdateAdapter', () => {
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
      schedulerType: 'fsrs-v6',
      ...overrides,
    };
  }

  it('deduplicates one scheduler command and accepts only Worker journal durability', async () => {
    const execute = vi.fn(async (request: BackendCardScheduleBatchUpdateRequest) => ({
      updatedCardIds: request.cards.map((card) => (card as FSRSCard).id),
      durabilityReceipt: {
        version: STORAGE_DURABILITY_RECEIPT_VERSION,
        mutationId: request.mutationId,
        family: 'card-schedule' as const,
        stage: 'journaled' as const,
        journalSequence: 9,
        affectedAggregates: request.cards.map((card) => ({
          family: 'card-schedule',
          aggregateId: (card as FSRSCard).id,
          causalBaseRevision: null,
        })),
        requiredTruthOutputs: [{
          family: 'card-schedule',
          kind: 'changeset' as const,
          aggregateIds: request.cards.map((card) => (card as FSRSCard).id),
        }],
        truthGenerationId: null,
        retry: {
          attemptCount: 0,
          nextAttemptAt: null,
          lastError: null,
        },
        diagnosticCode: null,
        diagnosticMessage: null,
        updatedAt: now,
      },
    }));
    const adapter = new WorkerCardScheduleUpdateAdapter(
      { execute },
      undefined,
      () => 'card-schedule:test-adapter-1',
    );
    const first = createCard('c1');
    const duplicateLastWriteWins = createCard('c1', { due: now + 1_000 });
    const second = createCard('c2', { due: now + 2_000 });

    await adapter.batchUpdateCardsWithoutEvents(
      [first, duplicateLastWriteWins, second],
      { schedulingWriteSource: 'manual-reschedule' },
    );

    expect(execute).toHaveBeenCalledWith({
      mutationId: 'card-schedule:test-adapter-1',
      schedulingWriteSource: 'manual-reschedule',
      cards: [duplicateLastWriteWins, second],
    });
  });

  it('propagates Worker unavailability without a renderer persistence fallback', async () => {
    const execute = vi.fn(async (_request: BackendCardScheduleBatchUpdateRequest) => {
      throw new Error('BACKEND_UNAVAILABLE: Card/Schedule writer offline');
    });
    const addReviewLogV2 = vi.fn();
    const adapter = new WorkerCardScheduleUpdateAdapter(
      { execute },
      { addReviewLogV2 },
      () => 'card-schedule:test-adapter-unavailable',
    );

    await expect(adapter.batchUpdateCardsWithoutEvents([
      createCard('c-unavailable'),
    ])).rejects.toThrow('BACKEND_UNAVAILABLE: Card/Schedule writer offline');

    expect(execute).toHaveBeenCalledTimes(1);
    expect(addReviewLogV2).not.toHaveBeenCalled();
  });
});
