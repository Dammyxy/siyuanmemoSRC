import type {
  BackendAiPromptExecuteRequest,
  BackendAiPromptNetworkRequest,
  BackendAutoCardExecuteRequest,
  BackendReviewRiffFeedbackExecuteRequest,
  BackendProgressiveCommandExecuteRequest,
  BackendTopicDerivedCommandExecuteRequest,
  BackendNeuralGraphQueryRequest,
  BackendXiuyuanRiffReadAuditRequest,
  BackendRpcRequest,
  BackendRpcResponse,
} from '../../packages/contracts/src/backend-rpc';

export type BackendWorkerHostEffect =
  | { kind: 'sqlite.readBinary'; path: string }
  | { kind: 'sqlite.writeBinary'; path: string; bytes: Uint8Array }
  | { kind: 'sqlite.readJSON'; path: string }
  | { kind: 'sqlite.writeJSON'; path: string; value: unknown }
  | { kind: 'truth.readBinary'; path: string }
  | { kind: 'truth.writeBinary'; path: string; bytes: Uint8Array }
  | { kind: 'truth.readJSON'; path: string }
  | { kind: 'truth.writeJSON'; path: string; value: unknown }
  | { kind: 'sqlite.readSyncConflictDatabaseSources' }
  | { kind: 'sqlite.cleanupSyncConflictDatabaseSources'; sourceIds: string[] }
  | { kind: 'siyuan.resolveExistingBlockIds'; blockIds: string[] }
  | { kind: 'siyuan.neuralGraph.query'; request: BackendNeuralGraphQueryRequest }
  | { kind: 'siyuan.riff.readAudit'; request: BackendXiuyuanRiffReadAuditRequest }
  | { kind: 'autocard.execute'; request: BackendAutoCardExecuteRequest }
  | { kind: 'progressive.command.execute'; request: BackendProgressiveCommandExecuteRequest }
  | { kind: 'topic-derived.command.execute'; request: BackendTopicDerivedCommandExecuteRequest }
  | { kind: 'review.riffFeedback.execute'; request: BackendReviewRiffFeedbackExecuteRequest }
  | { kind: 'ai.prompt.execute'; request: BackendAiPromptNetworkRequest; context: BackendAiPromptExecuteRequest };

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
}

export interface BackendWorkerInnerStepTiming {
  layer: 'worker-entry' | 'kernel' | 'database' | 'transaction' | 'queue-impact';
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
