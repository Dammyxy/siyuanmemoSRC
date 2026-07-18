import {
  FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION,
  type BackendForeignEpochRecoveryPhaseReceipt,
} from '../../packages/contracts/src/backend-rpc';

export interface WorkerForeignEpochRecoveryReceiptFileStore {
  readJSON<T>(path: string): Promise<T | null>;
  writeJSON(path: string, value: unknown): Promise<void>;
  listFiles?(prefix: string): Promise<string[]>;
}

const RECOVERY_RECEIPT_ROOT = 'truth/recovery/foreign-epoch';
const LATEST_RECEIPT_PATH = `${RECOVERY_RECEIPT_ROOT}/latest.v1.json`;

function normalizeOperationId(value: string): string {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(normalized) || normalized.includes('..')) {
    throw new Error(`RECOVERY_RECEIPT_INVALID: operationId ${value}`);
  }
  return normalized;
}

function receiptPath(operationId: string): string {
  return `${RECOVERY_RECEIPT_ROOT}/${normalizeOperationId(operationId)}/receipts.v1.json`;
}

function isReceipt(value: unknown): value is BackendForeignEpochRecoveryPhaseReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as Partial<BackendForeignEpochRecoveryPhaseReceipt>;
  return receipt.version === FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION
    && typeof receipt.operationId === 'string'
    && typeof receipt.planHash === 'string'
    && typeof receipt.phase === 'string'
    && typeof receipt.evidenceHash === 'string'
    && Array.isArray(receipt.artifactHashes)
    && receipt.artifactHashes.every((hash) => typeof hash === 'string')
    && typeof receipt.completedAt === 'number'
    && Number.isFinite(receipt.completedAt);
}

function sameReceipt(
  left: BackendForeignEpochRecoveryPhaseReceipt,
  right: BackendForeignEpochRecoveryPhaseReceipt,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class WorkerForeignEpochRecoveryReceiptStore {
  constructor(private readonly fileStore: WorkerForeignEpochRecoveryReceiptFileStore) {}

  async list(operationId: string): Promise<BackendForeignEpochRecoveryPhaseReceipt[]> {
    const normalized = normalizeOperationId(operationId);
    const value = await this.fileStore.readJSON<unknown>(receiptPath(normalized));
    if (value == null) return [];
    if (!Array.isArray(value) || !value.every(isReceipt)) {
      throw new Error('RECOVERY_RECEIPT_INVALID: receipt list is corrupt');
    }
    const receipts = value as BackendForeignEpochRecoveryPhaseReceipt[];
    if (receipts.some((receipt) => receipt.operationId !== normalized)) {
      throw new Error('RECOVERY_RECEIPT_INVALID: operation identity mismatch');
    }
    return structuredClone(receipts);
  }

  async append(receipt: BackendForeignEpochRecoveryPhaseReceipt): Promise<void> {
    if (!isReceipt(receipt)) {
      throw new Error('RECOVERY_RECEIPT_INVALID: refusing invalid phase receipt');
    }
    const operationId = normalizeOperationId(receipt.operationId);
    const current = await this.list(operationId);
    const samePhase = current.find((candidate) => candidate.phase === receipt.phase);
    if (samePhase) {
      if (sameReceipt(samePhase, receipt)) return;
      throw new Error(`RECOVERY_RECEIPT_CONFLICT: phase ${receipt.phase} already belongs to different evidence`);
    }
    if (current.some((candidate) => candidate.planHash !== receipt.planHash)) {
      throw new Error('RECOVERY_RECEIPT_CONFLICT: operationId belongs to another plan');
    }
    const next = [...current, structuredClone(receipt)];
    await this.fileStore.writeJSON(receiptPath(operationId), next);
    await this.fileStore.writeJSON(LATEST_RECEIPT_PATH, {
      version: FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION,
      operationId,
      planHash: receipt.planHash,
      updatedAt: receipt.completedAt,
    });
    const verified = await this.list(operationId);
    if (verified.length !== next.length || !verified.every((candidate, index) => sameReceipt(candidate, next[index]))) {
      throw new Error('RECOVERY_RECEIPT_VERIFICATION_FAILED: phase receipt read-back mismatch');
    }
  }

  async latestOperationId(): Promise<string | null> {
    const latest = await this.fileStore.readJSON<unknown>(LATEST_RECEIPT_PATH);
    if (!latest || typeof latest !== 'object' || Array.isArray(latest)) return null;
    const operationId = String((latest as { operationId?: unknown }).operationId || '').trim();
    return operationId ? normalizeOperationId(operationId) : null;
  }
}
