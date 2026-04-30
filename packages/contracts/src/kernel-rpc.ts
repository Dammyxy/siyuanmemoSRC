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

export type KernelBroadcastEvent =
  | { method: 'memo.kernel.ready'; params: KernelHealthPayload }
  | { method: 'memo.writer.leaseChanged'; params: WriterLeasePayload | null };
