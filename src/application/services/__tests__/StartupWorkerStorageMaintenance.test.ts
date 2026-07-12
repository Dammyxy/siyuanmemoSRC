import { describe, expect, it, vi } from 'vitest';
import {
  STORAGE_DURABILITY_RECEIPT_VERSION,
  type BackendCardScheduleBatchUpdateRequest,
  type BackendStorageMaintenanceFrontier,
  type BackendStorageMaintenanceStatusRequest,
} from '../../../../packages/contracts/src/backend-rpc';
import { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import {
  runStartupWorkerStorageMaintenance,
  type StartupMaintenanceReceiptScope,
} from '../StartupWorkerStorageMaintenance';

const RECEIPT_SCOPE: StartupMaintenanceReceiptScope = {
  pluginInstallationId: 'plugin-A',
  identityEpoch: 'epoch-A',
  inputVersion: 'startup-maintenance-input-v1',
  frontierHash: 'frontier-current',
  externalInputDirtyGeneration: 0,
  pendingExternalMerge: false,
};

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
    expect(diagnostics.phaseClassifications).toEqual({
      scheduleNormalization: 'deferred-safe',
      orphanCardRepair: 'deferred-safe',
    });
  });

  it('restores the renderer projection snapshot when Worker schedule maintenance fails', async () => {
    const storage = createStorage([createCard('card-failure')], {
      migrateLegacyScheduler: true,
    });
    const before = storage.getAllCards();
    const saveOrphanBatch = vi.fn(async () => 0);
    const writeReceipt = vi.fn();

    await expect(runStartupWorkerStorageMaintenance({
      storage,
      executeScheduleBatch: async () => {
        throw new Error('BACKEND_UNAVAILABLE: maintenance writer offline');
      },
      writeReceipt,
      receiptScope: RECEIPT_SCOPE,
      saveOrphanBatch,
    })).rejects.toThrow('BACKEND_UNAVAILABLE: maintenance writer offline');

    expect(storage.getAllCards()).toEqual(before);
    expect(saveOrphanBatch).not.toHaveBeenCalled();
    expect(writeReceipt).not.toHaveBeenCalled();
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

  it('classifies schedule normalization as deferred-safe because initial read and write surfaces canonicalize scheduling', () => {
    const storage = new UnifiedStorageManager();
    storage.restoreStoreSnapshot({
      version: 2,
      xiuyuans: {},
      cards: {},
      cardDTOs: {
        malformed: {
          ...createCard('malformed'),
          schedulerType: 'fsrs-v5',
          nextDues: [1_777_804_699_943],
          meta: {
            nextDues: [1_777_804_699_943],
          },
        } as never,
      },
    });

    const [readCard] = storage.getAllCards();
    const persisted = storage.getStoreData().cardDTOs?.malformed as Record<string, unknown>;

    expect(readCard.schedulerType).toBe('fsrs-v6');
    expect((readCard as unknown as Record<string, unknown>).nextDues).toBeUndefined();
    expect(persisted.schedulerType).toBe('fsrs-v6');
    expect(persisted.nextDues).toBeUndefined();
    expect(persisted.meta).toBeUndefined();
  });

  it('classifies orphan repair by top-level or meta Xiuyuan identity and leaves top-level identities deferred-safe', async () => {
    const storage = createStorage([
      createCard('top-level-identity', {
        xiuyuanID: 'xy-top-level-identity',
        schedulerType: 'fsrs-v6',
        meta: {},
      }),
      createCard('true-orphan', {
        xiuyuanID: '',
        schedulerType: 'fsrs-v6',
        meta: {},
      }),
    ]);
    const repairedIds: string[] = [];

    const diagnostics = await runStartupWorkerStorageMaintenance({
      storage,
      executeScheduleBatch: async (request) => scheduleResult(request),
      saveOrphanBatch: async (_storage, cards) => {
        repairedIds.push(...cards.map((card) => card.id));
        return cards.length;
      },
    });

    expect(repairedIds).toEqual(['true-orphan']);
    expect(diagnostics.orphanRepair).toMatchObject({
      discoveredCardCount: 1,
      repairedCardCount: 1,
    });
    expect(diagnostics.phaseClassifications.orphanCardRepair).toBe('deferred-safe');
  });

  it('skips schedule and orphan full scans when completed receipts match receipt scope', async () => {
    const readReceipt = vi.fn(async (request: BackendStorageMaintenanceStatusRequest) => (
      completedReceipt(request)
    ));
    const executeScheduleBatch = vi.fn(async (request: BackendCardScheduleBatchUpdateRequest) => (
      scheduleResult(request)
    ));
    const saveOrphanBatch = vi.fn(async () => 0);

    const diagnostics = await runStartupWorkerStorageMaintenance({
      storage: {} as UnifiedStorageManager,
      executeScheduleBatch,
      readReceipt,
      receiptScope: RECEIPT_SCOPE,
      saveOrphanBatch,
    });

    expect(readReceipt).toHaveBeenCalledTimes(1);
    expect(readReceipt.mock.calls.map(([request]) => request.operationId)).toEqual([
      'startup-storage-maintenance-receipt-v2:startup-storage-maintenance:plugin-A:epoch-A:startup-maintenance-input-v1:frontier-current',
    ]);
    expect(executeScheduleBatch).not.toHaveBeenCalled();
    expect(saveOrphanBatch).not.toHaveBeenCalled();
    expect(diagnostics.schedule).toMatchObject({
      affectedCardCount: 0,
      completedBatches: 0,
      totalBatches: 0,
    });
    expect(diagnostics.orphanRepair).toMatchObject({
      discoveredCardCount: 0,
      repairedCardCount: 0,
      completedBatches: 0,
      totalBatches: 0,
    });
  });

  it('falls back to full scans when receipt evidence is missing', async () => {
    const storage = createStorage([
      createCard('needs-schedule'),
      createCard('needs-orphan', { xiuyuanID: '', meta: {} }),
    ], { migrateLegacyScheduler: true });
    const readReceipt = vi.fn(async (request: BackendStorageMaintenanceStatusRequest) => ({
      ...completedReceipt(request),
      required: true,
      status: 'pending' as const,
      completedAt: null,
    }));
    const executeScheduleBatch = vi.fn(async (request: BackendCardScheduleBatchUpdateRequest) => (
      scheduleResult(request)
    ));
    const saveOrphanBatch = vi.fn(async (_storage, cards) => cards.length);

    const diagnostics = await runStartupWorkerStorageMaintenance({
      storage,
      executeScheduleBatch,
      readReceipt,
      receiptScope: {
        ...RECEIPT_SCOPE,
        frontierHash: 'frontier-missing',
      },
      saveOrphanBatch,
    });

    expect(readReceipt).toHaveBeenCalledTimes(1);
    expect(executeScheduleBatch).toHaveBeenCalledTimes(1);
    expect(saveOrphanBatch).toHaveBeenCalledTimes(1);
    expect(diagnostics.schedule.affectedCardCount).toBe(2);
    expect(diagnostics.orphanRepair.discoveredCardCount).toBe(1);
  });

  it.each([
    ['malformed frontier', (request: BackendStorageMaintenanceStatusRequest) => ({
      ...completedReceipt(request),
      currentFrontier: null,
    })],
    ['ambiguous frontier', (request: BackendStorageMaintenanceStatusRequest) => ({
      ...completedReceipt(request),
      currentFrontier: {
        ...backendFrontier(RECEIPT_SCOPE),
        frontierHash: null,
      },
    })],
    ['wrong receipt version', (request: BackendStorageMaintenanceStatusRequest) => ({
      ...completedReceipt(request),
      operationId: 'startup-storage-maintenance-v1:schedule:plugin-A:epoch-A:startup-maintenance-input-v1:frontier-current',
      migrationId: 'startup-storage-maintenance-v1:schedule:plugin-A:epoch-A:startup-maintenance-input-v1:frontier-current',
    })],
    ['wrong epoch', (request: BackendStorageMaintenanceStatusRequest) => ({
      ...completedReceipt(request, {
        ...RECEIPT_SCOPE,
        identityEpoch: 'epoch-B',
      }),
    })],
    ['wrong installation', (request: BackendStorageMaintenanceStatusRequest) => ({
      ...completedReceipt(request, {
        ...RECEIPT_SCOPE,
        pluginInstallationId: 'plugin-B',
      }),
    })],
    ['changed frontier', (request: BackendStorageMaintenanceStatusRequest) => ({
      ...completedReceipt(request, {
        ...RECEIPT_SCOPE,
        frontierHash: 'frontier-other',
      }),
    })],
    ['phase failure', (request: BackendStorageMaintenanceStatusRequest) => ({
      ...completedReceipt(request),
      required: true,
      status: 'failed' as const,
      error: 'maintenance failed before receipt',
    })],
  ])('runs bounded full maintenance when receipt evidence is %s', async (_caseName, buildStatus) => {
    const storage = createStorage([
      createCard('invalid-receipt-card', { xiuyuanID: '', meta: {} }),
    ], { migrateLegacyScheduler: true });
    const readReceipt = vi.fn(async (request: BackendStorageMaintenanceStatusRequest) => buildStatus(request));
    const executeScheduleBatch = vi.fn(async (request: BackendCardScheduleBatchUpdateRequest) => (
      scheduleResult(request)
    ));
    const saveOrphanBatch = vi.fn(async () => 0);

    const diagnostics = await runStartupWorkerStorageMaintenance({
      storage,
      executeScheduleBatch,
      readReceipt,
      receiptScope: RECEIPT_SCOPE,
      saveOrphanBatch,
    });

    expect(readReceipt).toHaveBeenCalledTimes(1);
    expect(executeScheduleBatch).toHaveBeenCalledTimes(1);
    expect(saveOrphanBatch).toHaveBeenCalledTimes(1);
    expect(diagnostics.schedule.affectedCardCount).toBe(1);
  });

  it('does not fail startup when receipt persistence fails after maintenance succeeds', async () => {
    const storage = createStorage([createCard('receipt-write-failure-card')], {
      migrateLegacyScheduler: true,
    });
    const readReceipt = vi.fn(async (request: BackendStorageMaintenanceStatusRequest) => ({
      ...completedReceipt(request),
      required: true,
      status: 'pending' as const,
      completedAt: null,
    }));
    const writeReceipt = vi.fn(async () => {
      throw new Error('receipt write failed');
    });

    await expect(runStartupWorkerStorageMaintenance({
      storage,
      executeScheduleBatch: async (request) => scheduleResult(request),
      readReceipt,
      writeReceipt,
      receiptScope: RECEIPT_SCOPE,
      saveOrphanBatch: async () => 0,
    })).resolves.toMatchObject({
      schedule: {
        affectedCardCount: 1,
      },
    });
    expect(writeReceipt).toHaveBeenCalledTimes(1);
  });

  it('updates receipts after successful maintenance scans', async () => {
    const storage = createStorage([createCard('clean-card', { schedulerType: 'fsrs-v6' })]);
    const readReceipt = vi.fn(async (request: BackendStorageMaintenanceStatusRequest) => ({
      ...completedReceipt(request),
      required: true,
      status: 'pending' as const,
      completedAt: null,
      currentFrontier: backendFrontier({
        ...RECEIPT_SCOPE,
        frontierHash: 'frontier-clean',
      }),
    }));
    const writeReceipt = vi.fn(async (request) => ({
      operationId: request.operationId,
      migrationId: request.migrationId,
      status: 'completed' as const,
      completedBatches: 1,
      totalBatches: 1,
      lastMutationId: `maintenance:${request.operationId}:batch:0`,
      completedAt: 1_777_804_699_944,
      error: null,
    }));

    await runStartupWorkerStorageMaintenance({
      storage,
      executeScheduleBatch: async (request) => scheduleResult(request),
      readReceipt,
      writeReceipt,
      receiptScope: {
        ...RECEIPT_SCOPE,
        frontierHash: 'frontier-clean',
      },
      saveOrphanBatch: async () => 0,
    });

    expect(readReceipt).toHaveBeenCalledTimes(2);
    expect(writeReceipt).toHaveBeenCalledTimes(1);
    expect(writeReceipt.mock.calls.map(([request]) => request.operationId)).toEqual([
      'startup-storage-maintenance-receipt-v2:startup-storage-maintenance:plugin-A:epoch-A:startup-maintenance-input-v1:frontier-clean',
    ]);
    expect(writeReceipt.mock.calls[0][0]).toMatchObject({
      batchIndex: 0,
      totalBatches: 1,
      batch: {
        kind: 'startup-maintenance-receipt',
        receiptVersion: 'startup-storage-maintenance-receipt-v2',
        maintenanceKind: 'startup-storage-maintenance',
        preSuccessFrontier: backendFrontier({
          ...RECEIPT_SCOPE,
          frontierHash: 'frontier-clean',
        }),
        postSuccessFrontier: backendFrontier({
          ...RECEIPT_SCOPE,
          frontierHash: 'frontier-clean',
        }),
      },
    });
  });

  it('writes the receipt against the post-success frontier when maintenance changes it', async () => {
    const storage = createStorage([createCard('changed-frontier-card')], {
      migrateLegacyScheduler: true,
    });
    const preScope = {
      ...RECEIPT_SCOPE,
      frontierHash: 'frontier-before-maintenance',
    };
    const postScope = {
      ...RECEIPT_SCOPE,
      frontierHash: 'frontier-after-maintenance',
    };
    let statusReadCount = 0;
    const readReceipt = vi.fn(async (request: BackendStorageMaintenanceStatusRequest) => {
      const scope = statusReadCount === 0 ? preScope : postScope;
      statusReadCount += 1;
      return {
        ...completedReceipt(request, scope),
        required: true,
        status: 'pending' as const,
        completedAt: null,
      };
    });
    const writeReceipt = vi.fn(async (request) => ({
      operationId: request.operationId,
      migrationId: request.migrationId,
      status: 'completed' as const,
      completedBatches: 1,
      totalBatches: 1,
      lastMutationId: `maintenance:${request.operationId}:batch:0`,
      completedAt: 1_777_804_699_944,
      error: null,
    }));

    await runStartupWorkerStorageMaintenance({
      storage,
      executeScheduleBatch: async (request) => scheduleResult(request),
      readReceipt,
      writeReceipt,
      receiptScope: preScope,
      saveOrphanBatch: async () => 0,
    });

    expect(writeReceipt).toHaveBeenCalledTimes(1);
    expect(writeReceipt.mock.calls[0][0]).toMatchObject({
      operationId: 'startup-storage-maintenance-receipt-v2:startup-storage-maintenance:plugin-A:epoch-A:startup-maintenance-input-v1:frontier-after-maintenance',
      batch: {
        kind: 'startup-maintenance-receipt',
        preSuccessFrontier: backendFrontier(preScope),
        postSuccessFrontier: backendFrontier(postScope),
      },
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

function completedReceipt(
  request: BackendStorageMaintenanceStatusRequest,
  scope: StartupMaintenanceReceiptScope = RECEIPT_SCOPE,
) {
  return {
    operationId: request.operationId,
    migrationId: request.migrationId,
    required: false,
    status: 'completed' as const,
    completedBatches: 1,
    totalBatches: 1,
    lastMutationId: `maintenance:${request.operationId}:batch:0`,
    completedAt: 1_777_804_699_943,
    error: null,
    currentFrontier: backendFrontier(scope),
  };
}

function backendFrontier(scope: StartupMaintenanceReceiptScope): BackendStorageMaintenanceFrontier {
  return {
    ...scope,
    recoveryStatus: null,
    journalSequenceFrontier: null,
    truthCoverageFrontier: null,
    externalInputDirtyGeneration: scope.externalInputDirtyGeneration,
    pendingExternalMerge: scope.pendingExternalMerge,
  };
}
