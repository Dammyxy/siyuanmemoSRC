import type {
  TransactionProvenanceReason,
  TransactionProvenanceSnapshot,
  TransactionProvenanceSnapshotEntry,
  TransactionProvenanceSource,
} from './transaction-fanout-coordinator';

export interface TransactionProvenanceRegistryOptions {
  defaultTtlMs?: number;
  now?: () => number;
}

export interface RecordTransactionProvenanceInput {
  blockId: string;
  expiresAt?: number;
  reason: TransactionProvenanceReason;
  source: TransactionProvenanceSource;
  suppressAutoCard?: boolean;
  ttlMs?: number;
}

const DEFAULT_TRANSACTION_PROVENANCE_TTL_MS = 10_000;

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeTimestamp(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.floor(numberValue) : 0;
}

export class TransactionProvenanceRegistry {
  private readonly now: () => number;
  private readonly defaultTtlMs: number;
  private readonly entriesByBlockId = new Map<string, Required<TransactionProvenanceSnapshotEntry>>();

  constructor(options: TransactionProvenanceRegistryOptions = {}) {
    this.now = options.now ?? Date.now;
    this.defaultTtlMs = Math.max(1, Math.floor(options.defaultTtlMs ?? DEFAULT_TRANSACTION_PROVENANCE_TTL_MS));
  }

  record(input: RecordTransactionProvenanceInput): void {
    const blockId = normalizeString(input.blockId);
    if (!blockId) {
      return;
    }
    const now = this.now();
    const explicitExpiresAt = normalizeTimestamp(input.expiresAt);
    const ttlMs = Math.max(1, Math.floor(Number(input.ttlMs ?? this.defaultTtlMs)));
    const expiresAt = explicitExpiresAt > now ? explicitExpiresAt : now + ttlMs;
    const current = this.entriesByBlockId.get(blockId);
    if (current && current.expiresAt > expiresAt) {
      return;
    }
    this.entriesByBlockId.set(blockId, {
      blockId,
      expiresAt,
      reason: input.reason,
      source: input.source,
      suppressAutoCard: input.suppressAutoCard !== false,
    });
  }

  recordBlockIds(
    blockIds: string[],
    details: Omit<RecordTransactionProvenanceInput, 'blockId'>,
  ): void {
    for (const blockId of blockIds) {
      this.record({
        ...details,
        blockId,
      });
    }
  }

  createSnapshot(now = this.now()): TransactionProvenanceSnapshot {
    this.prune(now);
    return {
      capturedAt: now,
      entries: Array.from(this.entriesByBlockId.values()).map((entry) => ({ ...entry })),
    };
  }

  prune(now = this.now()): void {
    for (const [blockId, entry] of this.entriesByBlockId.entries()) {
      if (entry.expiresAt <= now) {
        this.entriesByBlockId.delete(blockId);
      }
    }
  }

  clear(): void {
    this.entriesByBlockId.clear();
  }
}
