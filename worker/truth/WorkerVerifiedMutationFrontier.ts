import type {
  StorageDurabilityReceipt,
  StorageMutationEnvelope,
  TruthCoverageWatermark,
} from '../../packages/contracts/src/backend-rpc';
import type {
  WorkerTruthPromotionJournalEntry,
  WorkerTruthPromotionState,
  WorkerTruthPromotionStateStore,
} from './WorkerTruthPromotionModule';

export const WORKER_VERIFIED_MUTATION_FRONTIER_VERSION = 1 as const;

export type WorkerVerifiedMutationFrontierStatus = 'ready' | 'recovery-required';
export type WorkerVerifiedMutationFrontierFailureCode =
  | 'FRONTIER_STATE_UNSUPPORTED'
  | 'FRONTIER_IDENTITY_MISMATCH'
  | 'FRONTIER_JOURNAL_ALLOCATION_INVALID'
  | 'FRONTIER_JOURNAL_SEQUENCE_CONFLICT'
  | 'FRONTIER_JOURNAL_SEQUENCE_GAP'
  | 'FRONTIER_PREDECESSOR_CONFLICT'
  | 'FRONTIER_PREDECESSOR_UNVERIFIED'
  | 'FRONTIER_FOREIGN_EPOCH_UNCOVERED'
  | 'FRONTIER_RUNTIME_DISCONTINUITY';

export interface WorkerVerifiedMutationFrontierTransition {
  fromIdentityEpoch: string;
  toIdentityEpoch: string;
  inheritedCoveredJournalSequence: number;
  inheritedCoveredMutationId: string;
  inheritedTruthGenerationId: string;
  verifiedAt: number;
}

export interface WorkerVerifiedMutationFrontierRecord {
  version: typeof WORKER_VERIFIED_MUTATION_FRONTIER_VERSION;
  deviceId: string;
  activeIdentityEpoch: string;
  status: WorkerVerifiedMutationFrontierStatus;
  coverage: TruthCoverageWatermark | null;
  journalSequenceFrontier: number;
  journalMutationId: string | null;
  pendingLegacyRebindMutationIds: string[];
  transition: WorkerVerifiedMutationFrontierTransition | null;
  retry: WorkerTruthPromotionState['retry'];
  lastSuccessfulPromotionAt: number | null;
  blockingCode: WorkerVerifiedMutationFrontierFailureCode | null;
  blockingReason: string | null;
  updatedAt: number;
}

export interface WorkerVerifiedMutationFrontierDiagnostics {
  status: WorkerVerifiedMutationFrontierStatus;
  deviceId: string;
  activeIdentityEpoch: string;
  journalSequenceFrontier: number;
  truthCoverageFrontier: number;
  pendingMutationCount: number;
  transitionFromIdentityEpoch: string | null;
  retryClass: 'none' | 'retryable' | 'recovery-required';
  lastSuccessfulPromotionAt: number | null;
  blockingCode: WorkerVerifiedMutationFrontierFailureCode | null;
  blockingReason: string | null;
  updatedAt: number;
}

export interface WorkerVerifiedMutationFrontierStore {
  read(): Promise<WorkerVerifiedMutationFrontierRecord | null>;
  write(record: WorkerVerifiedMutationFrontierRecord): Promise<void>;
}

export interface WorkerVerifiedMutationFrontierJournalEvidence {
  nextJournalSequence: number;
  entries: WorkerTruthPromotionJournalEntry[];
}

export interface WorkerVerifiedMutationFrontierOptions {
  deviceId: string;
  identityEpoch: string;
  store: WorkerVerifiedMutationFrontierStore;
  readJournalEvidence(): Promise<WorkerVerifiedMutationFrontierJournalEvidence>;
  listLegacyPromotionStates(): Promise<WorkerTruthPromotionState[]>;
  now?: () => number;
}

export interface WorkerVerifiedMutationFrontierInitializationResult {
  ready: boolean;
  diagnostics: WorkerVerifiedMutationFrontierDiagnostics;
}

export interface WorkerVerifiedMutationFrontierRecoveryInput {
  verifiedOriginalCoverage: TruthCoverageWatermark;
  expectedRecoveredMutationId: string;
  expectedRecoveredJournalSequence: number;
  expectedNextJournalSequence: number;
}

type CoverageCandidate = {
  coverage: TruthCoverageWatermark;
  lastSuccessfulPromotionAt: number | null;
};

function normalizeIdentity(value: string, label: string): string {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(normalized) || normalized.includes('..')) {
    throw new Error(`Invalid verified mutation frontier ${label}: ${value}`);
  }
  return normalized;
}

function sequenceOf(entry: WorkerTruthPromotionJournalEntry): number | null {
  const sequence = entry.mutationEnvelope.journalSequence;
  return typeof sequence === 'number' && Number.isInteger(sequence) && sequence > 0
    ? sequence
    : null;
}

function retryClass(record: WorkerVerifiedMutationFrontierRecord): WorkerVerifiedMutationFrontierDiagnostics['retryClass'] {
  if (record.status === 'recovery-required') {
    return 'recovery-required';
  }
  return record.retry ? 'retryable' : 'none';
}

export class WorkerVerifiedMutationFrontier implements WorkerTruthPromotionStateStore {
  private readonly deviceId: string;
  private readonly identityEpoch: string;
  private readonly store: WorkerVerifiedMutationFrontierStore;
  private readonly readJournalEvidence: WorkerVerifiedMutationFrontierOptions['readJournalEvidence'];
  private readonly listLegacyPromotionStates: WorkerVerifiedMutationFrontierOptions['listLegacyPromotionStates'];
  private readonly now: () => number;
  private record: WorkerVerifiedMutationFrontierRecord | null = null;

  constructor(options: WorkerVerifiedMutationFrontierOptions) {
    this.deviceId = normalizeIdentity(options.deviceId, 'deviceId');
    this.identityEpoch = normalizeIdentity(options.identityEpoch, 'identityEpoch');
    this.store = options.store;
    this.readJournalEvidence = options.readJournalEvidence;
    this.listLegacyPromotionStates = options.listLegacyPromotionStates;
    this.now = options.now ?? Date.now;
  }

  async initialize(): Promise<WorkerVerifiedMutationFrontierInitializationResult> {
    try {
      const [stored, journalEvidence] = await Promise.all([
        this.store.read(),
        this.readJournalEvidence(),
      ]);
      const normalizedJournal = this.normalizeJournalEvidence(journalEvidence);
      const candidate = stored
        ? await this.continueStoredFrontier(stored, normalizedJournal)
        : await this.migrateFrontier(normalizedJournal);
      if (stored && this.recordsAreEquivalent(stored, candidate)) {
        this.record = structuredClone(stored);
      } else {
        this.record = candidate;
        await this.store.write(candidate);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const code = this.classifyInitializationError(reason);
      const blocked = this.createBlockedRecord(code, reason, this.record);
      this.record = blocked;
      if (!reason.startsWith('frontier-state-')) {
        await this.store.write(blocked);
      }
    }
    return {
      ready: this.record?.status === 'ready',
      diagnostics: this.diagnostics(),
    };
  }

  isReady(): boolean {
    return this.record?.status === 'ready';
  }

  assertMutationAdmission(envelope?: StorageMutationEnvelope): void {
    const record = this.requireRecord();
    if (record.status !== 'ready') {
      throw new Error(
        `STORAGE_RECOVERY_REQUIRED: ${record.blockingCode ?? 'FRONTIER_RUNTIME_DISCONTINUITY'}: ${record.blockingReason ?? 'verified mutation frontier requires recovery'}`,
      );
    }
    if (envelope && record.pendingLegacyRebindMutationIds.length > 0) {
      throw new Error(
        `STORAGE_RECOVERY_REQUIRED: FRONTIER_FOREIGN_EPOCH_UNCOVERED: provisional legacy mutations require recovery before ${envelope.mutationId}`,
      );
    }
    if (envelope && (
      envelope.deviceId !== this.deviceId
      || envelope.identityEpoch !== this.identityEpoch
    )) {
      throw new Error(
        `STORAGE_RECOVERY_REQUIRED: FRONTIER_IDENTITY_MISMATCH: mutation ${envelope.mutationId} does not match the active frontier identity`,
      );
    }
  }

  observeJournaledReceipt(receipt: StorageDurabilityReceipt): void {
    const record = this.requireRecord();
    if (record.status !== 'ready' || receipt.stage === 'failed' || receipt.journalSequence === null) {
      return;
    }
    const sequence = receipt.journalSequence;
    if (sequence === record.journalSequenceFrontier && receipt.mutationId === record.journalMutationId) {
      return;
    }
    if (sequence !== record.journalSequenceFrontier + 1) {
      this.record = this.createBlockedRecord(
        'FRONTIER_RUNTIME_DISCONTINUITY',
        `journal sequence expected ${record.journalSequenceFrontier + 1} but observed ${sequence}`,
        record,
      );
      return;
    }
    this.record = {
      ...record,
      journalSequenceFrontier: sequence,
      journalMutationId: receipt.mutationId,
      updatedAt: this.now(),
    };
  }

  async block(
    code: WorkerVerifiedMutationFrontierFailureCode,
    reason: string,
  ): Promise<boolean> {
    const prior = this.requireRecord();
    const changed = prior.status !== 'recovery-required'
      || prior.blockingCode !== code
      || prior.blockingReason !== reason;
    if (!changed) {
      return false;
    }
    this.record = this.createBlockedRecord(code, reason, prior);
    await this.store.write(this.record);
    return true;
  }

  async recoverFromVerifiedForeignEpochCoverage(
    input: WorkerVerifiedMutationFrontierRecoveryInput,
  ): Promise<WorkerVerifiedMutationFrontierInitializationResult> {
    const prior = this.requireRecord();
    const coverage = structuredClone(input.verifiedOriginalCoverage);
    if (
      prior.status !== 'recovery-required'
      || prior.blockingCode !== 'FRONTIER_FOREIGN_EPOCH_UNCOVERED'
      || prior.activeIdentityEpoch !== this.identityEpoch
    ) {
      throw new Error('frontier-recovery-state-ineligible');
    }
    if (
      coverage.deviceId !== this.deviceId
      || coverage.identityEpoch === this.identityEpoch
      || !String(prior.blockingReason || '').endsWith(`:${coverage.identityEpoch}`)
      || coverage.coveredJournalSequence !== input.expectedRecoveredJournalSequence
      || coverage.coveredMutationId !== input.expectedRecoveredMutationId
    ) {
      throw new Error('frontier-recovery-coverage-mismatch');
    }
    const journal = this.normalizeJournalEvidence(await this.readJournalEvidence());
    if (journal.nextJournalSequence !== input.expectedNextJournalSequence) {
      throw new Error(
        `frontier-recovery-journal-allocation-changed:${journal.nextJournalSequence}:${input.expectedNextJournalSequence}`,
      );
    }
    const recoveredEntry = journal.entries.find(
      (entry) => sequenceOf(entry) === input.expectedRecoveredJournalSequence,
    );
    if (
      !recoveredEntry
      || recoveredEntry.mutationEnvelope.mutationId !== input.expectedRecoveredMutationId
      || recoveredEntry.mutationEnvelope.identityEpoch !== coverage.identityEpoch
    ) {
      throw new Error('frontier-recovery-journal-evidence-mismatch');
    }
    const candidate = this.buildReadyRecord({
      journal,
      coverage,
      transition: this.buildTransition(coverage.identityEpoch, coverage),
      retry: null,
      lastSuccessfulPromotionAt: coverage.updatedAt,
    });
    if (
      candidate.status !== 'ready'
      || candidate.coverage?.coveredJournalSequence !== input.expectedRecoveredJournalSequence
      || candidate.journalSequenceFrontier !== input.expectedNextJournalSequence - 1
    ) {
      throw new Error('frontier-recovery-transition-verification-failed');
    }
    await this.store.write(candidate);
    this.record = candidate;
    return {
      ready: true,
      diagnostics: this.diagnostics(),
    };
  }

  diagnostics(): WorkerVerifiedMutationFrontierDiagnostics {
    const record = this.requireRecord();
    const coverage = record.coverage?.coveredJournalSequence ?? 0;
    return {
      status: record.status,
      deviceId: record.deviceId,
      activeIdentityEpoch: record.activeIdentityEpoch,
      journalSequenceFrontier: record.journalSequenceFrontier,
      truthCoverageFrontier: coverage,
      pendingMutationCount: Math.max(0, record.journalSequenceFrontier - coverage),
      transitionFromIdentityEpoch: record.transition?.fromIdentityEpoch ?? null,
      retryClass: retryClass(record),
      lastSuccessfulPromotionAt: record.lastSuccessfulPromotionAt,
      blockingCode: record.blockingCode,
      blockingReason: record.blockingReason,
      updatedAt: record.updatedAt,
    };
  }

  async read(): Promise<WorkerTruthPromotionState | null> {
    const record = this.requireRecord();
    return {
      version: 1,
      deviceId: this.deviceId,
      identityEpoch: this.identityEpoch,
      coverage: record.coverage ? structuredClone(record.coverage) : null,
      retry: record.retry ? structuredClone(record.retry) : null,
      lastSuccessfulPromotionAt: record.lastSuccessfulPromotionAt,
      updatedAt: record.updatedAt,
    };
  }

  async write(state: WorkerTruthPromotionState): Promise<void> {
    let record = this.requireRecord();
    if (
      record.status !== 'ready'
      || state.version !== 1
      || state.deviceId !== this.deviceId
      || state.identityEpoch !== this.identityEpoch
    ) {
      throw new Error('verified-mutation-frontier-state-write-identity-mismatch');
    }
    const nextCoverage = state.coverage;
    const priorCoverage = record.coverage?.coveredJournalSequence ?? 0;
    if (nextCoverage && nextCoverage.coveredJournalSequence > record.journalSequenceFrontier) {
      const journal = this.normalizeJournalEvidence(await this.readJournalEvidence());
      record = this.buildReadyRecord({
        journal,
        coverage: record.coverage,
        transition: record.transition,
        retry: record.retry,
        lastSuccessfulPromotionAt: record.lastSuccessfulPromotionAt,
      });
    }
    if (nextCoverage && (
      nextCoverage.deviceId !== this.deviceId
      || nextCoverage.identityEpoch !== this.identityEpoch
      || nextCoverage.coveredJournalSequence < priorCoverage
      || nextCoverage.coveredJournalSequence > record.journalSequenceFrontier
    )) {
      throw new Error('verified-mutation-frontier-coverage-non-monotonic');
    }
    const next: WorkerVerifiedMutationFrontierRecord = {
      ...record,
      coverage: nextCoverage ? structuredClone(nextCoverage) : record.coverage,
      retry: state.retry ? structuredClone(state.retry) : null,
      lastSuccessfulPromotionAt: state.lastSuccessfulPromotionAt,
      blockingCode: null,
      blockingReason: null,
      updatedAt: Math.max(this.now(), state.updatedAt),
    };
    await this.store.write(next);
    this.record = next;
  }

  private normalizeJournalEvidence(
    evidence: WorkerVerifiedMutationFrontierJournalEvidence,
  ): WorkerVerifiedMutationFrontierJournalEvidence {
    const nextJournalSequence = Math.floor(Number(evidence.nextJournalSequence));
    if (!Number.isInteger(nextJournalSequence) || nextJournalSequence < 1) {
      throw new Error(`frontier-journal-allocation-invalid:${String(evidence.nextJournalSequence)}`);
    }
    const bySequence = new Map<number, WorkerTruthPromotionJournalEntry>();
    for (const entry of evidence.entries) {
      const sequence = sequenceOf(entry);
      if (entry.mutationEnvelope.deviceId !== this.deviceId) {
        throw new Error(`frontier-identity-mismatch:${entry.mutationEnvelope.mutationId}`);
      }
      if (sequence === null || sequence >= nextJournalSequence) {
        throw new Error(`frontier-journal-allocation-invalid:${entry.mutationEnvelope.mutationId}`);
      }
      const existing = bySequence.get(sequence);
      if (existing && existing.mutationEnvelope.mutationId !== entry.mutationEnvelope.mutationId) {
        throw new Error(`frontier-journal-sequence-conflict:${sequence}`);
      }
      bySequence.set(sequence, structuredClone(entry));
    }
    return {
      nextJournalSequence,
      entries: Array.from(bySequence.values())
        .sort((left, right) => (sequenceOf(left) ?? 0) - (sequenceOf(right) ?? 0)),
    };
  }

  private async continueStoredFrontier(
    stored: WorkerVerifiedMutationFrontierRecord,
    journal: WorkerVerifiedMutationFrontierJournalEvidence,
  ): Promise<WorkerVerifiedMutationFrontierRecord> {
    this.validateStoredRecord(stored);
    if (stored.status === 'recovery-required') {
      if (stored.activeIdentityEpoch === this.identityEpoch) {
        return structuredClone(stored);
      }
      return this.createBlockedRecord(
        stored.blockingCode ?? 'FRONTIER_PREDECESSOR_UNVERIFIED',
        stored.blockingReason ?? 'stored verified mutation frontier requires recovery',
        stored,
      );
    }
    if (stored.activeIdentityEpoch === this.identityEpoch) {
      return this.buildReadyRecord({
        journal,
        coverage: stored.coverage,
        transition: stored.transition,
        retry: stored.retry,
        lastSuccessfulPromotionAt: stored.lastSuccessfulPromotionAt,
      });
    }
    return this.buildReadyRecord({
      journal,
      coverage: stored.coverage,
      transition: stored.coverage
        ? this.buildTransition(stored.activeIdentityEpoch, stored.coverage)
        : null,
      retry: null,
      lastSuccessfulPromotionAt: stored.lastSuccessfulPromotionAt,
    });
  }

  private async migrateFrontier(
    journal: WorkerVerifiedMutationFrontierJournalEvidence,
  ): Promise<WorkerVerifiedMutationFrontierRecord> {
    if (journal.nextJournalSequence === 1 && journal.entries.length === 0) {
      return this.buildReadyRecord({
        journal,
        coverage: null,
        transition: null,
        retry: null,
        lastSuccessfulPromotionAt: null,
      });
    }
    const legacyStates = await this.listLegacyPromotionStates();
    const candidates = legacyStates
      .filter((state) => state.deviceId === this.deviceId && state.coverage)
      .map((state): CoverageCandidate => ({
        coverage: structuredClone(state.coverage!),
        lastSuccessfulPromotionAt: state.lastSuccessfulPromotionAt,
      }));
    const highestSequence = Math.max(0, ...candidates.map((candidate) => candidate.coverage.coveredJournalSequence));
    const highest = candidates.filter((candidate) => candidate.coverage.coveredJournalSequence === highestSequence);
    const uniqueEvidence = new Set(highest.map((candidate) => [
      candidate.coverage.identityEpoch,
      candidate.coverage.coveredMutationId,
      candidate.coverage.truthGenerationId,
    ].join('|')));
    if (uniqueEvidence.size > 1) {
      throw new Error(`frontier-predecessor-conflict:${highestSequence}`);
    }
    const selected = highest[0] ?? null;
    return this.buildReadyRecord({
      journal,
      coverage: selected?.coverage ?? null,
      transition: selected?.coverage && selected.coverage.identityEpoch !== this.identityEpoch
        ? this.buildTransition(selected.coverage.identityEpoch, selected.coverage)
        : null,
      retry: null,
      lastSuccessfulPromotionAt: selected?.lastSuccessfulPromotionAt ?? null,
    });
  }

  private buildReadyRecord(input: {
    journal: WorkerVerifiedMutationFrontierJournalEvidence;
    coverage: TruthCoverageWatermark | null;
    transition: WorkerVerifiedMutationFrontierTransition | null;
    retry: WorkerTruthPromotionState['retry'];
    lastSuccessfulPromotionAt: number | null;
  }): WorkerVerifiedMutationFrontierRecord {
    const journalFrontier = input.journal.nextJournalSequence - 1;
    const coveredSequence = input.coverage?.coveredJournalSequence ?? 0;
    if (coveredSequence > journalFrontier) {
      throw new Error(`frontier-predecessor-unverified:${coveredSequence}:${journalFrontier}`);
    }
    const coveredEntry = input.journal.entries.find((entry) => sequenceOf(entry) === coveredSequence);
    if (input.coverage && coveredEntry
      && coveredEntry.mutationEnvelope.mutationId !== input.coverage.coveredMutationId) {
      throw new Error(`frontier-predecessor-unverified:${coveredSequence}:mutation-mismatch`);
    }
    const uncovered = input.journal.entries.filter((entry) => (sequenceOf(entry) ?? 0) > coveredSequence);
    const pendingLegacyRebindMutationIds: string[] = [];
    let expected = coveredSequence + 1;
    for (const entry of uncovered) {
      const sequence = sequenceOf(entry)!;
      if (entry.mutationEnvelope.identityEpoch !== this.identityEpoch) {
        if (this.isRebindableLegacyAdoption(entry)) {
          pendingLegacyRebindMutationIds.push(entry.mutationEnvelope.mutationId);
        } else {
          throw new Error(`frontier-foreign-epoch-uncovered:${sequence}:${entry.mutationEnvelope.identityEpoch}`);
        }
      }
      if (sequence !== expected) {
        throw new Error(`frontier-journal-sequence-gap:${expected}:${sequence}`);
      }
      expected += 1;
    }
    if (expected !== input.journal.nextJournalSequence) {
      throw new Error(`frontier-journal-sequence-gap:${expected}:${input.journal.nextJournalSequence}`);
    }
    const normalizedCoverage = input.coverage
      ? {
          ...structuredClone(input.coverage),
          deviceId: this.deviceId,
          identityEpoch: this.identityEpoch,
        }
      : null;
    const lastEntry = input.journal.entries.find((entry) => sequenceOf(entry) === journalFrontier) ?? null;
    const at = this.now();
    return {
      version: WORKER_VERIFIED_MUTATION_FRONTIER_VERSION,
      deviceId: this.deviceId,
      activeIdentityEpoch: this.identityEpoch,
      status: 'ready',
      coverage: normalizedCoverage,
      journalSequenceFrontier: journalFrontier,
      journalMutationId: lastEntry?.mutationEnvelope.mutationId ?? null,
      pendingLegacyRebindMutationIds,
      transition: input.transition,
      retry: input.retry ? structuredClone(input.retry) : null,
      lastSuccessfulPromotionAt: input.lastSuccessfulPromotionAt,
      blockingCode: null,
      blockingReason: null,
      updatedAt: at,
    };
  }

  private buildTransition(
    fromIdentityEpoch: string,
    coverage: TruthCoverageWatermark,
  ): WorkerVerifiedMutationFrontierTransition {
    return {
      fromIdentityEpoch,
      toIdentityEpoch: this.identityEpoch,
      inheritedCoveredJournalSequence: coverage.coveredJournalSequence,
      inheritedCoveredMutationId: coverage.coveredMutationId,
      inheritedTruthGenerationId: coverage.truthGenerationId,
      verifiedAt: this.now(),
    };
  }

  private validateStoredRecord(record: WorkerVerifiedMutationFrontierRecord): void {
    if (record.version !== WORKER_VERIFIED_MUTATION_FRONTIER_VERSION) {
      throw new Error(`frontier-state-unsupported:${String(record.version)}`);
    }
    if (record.deviceId !== this.deviceId) {
      throw new Error(`frontier-identity-mismatch:${record.deviceId}`);
    }
  }

  private recordsAreEquivalent(
    left: WorkerVerifiedMutationFrontierRecord,
    right: WorkerVerifiedMutationFrontierRecord,
  ): boolean {
    return left.version === right.version
      && left.deviceId === right.deviceId
      && left.activeIdentityEpoch === right.activeIdentityEpoch
      && left.status === right.status
      && JSON.stringify(left.coverage) === JSON.stringify(right.coverage)
      && left.journalSequenceFrontier === right.journalSequenceFrontier
      && left.journalMutationId === right.journalMutationId
      && JSON.stringify(left.pendingLegacyRebindMutationIds) === JSON.stringify(right.pendingLegacyRebindMutationIds)
      && JSON.stringify(left.transition) === JSON.stringify(right.transition)
      && JSON.stringify(left.retry) === JSON.stringify(right.retry)
      && left.lastSuccessfulPromotionAt === right.lastSuccessfulPromotionAt
      && left.blockingCode === right.blockingCode
      && left.blockingReason === right.blockingReason;
  }

  private createBlockedRecord(
    code: WorkerVerifiedMutationFrontierFailureCode,
    reason: string,
    prior: WorkerVerifiedMutationFrontierRecord | null,
  ): WorkerVerifiedMutationFrontierRecord {
    return {
      version: WORKER_VERIFIED_MUTATION_FRONTIER_VERSION,
      deviceId: this.deviceId,
      activeIdentityEpoch: this.identityEpoch,
      status: 'recovery-required',
      coverage: prior?.coverage ? structuredClone(prior.coverage) : null,
      journalSequenceFrontier: prior?.journalSequenceFrontier ?? 0,
      journalMutationId: prior?.journalMutationId ?? null,
      pendingLegacyRebindMutationIds: prior?.pendingLegacyRebindMutationIds ?? [],
      transition: prior?.transition ? structuredClone(prior.transition) : null,
      retry: null,
      lastSuccessfulPromotionAt: prior?.lastSuccessfulPromotionAt ?? null,
      blockingCode: code,
      blockingReason: reason,
      updatedAt: this.now(),
    };
  }

  private classifyInitializationError(reason: string): WorkerVerifiedMutationFrontierFailureCode {
    if (reason.includes('unsupported') || reason.includes('state-corrupt')) return 'FRONTIER_STATE_UNSUPPORTED';
    if (reason.includes('identity-mismatch')) return 'FRONTIER_IDENTITY_MISMATCH';
    if (reason.includes('journal-allocation-invalid')) return 'FRONTIER_JOURNAL_ALLOCATION_INVALID';
    if (reason.includes('journal-sequence-conflict')) return 'FRONTIER_JOURNAL_SEQUENCE_CONFLICT';
    if (reason.includes('journal-sequence-gap')) return 'FRONTIER_JOURNAL_SEQUENCE_GAP';
    if (reason.includes('predecessor-conflict')) return 'FRONTIER_PREDECESSOR_CONFLICT';
    if (reason.includes('foreign-epoch-uncovered')) return 'FRONTIER_FOREIGN_EPOCH_UNCOVERED';
    return 'FRONTIER_PREDECESSOR_UNVERIFIED';
  }

  private isRebindableLegacyAdoption(entry: WorkerTruthPromotionJournalEntry): boolean {
    return entry.durabilityReceipt.stage === 'journaled'
      && entry.durabilityReceipt.truthGenerationId === null
      && entry.durabilityReceipt.diagnosticCode === 'LEGACY_DELTA_ADOPTED';
  }

  private requireRecord(): WorkerVerifiedMutationFrontierRecord {
    if (!this.record) {
      throw new Error('verified-mutation-frontier-uninitialized');
    }
    return this.record;
  }
}
