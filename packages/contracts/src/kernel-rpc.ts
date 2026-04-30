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
}

export type KernelBroadcastEvent =
  | { method: 'memo.kernel.ready'; params: KernelHealthPayload }
  | { method: 'memo.writer.leaseChanged'; params: WriterLeasePayload };
