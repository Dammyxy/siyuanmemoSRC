import { describe, expect, it } from 'vitest';
import {
  WorkerVerifiedMutationFrontier,
  type WorkerVerifiedMutationFrontierRecord,
  type WorkerVerifiedMutationFrontierStore,
} from '../WorkerVerifiedMutationFrontier';
import type {
  WorkerTruthPromotionJournalEntry,
  WorkerTruthPromotionState,
} from '../WorkerTruthPromotionModule';

class MemoryFrontierStore implements WorkerVerifiedMutationFrontierStore {
  record: WorkerVerifiedMutationFrontierRecord | null = null;
  writeCount = 0;

  async read(): Promise<WorkerVerifiedMutationFrontierRecord | null> {
    return this.record ? structuredClone(this.record) : null;
  }

  async write(record: WorkerVerifiedMutationFrontierRecord): Promise<void> {
    this.writeCount += 1;
    this.record = structuredClone(record);
  }
}

function journalEntry(
  sequence: number,
  identityEpoch = 'epoch-current',
  mutationId = `mutation-${sequence}`,
): WorkerTruthPromotionJournalEntry {
  return {
    createdAt: sequence * 1_000,
    mutationEnvelope: {
      version: 1,
      mutationId,
      family: 'review',
      deviceId: 'device-A',
      identityEpoch,
      journalSequence: sequence,
      createdAt: sequence * 1_000,
      affectedAggregates: [],
      operations: [],
      requiredTruthOutputs: [],
    },
    durabilityReceipt: {
      version: 1,
      mutationId,
      family: 'review',
      stage: 'journaled',
      journalSequence: sequence,
      affectedAggregates: [],
      requiredTruthOutputs: [],
      truthGenerationId: null,
      retry: { attemptCount: 0, nextAttemptAt: null, lastError: null },
      diagnosticCode: null,
      diagnosticMessage: null,
      updatedAt: sequence * 1_000,
    },
  };
}

function promotionState(
  identityEpoch: string,
  sequence: number,
  overrides: Partial<WorkerTruthPromotionState['coverage']> = {},
): WorkerTruthPromotionState {
  return {
    version: 1,
    deviceId: 'device-A',
    identityEpoch,
    coverage: {
      version: 1,
      deviceId: 'device-A',
      identityEpoch,
      coveredJournalSequence: sequence,
      coveredMutationId: `mutation-${sequence}`,
      truthGenerationId: `truth-generation-${sequence}`,
      updatedAt: sequence * 1_000,
      ...overrides,
    },
    retry: null,
    lastSuccessfulPromotionAt: sequence * 1_000,
    updatedAt: sequence * 1_000,
  };
}

function createFrontier(input: {
  entries?: WorkerTruthPromotionJournalEntry[];
  nextJournalSequence?: number;
  legacyStates?: WorkerTruthPromotionState[];
  store?: MemoryFrontierStore;
} = {}) {
  const store = input.store ?? new MemoryFrontierStore();
  const frontier = new WorkerVerifiedMutationFrontier({
    deviceId: 'device-A',
    identityEpoch: 'epoch-current',
    store,
    readJournalEvidence: async () => ({
      nextJournalSequence: input.nextJournalSequence ?? 1,
      entries: input.entries ?? [],
    }),
    listLegacyPromotionStates: async () => input.legacyStates ?? [],
    now: () => 500_000,
  });
  return { frontier, store };
}

describe('WorkerVerifiedMutationFrontier', () => {
  it('establishes a ready genesis frontier', async () => {
    const { frontier, store } = createFrontier();

    await expect(frontier.initialize()).resolves.toMatchObject({
      ready: true,
      diagnostics: {
        status: 'ready',
        journalSequenceFrontier: 0,
        truthCoverageFrontier: 0,
      },
    });
    expect(store.record).toMatchObject({
      activeIdentityEpoch: 'epoch-current',
      coverage: null,
      journalSequenceFrontier: 0,
    });
  });

  it('loads a matching active-epoch coverage frontier', async () => {
    const { frontier } = createFrontier({
      entries: [journalEntry(2)],
      nextJournalSequence: 3,
      legacyStates: [promotionState('epoch-current', 1)],
    });

    const result = await frontier.initialize();

    expect(result).toMatchObject({
      ready: true,
      diagnostics: {
        journalSequenceFrontier: 2,
        truthCoverageFrontier: 1,
        pendingMutationCount: 1,
        transitionFromIdentityEpoch: null,
      },
    });
  });

  it('does not rewrite an unchanged persisted frontier during restart', async () => {
    const store = new MemoryFrontierStore();
    const first = createFrontier({ store });
    await first.frontier.initialize();
    const persisted = structuredClone(store.record);

    const restarted = createFrontier({ store });
    await expect(restarted.frontier.initialize()).resolves.toMatchObject({ ready: true });

    expect(store.writeCount).toBe(1);
    expect(store.record).toEqual(persisted);
  });

  it('fails closed on an unsupported stored version without overwriting it', async () => {
    const store = new MemoryFrontierStore();
    const first = createFrontier({ store });
    await first.frontier.initialize();
    const unsupported = {
      ...structuredClone(store.record!),
      version: 2,
    } as unknown as WorkerVerifiedMutationFrontierRecord;
    store.record = unsupported;

    const restarted = createFrontier({ store });
    await expect(restarted.frontier.initialize()).resolves.toMatchObject({
      ready: false,
      diagnostics: {
        status: 'recovery-required',
        blockingCode: 'FRONTIER_STATE_UNSUPPORTED',
      },
    });

    expect(store.writeCount).toBe(1);
    expect(store.record).toEqual(unsupported);
  });

  it('proves the observed prior coverage 403 to current sequence 404 transition', async () => {
    const { frontier, store } = createFrontier({
      entries: [journalEntry(404)],
      nextJournalSequence: 405,
      legacyStates: [promotionState('epoch-previous', 403)],
    });

    const result = await frontier.initialize();

    expect(result).toMatchObject({
      ready: true,
      diagnostics: {
        journalSequenceFrontier: 404,
        truthCoverageFrontier: 403,
        pendingMutationCount: 1,
        transitionFromIdentityEpoch: 'epoch-previous',
      },
    });
    expect(store.record).toMatchObject({
      activeIdentityEpoch: 'epoch-current',
      coverage: {
        identityEpoch: 'epoch-current',
        coveredJournalSequence: 403,
        coveredMutationId: 'mutation-403',
      },
      transition: {
        fromIdentityEpoch: 'epoch-previous',
        toIdentityEpoch: 'epoch-current',
        inheritedCoveredJournalSequence: 403,
      },
    });
  });

  it('fails closed when predecessor states conflict at the same sequence', async () => {
    const { frontier } = createFrontier({
      entries: [journalEntry(404)],
      nextJournalSequence: 405,
      legacyStates: [
        promotionState('epoch-A', 403),
        promotionState('epoch-B', 403, { coveredMutationId: 'different-mutation' }),
      ],
    });

    await expect(frontier.initialize()).resolves.toMatchObject({
      ready: false,
      diagnostics: {
        status: 'recovery-required',
        blockingCode: 'FRONTIER_PREDECESSOR_CONFLICT',
      },
    });
  });

  it('fails closed when a foreign epoch owns an uncovered entry', async () => {
    const { frontier } = createFrontier({
      entries: [journalEntry(404, 'epoch-foreign')],
      nextJournalSequence: 405,
      legacyStates: [promotionState('epoch-previous', 403)],
    });

    await expect(frontier.initialize()).resolves.toMatchObject({
      ready: false,
      diagnostics: {
        blockingCode: 'FRONTIER_FOREIGN_EPOCH_UNCOVERED',
      },
    });
  });

  it('transitions a blocked Frontier only from verified original-epoch coverage', async () => {
    const { frontier, store } = createFrontier({
      entries: [journalEntry(404, 'epoch-foreign')],
      nextJournalSequence: 405,
      legacyStates: [promotionState('epoch-foreign', 403)],
    });
    await expect(frontier.initialize()).resolves.toMatchObject({ ready: false });
    const verifiedCoverage = promotionState('epoch-foreign', 404).coverage!;

    await expect(frontier.recoverFromVerifiedForeignEpochCoverage({
      verifiedOriginalCoverage: verifiedCoverage,
      expectedRecoveredMutationId: 'mutation-404',
      expectedRecoveredJournalSequence: 404,
      expectedNextJournalSequence: 405,
    })).resolves.toMatchObject({
      ready: true,
      diagnostics: {
        status: 'ready',
        truthCoverageFrontier: 404,
        journalSequenceFrontier: 404,
        transitionFromIdentityEpoch: 'epoch-foreign',
      },
    });
    expect(store.record).toMatchObject({
      activeIdentityEpoch: 'epoch-current',
      coverage: {
        identityEpoch: 'epoch-current',
        coveredJournalSequence: 404,
      },
      transition: {
        fromIdentityEpoch: 'epoch-foreign',
        toIdentityEpoch: 'epoch-current',
        inheritedCoveredJournalSequence: 404,
      },
    });
  });

  it('rejects Frontier recovery from unverified identity or allocation evidence', async () => {
    const { frontier } = createFrontier({
      entries: [journalEntry(404, 'epoch-foreign')],
      nextJournalSequence: 405,
      legacyStates: [promotionState('epoch-foreign', 403)],
    });
    await frontier.initialize();

    await expect(frontier.recoverFromVerifiedForeignEpochCoverage({
      verifiedOriginalCoverage: promotionState('epoch-other', 404).coverage!,
      expectedRecoveredMutationId: 'mutation-404',
      expectedRecoveredJournalSequence: 404,
      expectedNextJournalSequence: 405,
    })).rejects.toThrow('coverage-mismatch');
    await expect(frontier.recoverFromVerifiedForeignEpochCoverage({
      verifiedOriginalCoverage: promotionState('epoch-foreign', 404).coverage!,
      expectedRecoveredMutationId: 'mutation-404',
      expectedRecoveredJournalSequence: 404,
      expectedNextJournalSequence: 406,
    })).rejects.toThrow('allocation-changed');
  });

  it('rejects synthetic coverage through the normal Truth Promotion state writer while blocked', async () => {
    const { frontier } = createFrontier({
      entries: [journalEntry(404, 'epoch-foreign')],
      nextJournalSequence: 405,
      legacyStates: [promotionState('epoch-foreign', 403)],
    });
    await frontier.initialize();

    await expect(frontier.write(promotionState('epoch-current', 404))).rejects.toThrow(
      'state-write-identity-mismatch',
    );
    expect(frontier.diagnostics()).toMatchObject({
      status: 'recovery-required',
      truthCoverageFrontier: 0,
      blockingCode: 'FRONTIER_FOREIGN_EPOCH_UNCOVERED',
    });
  });

  it('fails closed when the active journal is not contiguous', async () => {
    const { frontier } = createFrontier({
      entries: [journalEntry(405)],
      nextJournalSequence: 406,
      legacyStates: [promotionState('epoch-previous', 403)],
    });

    await expect(frontier.initialize()).resolves.toMatchObject({
      ready: false,
      diagnostics: {
        blockingCode: 'FRONTIER_JOURNAL_SEQUENCE_GAP',
      },
    });
  });

  it('invalidates cached admission on a runtime journal discontinuity', async () => {
    const { frontier } = createFrontier();
    await frontier.initialize();

    frontier.observeJournaledReceipt({
      ...journalEntry(2).durabilityReceipt,
      journalSequence: 2,
    });

    expect(frontier.diagnostics()).toMatchObject({
      status: 'recovery-required',
      blockingCode: 'FRONTIER_RUNTIME_DISCONTINUITY',
    });
    expect(() => frontier.assertMutationAdmission()).toThrow('STORAGE_RECOVERY_REQUIRED');
  });
});
