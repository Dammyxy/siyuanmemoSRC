export interface KernelHealthPayload {
  ok: true;
  plugin: string;
  version?: string;
  platform?: string;
  uptimeMs?: number;
}

export interface KernelCapabilitiesPayload {
  version: number;
  methods: string[];
  storage: string;
  rpc: string;
  writesSiyuanMemoDb: false;
  kernelNetworkProxy?: boolean;
  kernelNetworkSse?: boolean;
  privateHttp?: boolean;
  privateSse?: boolean;
  riffReadAuditProxy?: boolean;
  aiStreaming?: boolean;
}

export const KERNEL_FAST_PATH_CAPABILITY_KEYS = [
  'rpcWebSocketPush',
  'backendRealWorkerTransport',
  'kernelNetworkProxy',
  'kernelNetworkSse',
  'privateHttp',
  'privateSse',
  'riffReadAuditProxy',
  'aiKernelStreaming',
] as const;

export type KernelFastPathCapabilityKey = typeof KERNEL_FAST_PATH_CAPABILITY_KEYS[number];

export type KernelFastPathCapabilityState =
  | 'available'
  | 'unavailable'
  | 'degraded'
  | 'unknown';

export type KernelFastPathUnavailableReason =
  | 'not-loaded'
  | 'not-running'
  | 'network-error'
  | 'http-error'
  | 'rpc-error'
  | 'invalid-response'
  | 'websocket-url-unavailable'
  | 'websocket-closed'
  | 'worker-closed'
  | 'streaming-unsupported'
  | 'timeout'
  | 'canceled'
  | 'smoke-required'
  | 'not-configured';

export interface KernelFastPathCapability {
  state: KernelFastPathCapabilityState;
  reason?: KernelFastPathUnavailableReason;
  message?: string;
  checkedAt?: number;
}

export type KernelFastPathCapabilities = Record<KernelFastPathCapabilityKey, KernelFastPathCapability>;

export type WriterBackendContainer =
  | 'std'
  | 'docker'
  | 'android'
  | 'ios'
  | 'harmony'
  | 'unknown';

export type WriterFrontendKind =
  | 'desktop'
  | 'desktop-window'
  | 'browser-desktop'
  | 'browser-mobile'
  | 'mobile'
  | 'unknown';

export type WriterSurfaceRole =
  | 'primary-app'
  | 'document-window'
  | 'active-frontend'
  | 'auxiliary'
  | 'unknown';

export type WriterEligibility =
  | 'canonical'
  | 'follower-only'
  | 'provisional-candidate'
  | 'never'
  | 'unavailable';

export interface WriterProfilePayload {
  backendContainer: WriterBackendContainer;
  frontendKind: WriterFrontendKind;
  surfaceRole: WriterSurfaceRole;
  writerEligibility: WriterEligibility;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  sanitizedLocationHref: string | null;
}

export interface WriterLeasePayload {
  instanceId: string;
  acquiredAt: number;
  expiresAt: number;
  lastHeartbeatAt: number;
  dbRevision?: number;
  surfaceId?: string;
  visibilityState?: string;
  documentHasFocus?: boolean;
  locationHref?: string;
  writerProfile?: WriterProfilePayload;
  leaseEpoch?: number;
  ownerChangedAt?: number;
}

export type KernelWriterLeaseErrorCode =
  | 'BACKEND_UNAVAILABLE'
  | 'INVALID_REQUEST';

export interface KernelWriterLeaseErrorEnvelope {
  ok: false;
  error: {
    code: KernelWriterLeaseErrorCode;
    message: string;
  };
  lease: WriterLeasePayload | null;
  now: number;
}

export interface KernelWriterLeaseSuccessEnvelope {
  ok: true;
  lease: WriterLeasePayload | null;
  now: number;
}

export type KernelWriterLeaseEnvelope =
  | KernelWriterLeaseErrorEnvelope
  | KernelWriterLeaseSuccessEnvelope;

export interface KernelWriterHelloRequest {
  instanceId: string;
  surfaceId?: string;
  visibilityState?: string;
  documentHasFocus?: boolean;
  locationHref?: string;
  writerProfile?: WriterProfilePayload;
}

export interface KernelWriterAcquireLeaseRequest {
  instanceId: string;
  ttlMs?: number;
  dbRevision?: number;
  surfaceId?: string;
  visibilityState?: string;
  documentHasFocus?: boolean;
  locationHref?: string;
  writerProfile?: WriterProfilePayload;
}

export interface KernelWriterRenewLeaseRequest {
  instanceId: string;
  ttlMs?: number;
  dbRevision?: number;
  surfaceId?: string;
  visibilityState?: string;
  documentHasFocus?: boolean;
  locationHref?: string;
  writerProfile?: WriterProfilePayload;
}

export interface KernelWriterReleaseLeaseRequest {
  instanceId: string;
}

export interface KernelWriterSubmitCommandRequest {
  instanceId: string;
  commandId?: string;
  idempotencyKey?: string;
  method: KernelRelayMethod;
  params?: unknown;
}

export interface KernelWriterCompleteCommandRequest {
  instanceId: string;
  commandId: string;
  result?: unknown;
}

export interface KernelWriterFailCommandRequest {
  instanceId: string;
  commandId: string;
  error: {
    code: string;
    message: string;
  };
}

export interface KernelWriterGetCommandResultRequest {
  commandId: string;
}

export interface KernelWriterTakeCommandRequest {
  instanceId: string;
}

export interface WriterRelayCommandPayload {
  commandId: string;
  requesterInstanceId: string;
  method: KernelRelayMethod;
  params?: unknown;
  idempotencyKey?: string;
  requestedAt: number;
  expiresAt?: number;
}

export const KERNEL_RELAY_METHODS = [
  'review.feedback',
  'domainSync.repair.apply',
  'browser.sourceExistence.applySweepHost',
  'browser.sourceExistence.update',
  'browser.sourceExistence.applySweep',
  'autocard.decision.resolve',
  'autocard.execute',
  'kernel.transaction.ingest',
  'kernel.transaction.dequeue',
  'kernel.transaction.requeue',
  'queue.projection.replace',
  'neural-roam.advance',
  'neural-roam.viewState',
  'neural-roam.command',
  'ai.session.create',
  'ai.session.get',
  'ai.session.update',
  'ai.session.cancel',
  'hotspot.command.submit',
  'private.command.execute',
  'semantic.command.execute',
] as const;

export type KernelRelayMethod = typeof KERNEL_RELAY_METHODS[number];

export type QueueProjectionIdentityQueueType =
  | 'retrieval-practice'
  | 'incremental-learning'
  | 'filter-group'
  | 'final-drill'
  | 'leech'
  | 'neural-roam';

export type QueueProjectionIdentityReason =
  | 'materialized'
  | 'refreshed';

export interface QueueProjectionIdentityBroadcastPayload {
  queueId: string;
  queueType: QueueProjectionIdentityQueueType;
  policyId: string;
  generation: number;
  reason: QueueProjectionIdentityReason;
  sourceInstanceId: string;
  sourceSurfaceId?: string;
  sourceMode?: 'writer' | 'follower' | string;
  source: 'backend' | 'writer-relay' | 'runtime';
  timestamp: number;
  diagnosticEventId: string;
}

export interface QueueProjectionIdentityPublishEnvelope {
  ok: true;
  broadcast: QueueProjectionIdentityBroadcastPayload;
  now: number;
}

export interface WriterRelayCommandResultPayload {
  commandId: string;
  requesterInstanceId: string;
  writerInstanceId: string;
  writerSurfaceId?: string;
  ok: boolean;
  result?: unknown;
  error?: {
    code: KernelWriterRelayErrorCode;
    message: string;
  };
  completedAt: number;
}

export const KERNEL_AI_STREAM_EVENT_TYPES = [
  'token',
  'progress',
  'error',
  'final',
  'canceled',
  'timeout',
  'close',
] as const;

export type KernelAiStreamEventType = typeof KERNEL_AI_STREAM_EVENT_TYPES[number];

export interface KernelAiStreamEvent {
  type: KernelAiStreamEventType;
  streamId: string;
  sessionId?: string;
  jobId?: string;
  sequence?: number;
  text?: string;
  progress?: {
    phase: string;
    current?: number;
    total?: number;
  };
  error?: {
    code: string;
    message: string;
  };
  final?: {
    status: number;
    headers?: Record<string, string>;
    body?: string;
  };
  emittedAt: number;
}

export type KernelWriterRelayErrorCode =
  | 'WRITER_UNAVAILABLE'
  | 'LEASE_UNAVAILABLE'
  | 'RELAY_QUEUE_UNAVAILABLE'
  | 'COMMAND_EXPIRED'
  | 'INVALID_REQUEST'
  | 'BACKEND_UNAVAILABLE'
  | 'KERNEL_SIDECAR_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface KernelNetworkFetchExternalRequest {
  requestId?: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface KernelNetworkFetchExternalResult {
  requestId: string;
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface KernelNetworkStreamExternalRequest {
  requestId?: string;
  streamId: string;
  sessionId?: string;
  jobId?: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface KernelNetworkStreamExternalResult {
  requestId: string;
  streamId: string;
  state: 'started' | 'unavailable';
  privateSsePath: string;
  unavailableReason?: KernelFastPathUnavailableReason;
  message?: string;
  startedAt: number;
}

export interface KernelWriterSubmitCommandSuccessEnvelope {
  ok: true;
  commandId: string;
  ownerInstanceId: string;
  ownerSurfaceId?: string;
  status: 'queued';
  now: number;
}

export interface KernelWriterCommandResultEnvelope {
  ok: true;
  commandId: string;
  status: 'pending' | 'completed' | 'failed' | 'unavailable' | 'expired';
  requesterInstanceId?: string;
  writerInstanceId?: string;
  result?: unknown;
  error?: {
    code: KernelWriterRelayErrorCode;
    message: string;
  };
  ownerInstanceId?: string;
  ownerSurfaceId?: string;
  completedAt?: number;
  now: number;
}

export interface KernelWriterTakeCommandEnvelope {
  ok: true;
  command: WriterRelayCommandPayload | null;
  pendingCommandCount?: number;
  now: number;
}

export type KernelWriterSubmitCommandEnvelope =
  | KernelWriterLeaseErrorEnvelope
  | KernelWriterSubmitCommandSuccessEnvelope;

export type KernelWriterCommandResultLookupEnvelope =
  | KernelWriterLeaseErrorEnvelope
  | KernelWriterCommandResultEnvelope;

export type KernelWriterTakeCommandLookupEnvelope =
  | KernelWriterLeaseErrorEnvelope
  | KernelWriterTakeCommandEnvelope;

export type KernelBroadcastEvent =
  | { method: 'memo.kernel.ready'; params: KernelHealthPayload }
  | { method: 'memo.writer.leaseChanged'; params: WriterLeasePayload | null }
  | { method: 'memo.writer.command'; params: WriterRelayCommandPayload }
  | { method: 'memo.writer.commandResult'; params: WriterRelayCommandResultPayload }
  | { method: 'memo.queueProjection.identityChanged'; params: QueueProjectionIdentityBroadcastPayload }
  | { method: 'memo.ai.stream'; params: KernelAiStreamEvent };
