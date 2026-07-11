import { describe, expect, it, vi } from 'vitest';
import {
  StorageBootstrapRuntime,
  type WorkerStorageBootstrapOptions,
} from '../StorageBootstrapRuntime';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthSegmentFileStore,
} from '../../truth/MessagePackTruthSegmentStore';
import { MessagePackTruthSnapshotGenerationStore } from '../../truth/MessagePackTruthSnapshotGenerationStore';
import type { BackendStorageDiagnostic } from '../../../packages/contracts/src/backend-rpc';

const BOOTSTRAP_OPTIONS: WorkerStorageBootstrapOptions = {
  truthDeviceId: 'device-local',
  identityEpoch: 'epoch-local',
  truthSchemaVersion: 1,
  cardTruthGenerationId: 'card-memory-facts-v1',
  reviewTruthGenerationId: 'review-events-v1',
  queueTruthGenerationId: 'queue-facts-v1',
};

class MemoryTruthFileStore implements MessagePackTruthSegmentFileStore {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();

  async readJSON<T>(fileName: string): Promise<T | null> {
    return this.json.has(fileName) ? this.json.get(fileName) as T : null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.json.set(fileName, structuredClone(data));
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binary.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.binary.set(fileName, new Uint8Array(bytes));
  }

  async listFiles(prefix: string): Promise<string[]> {
    return [
      ...Array.from(this.json.keys()),
      ...Array.from(this.binary.keys()),
    ].filter((path) => path.startsWith(prefix));
  }
}

async function seedCardTruth(store: MemoryTruthFileStore): Promise<void> {
  const truthStore = createMessagePackTruthSegmentStore({
    fileStore: store,
    family: 'card-memory-facts',
    deviceId: BOOTSTRAP_OPTIONS.truthDeviceId!,
    generationId: BOOTSTRAP_OPTIONS.cardTruthGenerationId,
    schemaVersion: 1,
  });
  await truthStore.appendRecords([{
    id: 'seed:card-1',
    family: 'card-memory-facts',
    schemaVersion: 1,
    type: 'card-memory.snapshot-imported',
    idempotencyKey: 'seed:card-1',
    logicalTime: 1,
    recordedAt: 1,
    cardId: 'card-1',
  }]);
}

function createRuntime(input: {
  truthFileStore: MemoryTruthFileStore;
  projectionBytes?: Uint8Array | null;
  diagnostics?: BackendStorageDiagnostic[];
}): StorageBootstrapRuntime {
  return new StorageBootstrapRuntime({
    dbFile: 'siyuanmemo.db',
    fileService: {
      readBinary: vi.fn(async (fileName: string) => (
        fileName === 'siyuanmemo.db' ? input.projectionBytes ?? null : null
      )),
      hasLegacyPetalSqliteDb: vi.fn(async () => false),
    },
    truthFileStore: input.truthFileStore,
    addStorageDiagnostic: (diagnostic) => input.diagnostics?.push(diagnostic),
  });
}

describe('StorageBootstrapRuntime', () => {
  it('keeps existing sqlite projection loadable when durable truth exists', async () => {
    const truthFileStore = new MemoryTruthFileStore();
    await seedCardTruth(truthFileStore);
    const runtime = createRuntime({
      truthFileStore,
      projectionBytes: new Uint8Array([1, 2, 3]),
    });

    const result = await runtime.bootstrap(BOOTSTRAP_OPTIONS);

    expect(result).toMatchObject({
      truthAvailable: true,
      projectionRebuildRequired: false,
      projectionRebuildReason: 'sql-stale',
      projectionBytesBeforeStartup: new Uint8Array([1, 2, 3]),
    });
    expect(result.truthProjectionInput?.truthRecords).toHaveLength(1);
    expect(result.truthProjectionInput?.primaryDeviceId).toBe('device-local');
    expect(result.truthProjectionInput?.primaryGenerationId).toBe('card-memory-facts-v1');
  });

  it('requests truth-backed projection rebuild when sqlite projection is missing', async () => {
    const truthFileStore = new MemoryTruthFileStore();
    await seedCardTruth(truthFileStore);
    const runtime = createRuntime({
      truthFileStore,
      projectionBytes: null,
    });

    const result = await runtime.bootstrap(BOOTSTRAP_OPTIONS);

    expect(result).toMatchObject({
      truthAvailable: true,
      projectionRebuildRequired: true,
      projectionRebuildReason: 'temp-projection-missing',
      projectionBytesBeforeStartup: null,
    });
    expect(result.truthProjectionInput?.truthRecords).toHaveLength(1);
  });

  it('classifies current and previous snapshot generation fence evidence', async () => {
    const truthFileStore = new MemoryTruthFileStore();
    const generationStore = new MessagePackTruthSnapshotGenerationStore({
      fileStore: truthFileStore,
      family: 'card-memory-facts',
      deviceId: BOOTSTRAP_OPTIONS.truthDeviceId!,
      schemaVersion: BOOTSTRAP_OPTIONS.truthSchemaVersion,
    });
    const previous = await generationStore.publishGeneration({
      generationId: 'compact-card-memory-facts-0-1',
      expectedCurrentGenerationId: null,
      records: [{
        id: 'snapshot:previous',
        family: 'card-memory-facts',
        schemaVersion: 1,
        type: 'card-memory.snapshot-imported',
        idempotencyKey: 'snapshot:previous',
        logicalTime: 1,
        recordedAt: 1,
        cardId: 'previous-card',
      }],
    });
    await generationStore.publishGeneration({
      generationId: 'compact-card-memory-facts-1-1',
      expectedCurrentGenerationId: previous.generation.generationId,
      records: [{
        id: 'snapshot:current',
        family: 'card-memory-facts',
        schemaVersion: 1,
        type: 'card-memory.snapshot-imported',
        idempotencyKey: 'snapshot:current',
        logicalTime: 2,
        recordedAt: 2,
        cardId: 'current-card',
      }],
    });
    const runtime = createRuntime({
      truthFileStore,
      projectionBytes: new Uint8Array([1]),
    });

    const result = await runtime.bootstrap(BOOTSTRAP_OPTIONS);

    expect(result.truthProjectionInput).toMatchObject({
      currentGenerationId: 'compact-card-memory-facts-1-1',
      previousGenerationId: 'compact-card-memory-facts-0-1',
      selectedGenerationId: 'compact-card-memory-facts-1-1',
      generationFallbackReason: null,
      quarantinedPaths: [],
    });
  });

  it('recovers from the previous verified generation when the current generation is corrupt', async () => {
    const truthFileStore = new MemoryTruthFileStore();
    const generationStore = new MessagePackTruthSnapshotGenerationStore({
      fileStore: truthFileStore,
      family: 'card-memory-facts',
      deviceId: BOOTSTRAP_OPTIONS.truthDeviceId!,
      schemaVersion: BOOTSTRAP_OPTIONS.truthSchemaVersion,
    });
    const previous = await generationStore.publishGeneration({
      generationId: 'compact-card-memory-facts-0-1',
      expectedCurrentGenerationId: null,
      records: [{
        id: 'snapshot:previous-card',
        family: 'card-memory-facts',
        schemaVersion: 1,
        type: 'card-memory.snapshot-imported',
        idempotencyKey: 'snapshot:previous-card',
        logicalTime: 1,
        recordedAt: 1,
        cardId: 'previous-card',
      }],
    });
    const current = await generationStore.publishGeneration({
      generationId: 'compact-card-memory-facts-1-1',
      expectedCurrentGenerationId: previous.generation.generationId,
      records: [{
        id: 'snapshot:current-card',
        family: 'card-memory-facts',
        schemaVersion: 1,
        type: 'card-memory.snapshot-imported',
        idempotencyKey: 'snapshot:current-card',
        logicalTime: 2,
        recordedAt: 2,
        cardId: 'current-card',
      }],
    });
    const corruptSegmentPath = current.generation.manifest.segments[0].path;
    const corruptBytes = truthFileStore.binary.get(corruptSegmentPath)!;
    corruptBytes[0] ^= 0xff;
    const runtime = createRuntime({
      truthFileStore,
      projectionBytes: null,
    });

    const result = await runtime.bootstrap(BOOTSTRAP_OPTIONS);

    expect(result.truthProjectionInput).toMatchObject({
      primaryGenerationId: 'compact-card-memory-facts-0-1',
      currentGenerationId: 'compact-card-memory-facts-1-1',
      previousGenerationId: 'compact-card-memory-facts-0-1',
      selectedGenerationId: 'compact-card-memory-facts-0-1',
      generationFallbackReason: expect.stringContaining('checksum-mismatch'),
    });
    expect(result.truthProjectionInput?.truthRecords.map((record) => record.id)).toEqual([
      'snapshot:previous-card',
    ]);
    expect(truthFileStore.json.get(generationStore.fencePath)).toMatchObject({
      current: {
        generationId: 'compact-card-memory-facts-1-1',
      },
      previous: {
        generationId: 'compact-card-memory-facts-0-1',
      },
    });
    expect(truthFileStore.binary.has(corruptSegmentPath)).toBe(true);
  });

  it('classifies invalid canonical truth for read-only recovery without deleting evidence', async () => {
    const truthFileStore = new MemoryTruthFileStore();
    await seedCardTruth(truthFileStore);
    const manifestPath = 'truth/card-memory-facts/card-memory-facts-v1/device-device-local/manifest.v1.json';
    const manifest = await truthFileStore.readJSON<Record<string, unknown>>(manifestPath);
    truthFileStore.json.set(manifestPath, {
      ...manifest,
      segments: Array.isArray(manifest?.segments)
        ? manifest.segments.map((segment) => ({ ...segment, checksum: 'bad-checksum' }))
        : [],
    });
    const runtime = createRuntime({ truthFileStore });

    const result = await runtime.bootstrap(BOOTSTRAP_OPTIONS);

    expect(result).toMatchObject({
      truthAvailable: false,
      truthValidationError: 'TRUTH_VALIDATION_FAILED: MessagePack truth validation failed: checksum-mismatch',
      projectionRebuildRequired: false,
      truthProjectionInput: null,
      quarantinedPaths: expect.arrayContaining([
        manifestPath,
      ]),
    });
    expect(truthFileStore.json.has(manifestPath)).toBe(true);
  });

  it('records ignored legacy petal database diagnostic through bootstrap interface', async () => {
    const truthFileStore = new MemoryTruthFileStore();
    const diagnostics: BackendStorageDiagnostic[] = [];
    const runtime = new StorageBootstrapRuntime({
      dbFile: 'siyuanmemo.db',
      fileService: {
        readBinary: vi.fn(async () => null),
        hasLegacyPetalSqliteDb: vi.fn(async () => true),
      },
      truthFileStore,
      addStorageDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    await runtime.bootstrap(BOOTSTRAP_OPTIONS);
    await runtime.bootstrap(BOOTSTRAP_OPTIONS);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      kind: 'legacy-petal-db-ignored',
      severity: 'warning',
      path: 'storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db',
      details: {
        read: false,
        migrated: false,
        deleted: false,
        written: false,
      },
    });
  });

  it('reinitializes temp projection runtime while suppressing persisted projection reads', async () => {
    const truthFileStore = new MemoryTruthFileStore();
    const events: string[] = [];
    const runtime = new StorageBootstrapRuntime({
      dbFile: 'siyuanmemo.db',
      fileService: {
        readBinary: vi.fn(async () => null),
        hasLegacyPetalSqliteDb: vi.fn(async () => false),
      },
      truthFileStore,
      addStorageDiagnostic: vi.fn(),
      projectionRuntime: {
        dispose: vi.fn(() => events.push('dispose')),
        init: vi.fn(async () => events.push('init')),
        suppressPersistedProjectionRead: vi.fn(async (task) => {
          events.push('suppress:start');
          try {
            await task();
          } finally {
            events.push('suppress:end');
          }
        }),
      },
    });

    await runtime.reinitializeTempProjectionRuntimeAfterLoadFailure(new Error('bad persisted db'));

    expect(events).toEqual(['suppress:start', 'dispose', 'init', 'suppress:end']);
  });

  it('wraps temp projection runtime reinitialization failure as storage rebuild failure', async () => {
    const truthFileStore = new MemoryTruthFileStore();
    const runtime = new StorageBootstrapRuntime({
      dbFile: 'siyuanmemo.db',
      fileService: {
        readBinary: vi.fn(async () => null),
        hasLegacyPetalSqliteDb: vi.fn(async () => false),
      },
      truthFileStore,
      addStorageDiagnostic: vi.fn(),
      projectionRuntime: {
        dispose: vi.fn(),
        init: vi.fn(async () => {
          throw new Error('fresh temp failed');
        }),
        suppressPersistedProjectionRead: vi.fn(async (task) => task()),
      },
    });

    await expect(
      runtime.reinitializeTempProjectionRuntimeAfterLoadFailure(new Error('bad persisted db')),
    ).rejects.toThrow(
      'PROJECTION_REBUILD_FAILED: failed to reinitialize temp projection after persisted DB load failure: fresh temp failed; original failure: bad persisted db',
    );
  });
});
