import { KernelSidecarClient } from '@/application/clients/KernelSidecarClient';

const DEFAULT_LEASE_TTL_MS = 60_000;

export interface KernelWriterLeaseGuardOptions {
  instanceId?: string;
  ttlMs?: number;
}

function createDefaultInstanceId(): string {
  return `memo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class KernelWriterLeaseGuard {
  private readonly instanceId: string;
  private readonly ttlMs: number;

  constructor(
    private readonly sidecarClient: KernelSidecarClient,
    options: KernelWriterLeaseGuardOptions = {},
  ) {
    this.instanceId = String(options.instanceId || '').trim() || createDefaultInstanceId();
    this.ttlMs = Number.isFinite(Number(options.ttlMs))
      ? Math.max(3_000, Math.floor(Number(options.ttlMs)))
      : DEFAULT_LEASE_TTL_MS;
  }

  async ensureWritable(): Promise<void> {
    await this.sidecarClient.writerHello({ instanceId: this.instanceId });
    const leaseEnvelope = await this.sidecarClient.writerAcquireLease({
      instanceId: this.instanceId,
      ttlMs: this.ttlMs,
    });
    const holder = String(leaseEnvelope.lease?.instanceId || '').trim();
    if (!holder || holder !== this.instanceId) {
      throw new Error('BACKEND_UNAVAILABLE: writer lease not owned by current instance');
    }
  }
}
