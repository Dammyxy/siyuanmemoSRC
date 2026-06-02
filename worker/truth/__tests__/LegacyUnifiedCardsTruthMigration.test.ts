import { encode } from '@msgpack/msgpack';
import { describe, expect, it, vi } from 'vitest';
import {
  LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH,
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
} from '../../../packages/contracts/src/backend-rpc';
import { CardState, CardType } from '@/types/card';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthSegmentFileStore,
} from '../MessagePackTruthSegmentStore';
import {
  migrateLegacyUnifiedCardsToCardMemoryTruth,
  type LegacyUnifiedCardsTruthMigrationFileStore,
} from '../LegacyUnifiedCardsTruthMigration';
import {
  LEGACY_SPLIT_CARDS_SOURCE_PATH,
  LEGACY_SPLIT_XIUYUAN_SOURCE_PATH,
  LEGACY_UNIFIED_CARDS_SOURCE_PATH,
} from '../LegacyUnifiedCardsSource';
import type { LegacyUnifiedCardsMigrationReceipt } from '../LegacyUnifiedCardsMigrationReceipt';

class MemoryMigrationFileStore implements MessagePackTruthSegmentFileStore, LegacyUnifiedCardsTruthMigrationFileStore {
  readonly jsonFiles = new Map<string, unknown>();
  readonly binaryFiles = new Map<string, Uint8Array>();
  readonly operations: Array<{ type: 'read-binary' | 'write-binary' | 'read-json' | 'write-json'; path: string }> = [];

  async readJSON<T>(fileName: string): Promise<T | null> {
    this.operations.push({ type: 'read-json', path: fileName });
    return (this.jsonFiles.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.operations.push({ type: 'write-json', path: fileName });
    this.jsonFiles.set(fileName, structuredClone(data));
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    this.operations.push({ type: 'read-binary', path: fileName });
    const bytes = this.binaryFiles.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.operations.push({ type: 'write-binary', path: fileName });
    this.binaryFiles.set(fileName, new Uint8Array(bytes));
  }

  async listFiles(prefix: string): Promise<string[]> {
    return [
      ...Array.from(this.jsonFiles.keys()),
      ...Array.from(this.binaryFiles.keys()),
    ].filter((path) => path.startsWith(prefix));
  }
}

function createCardMemoryTruthStore(fileStore: MemoryMigrationFileStore) {
  return createMessagePackTruthSegmentStore({
    fileStore,
    family: 'card-memory-facts',
    deviceId: 'device-A',
    generationId: 'card-memory-facts-v1',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    maxSegmentBytes: 4096,
  });
}

describe('LegacyUnifiedCardsTruthMigration', () => {
  it('migrates no-truth unified-cards snapshot to card-memory-facts truth and completed receipt', async () => {
    const fileStore = new MemoryMigrationFileStore();
    const card = {
      id: 'card-active-a',
      xiuyuanID: 'xy-active-a',
      blockId: 'block-active-a',
      due: 1_700_086_400_000,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: CardState.New,
      lastReview: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      priority: 42,
      type: CardType.Item,
      tags: ['legacy', 'snapshot'],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_010_000,
      schedulerType: 'fsrs-v6',
      meta: {
        faceKey: { ruleId: 'basic-front', faceIndex: 0 },
        sourceHash: 'legacy-source-hash-a',
      },
    };
    fileStore.binaryFiles.set(LEGACY_UNIFIED_CARDS_SOURCE_PATH, encode({
      version: 2,
      xiuyuans: {},
      cards: {
        [card.id]: card,
      },
      cardDTOs: {},
      deletedCardDTOs: {
        'card-deleted-a': {
          deletedAt: 1_700_000_020_000,
          deletedBy: 'device-old',
        },
      },
      deletedXiuyuans: {},
      riffBlacklist: [],
      riffSyncState: {},
    }));
    const truthStore = createCardMemoryTruthStore(fileStore);

    const result = await migrateLegacyUnifiedCardsToCardMemoryTruth({
      sourceFileStore: fileStore,
      receiptFileStore: fileStore,
      truthStore,
      truthExists: false,
      localDeviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      now: () => 1_700_000_030_000,
    });

    expect(result).toMatchObject({
      status: 'migrated',
      counts: {
        activeCards: 1,
        tombstones: 1,
        sourceBindings: 1,
        reviewEvents: 0,
      },
      recordsWritten: 3,
    });
    expect(fileStore.operations.find((operation) => operation.type === 'read-binary')).toEqual({
      type: 'read-binary',
      path: LEGACY_UNIFIED_CARDS_SOURCE_PATH,
    });
    const replay = await truthStore.replayRecords();
    expect(replay.records.map((record) => record.type).sort()).toEqual([
      'card-memory.snapshot-imported',
      'card-memory.tombstone-imported',
      'source-binding.snapshot-imported',
    ]);
    expect(replay.records.map((record) => record.type)).not.toContain('card-memory.created.v1');
    const snapshotRecord = replay.records.find((record) => record.type === 'card-memory.snapshot-imported');
    const bindingRecord = replay.records.find((record) => record.type === 'source-binding.snapshot-imported');
    const tombstoneRecord = replay.records.find((record) => record.type === 'card-memory.tombstone-imported');
    expect(snapshotRecord).toMatchObject({
      family: 'card-memory-facts',
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      source: {
        cardId: 'card-active-a',
        blockId: 'block-active-a',
        xiuyuanId: 'xy-active-a',
      },
      memory: {
        schedulerOwner: 'fsrs-v6',
        lineage: {
          type: CardType.Item,
          state: CardState.New,
          due: 1_700_086_400_000,
          priority: 42,
          tags: ['legacy', 'snapshot'],
        },
      },
    });
    expect(bindingRecord).toMatchObject({
      type: 'source-binding.snapshot-imported',
      source: {
        cardId: 'card-active-a',
        sourceBlockId: 'block-active-a',
        xiuyuanId: 'xy-active-a',
        sourceHash: 'legacy-source-hash-a',
      },
    });
    expect(tombstoneRecord).toMatchObject({
      type: 'card-memory.tombstone-imported',
      source: {
        cardId: 'card-deleted-a',
      },
      memory: {
        lineage: {
          deletedAt: 1_700_000_020_000,
          deletedBy: 'device-old',
        },
      },
    });
    for (const record of replay.records) {
      expect(record.idempotencyKey).toEqual(expect.stringContaining(result.source.sha256));
    }

    const receipt = fileStore.jsonFiles.get(LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH) as LegacyUnifiedCardsMigrationReceipt;
    expect(receipt).toMatchObject({
      status: 'completed',
      source: {
        file: LEGACY_UNIFIED_CARDS_SOURCE_PATH,
        sha256: result.source.sha256,
        byteLength: result.source.byteLength,
      },
      counts: result.counts,
      families: [{
        family: 'card-memory-facts',
        generationId: 'card-memory-facts-v1',
        recordCount: 3,
        segmentRefs: [expect.stringMatching(/^truth\/card-memory-facts\/card-memory-facts-v1\/device-device-A\/seg-/)],
      }],
    });
  });

  it('preserves unreviewed empty memory and repairs reviewed empty memory with diagnostics', async () => {
    const fileStore = new MemoryMigrationFileStore();
    fileStore.binaryFiles.set(LEGACY_UNIFIED_CARDS_SOURCE_PATH, encode({
      version: 2,
      cards: {
        'card-new-empty': {
          id: 'card-new-empty',
          xiuyuanID: 'xy-new-empty',
          blockId: 'block-new-empty',
          due: 1_700_086_400_000,
          reps: 0,
          lapses: 0,
          state: CardState.New,
          lastReview: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          type: CardType.Item,
          schedulerType: 'fsrs-v6',
        },
        'card-review-empty': {
          id: 'card-review-empty',
          xiuyuanID: 'xy-review-empty',
          blockId: 'block-review-empty',
          due: 1_700_172_800_000,
          stability: 0,
          difficulty: 0,
          reps: 3,
          lapses: 1,
          state: CardState.Review,
          lastReview: 1_700_000_000_000,
          elapsedDays: 2,
          scheduledDays: 2,
          type: CardType.Item,
          schedulerType: 'fsrs-v6',
        },
      },
      cardDTOs: {},
      deletedCardDTOs: {},
    }));
    const truthStore = createCardMemoryTruthStore(fileStore);

    const result = await migrateLegacyUnifiedCardsToCardMemoryTruth({
      sourceFileStore: fileStore,
      receiptFileStore: fileStore,
      truthStore,
      truthExists: false,
      localDeviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      now: () => 1_700_259_200_000,
    });

    const replay = await truthStore.replayRecords();
    const snapshots = replay.records.filter((record) => record.type === 'card-memory.snapshot-imported');
    const newSnapshot = snapshots.find((record) => record.source.cardId === 'card-new-empty');
    const reviewedSnapshot = snapshots.find((record) => record.source.cardId === 'card-review-empty');
    expect(newSnapshot).toMatchObject({
      memory: {
        lineage: {
          state: CardState.New,
          stability: 0,
          difficulty: 0,
        },
      },
    });
    expect(reviewedSnapshot).toMatchObject({
      memory: {
        lineage: {
          state: CardState.Review,
          stability: 1.2931,
          difficulty: 5.11217071,
        },
      },
    });
    expect(result.receipt.diagnostics).toEqual([
      expect.objectContaining({
        kind: 'repaired-scheduling-memory',
        severity: 'warning',
        details: expect.objectContaining({
          cardId: 'card-review-empty',
          state: CardState.Review,
          originalStability: 0,
          originalDifficulty: 0,
          repairedStability: 1.2931,
          repairedDifficulty: 5.11217071,
          reason: 'reviewed-empty-memory',
        }),
      }),
    ]);
  });

  it('reports split legacy source diagnostics only when unified-cards is absent', async () => {
    const fileStore = new MemoryMigrationFileStore();
    fileStore.binaryFiles.set(LEGACY_SPLIT_CARDS_SOURCE_PATH, new Uint8Array([1, 2, 3]));
    fileStore.binaryFiles.set(LEGACY_SPLIT_XIUYUAN_SOURCE_PATH, new Uint8Array([4, 5]));
    const truthStore = createCardMemoryTruthStore(fileStore);

    const result = await migrateLegacyUnifiedCardsToCardMemoryTruth({
      sourceFileStore: fileStore,
      receiptFileStore: fileStore,
      truthStore,
      truthExists: false,
      localDeviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      now: () => 1_700_259_200_000,
    });

    expect(result.status).toBe('source-absent');
    if (result.status !== 'source-absent') {
      throw new Error(`expected source-absent, got ${result.status}`);
    }
    expect(fileStore.operations).toEqual([
      { type: 'read-binary', path: LEGACY_UNIFIED_CARDS_SOURCE_PATH },
      { type: 'read-binary', path: LEGACY_SPLIT_CARDS_SOURCE_PATH },
      { type: 'read-binary', path: LEGACY_SPLIT_XIUYUAN_SOURCE_PATH },
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        kind: 'legacy-split-source-fallback',
        severity: 'info',
        details: expect.objectContaining({
          sourceFile: LEGACY_SPLIT_CARDS_SOURCE_PATH,
          byteLength: 3,
          reason: 'unified-source-absent',
        }),
      }),
      expect.objectContaining({
        kind: 'legacy-split-source-fallback',
        severity: 'info',
        details: expect.objectContaining({
          sourceFile: LEGACY_SPLIT_XIUYUAN_SOURCE_PATH,
          byteLength: 2,
          reason: 'unified-source-absent',
        }),
      }),
    ]);
    expect(fileStore.operations.some((operation) => operation.type === 'write-binary' || operation.type === 'write-json')).toBe(false);
  });

  it('fails closed without a completed receipt when card-memory truth commit fails', async () => {
    const fileStore = new MemoryMigrationFileStore();
    fileStore.binaryFiles.set(LEGACY_UNIFIED_CARDS_SOURCE_PATH, encode({
      version: 2,
      cards: {
        'card-active-a': {
          id: 'card-active-a',
          blockId: 'block-active-a',
          state: CardState.New,
          reps: 0,
          stability: 0,
          difficulty: 0,
          schedulerType: 'fsrs-v6',
        },
      },
      cardDTOs: {},
      deletedCardDTOs: {},
    }));
    const truthStore = createCardMemoryTruthStore(fileStore);
    truthStore.appendRecords = vi.fn(async () => {
      throw new Error('segment manifest commit failed');
    });

    await expect(migrateLegacyUnifiedCardsToCardMemoryTruth({
      sourceFileStore: fileStore,
      receiptFileStore: fileStore,
      truthStore,
      truthExists: false,
      localDeviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      now: () => 1_700_259_200_000,
    })).rejects.toMatchObject({
      code: 'LEGACY_MIGRATION_FAILED',
    });
    expect(fileStore.jsonFiles.has(LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH)).toBe(false);
    expect(fileStore.operations.some((operation) => operation.type === 'write-json')).toBe(false);
  });
});
