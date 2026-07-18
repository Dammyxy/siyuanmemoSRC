import type { MessagePackTruthSegmentFileStore } from './MessagePackTruthSegmentStore';
import { MessagePackTruthPromotionStateStore } from './MessagePackTruthPromotionStateStore';
import type { WorkerTruthPromotionState } from './WorkerTruthPromotionModule';
import {
  WORKER_VERIFIED_MUTATION_FRONTIER_VERSION,
  type WorkerVerifiedMutationFrontierRecord,
  type WorkerVerifiedMutationFrontierStore,
} from './WorkerVerifiedMutationFrontier';

export interface MessagePackVerifiedMutationFrontierStoreOptions {
  fileStore: Pick<MessagePackTruthSegmentFileStore, 'readJSON' | 'writeJSON' | 'listFiles'>;
  deviceId: string;
  basePath?: string;
}

function normalizeIdentity(value: string, label: string): string {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(normalized) || normalized.includes('..')) {
    throw new Error(`Invalid verified mutation frontier ${label}: ${value}`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isCoverage(value: unknown, deviceId: string, identityEpoch: string): boolean {
  return value === null || (
    isRecord(value)
    && value.version === 1
    && value.deviceId === deviceId
    && value.identityEpoch === identityEpoch
    && isNonNegativeInteger(value.coveredJournalSequence)
    && typeof value.coveredMutationId === 'string'
    && typeof value.truthGenerationId === 'string'
    && isFiniteNumber(value.updatedAt)
  );
}

function isTransition(value: unknown, identityEpoch: string): boolean {
  return value === null || (
    isRecord(value)
    && typeof value.fromIdentityEpoch === 'string'
    && value.toIdentityEpoch === identityEpoch
    && isNonNegativeInteger(value.inheritedCoveredJournalSequence)
    && typeof value.inheritedCoveredMutationId === 'string'
    && typeof value.inheritedTruthGenerationId === 'string'
    && isFiniteNumber(value.verifiedAt)
  );
}

function isRetry(value: unknown): boolean {
  return value === null || (
    isRecord(value)
    && typeof value.mutationId === 'string'
    && isNonNegativeInteger(value.journalSequence)
    && isNonNegativeInteger(value.attemptCount)
    && (value.nextAttemptAt === null || isFiniteNumber(value.nextAttemptAt))
    && typeof value.lastError === 'string'
  );
}

function isFrontierRecord(
  value: Record<string, unknown>,
  deviceId: string,
): boolean {
  const identityEpoch = value.activeIdentityEpoch;
  return typeof identityEpoch === 'string'
    && (value.status === 'ready' || value.status === 'recovery-required')
    && isCoverage(value.coverage, deviceId, identityEpoch)
    && isNonNegativeInteger(value.journalSequenceFrontier)
    && isNullableString(value.journalMutationId)
    && Array.isArray(value.pendingLegacyRebindMutationIds)
    && value.pendingLegacyRebindMutationIds.every((mutationId) => typeof mutationId === 'string')
    && isTransition(value.transition, identityEpoch)
    && isRetry(value.retry)
    && (value.lastSuccessfulPromotionAt === null || isFiniteNumber(value.lastSuccessfulPromotionAt))
    && isNullableString(value.blockingCode)
    && isNullableString(value.blockingReason)
    && isFiniteNumber(value.updatedAt);
}

export class MessagePackVerifiedMutationFrontierStore implements WorkerVerifiedMutationFrontierStore {
  private readonly fileStore: MessagePackVerifiedMutationFrontierStoreOptions['fileStore'];
  private readonly deviceId: string;
  private readonly devicePath: string;
  private readonly frontierPath: string;

  constructor(options: MessagePackVerifiedMutationFrontierStoreOptions) {
    this.fileStore = options.fileStore;
    this.deviceId = normalizeIdentity(options.deviceId, 'deviceId');
    const basePath = String(options.basePath || 'truth/promotion').replace(/\\/g, '/').replace(/\/+$/g, '');
    if (!basePath || basePath.includes('..')) {
      throw new Error(`Invalid verified mutation frontier base path: ${options.basePath}`);
    }
    this.devicePath = `${basePath}/device-${this.deviceId}`;
    this.frontierPath = `${this.devicePath}/frontier.v1.json`;
  }

  async read(): Promise<WorkerVerifiedMutationFrontierRecord | null> {
    const value = await this.fileStore.readJSON<unknown>(this.frontierPath);
    if (value === null || value === undefined) {
      return null;
    }
    if (!isRecord(value)) {
      throw new Error('frontier-state-corrupt');
    }
    if (Number(value.version) !== WORKER_VERIFIED_MUTATION_FRONTIER_VERSION) {
      throw new Error(`frontier-state-unsupported:${String(value.version)}`);
    }
    if (value.deviceId !== this.deviceId) {
      throw new Error('frontier-state-identity-mismatch');
    }
    if (!isFrontierRecord(value, this.deviceId)) {
      throw new Error('frontier-state-corrupt');
    }
    return structuredClone(value as unknown as WorkerVerifiedMutationFrontierRecord);
  }

  async write(record: WorkerVerifiedMutationFrontierRecord): Promise<void> {
    if (
      record.version !== WORKER_VERIFIED_MUTATION_FRONTIER_VERSION
      || record.deviceId !== this.deviceId
    ) {
      throw new Error('frontier-state-write-identity-mismatch');
    }
    const candidate = structuredClone(record);
    await this.fileStore.writeJSON(this.frontierPath, candidate);
    const verified = await this.read();
    if (!verified || JSON.stringify(verified) !== JSON.stringify(candidate)) {
      throw new Error('frontier-state-verification-failed');
    }
  }

  async listLegacyPromotionStates(): Promise<WorkerTruthPromotionState[]> {
    if (!this.fileStore.listFiles) {
      throw new Error('frontier-state-list-unsupported');
    }
    const prefix = `${this.devicePath}/`;
    const paths = (await this.fileStore.listFiles(prefix))
      .map((path) => String(path).replace(/\\/g, '/'))
      .filter((path) => path.startsWith(prefix) && /\/epoch-[^/]+\/state\.v1\.json$/.test(path));
    const states: WorkerTruthPromotionState[] = [];
    for (const path of Array.from(new Set(paths)).sort()) {
      const match = path.match(/\/epoch-([^/]+)\/state\.v1\.json$/);
      if (!match) continue;
      const identityEpoch = normalizeIdentity(match[1], 'identityEpoch');
      const state = await new MessagePackTruthPromotionStateStore({
        fileStore: this.fileStore,
        deviceId: this.deviceId,
        identityEpoch,
        basePath: this.devicePath.replace(/\/device-[^/]+$/, ''),
      }).read();
      if (state) states.push(state);
    }
    return states;
  }
}
