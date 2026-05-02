import { KernelSidecarClient } from '@/application/clients/KernelSidecarClient';

export interface FrontendInstanceRuntimeOptions {
  instanceId?: string;
  leaseTtlMs?: number;
  relayPollIntervalMs?: number;
  startupRetryDelayMs?: number;
  startupMaxWaitMs?: number;
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
  private readonly startupRetryDelayMs: number;
  private readonly startupMaxWaitMs: number;
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
    this.startupRetryDelayMs = Number.isFinite(Number(options.startupRetryDelayMs))
      ? Math.max(1, Math.floor(Number(options.startupRetryDelayMs)))
      : 250;
    this.startupMaxWaitMs = Number.isFinite(Number(options.startupMaxWaitMs))
      ? Math.max(this.startupRetryDelayMs, Math.floor(Number(options.startupMaxWaitMs)))
      : 5_000;
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
    await this.waitForKernelCompanionRunning();
    this.started = true;
    try {
      await this.sidecarClient.writerHello({ instanceId: this.instanceId });
      await this.refreshOwnership();
      this.startHeartbeat();
      this.startRelayPump();
    } catch (error) {
      this.started = false;
      this.stopHeartbeat();
      this.stopRelayPump();
      throw error;
    }
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

  private async waitForKernelCompanionRunning(): Promise<void> {
    if (typeof this.sidecarClient.getStatus !== 'function') {
      return;
    }

    const startedAt = Date.now();
    let lastMessage = 'kernel companion is not available';
    while (Date.now() - startedAt <= this.startupMaxWaitMs) {
      const status = await this.sidecarClient.getStatus();
      if (status.kind === 'available') {
        return;
      }

      lastMessage = [
        `reason=${status.reason}`,
        status.pluginState ? `state=${status.pluginState}` : null,
        status.message ? `message=${status.message}` : null,
      ].filter(Boolean).join(' ');

      if (status.reason !== 'not-loaded' && status.reason !== 'not-running') {
        throw new Error(`BACKEND_UNAVAILABLE: kernel companion unavailable (${lastMessage})`);
      }
      await sleep(this.startupRetryDelayMs);
    }

    throw new Error(`BACKEND_UNAVAILABLE: kernel companion did not reach running state (${lastMessage})`);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
