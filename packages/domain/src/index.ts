export type CardId = string;
export type BlockId = string;
export type QueueId = string;
export type ReviewSessionId = string;
export type AiSessionId = string;

export interface RuntimeRevision {
  value: number;
}

export interface RuntimeHealthSnapshot {
  runtime: 'ui-shell' | 'srs-backend-worker' | 'kernel-sidecar';
  initialized: boolean;
  checkedAt: number;
}
