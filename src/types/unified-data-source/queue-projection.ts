import type { QueueSnapshotRow } from '@/types/queue-browser';
import type { FSRSCard } from '@/types/card';
import type { QueueProjectionLiveIdentityListener } from '@/types/queue-projection-live-identity';
import type { BackendQueueProjectionReplaceResult } from '../../../packages/contracts/src/backend-rpc';
import type { IReviewQueue, QueueCounterSnapshot, QueueType } from './queue-core';

export type {
  QueueProjectionReadiness,
  QueueProjectionReadinessRequest,
} from '../../../packages/contracts/src/backend-rpc';
import type {
  QueueProjectionReadiness,
  QueueProjectionReadinessRequest,
} from '../../../packages/contracts/src/backend-rpc';

export interface QueueProjectionSnapshot {
  queueType: QueueType;
  policyHash: string;
  generation: number;
  rows: QueueSnapshotRow[];
  counters: QueueCounterSnapshot | null;
}

export type QueueProjectionReadRequest =
  | { type: 'readiness'; request: QueueProjectionReadinessRequest }
  | { type: 'snapshot'; queueType: QueueType }
  | { type: 'rows-by-id'; queueType: QueueType; ids: string[] }
  | { type: 'diagnostics'; queueType?: QueueType };

export type QueueProjectionReadResult =
  | { type: 'readiness'; readiness: QueueProjectionReadiness }
  | {
    type: 'snapshot';
    status: QueueProjectionReadiness['status'];
    readiness: QueueProjectionReadiness;
    snapshot: QueueProjectionSnapshot | null;
  }
  | {
    type: 'rows-by-id';
    status: QueueProjectionReadiness['status'];
    readiness: QueueProjectionReadiness;
    cards: FSRSCard[];
  }
  | { type: 'diagnostics'; diagnostics: QueueProjectionRolloutDiagnostic[] };

export type QueueProjectionRepairCommand =
  | {
    type: 'materialize' | 'rebuild' | 'refresh';
    queueType: QueueType;
    queueOverride?: Pick<IReviewQueue, 'getCards'> | null;
    readinessRequest?: QueueProjectionReadinessRequest | null;
    reason?: string | null;
  }
  | {
    type: 'invalidate';
    queueType: QueueType;
    reason?: string | null;
  };

export type QueueProjectionRepairReceipt =
  | {
    status: 'ready';
    queueType: QueueType;
    policyHash: string;
    generation: number;
    result: BackendQueueProjectionReplaceResult;
  }
  | {
    status: 'invalidated';
    queueType: QueueType;
    reason: string;
  }
  | {
    status: 'unavailable';
    queueType: QueueType;
    reason: string;
  };

export interface QueueProjectionLifecycleInterface {
  read(request: QueueProjectionReadRequest): Promise<QueueProjectionReadResult>;
  repair(command: QueueProjectionRepairCommand): Promise<QueueProjectionRepairReceipt>;
  observe(listener: QueueProjectionLiveIdentityListener): () => void;
}

export type QueueProjectionRolloutState =
  | 'existing-queue-strategy'
  | 'parity-checking'
  | 'backend-advance'
  | 'advance-contract-unavailable'
  | 'backend-projection'
  | 'projection-unavailable';

export type QueueProjectionReadPath = 'backend-projection' | 'backend-advance' | 'existing-queue-strategy';
export type QueueProjectionReadMode = 'backend-projection' | 'local-queue';

export type QueueProjectionRolloutReason =
  | 'rollout-enabled'
  | 'advance-backed'
  | 'advance-contract-unavailable'
  | 'projection-rollout-pending'
  | 'parity-checking'
  | 'backend-unavailable'
  | 'refresh-required'
  | 'projection-unavailable';

export interface QueueProjectionRolloutDiagnostic {
  queueType: QueueType;
  projectionBacked: boolean;
  state: QueueProjectionRolloutState;
  readPath: QueueProjectionReadPath;
  reason: QueueProjectionRolloutReason;
  nextCoverageTask: string | null;
  unavailableReason?: QueueProjectionRolloutReason | string | null;
  backendStatus?: string | null;
  policyHash?: string | null;
  generation?: number | null;
  checkedAt?: number | null;
  cacheState?: string | null;
  freshness?: {
    checkedAt: number;
    totalRows: number;
    freshRows: number;
    staleRows: number;
    missingRows: number;
    staleCardIds: string[];
    missingCardIds: string[];
  } | null;
}
