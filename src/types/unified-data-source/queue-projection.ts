import type { QueueSnapshotRow } from '@/types/queue-browser';
import type { QueueCounterSnapshot, QueueType } from './queue-core';

export type {
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
