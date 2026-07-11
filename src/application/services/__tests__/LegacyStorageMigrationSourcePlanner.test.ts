import { describe, expect, it, vi } from 'vitest';
import type { UnifiedCardStore } from '@/core/storage/UnifiedStorageManager';
import type { IFileService } from '@/infrastructure/services/FileService';
import {
  INITIAL_STORAGE_IMPORT_MIGRATION_ID,
  LegacyStorageMigrationSourcePlanner,
  getLegacyStorageMigrationOperationDescriptors,
  runPendingLegacyStorageMigrations,
} from '../LegacyStorageMigrationSourcePlanner';

class MemoryLegacySourceFileService implements Pick<IFileService, 'readJSON' | 'readMsgpack'> {
  readonly json = new Map<string, unknown>();
  readonly msgpack = new Map<string, unknown>();

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.json.get(fileName) as T | undefined) ?? null;
  }

  async readMsgpack<T>(fileName: string): Promise<T | null> {
    return (this.msgpack.get(fileName) as T | undefined) ?? null;
  }
}

function createLegacyStore(cardCount: number): UnifiedCardStore & { riffBlacklist?: string[] } {
  const cards = Object.fromEntries(
    Array.from({ length: cardCount }, (_, index) => {
      const id = `card-${String(index).padStart(4, '0')}`;
      return [id, {
        id,
        blockId: `block-${id}`,
        xiuyuanID: `xy-${id}`,
        due: index,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        lastReview: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        priority: 50,
        type: 'item',
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: index,
        updatedAt: index,
        schedulerType: 'fsrs-v6',
      }];
    }),
  );
  return {
    version: 2,
    cards,
    cardDTOs: {},
    xiuyuans: {},
    deletedCardDTOs: {},
    deletedXiuyuans: {},
    riffBlacklist: [' block-b ', 'block-a', 'block-a'],
  } as unknown as UnifiedCardStore & { riffBlacklist?: string[] };
}

describe('LegacyStorageMigrationSourcePlanner', () => {
  it('plans stable bounded Worker batches without renderer SQL dependencies', async () => {
    const fileService = new MemoryLegacySourceFileService();
    fileService.msgpack.set(
      'queues.msgpack',
      Object.fromEntries(Array.from({ length: 130 }, (_, index) => [`queue-${index}`, { index }])),
    );
    fileService.json.set('review-logs/2026-07.json', {
      reviewLogs: Array.from({ length: 130 }, (_, index) => ({
        id: `review-${index}`,
        cardId: `card-${index}`,
        rating: 3,
        review: index,
      })),
    });
    fileService.json.set('arena/store.json', {
      version: 1,
      matches: [{ id: 'match-1' }],
      scores: [{ id: 'score-1' }],
      attributions: [{ cardId: 'card-1' }],
    });
    const planner = new LegacyStorageMigrationSourcePlanner(
      fileService,
      async () => createLegacyStore(260),
    );

    expect(getLegacyStorageMigrationOperationDescriptors().map((operation) => operation.migrationId)).toEqual([
      INITIAL_STORAGE_IMPORT_MIGRATION_ID,
      'native-riff-persistence-retirement-v1',
      'algorithm-card-state-production-v1',
      'algorithm-card-state-production-repair-v2',
      'neural-roam-route-state-v1',
    ]);
    const initial = await planner.planOperation(
      INITIAL_STORAGE_IMPORT_MIGRATION_ID,
      1_783_728_000_000,
    );
    expect(initial.backup).toMatchObject({
      fileName: 'migration-backups/unified-cards-initial-msgpack-json-import-v1.json',
    });
    expect(initial.batches[0]).toEqual({
      kind: 'legacy-storage-import-begin',
      appliedAt: 1_783_728_000_000,
    });
    expect(initial.batches.at(-1)).toMatchObject({
      kind: 'legacy-unified-finalize',
      version: 2,
    });

    for (const batch of initial.batches) {
      if (batch.kind === 'legacy-unified-records') {
        expect(batch.records.length).toBeLessThanOrEqual(128);
      }
      if (batch.kind === 'legacy-queue-records') {
        expect(batch.entries.length).toBeLessThanOrEqual(128);
      }
      if (batch.kind === 'legacy-review-records') {
        expect(batch.records.length).toBeLessThanOrEqual(128);
      }
      if (batch.kind === 'legacy-arena-records') {
        expect(batch.records.length).toBeLessThanOrEqual(128);
      }
    }

    const nativeRiff = await planner.planOperation(
      'native-riff-persistence-retirement-v1',
      1_783_728_000_000,
    );
    expect(nativeRiff.batches).toEqual([{
      kind: 'native-riff-retirement',
      blockIds: ['block-a', 'block-b'],
      appliedAt: 1_783_728_000_000,
      includeStoredBlacklist: true,
      dropLegacyTable: true,
    }]);
    const algorithm = await planner.planOperation(
      'algorithm-card-state-production-v1',
      1_783_728_000_000,
    );
    expect(algorithm.batches.map((batch) => batch.kind)).toEqual([
      'algorithm-card-state-backup',
      'algorithm-card-state-backfill',
    ]);
  });

  it('does not read legacy files after Worker migration markers are complete', async () => {
    const fileService = new MemoryLegacySourceFileService();
    const readJson = vi.spyOn(fileService, 'readJSON');
    const readMsgpack = vi.spyOn(fileService, 'readMsgpack');
    const legacyStoreLoader = vi.fn(async () => createLegacyStore(1));
    const executeBatch = vi.fn();
    const planner = new LegacyStorageMigrationSourcePlanner(
      fileService,
      legacyStoreLoader,
    );

    await runPendingLegacyStorageMigrations({
      planner,
      readStatus: async ({ operationId, migrationId }) => ({
        operationId,
        migrationId,
        required: false,
        status: 'completed',
        completedBatches: 0,
        totalBatches: null,
        lastMutationId: null,
        completedAt: 1_783_728_000_000,
        error: null,
      }),
      executeBatch,
      writeBackup: vi.fn(),
      now: () => 1_783_728_000_000,
    });

    expect(legacyStoreLoader).not.toHaveBeenCalled();
    expect(readJson).not.toHaveBeenCalled();
    expect(readMsgpack).not.toHaveBeenCalled();
    expect(executeBatch).not.toHaveBeenCalled();
  });

  it('retries a failed initial-import backup before resuming completed Worker progress', async () => {
    const fileService = new MemoryLegacySourceFileService();
    const planner = new LegacyStorageMigrationSourcePlanner(
      fileService,
      async () => createLegacyStore(1),
    );
    const initialStatus = {
      operationId: INITIAL_STORAGE_IMPORT_MIGRATION_ID,
      migrationId: INITIAL_STORAGE_IMPORT_MIGRATION_ID,
      required: true,
      status: 'failed' as const,
      completedBatches: 1,
      totalBatches: 4,
      lastMutationId: `maintenance:${INITIAL_STORAGE_IMPORT_MIGRATION_ID}:batch:0`,
      completedAt: null,
      error: 'backup write failed',
    };
    const readStatus = async ({ operationId, migrationId }: {
      operationId: string;
      migrationId: string;
    }) => operationId === INITIAL_STORAGE_IMPORT_MIGRATION_ID
      ? initialStatus
      : {
          operationId,
          migrationId,
          required: false,
          status: 'completed' as const,
          completedBatches: 0,
          totalBatches: null,
          lastMutationId: null,
          completedAt: 100,
          error: null,
        };
    const writeBackup = vi.fn()
      .mockRejectedValueOnce(new Error('backup write failed'))
      .mockResolvedValue(undefined);
    const executedBatchIndexes: number[] = [];
    const executeBatch = vi.fn(async (request: {
      operationId: string;
      migrationId: string;
      batchIndex: number;
      totalBatches: number;
    }) => {
      executedBatchIndexes.push(request.batchIndex);
      const completedBatches = request.batchIndex + 1;
      return {
        operationId: request.operationId,
        migrationId: request.migrationId,
        required: completedBatches < request.totalBatches,
        status: completedBatches === request.totalBatches ? 'completed' as const : 'running' as const,
        completedBatches,
        totalBatches: request.totalBatches,
        lastMutationId: `maintenance:${request.operationId}:batch:${request.batchIndex}`,
        completedAt: completedBatches === request.totalBatches ? 200 : null,
        error: null,
      };
    });

    await expect(runPendingLegacyStorageMigrations({
      planner,
      readStatus,
      executeBatch,
      writeBackup,
      now: () => 100,
    })).rejects.toThrow('backup write failed');
    expect(executeBatch).not.toHaveBeenCalled();

    await expect(runPendingLegacyStorageMigrations({
      planner,
      readStatus,
      executeBatch,
      writeBackup,
      now: () => 100,
    })).resolves.toMatchObject({
      requiredOperationIds: [INITIAL_STORAGE_IMPORT_MIGRATION_ID],
      appliedOperationIds: [INITIAL_STORAGE_IMPORT_MIGRATION_ID],
    });
    expect(executedBatchIndexes).toEqual([1, 2, 3]);
    expect(writeBackup).toHaveBeenCalledTimes(2);
  });
});
