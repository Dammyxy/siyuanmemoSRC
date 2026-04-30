import { KernelSidecarClient } from '@/application/clients/KernelSidecarClient';

export interface FrontendInstanceRuntimeOptions {
  instanceId?: string;
  leaseTtlMs?: number;
  relayPollIntervalMs?: number;
  writerCommandHandler?: (command: {
    commandId: string;
    requesterInstanceId: string;
    method: string;
    params?: unknown;
    requestedAt: number;
  }) => Promise<unknown>;
}

function createDefaultInstanceId(): string {
  return `memo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type FrontendInstanceMode = 'writer' | 'follower';

export class FrontendInstanceRuntime {
  private readonly instanceId: string;
  private readonly leaseTtlMs: number;
  private readonly relayPollIntervalMs: number;
  private readonly writerCommandHandler: FrontendInstanceRuntimeOptions['writerCommandHandler'];
  private mode: FrontendInstanceMode = 'follower';
  private started = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private relayTimer: ReturnType<typeof setInterval> | null = null;
  private drainingRelay = false;

  constructor(
    private readonly sidecarClient: KernelSidecarClient,
    options: FrontendInstanceRuntimeOptions = {},
  ) {
    this.instanceId = String(options.instanceId || '').trim() || createDefaultInstanceId();
    this.leaseTtlMs = Number.isFinite(Number(options.leaseTtlMs))
      ? Math.max(3_000, Math.floor(Number(options.leaseTtlMs)))
      : 12_000;
    this.relayPollIntervalMs = Number.isFinite(Number(options.relayPollIntervalMs))
      ? Math.max(250, Math.floor(Number(options.relayPollIntervalMs)))
      : 1_000;
    this.writerCommandHandler = options.writerCommandHandler;
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  getMode(): FrontendInstanceMode {
    return this.mode;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    await this.sidecarClient.writerHello({ instanceId: this.instanceId });
    await this.refreshOwnership();
    this.startHeartbeat();
    this.startRelayPump();
  }

  async ensureWritable(): Promise<void> {
    await this.refreshOwnership();
    if (this.mode !== 'writer') {
      throw new Error('BACKEND_UNAVAILABLE: writer lease held by another instance');
    }
  }

  async dispose(): Promise<void> {
    this.started = false;
    this.stopHeartbeat();
    this.stopRelayPump();
    if (this.mode === 'writer') {
      try {
        await this.sidecarClient.writerReleaseLease({ instanceId: this.instanceId });
      } catch {
        // no-op
      }
    }
    this.mode = 'follower';
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const intervalMs = Math.max(2_000, Math.floor(this.leaseTtlMs / 3));
    this.heartbeatTimer = setInterval(() => {
      this.refreshOwnership().catch(() => {
        // keep background heartbeat best-effort
      });
    }, intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startRelayPump(): void {
    this.stopRelayPump();
    if (!this.writerCommandHandler) {
      return;
    }
    this.relayTimer = setInterval(() => {
      this.drainPendingWriterCommands().catch(() => {
        // keep relay loop best-effort
      });
    }, this.relayPollIntervalMs);
  }

  private stopRelayPump(): void {
    if (this.relayTimer) {
      clearInterval(this.relayTimer);
      this.relayTimer = null;
    }
  }

  private async refreshOwnership(): Promise<void> {
    try {
      const lease = await this.sidecarClient.writerAcquireLease({
        instanceId: this.instanceId,
        ttlMs: this.leaseTtlMs,
      });
      this.mode = lease.lease?.instanceId === this.instanceId ? 'writer' : 'follower';
      return;
    } catch {
      this.mode = 'follower';
    }

    const lease = await this.sidecarClient.writerGetLease().catch(() => null);
    this.mode = lease?.lease?.instanceId === this.instanceId ? 'writer' : 'follower';
  }

  private async drainPendingWriterCommands(): Promise<void> {
    if (!this.started || this.mode !== 'writer' || !this.writerCommandHandler || this.drainingRelay) {
      return;
    }
    this.drainingRelay = true;
    try {
      for (let i = 0; i < 4; i += 1) {
        const pulled = await this.sidecarClient.writerTakeCommand({
          instanceId: this.instanceId,
        });
        if (!pulled.command) {
          break;
        }
        const command = pulled.command;
        try {
          const result = await this.writerCommandHandler(command);
          await this.sidecarClient.writerCompleteCommand({
            instanceId: this.instanceId,
            commandId: command.commandId,
            result,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.sidecarClient.writerFailCommand({
            instanceId: this.instanceId,
            commandId: command.commandId,
            error: {
              code: 'INTERNAL_ERROR',
              message,
            },
          });
        }
      }
    } catch (error) {
      if (this.isWriterLeaseUnavailableError(error)) {
        await this.refreshOwnership().catch(() => {
          this.mode = 'follower';
        });
      }
    } finally {
      this.drainingRelay = false;
    }
  }

  private isWriterLeaseUnavailableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '');
    return message.startsWith('BACKEND_UNAVAILABLE:');
  }
}
