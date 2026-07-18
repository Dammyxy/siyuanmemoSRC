import { describe, expect, it, vi } from 'vitest';
import {
  FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION,
  type BackendForeignEpochRecoveryPhaseReceipt,
} from '../../../packages/contracts/src/backend-rpc';
import { WorkerForeignEpochRecoveryEvidenceSourceAdapter } from '../WorkerForeignEpochRecoveryEvidenceSourceAdapter';

function createHarness() {
  const frontier = {
    version: 1,
    deviceId: 'device-redacted',
    activeIdentityEpoch: 'epoch-current-redacted',
    status: 'recovery-required',
    blockingCode: 'FRONTIER_FOREIGN_EPOCH_UNCOVERED',
  };
  const receipt: BackendForeignEpochRecoveryPhaseReceipt = {
    version: FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION,
    operationId: 'operation-redacted',
    planHash: `sha256:${'a'.repeat(64)}`,
    phase: 'validated',
    evidenceHash: `sha256:${'b'.repeat(64)}`,
    artifactHashes: [],
    completedAt: 100,
  };
  const files = new Map<string, unknown>([
    ['truth/promotion/device-redacted/frontier.v1.json', frontier],
    ['truth/recovery/foreign-epoch/operation-redacted/receipts.v1.json', [receipt]],
  ]);
  const identityEvidence = {
    currentAuthority: null,
    previousAuthority: null,
    tempLocalIdentity: { version: 1, deviceId: 'device-redacted' },
    browserCacheObservations: [{ version: 2, deviceId: 'device-redacted' }],
  };
  const readIdentityEvidence = vi.fn(async () => structuredClone(identityEvidence));
  const journal = { nextJournalSequence: 405 };
  const database = {
    readForeignEpochRecoveryJournalEvidence: vi.fn(async () => journal),
    getStorageRecoveryState: vi.fn(() => null),
  };
  const truthFileStore = {
    readJSON: vi.fn(async (path: string) => structuredClone(files.get(path) ?? null)),
    listFiles: vi.fn(async (prefix: string) => Array.from(files.keys()).filter((path) => path.startsWith(prefix))),
  };
  return {
    files,
    frontier,
    identityEvidence,
    journal,
    readIdentityEvidence,
    adapter: new WorkerForeignEpochRecoveryEvidenceSourceAdapter({
      database: database as never,
      truthFileStore: truthFileStore as never,
      readIdentityEvidence,
    }),
  };
}

describe('WorkerForeignEpochRecoveryEvidenceSourceAdapter', () => {
  it('shares one identity evidence host read across a concurrent inventory pass', async () => {
    const harness = createHarness();

    const [current, previous, temp, browser] = await Promise.all([
      harness.adapter.readCurrentAuthority(),
      harness.adapter.readPreviousAuthority(),
      harness.adapter.readTempLocalIdentity(),
      harness.adapter.readBrowserCacheObservations(),
    ]);

    expect(harness.readIdentityEvidence).toHaveBeenCalledTimes(1);
    expect(current).toBeNull();
    expect(previous).toBeNull();
    expect(temp).toEqual(harness.identityEvidence.tempLocalIdentity);
    expect(browser).toEqual(harness.identityEvidence.browserCacheObservations);
  });

  it('reads journal, Frontier, and recovery receipts from their owned stores', async () => {
    const harness = createHarness();

    await expect(harness.adapter.readJournalEvidence()).resolves.toEqual(harness.journal);
    await expect(harness.adapter.readFrontier()).resolves.toEqual(harness.frontier);
    await expect(harness.adapter.listRecoveryReceipts()).resolves.toMatchObject([
      { operationId: 'operation-redacted', phase: 'validated' },
    ]);
  });

  it('binds physical manifests to the verified promotion generation even when their generation IDs differ', async () => {
    const harness = createHarness();
    harness.files.set('truth/promotion/device-redacted/epoch-predecessor/state.v1.json', {
      version: 1,
      deviceId: 'device-redacted',
      identityEpoch: 'epoch-predecessor',
      coverage: {
        version: 1,
        deviceId: 'device-redacted',
        identityEpoch: 'epoch-predecessor',
        coveredJournalSequence: 403,
        coveredMutationId: 'mutation-403',
        truthGenerationId: 'truth-promotion-device-redacted-403',
        updatedAt: 403_000,
      },
      retry: null,
      lastSuccessfulPromotionAt: 403_000,
      updatedAt: 403_000,
    });
    harness.files.set('truth/card-facts/cards-v1/device-device-redacted/manifest.v1.json', {
      version: 1,
      family: 'card-facts',
      deviceId: 'device-redacted',
      generationId: 'cards-v1',
      segments: [{ path: 'truth/card-facts/cards-v1/device-device-redacted/seg-1.msgpack' }],
      updatedAt: 402_000,
    });

    await expect(harness.adapter.listTruthGenerations()).resolves.toMatchObject([{
      generationId: 'truth-promotion-device-redacted-403',
      deviceId: 'device-redacted',
      identityEpoch: 'epoch-predecessor',
      status: 'published',
      families: [{
        family: 'card-facts',
        manifestPath: 'truth/card-facts/cards-v1/device-device-redacted/manifest.v1.json',
        segmentPaths: ['truth/card-facts/cards-v1/device-device-redacted/seg-1.msgpack'],
      }],
    }]);
  });
});
