import { describe, expect, it, vi } from 'vitest';
import {
  STORAGE_DURABILITY_RECEIPT_VERSION,
  type BackendCardScheduleBatchUpdateRequest,
} from '../../../../packages/contracts/src/backend-rpc';
import { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { runStartupWorkerStorageMaintenance } from '../StartupWorkerStorageMaintenance';

describe('StartupWorkerStorageMaintenance', () => {
  it('runs schedule normalization in bounded batches with stable mutation ids', async () => {
    const storage = createStorage(
      Array.from({ length: 129 }, (_, index) => createCard(`card-${String(index).padStart(3, '0')}`)),
      { migrateLegacyScheduler: true },
    );
    const executeScheduleBatch = vi.fn(async (request: BackendCardScheduleBatchUpdateRequest) => (
      scheduleResult(request)
    ));

    const diagnostics = await runStartupWorkerStorageMaintenance({
      storage,
      executeScheduleBatch,
      saveOrphanBatch: async () => 0,
    });

    expect(executeScheduleBatch).toHaveBeenCalledTimes(2);
    expect(executeScheduleBatch.mock.calls[0][0].cards).toHaveLength(128);
    expect(executeScheduleBatch.mock.calls[1][0].cards).toHaveLength(1);
    expect(executeScheduleBatch.mock.calls.map(([request]) => request.mutationId)).toEqual([
      'maintenance:startup-storage-maintenance-v1:schedule-normalization:0:128:card-000:card-127',
      'maintenance:startup-storage-maintenance-v1:schedule-normalization:1:1:card-128:card-128',
    ]);
    expect(diagnostics.schedule).toMatchObject({
      migratedLegacySchedulerCount: 129,
      affectedCardCount: 129,
      completedBatches: 2,
      totalBatches: 2,
    });
  });

  it('restores the renderer projection snapshot when Worker schedule maintenance fails', async () => {
    const storage = createStorage([createCard('card-failure')], {
      migrateLegacyScheduler: true,
    });
    const before = storage.getAllCards();
    const saveOrphanBatch = vi.fn(async () => 0);

    await expect(runStartupWorkerStorageMaintenance({
      storage,
      executeScheduleBatch: async () => {
        throw new Error('BACKEND_UNAVAILABLE: maintenance writer offline');
      },
      saveOrphanBatch,
    })).rejects.toThrow('BACKEND_UNAVAILABLE: maintenance writer offline');

    expect(storage.getAllCards()).toEqual(before);
    expect(saveOrphanBatch).not.toHaveBeenCalled();
  });

  it('runs orphan repair in bounded batches and reports progress totals', async () => {
    const storage = createStorage(
      Array.from({ length: 130 }, (_, index) => createCard(`orphan-${index}`, {
        xiuyuanID: '',
        meta: {},
      })),
    );
    const batchSizes: number[] = [];

    const diagnostics = await runStartupWorkerStorageMaintenance({
      storage,
      executeScheduleBatch: async (request) => scheduleResult(request),
      saveOrphanBatch: async (_storage, cards) => {
        batchSizes.push(cards.length);
        return cards.length;
      },
    });

    expect(batchSizes).toEqual([64, 64, 2]);
    expect(diagnostics.orphanRepair).toEqual({
      discoveredCardCount: 130,
      repairedCardCount: 130,
      completedBatches: 3,
      totalBatches: 3,
    });
  });
});

function createStorage(
  initialCards: FSRSCard[],
  options: { migrateLegacyScheduler?: boolean } = {},
): UnifiedStorageManager {
  let cards = structuredClone(initialCards);
  let snapshot = structuredClone(initialCards);
  return {
    getStoreData: () => ({ cards: Object.fromEntries(cards.map((card) => [card.id, card])) }),
    getAllCards: () => structuredClone(cards),
    migrateLegacyFSRSV5SchedulerType: () => {
      if (!options.migrateLegacyScheduler) {
        return 0;
      }
      cards = cards.map((card) => ({ ...card, schedulerType: 'fsrs-v6' }));
      return cards.length;
    },
    normalizeMalformedReviewScheduling: () => 0,
    restoreStoreSnapshot: () => {
      cards = structuredClone(snapshot);
    },
  } as unknown as UnifiedStorageManager;
}

function createCard(id: string, overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_777_804_699_943;
  return {
    id,
    xiuyuanID: `xy-${id}`,
    blockId: `block-${id}`,
    due: now,
    stability: 10,
    difficulty: 5,
    reps: 4,
    lapses: 0,
    state: CardState.Review,
    lastReview: now - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    schedulerType: 'fsrs-v5',
    meta: { xiuyuanID: `xy-${id}` },
    ...overrides,
  };
}

function scheduleResult(request: BackendCardScheduleBatchUpdateRequest) {
  const cardIds = request.cards.map((card) => (card as FSRSCard).id);
  return {
    updatedCardIds: cardIds,
    durabilityReceipt: {
      version: STORAGE_DURABILITY_RECEIPT_VERSION,
      mutationId: request.mutationId,
      family: 'card-schedule' as const,
      stage: 'journaled' as const,
      journalSequence: 1,
      affectedAggregates: cardIds.map((aggregateId) => ({
        family: 'card-schedule',
        aggregateId,
        causalBaseRevision: null,
      })),
      requiredTruthOutputs: [{
        family: 'card-schedule',
        kind: 'changeset' as const,
        aggregateIds: cardIds,
      }],
      truthGenerationId: null,
      retry: {
        attemptCount: 0,
        nextAttemptAt: null,
        lastError: null,
      },
      diagnosticCode: null,
      diagnosticMessage: null,
      updatedAt: 1_777_804_699_943,
    },
  };
}
