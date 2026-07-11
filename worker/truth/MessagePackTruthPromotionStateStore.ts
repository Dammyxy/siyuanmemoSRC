import type { MessagePackTruthSegmentFileStore } from './MessagePackTruthSegmentStore';
import {
  WORKER_TRUTH_PROMOTION_STATE_VERSION,
  type WorkerTruthPromotionState,
  type WorkerTruthPromotionStateStore,
} from './WorkerTruthPromotionModule';

export interface MessagePackTruthPromotionStateStoreOptions {
  fileStore: Pick<MessagePackTruthSegmentFileStore, 'readJSON' | 'writeJSON'>;
  deviceId: string;
  identityEpoch: string;
  basePath?: string;
}

function normalizeIdentity(value: string, label: string): string {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(normalized) || normalized.includes('..')) {
    throw new Error(`Invalid truth promotion ${label}: ${value}`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class MessagePackTruthPromotionStateStore implements WorkerTruthPromotionStateStore {
  private readonly fileStore: MessagePackTruthPromotionStateStoreOptions['fileStore'];
  private readonly deviceId: string;
  private readonly identityEpoch: string;
  private readonly statePath: string;

  constructor(options: MessagePackTruthPromotionStateStoreOptions) {
    this.fileStore = options.fileStore;
    this.deviceId = normalizeIdentity(options.deviceId, 'deviceId');
    this.identityEpoch = normalizeIdentity(options.identityEpoch, 'identityEpoch');
    const basePath = String(options.basePath || 'truth/promotion').replace(/\\/g, '/').replace(/\/+$/g, '');
    if (!basePath || basePath.includes('..')) {
      throw new Error(`Invalid truth promotion base path: ${options.basePath}`);
    }
    this.statePath = `${basePath}/device-${this.deviceId}/epoch-${this.identityEpoch}/state.v1.json`;
  }

  async read(): Promise<WorkerTruthPromotionState | null> {
    const value = await this.fileStore.readJSON<unknown>(this.statePath);
    if (value === null || value === undefined) {
      return null;
    }
    if (!isRecord(value)) {
      throw new Error('truth-promotion-state-corrupt');
    }
    if (Number(value.version) !== WORKER_TRUTH_PROMOTION_STATE_VERSION) {
      throw new Error(`truth-promotion-state-unsupported-version:${String(value.version)}`);
    }
    if (value.deviceId !== this.deviceId || value.identityEpoch !== this.identityEpoch) {
      throw new Error('truth-promotion-state-identity-mismatch');
    }
    return structuredClone(value as unknown as WorkerTruthPromotionState);
  }

  async write(state: WorkerTruthPromotionState): Promise<void> {
    if (
      state.version !== WORKER_TRUTH_PROMOTION_STATE_VERSION
      || state.deviceId !== this.deviceId
      || state.identityEpoch !== this.identityEpoch
    ) {
      throw new Error('truth-promotion-state-write-identity-mismatch');
    }
    const candidate = structuredClone(state);
    await this.fileStore.writeJSON(this.statePath, candidate);
    const verified = await this.read();
    if (!verified || JSON.stringify(verified) !== JSON.stringify(candidate)) {
      throw new Error('truth-promotion-state-verification-failed');
    }
  }
}
