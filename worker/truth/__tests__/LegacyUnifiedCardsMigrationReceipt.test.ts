import { describe, expect, it } from 'vitest';
import {
  LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH,
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
} from '../../../packages/contracts/src/backend-rpc';
import {
  createCompletedLegacyUnifiedCardsMigrationReceipt,
  createReconciledLegacyUnifiedCardsMigrationReceipt,
  LegacyUnifiedCardsMigrationReceiptError,
  readLegacyUnifiedCardsMigrationReceipt,
  reconcileLegacyUnifiedCardsMigrationReceipt,
  writeLegacyUnifiedCardsMigrationReceipt,
  type LegacyUnifiedCardsMigrationReceiptFileStore,
} from '../LegacyUnifiedCardsMigrationReceipt';
import { LEGACY_UNIFIED_CARDS_SOURCE_PATH } from '../LegacyUnifiedCardsSource';

class MemoryReceiptFileStore implements LegacyUnifiedCardsMigrationReceiptFileStore {
  readonly jsonFiles = new Map<string, unknown>();
  readonly operations: Array<{ type: 'read-json' | 'write-json'; path: string }> = [];
  writeError: Error | null = null;

  async readJSON<T>(fileName: string): Promise<T | null> {
    this.operations.push({ type: 'read-json', path: fileName });
    return (this.jsonFiles.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.operations.push({ type: 'write-json', path: fileName });
    if (this.writeError) {
      throw this.writeError;
    }
    this.jsonFiles.set(fileName, structuredClone(data));
  }
}

function completedReceipt() {
  return createCompletedLegacyUnifiedCardsMigrationReceipt({
    migratedAt: 1_700_000_000_000,
    localDeviceId: 'device-A',
    source: {
      sourceFile: LEGACY_UNIFIED_CARDS_SOURCE_PATH,
      byteLength: 5,
      sha256: `sha256:${'a'.repeat(64)}`,
    },
    truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    families: [{
      family: 'card-memory-facts',
      generationId: 'card-memory-facts-v1',
      recordCount: 3,
      segmentRefs: ['truth/card-memory-facts/card-memory-facts-v1/device-device-A/seg-000001-test.msgpack'],
    }],
    counts: {
      activeCards: 2,
      tombstones: 1,
      sourceBindings: 1,
      reviewEvents: 0,
      quarantinedReviewLogs: 0,
      skippedDrillLogsV2: 0,
      skippedRescheduleLogs: 0,
    },
    diagnostics: [],
  });
}

describe('LegacyUnifiedCardsMigrationReceipt', () => {
  it('reads a missing truth-side receipt as null', async () => {
    const fileStore = new MemoryReceiptFileStore();

    await expect(readLegacyUnifiedCardsMigrationReceipt(fileStore)).resolves.toBeNull();
    expect(fileStore.operations).toEqual([
      { type: 'read-json', path: LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH },
    ]);
  });

  it('writes and reads a completed receipt at the truth migration path', async () => {
    const fileStore = new MemoryReceiptFileStore();
    const receipt = completedReceipt();

    await writeLegacyUnifiedCardsMigrationReceipt(fileStore, receipt);
    const stored = await readLegacyUnifiedCardsMigrationReceipt(fileStore);

    expect(fileStore.operations.map((operation) => operation.path)).toEqual([
      LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH,
      LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH,
    ]);
    expect(stored).toEqual(receipt);
    expect(stored?.source).toEqual({
      file: LEGACY_UNIFIED_CARDS_SOURCE_PATH,
      sha256: `sha256:${'a'.repeat(64)}`,
      byteLength: 5,
    });
  });

  it('reconciles truth without receipt by writing a reconciled receipt without reading legacy source', async () => {
    const fileStore = new MemoryReceiptFileStore();
    const reconciled = createReconciledLegacyUnifiedCardsMigrationReceipt({
      reconciledAt: 1_700_000_000_100,
      localDeviceId: 'device-A',
      truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      families: [{
        family: 'card-memory-facts',
        generationId: 'card-memory-facts-v1',
        recordCount: 3,
        segmentRefs: ['truth/card-memory-facts/card-memory-facts-v1/device-device-A/seg-000001-test.msgpack'],
      }],
      diagnostics: [{ kind: 'truth-without-receipt', severity: 'warning', message: 'truth existed before receipt' }],
    });

    const result = await reconcileLegacyUnifiedCardsMigrationReceipt(fileStore, {
      truthExists: true,
      reconciledReceipt: reconciled,
    });

    expect(result).toEqual({
      status: 'reconciled',
      receipt: reconciled,
      wroteReceipt: true,
    });
    expect(fileStore.operations).toEqual([
      { type: 'read-json', path: LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH },
      { type: 'write-json', path: LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH },
    ]);
  });

  it('fails closed with LEGACY_MIGRATION_FAILED for invalid or unwritable receipts', async () => {
    const invalidStore = new MemoryReceiptFileStore();
    invalidStore.jsonFiles.set(LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH, { status: 'completed' });

    await expect(readLegacyUnifiedCardsMigrationReceipt(invalidStore)).rejects.toMatchObject({
      code: 'LEGACY_MIGRATION_FAILED',
      receiptPath: LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH,
    });
    await expect(readLegacyUnifiedCardsMigrationReceipt(invalidStore))
      .rejects.toBeInstanceOf(LegacyUnifiedCardsMigrationReceiptError);

    const unwritableStore = new MemoryReceiptFileStore();
    unwritableStore.writeError = new Error('host write failed');
    await expect(writeLegacyUnifiedCardsMigrationReceipt(unwritableStore, completedReceipt())).rejects.toMatchObject({
      code: 'LEGACY_MIGRATION_FAILED',
    });
  });
});
