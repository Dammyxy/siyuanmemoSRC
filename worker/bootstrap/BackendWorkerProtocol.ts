import type {
  BackendAutoCardExecuteRequest,
  BackendAutoCardExecuteBatchRequest,
  BackendProgressiveCommandExecuteRequest,
  BackendTopicDerivedCommandExecuteRequest,
  BackendNeuralGraphQueryRequest,
  BackendRpcRequest,
  BackendRpcResponse,
} from '../../packages/contracts/src/backend-rpc';

export type BackendWorkerHostEffectAttribution = {
  purpose?: string | null;
  substep?: string | null;
  requestMethod?: string | null;
};

export interface BackendWorkerSqliteFileEntry {
  path: string;
  size: number | null;
}

export type BackendWorkerHostEffect =
  | ({ kind: 'sqlite.readBinary'; path: string } & BackendWorkerHostEffectAttribution)
  | ({ kind: 'sqlite.writeBinary'; path: string; bytes: Uint8Array } & BackendWorkerHostEffectAttribution)
  | ({ kind: 'sqlite.readJSON'; path: string } & BackendWorkerHostEffectAttribution)
  | ({ kind: 'sqlite.writeJSON'; path: string; value: unknown } & BackendWorkerHostEffectAttribution)
  | ({ kind: 'sqlite.listFiles'; prefix: string } & BackendWorkerHostEffectAttribution)
  | ({ kind: 'sqlite.deleteFile'; path: string } & BackendWorkerHostEffectAttribution)
  | { kind: 'sqlite.hasLegacyPetalSqliteDb' }
  | ({ kind: 'truth.readBinary'; path: string } & BackendWorkerHostEffectAttribution)
  | ({ kind: 'truth.writeBinary'; path: string; bytes: Uint8Array } & BackendWorkerHostEffectAttribution)
  | ({ kind: 'truth.readJSON'; path: string } & BackendWorkerHostEffectAttribution)
  | ({ kind: 'truth.writeJSON'; path: string; value: unknown } & BackendWorkerHostEffectAttribution)
  | { kind: 'truth.listFiles'; prefix: string }
  | { kind: 'truth.deleteFile'; path: string }
  | { kind: 'sqlite.readSyncConflictDatabaseSources' }
  | { kind: 'sqlite.cleanupSyncConflictDatabaseSources'; sourceIds: string[] }
  | { kind: 'siyuan.resolveExistingBlockIds'; blockIds: string[] }
  | { kind: 'siyuan.neuralGraph.query'; request: BackendNeuralGraphQueryRequest }
  | { kind: 'autocard.execute'; request: BackendAutoCardExecuteRequest }
  | { kind: 'autocard.executeBatch'; request: BackendAutoCardExecuteBatchRequest }
  | { kind: 'progressive.command.execute'; request: BackendProgressiveCommandExecuteRequest }
  | { kind: 'topic-derived.command.execute'; request: BackendTopicDerivedCommandExecuteRequest };

export type BackendWorkerRequestMessage = {
  kind: 'request';
  requestId: string;
  request: BackendRpcRequest;
  sentAt?: number | null;
};

export type BackendWorkerResponseMessage = {
  kind: 'response';
  requestId: string;
  response: BackendRpcResponse;
  timing?: BackendWorkerResponseTiming | null;
};

export interface BackendWorkerHostEffectTiming {
  kind: BackendWorkerHostEffect['kind'];
  durationMs: number;
  path?: string | null;
  byteLength?: number | null;
  storageClass?: string | null;
  purpose?: string | null;
  substep?: string | null;
}

export interface BackendWorkerHostEffectBreakdownEntry {
  kind: BackendWorkerHostEffect['kind'];
  path?: string | null;
  storageClass?: string | null;
  purpose?: string | null;
  substep?: string | null;
  count: number;
  totalMs: number;
  maxMs: number;
  byteLength?: number | null;
}

export interface BackendWorkerInnerStepTiming {
  layer: 'worker-entry' | 'kernel' | 'database' | 'transaction' | 'queue-impact' | 'session';
  step: string;
  durationMs: number;
  cardId?: string | null;
  queueType?: string | null;
  extra?: Record<string, unknown> | null;
}

export interface BackendWorkerResponseTiming {
  sentAt: number | null;
  receivedAt: number;
  receivedDelayMs: number | null;
  handleStartedAt: number;
  handledAt: number;
  handleDurationMs: number;
  hostEffectCount: number;
  hostEffectTotalMs: number;
  hostEffectAttribution: 'complete' | 'ambiguous-concurrency';
  slowestHostEffect: BackendWorkerHostEffectTiming | null;
  hostEffectBreakdown?: BackendWorkerHostEffectBreakdownEntry[];
  innerSteps: BackendWorkerInnerStepTiming[];
  innerStepAttribution: 'complete' | 'ambiguous-concurrency';
  innerStepsTruncated: boolean;
}

export type BackendWorkerReadyMessage = {
  kind: 'ready';
};

export type BackendWorkerShutdownMessage = {
  kind: 'shutdown';
};

export type BackendWorkerProbeMessage = {
  kind: 'probe';
  probeId: string;
};

export type BackendWorkerProbeResultMessage = {
  kind: 'probe-result';
  probeId: string;
};

export type BackendWorkerHostEffectMessage = {
  kind: 'host-effect';
  effectId: string;
  effect: BackendWorkerHostEffect;
};

export type BackendWorkerHostEffectResultMessage = {
  kind: 'host-effect-result';
  effectId: string;
} & (
  | { ok: true; result: unknown }
  | { ok: false; error: { code: 'BACKEND_UNAVAILABLE' | 'INTERNAL_ERROR'; message: string } }
);

export type BackendWorkerMainToWorkerMessage =
  | BackendWorkerRequestMessage
  | BackendWorkerHostEffectResultMessage
  | BackendWorkerShutdownMessage
  | BackendWorkerProbeMessage;

export type BackendWorkerToMainMessage =
  | BackendWorkerReadyMessage
  | BackendWorkerResponseMessage
  | BackendWorkerHostEffectMessage
  | BackendWorkerProbeResultMessage;

export type BackendWorkerHostEffectHandler = (effect: BackendWorkerHostEffect) => Promise<unknown>;
