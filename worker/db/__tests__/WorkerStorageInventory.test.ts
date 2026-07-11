import { describe, expect, it } from 'vitest';
import type { MessagePackTruthSegmentFileStore } from '../../truth/MessagePackTruthSegmentStore';
import { WorkerStorageInventory } from '../WorkerStorageInventory';

function createTruthFileStore(
  jsonEntries: Record<string, unknown>,
): MessagePackTruthSegmentFileStore {
  const json = new Map(Object.entries(jsonEntries));
  return {
    async readJSON<T>(path: string): Promise<T | null> {
      return (json.get(path) as T | undefined) ?? null;
    },
    async writeJSON(): Promise<void> {},
    async readBinary(): Promise<Uint8Array | null> {
      return null;
    },
    async writeBinary(): Promise<void> {},
    async listFiles(prefix: string): Promise<string[]> {
      return Array.from(json.keys()).filter((path) => path.startsWith(prefix));
    },
  };
}

describe('WorkerStorageInventory', () => {
  it('aggregates truth segment counts, bytes, age, and retained generations by family and device', async () => {
    const now = 10_000;
    const reviewManifestPath = 'truth/review-events/review-v1/device-device-a/manifest.v1.json';
    const cardCurrentManifestPath = 'truth/card-memory-facts/card-v2/device-device-a/manifest.v1.json';
    const cardPreviousManifestPath = 'truth/card-memory-facts/card-v1/device-device-a/manifest.v1.json';
    const cardFencePath = 'truth/card-memory-facts/device-device-a/generation-fence.v1.json';
    const truthFileStore = createTruthFileStore({
      [reviewManifestPath]: {
        version: 1,
        path: reviewManifestPath,
        family: 'review-events',
        deviceId: 'device-a',
        generationId: 'review-v1',
        schemaVersion: 1,
        updatedAt: 9_500,
        segments: [
          {
            version: 1,
            family: 'review-events',
            deviceId: 'device-a',
            generationId: 'review-v1',
            schemaVersion: 1,
            sequence: 1,
            path: 'truth/review-events/review-v1/device-device-a/segment-1.msgpack',
            checksum: 'sha256:review-1',
            recordCount: 2,
            byteSize: 120,
            minLogicalTime: 1,
            maxLogicalTime: 2,
            closedAt: 8_000,
            compactedFrom: [],
          },
          {
            version: 1,
            family: 'review-events',
            deviceId: 'device-a',
            generationId: 'review-v1',
            schemaVersion: 1,
            sequence: 2,
            path: 'truth/review-events/review-v1/device-device-a/segment-2.msgpack',
            checksum: 'sha256:review-2',
            recordCount: 1,
            byteSize: 180,
            minLogicalTime: 3,
            maxLogicalTime: 3,
            closedAt: 9_000,
            compactedFrom: [],
          },
        ],
      },
      [cardCurrentManifestPath]: {
        version: 1,
        path: cardCurrentManifestPath,
        family: 'card-memory-facts',
        deviceId: 'device-a',
        generationId: 'card-v2',
        schemaVersion: 1,
        updatedAt: 9_900,
        segments: [
          {
            version: 1,
            family: 'card-memory-facts',
            deviceId: 'device-a',
            generationId: 'card-v2',
            schemaVersion: 1,
            sequence: 1,
            path: 'truth/card-memory-facts/card-v2/device-device-a/segment-1.msgpack',
            checksum: 'sha256:card-v2',
            recordCount: 3,
            byteSize: 420,
            minLogicalTime: 4,
            maxLogicalTime: 6,
            closedAt: 9_600,
            compactedFrom: [],
          },
        ],
      },
      [cardPreviousManifestPath]: {
        version: 1,
        path: cardPreviousManifestPath,
        family: 'card-memory-facts',
        deviceId: 'device-a',
        generationId: 'card-v1',
        schemaVersion: 1,
        updatedAt: 7_500,
        segments: [
          {
            version: 1,
            family: 'card-memory-facts',
            deviceId: 'device-a',
            generationId: 'card-v1',
            schemaVersion: 1,
            sequence: 1,
            path: 'truth/card-memory-facts/card-v1/device-device-a/segment-1.msgpack',
            checksum: 'sha256:card-v1',
            recordCount: 2,
            byteSize: 260,
            minLogicalTime: 1,
            maxLogicalTime: 3,
            closedAt: 7_000,
            compactedFrom: [],
          },
        ],
      },
      [cardFencePath]: {
        version: 1,
        path: cardFencePath,
        family: 'card-memory-facts',
        deviceId: 'device-a',
        schemaVersion: 1,
        fence: 2,
        current: {
          generationId: 'card-v2',
          manifestPath: cardCurrentManifestPath,
          manifestChecksum: `sha256:${'a'.repeat(64)}`,
          verifiedAt: 9_700,
        },
        previous: {
          generationId: 'card-v1',
          manifestPath: cardPreviousManifestPath,
          manifestChecksum: `sha256:${'b'.repeat(64)}`,
          verifiedAt: 7_600,
        },
        updatedAt: 9_700,
      },
    });

    const inventory = new WorkerStorageInventory({
      truthFileStore,
      deviceId: 'device-a',
      identityEpoch: 'epoch-1',
      readSqliteDeltaInventory: async () => null,
      readProjectionBytes: async () => null,
      readPromotionDiagnostics: async () => null,
      now: () => now,
    });

    const result = await inventory.collect();

    expect(result.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        family: 'review-events',
        deviceId: 'device-a',
        identityEpoch: 'epoch-1',
        files: 2,
        bytes: 300,
        oldestAgeMs: 2_000,
        currentGenerationId: 'review-v1',
        previousGenerationId: null,
        uncoveredMutationCount: 0,
      }),
      expect.objectContaining({
        family: 'card-memory-facts',
        deviceId: 'device-a',
        identityEpoch: 'epoch-1',
        files: 2,
        bytes: 680,
        oldestAgeMs: 3_000,
        currentGenerationId: 'card-v2',
        previousGenerationId: 'card-v1',
        uncoveredMutationCount: 0,
      }),
    ]));
    expect(result.pressure.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        family: 'review-events',
        deviceId: 'device-a',
        identityEpoch: 'epoch-1',
        level: 'normal',
      }),
      expect.objectContaining({
        family: 'card-memory-facts',
        deviceId: 'device-a',
        identityEpoch: 'epoch-1',
        level: 'normal',
      }),
    ]));
  });

  it('reports delta, projection, and uncovered mutation evidence for the active device', async () => {
    const inventory = new WorkerStorageInventory({
      truthFileStore: createTruthFileStore({}),
      deviceId: 'device-a',
      identityEpoch: 'epoch-1',
      readSqliteDeltaInventory: async () => ({
        files: 3,
        sealedFiles: 2,
        openFiles: 1,
        entries: 5,
        bytes: 600,
        oldestCreatedAt: 7_000,
      }),
      readProjectionBytes: async () => new Uint8Array(1_024),
      readPromotionDiagnostics: async () => ({
        active: false,
        shutdownStarted: false,
        pendingMutationCount: 2,
        oldestPendingAgeMs: 2_500,
        journalSequenceFrontier: 8,
        truthCoverageFrontier: 6,
        retryReason: 'truth-host-effect-failed',
        lastSuccessfulPromotionAt: 6_000,
      }),
      now: () => 10_000,
    });

    const result = await inventory.collect();

    expect(result.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        family: 'sqlite-delta',
        deviceId: 'device-a',
        identityEpoch: 'epoch-1',
        files: 3,
        bytes: 600,
        oldestAgeMs: 3_000,
        currentGenerationId: null,
        previousGenerationId: null,
        uncoveredMutationCount: 2,
        compactionStatus: 'blocked-uncovered',
      }),
      expect.objectContaining({
        family: 'temporary-sqlite-projection',
        deviceId: 'device-a',
        identityEpoch: 'epoch-1',
        files: 1,
        bytes: 1_024,
        oldestAgeMs: null,
        currentGenerationId: null,
        previousGenerationId: null,
        uncoveredMutationCount: 0,
        compactionStatus: 'not-applicable',
      }),
    ]));
  });

  it('marks reclaimable families eligible when configurable pressure reaches soft or higher', async () => {
    const inventory = new WorkerStorageInventory({
      truthFileStore: createTruthFileStore({}),
      deviceId: 'device-a',
      identityEpoch: 'epoch-1',
      readSqliteDeltaInventory: async () => ({
        files: 2,
        sealedFiles: 2,
        openFiles: 0,
        entries: 4,
        bytes: 200,
        oldestCreatedAt: 8_000,
      }),
      readProjectionBytes: async () => null,
      readPromotionDiagnostics: async () => ({
        active: false,
        shutdownStarted: false,
        pendingMutationCount: 0,
        oldestPendingAgeMs: null,
        journalSequenceFrontier: 4,
        truthCoverageFrontier: 4,
        retryReason: null,
        lastSuccessfulPromotionAt: 9_000,
      }),
      budgetPolicies: [{
        family: 'sqlite-delta',
        files: { target: 1, soft: 2, high: 3, hard: 4 },
      }],
      now: () => 10_000,
    });

    const result = await inventory.collect();

    expect(result.pressure).toMatchObject({
      level: 'soft',
      metrics: [expect.objectContaining({
        family: 'sqlite-delta',
        level: 'soft',
      })],
    });
    expect(result.metrics).toEqual([
      expect.objectContaining({
        family: 'sqlite-delta',
        compactionStatus: 'eligible',
        uncoveredMutationCount: 0,
      }),
    ]);
  });
});
