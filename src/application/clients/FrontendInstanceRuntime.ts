import { KernelSidecarClient } from '@/application/clients/KernelSidecarClient';
import {
  getRelayCompletionExtraDiagnostics,
  shouldLogRelayCommandSubmitted,
} from '@/application/clients/relayDiagnostics';
import { createLogger } from '@/utils/logger';

export interface FrontendInstanceRuntimeOptions {
  instanceId?: string;
  runtimeScopeId?: string;
  leaseTtlMs?: number;
  relayPollIntervalMs?: number;
  startupRetryDelayMs?: number;
  startupMaxWaitMs?: number;
  logger?: FrontendRuntimeDiagnosticsLogger;
  writerCommandHandler?: (command: {
    commandId: string;
    requesterInstanceId: string;
    method: string;
    params?: unknown;
    requestedAt: number;
  }) => Promise<unknown>;
}

export interface FrontendRuntimeDiagnosticsLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface FrontendRuntimeScopeRegistryEntry {
  instanceId: string;
  runtimeScopeId: string;
  dispose: () => Promise<void>;
}

function createDefaultInstanceId(): string {
  return `memo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createDefaultRuntimeScopeId(): string {
  return `memo-scope-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const GLOBAL_RUNTIME_SCOPE_ID_KEY = '__siyuanmemoFrontendRuntimeScopeId';
const GLOBAL_RUNTIME_SCOPE_REGISTRY_KEY = '__siyuanmemoFrontendRuntimeScopeRegistry';

function getGlobalRecord(): Record<string, unknown> | null {
  if (typeof globalThis !== 'object' || !globalThis) {
    return null;
  }
  return globalThis as unknown as Record<string, unknown>;
}

function resolveDefaultRuntimeScopeId(): string {
  const globalRecord = getGlobalRecord();
  if (!globalRecord) {
    return createDefaultRuntimeScopeId();
  }
  const existing = String(globalRecord[GLOBAL_RUNTIME_SCOPE_ID_KEY] || '').trim();
  if (existing) {
    return existing;
  }
  const runtimeScopeId = createDefaultRuntimeScopeId();
  globalRecord[GLOBAL_RUNTIME_SCOPE_ID_KEY] = runtimeScopeId;
  return runtimeScopeId;
}

function getRuntimeScopeRegistry(): Map<string, FrontendRuntimeScopeRegistryEntry> | null {
  const globalRecord = getGlobalRecord();
  if (!globalRecord) {
    return null;
  }
  const existing = globalRecord[GLOBAL_RUNTIME_SCOPE_REGISTRY_KEY];
  if (existing instanceof Map) {
    return existing as Map<string, FrontendRuntimeScopeRegistryEntry>;
  }
  const registry = new Map<string, FrontendRuntimeScopeRegistryEntry>();
  globalRecord[GLOBAL_RUNTIME_SCOPE_REGISTRY_KEY] = registry;
  return registry;
}

function resolveDocumentVisibilityState(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  return typeof document.visibilityState === 'string' ? document.visibilityState : null;
}

function resolveWindowLocationHref(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return typeof window.location?.href === 'string' ? window.location.href : null;
  } catch {
    return null;
  }
}

type FrontendInstanceMode = 'writer' | 'follower';

export class FrontendInstanceRuntime {
  private readonly instanceId: string;
  private readonly runtimeScopeId: string;
  private readonly leaseTtlMs: number;
  private readonly relayPollIntervalMs: number;
  private readonly startupRetryDelayMs: number;
  private readonly startupMaxWaitMs: number;
  private readonly logger: FrontendRuntimeDiagnosticsLogger;
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
    this.runtimeScopeId = String(options.runtimeScopeId || '').trim() || resolveDefaultRuntimeScopeId();
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
    this.logger = options.logger ?? createLogger('FrontendInstanceRuntime');
    this.writerCommandHandler = options.writerCommandHandler;
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  getRuntimeScopeId(): string {
    return this.runtimeScopeId;
  }

  getMode(): FrontendInstanceMode {
    return this.mode;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    await this.disposePreviousRuntimeInSameScope();
    await this.waitForKernelCompanionRunning();
    this.started = true;
    try {
      await this.sidecarClient.writerHello({
        instanceId: this.instanceId,
        surfaceId: this.runtimeScopeId,
      });
      const ownership = await this.refreshOwnership('startup');
      this.startHeartbeat();
      this.startRelayPump();
      this.registerCurrentRuntimeInScope();
      this.logger.info('[FrontendInstanceRuntime] started', {
        instanceId: this.instanceId,
        runtimeScopeId: this.runtimeScopeId,
        visibilityState: resolveDocumentVisibilityState(),
        locationHref: resolveWindowLocationHref(),
        mode: this.mode,
        leaseHolder: ownership.leaseHolder,
        leaseSurfaceId: ownership.leaseSurfaceId,
        leaseTtlMs: this.leaseTtlMs,
        relayPollIntervalMs: this.writerCommandHandler ? this.relayPollIntervalMs : null,
      });
    } catch (error) {
      this.started = false;
      this.stopHeartbeat();
      this.stopRelayPump();
      this.unregisterCurrentRuntimeInScope();
      this.logger.error('[FrontendInstanceRuntime] start failed', {
        instanceId: this.instanceId,
        runtimeScopeId: this.runtimeScopeId,
        error,
      });
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
    this.unregisterCurrentRuntimeInScope();
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
      this.refreshOwnership('heartbeat').catch(() => {
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

  private async disposePreviousRuntimeInSameScope(): Promise<void> {
    const registry = getRuntimeScopeRegistry();
    const previous = registry?.get(this.runtimeScopeId);
    if (!previous || previous.instanceId === this.instanceId) {
      return;
    }
    this.logger.warn('[FrontendInstanceRuntime] disposing previous runtime in same scope before start', {
      instanceId: this.instanceId,
      runtimeScopeId: this.runtimeScopeId,
      previousInstanceId: previous.instanceId,
    });
    try {
      await previous.dispose();
    } catch (error) {
      this.logger.warn('[FrontendInstanceRuntime] previous runtime dispose failed', {
        instanceId: this.instanceId,
        runtimeScopeId: this.runtimeScopeId,
        previousInstanceId: previous.instanceId,
        error,
      });
    }
  }

  private registerCurrentRuntimeInScope(): void {
    const registry = getRuntimeScopeRegistry();
    registry?.set(this.runtimeScopeId, {
      instanceId: this.instanceId,
      runtimeScopeId: this.runtimeScopeId,
      dispose: () => this.dispose(),
    });
  }

  private unregisterCurrentRuntimeInScope(): void {
    const registry = getRuntimeScopeRegistry();
    const current = registry?.get(this.runtimeScopeId);
    if (current?.instanceId === this.instanceId) {
      registry?.delete(this.runtimeScopeId);
    }
  }

  private setMode(
    nextMode: FrontendInstanceMode,
    reason: string,
    leaseHolder: string | null,
    leaseSurfaceId: string | null,
  ): void {
    const previousMode = this.mode;
    this.mode = nextMode;
    if (previousMode !== nextMode) {
      this.logger.info('[FrontendInstanceRuntime] mode changed', {
        instanceId: this.instanceId,
        runtimeScopeId: this.runtimeScopeId,
        previousMode,
        mode: nextMode,
        leaseHolder,
        leaseSurfaceId,
        reason,
      });
    }
  }

  private async refreshOwnership(reason = 'manual'): Promise<{ leaseHolder: string | null; leaseSurfaceId: string | null }> {
    try {
      const lease = await this.sidecarClient.writerAcquireLease({
        instanceId: this.instanceId,
        ttlMs: this.leaseTtlMs,
        surfaceId: this.runtimeScopeId,
      });
      const leaseHolder = typeof lease.lease?.instanceId === 'string' ? lease.lease.instanceId : null;
      const leaseSurfaceId = typeof lease.lease?.surfaceId === 'string' ? lease.lease.surfaceId : null;
      this.setMode(leaseHolder === this.instanceId ? 'writer' : 'follower', reason, leaseHolder, leaseSurfaceId);
      return { leaseHolder, leaseSurfaceId };
    } catch (error) {
      const previousMode = this.mode;
      this.setMode('follower', `${reason}:acquire-failed`, null, null);
      if (!this.isExpectedFollowerHeartbeatLeaseContention(reason, previousMode, error)) {
        this.logger.warn('[FrontendInstanceRuntime] writer lease acquire failed', {
          instanceId: this.instanceId,
          runtimeScopeId: this.runtimeScopeId,
          reason,
          error,
        });
      }
    }

    const lease = await this.sidecarClient.writerGetLease().catch(() => null);
    const leaseHolder = typeof lease?.lease?.instanceId === 'string' ? lease.lease.instanceId : null;
    const leaseSurfaceId = typeof lease?.lease?.surfaceId === 'string' ? lease.lease.surfaceId : null;
    this.setMode(leaseHolder === this.instanceId ? 'writer' : 'follower', `${reason}:get-lease`, leaseHolder, leaseSurfaceId);
    return { leaseHolder, leaseSurfaceId };
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
        const relayContext = {
          commandId: command.commandId,
          method: command.method,
          requesterInstanceId: command.requesterInstanceId,
          writerInstanceId: this.instanceId,
          writerRuntimeScopeId: this.runtimeScopeId,
        };
        const logTakenBeforeHandling = shouldLogRelayCommandSubmitted(command.method);
        if (logTakenBeforeHandling) {
          this.logger.info('[FrontendInstanceRuntime] relay command taken', relayContext);
        }
        try {
          const result = await this.writerCommandHandler(command);
          await this.sidecarClient.writerCompleteCommand({
            instanceId: this.instanceId,
            commandId: command.commandId,
            result,
          });
          const completionDiagnostics = getRelayCompletionExtraDiagnostics(command.method, result);
          if (completionDiagnostics) {
            const completionContext = {
              ...relayContext,
              ...completionDiagnostics,
            };
            if (!logTakenBeforeHandling) {
              this.logger.info('[FrontendInstanceRuntime] relay command taken', completionContext);
            }
            this.logger.info('[FrontendInstanceRuntime] relay command completed', completionContext);
          }
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
          this.logger.warn('[FrontendInstanceRuntime] relay command failed', {
            commandId: command.commandId,
            method: command.method,
            requesterInstanceId: command.requesterInstanceId,
            writerInstanceId: this.instanceId,
            error: message,
          });
        }
      }
    } catch (error) {
      if (this.isWriterLeaseUnavailableError(error)) {
        this.logger.warn('[FrontendInstanceRuntime] relay polling lost writer lease', {
          instanceId: this.instanceId,
          runtimeScopeId: this.runtimeScopeId,
          error,
        });
        await this.refreshOwnership('relay-poll').catch(() => {
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

  private isExpectedFollowerHeartbeatLeaseContention(
    reason: string,
    previousMode: FrontendInstanceMode,
    error: unknown,
  ): boolean {
    if (reason !== 'heartbeat' || previousMode !== 'follower') {
      return false;
    }
    const message = error instanceof Error ? error.message : String(error || '');
    return message.includes('writer lease held by another instance');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
