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
}

export interface WriterLeasePayload {
  instanceId: string;
  acquiredAt: number;
  expiresAt: number;
  lastHeartbeatAt: number;
  dbRevision?: number;
  surfaceId?: string;
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
}

export interface KernelWriterAcquireLeaseRequest {
  instanceId: string;
  ttlMs?: number;
  dbRevision?: number;
  surfaceId?: string;
}

export interface KernelWriterRenewLeaseRequest {
  instanceId: string;
  ttlMs?: number;
  dbRevision?: number;
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

export type KernelRelayMethod =
  | 'review.feedback'
  | 'autocard.decision.resolve'
  | 'autocard.execute'
  | 'kernel.transaction.ingest'
  | 'kernel.transaction.dequeue'
  | 'kernel.transaction.requeue'
  | 'private.command.execute';

export interface WriterRelayCommandResultPayload {
  commandId: string;
  requesterInstanceId: string;
  writerInstanceId: string;
  ok: boolean;
  result?: unknown;
  error?: {
    code: KernelWriterRelayErrorCode;
    message: string;
  };
  completedAt: number;
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

export interface KernelWriterSubmitCommandSuccessEnvelope {
  ok: true;
  commandId: string;
  ownerInstanceId: string;
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
  completedAt?: number;
  now: number;
}

export interface KernelWriterTakeCommandEnvelope {
  ok: true;
  command: WriterRelayCommandPayload | null;
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
  | { method: 'memo.writer.commandResult'; params: WriterRelayCommandResultPayload };
