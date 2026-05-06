import { KernelSidecarClient } from '@/application/clients/KernelSidecarClient';
import type {
  KernelCompanionBroadcastDiagnostics,
  KernelCompanionBroadcastSubscription,
} from '@/application/ports/KernelCompanionPort';
import {
  getRelayCompletionExtraDiagnostics,
  shouldLogRelayCommandSubmitted,
} from '@/application/clients/relayDiagnostics';
import { createLogger } from '@/utils/logger';
import type { KernelBroadcastEvent } from '../../../packages/contracts/src/kernel-rpc';

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

interface FrontendObservedLeasePayload {
  instanceId?: unknown;
  surfaceId?: unknown;
  visibilityState?: unknown;
  documentHasFocus?: unknown;
  locationHref?: unknown;
  ownerChangedAt?: unknown;
  acquiredAt?: unknown;
  lastHeartbeatAt?: unknown;
}

interface FrontendObservedLeaseEnvelope {
  lease?: FrontendObservedLeasePayload | null;
  now?: unknown;
}

interface FrontendOwnershipSnapshot {
  leaseHolder: string | null;
  leaseSurfaceId: string | null;
  leaseVisibilityState: string | null;
  leaseDocumentHasFocus: boolean | null;
  leaseLocationHref: string | null;
  leaseOwnerChangedAt: number | null;
  leaseAcquiredAt: number | null;
  leaseLastHeartbeatAt: number | null;
  leaseObservedAt: number;
}

function createDefaultInstanceId(): string {
  return `memo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createDefaultRuntimeScopeId(): string {
  return `memo-scope-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const GLOBAL_RUNTIME_SCOPE_ID_KEY = '__siyuanmemoFrontendRuntimeScopeId';
const GLOBAL_RUNTIME_SCOPE_REGISTRY_KEY = '__siyuanmemoFrontendRuntimeScopeRegistry';
const WRITER_LEASE_STALE_OWNER_RECLAIM_GRACE_MS = 30_000;

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

function resolveDocumentHasFocus(): boolean | null {
  if (typeof document === 'undefined' || typeof document.hasFocus !== 'function') {
    return null;
  }
  try {
    return document.hasFocus();
  } catch {
    return null;
  }
}

function isDocumentHidden(): boolean {
  return resolveDocumentVisibilityState() === 'hidden';
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

function normalizeObservedString(value: unknown): string | null {
  const text = String(value || '').trim();
  return text ? text : null;
}

function normalizeObservedNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeObservedBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function isAuxiliarySiyuanSurfaceHref(locationHref: string | null): boolean {
  const href = String(locationHref || '').toLowerCase();
  return href.includes('enhance=true')
    || href.includes('enwindowtitle=quicknote')
    || href.includes('quicknote');
}

type SiyuanAppSurfaceRole = 'primary-app' | 'document-window' | 'auxiliary' | 'unknown';

function getSiyuanAppSurfaceRole(locationHref: string | null): SiyuanAppSurfaceRole {
  const href = String(locationHref || '').toLowerCase();
  if (!href.includes('/stage/build/app')) {
    return 'unknown';
  }
  if (isAuxiliarySiyuanSurfaceHref(href)) {
    return 'auxiliary';
  }
  if (href.includes('/window.html')) {
    return 'document-window';
  }
  return 'primary-app';
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
  private visibilityRefreshDisposer: (() => void) | null = null;
  private pushRelaySubscription: KernelCompanionBroadcastSubscription | null = null;
  private pushRelayDiagnostics: KernelCompanionBroadcastDiagnostics | null = null;
  private drainingRelay = false;
  private readonly processingRelayCommandIds = new Set<string>();

  constructor(
    private readonly sidecarClient: KernelSidecarClient,
    options: FrontendInstanceRuntimeOptions = {},
  ) {
    this.instanceId = String(options.instanceId || '').trim() || createDefaultInstanceId();
    this.runtimeScopeId = String(options.runtimeScopeId || '').trim() || resolveDefaultRuntimeScopeId();
    this.leaseTtlMs = Number.isFinite(Number(options.leaseTtlMs))
      ? Math.max(3_000, Math.floor(Number(options.leaseTtlMs)))
      : 60_000;
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
    await this.disposePreviousRuntimesInSameContext();
    await this.waitForKernelCompanionRunning();
    this.started = true;
    try {
      await this.sidecarClient.writerHello({
        instanceId: this.instanceId,
        surfaceId: this.runtimeScopeId,
        ...this.buildWriterLeaseClientState(),
      });
      const ownership = await this.refreshOwnership('startup');
      this.startHeartbeat();
      this.startPushRelay();
      this.startRelayPump();
      this.startVisibilityRefresh();
      this.registerCurrentRuntimeInScope();
      this.logger.info('[FrontendInstanceRuntime] started', {
        instanceId: this.instanceId,
        runtimeScopeId: this.runtimeScopeId,
        visibilityState: resolveDocumentVisibilityState(),
        documentHasFocus: resolveDocumentHasFocus(),
        locationHref: resolveWindowLocationHref(),
        mode: this.mode,
        leaseHolder: ownership.leaseHolder,
        leaseSurfaceId: ownership.leaseSurfaceId,
        leaseTtlMs: this.leaseTtlMs,
        relayPollIntervalMs: this.writerCommandHandler ? this.relayPollIntervalMs : null,
        pushRelayState: this.pushRelayDiagnostics?.state ?? null,
      });
    } catch (error) {
      this.started = false;
      this.stopHeartbeat();
      this.stopPushRelay();
      this.stopRelayPump();
      this.stopVisibilityRefresh();
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
    this.stopPushRelay();
    this.stopRelayPump();
    this.stopVisibilityRefresh();
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

  private startPushRelay(): void {
    this.stopPushRelay();
    if (!this.writerCommandHandler) {
      return;
    }
    const subscription = this.sidecarClient.subscribeBroadcast?.({
      onEvent: (event) => this.handleKernelBroadcastEvent(event),
      onStateChange: (diagnostics) => {
        this.pushRelayDiagnostics = diagnostics;
        if (diagnostics.state === 'degraded' || diagnostics.state === 'unavailable') {
          this.logger.warn('[FrontendInstanceRuntime] push relay degraded', {
            instanceId: this.instanceId,
            runtimeScopeId: this.runtimeScopeId,
            diagnostics,
          });
        }
        if (diagnostics.state === 'open') {
          this.drainPendingWriterCommands('push:reconnect-drain').catch(() => {
            // keep reconnect catch-up best-effort
          });
        }
      },
    });
    if (!subscription) {
      this.pushRelayDiagnostics = {
        state: 'unavailable',
        reconnectAttempts: 0,
        unavailableReason: 'not-configured',
        message: 'Kernel broadcast subscription is not available',
      };
      return;
    }
    this.pushRelaySubscription = subscription;
    this.pushRelayDiagnostics = subscription.getDiagnostics();
  }

  private stopPushRelay(): void {
    if (!this.pushRelaySubscription) {
      return;
    }
    this.pushRelaySubscription.close();
    this.pushRelayDiagnostics = this.pushRelaySubscription.getDiagnostics();
    this.pushRelaySubscription = null;
  }

  private handleKernelBroadcastEvent(event: KernelBroadcastEvent): void {
    if (event.method !== 'memo.writer.command') {
      return;
    }
    this.drainPendingWriterCommands('push:command').catch((error) => {
      this.logger.warn('[FrontendInstanceRuntime] push relay drain failed', {
        instanceId: this.instanceId,
        runtimeScopeId: this.runtimeScopeId,
        error,
      });
    });
  }

  private startVisibilityRefresh(): void {
    this.stopVisibilityRefresh();
    const disposers: Array<() => void> = [];
    const refreshWhenVisible = () => {
      if (!this.started || isDocumentHidden()) {
        return;
      }
      this.refreshOwnership('visibility').catch(() => {
        // keep visibility-triggered ownership refresh best-effort
      });
    };

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', refreshWhenVisible);
      disposers.push(() => document.removeEventListener('visibilitychange', refreshWhenVisible));
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('focus', refreshWhenVisible);
      disposers.push(() => window.removeEventListener('focus', refreshWhenVisible));
    }
    if (disposers.length === 0) {
      return;
    }
    this.visibilityRefreshDisposer = () => {
      for (const dispose of disposers) {
        dispose();
      }
    };
  }

  private stopVisibilityRefresh(): void {
    if (!this.visibilityRefreshDisposer) {
      return;
    }
    this.visibilityRefreshDisposer();
    this.visibilityRefreshDisposer = null;
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

  private async disposePreviousRuntimesInSameContext(): Promise<void> {
    const registry = getRuntimeScopeRegistry();
    if (!registry || registry.size === 0) {
      return;
    }

    const previousEntries = Array.from(registry.entries())
      .filter(([, previous]) => previous.instanceId !== this.instanceId);
    for (const [previousRuntimeScopeId, previous] of previousEntries) {
      this.logger.warn('[FrontendInstanceRuntime] disposing previous runtime in same JS context before start', {
        instanceId: this.instanceId,
        runtimeScopeId: this.runtimeScopeId,
        previousInstanceId: previous.instanceId,
        previousRuntimeScopeId,
      });
      try {
        await previous.dispose();
      } catch (error) {
        this.logger.warn('[FrontendInstanceRuntime] previous runtime dispose failed', {
          instanceId: this.instanceId,
          runtimeScopeId: this.runtimeScopeId,
          previousInstanceId: previous.instanceId,
          previousRuntimeScopeId,
          error,
        });
      } finally {
        const currentEntry = registry.get(previousRuntimeScopeId);
        if (currentEntry?.instanceId === previous.instanceId) {
          registry.delete(previousRuntimeScopeId);
        }
      }
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

  private async refreshOwnership(reason = 'manual'): Promise<FrontendOwnershipSnapshot> {
    if (reason === 'heartbeat') {
      if (this.mode === 'writer') {
        return this.renewCurrentWriterLease(reason);
      }
      const observedOwnership = await this.observeCurrentLease(`${reason}:observe`);
      if (observedOwnership.leaseHolder || isDocumentHidden()) {
        return observedOwnership;
      }
      return this.acquireWriterLease(reason);
    }

    if (this.mode === 'writer' && reason === 'visibility') {
      return this.renewCurrentWriterLease(reason);
    }

    if (this.mode !== 'writer') {
      const observedOwnership = await this.observeCurrentLease(`${reason}:observe`);
      if (!this.shouldAcquireWriterLeaseAfterObserve(reason, observedOwnership)) {
        return observedOwnership;
      }
      return this.acquireWriterLease(reason);
    }

    return this.acquireWriterLease(reason);
  }

  private shouldAcquireWriterLeaseAfterObserve(reason: string, ownership: FrontendOwnershipSnapshot): boolean {
    if (isDocumentHidden()) {
      return false;
    }
    if (!ownership.leaseHolder) {
      return true;
    }
    if (ownership.leaseHolder === this.instanceId || reason === 'heartbeat') {
      return false;
    }
    if (this.shouldPreferCurrentSurfaceOverObservedOwner(ownership)) {
      return true;
    }
    if (reason === 'visibility') {
      return false;
    }
    return this.isObservedStaleUnfocusedNormalAppOwner(ownership);
  }

  private shouldPreferCurrentSurfaceOverObservedOwner(ownership: FrontendOwnershipSnapshot): boolean {
    const currentRole = getSiyuanAppSurfaceRole(resolveWindowLocationHref());
    const ownerRole = getSiyuanAppSurfaceRole(ownership.leaseLocationHref);
    return currentRole === 'primary-app' && (ownerRole === 'document-window' || ownerRole === 'auxiliary');
  }

  private isObservedStaleUnfocusedNormalAppOwner(ownership: FrontendOwnershipSnapshot): boolean {
    const currentRole = getSiyuanAppSurfaceRole(resolveWindowLocationHref());
    const ownerRole = getSiyuanAppSurfaceRole(ownership.leaseLocationHref);
    if (currentRole !== 'document-window' || ownerRole !== 'document-window') {
      return false;
    }
    const ownerSince = ownership.leaseOwnerChangedAt
      ?? ownership.leaseAcquiredAt
      ?? ownership.leaseLastHeartbeatAt
      ?? ownership.leaseObservedAt;
    const ownerAgeMs = Math.max(0, ownership.leaseObservedAt - ownerSince);
    if (ownerAgeMs < WRITER_LEASE_STALE_OWNER_RECLAIM_GRACE_MS) {
      return false;
    }
    return ownership.leaseVisibilityState === 'hidden' || ownership.leaseDocumentHasFocus === false;
  }

  private async acquireWriterLease(reason: string): Promise<FrontendOwnershipSnapshot> {
    try {
      const lease = await this.sidecarClient.writerAcquireLease({
        instanceId: this.instanceId,
        ttlMs: this.leaseTtlMs,
        surfaceId: this.runtimeScopeId,
        ...this.buildWriterLeaseClientState(),
      });
      return this.applyLeaseOwnership(lease, reason);
    } catch (error) {
      const observedOwnership = await this.observeCurrentLease(`${reason}:acquire-failed`);
      if (!this.isExpectedOwnershipAcquireContention(reason, error, observedOwnership)) {
        this.logger.warn('[FrontendInstanceRuntime] writer lease acquire failed', {
          instanceId: this.instanceId,
          runtimeScopeId: this.runtimeScopeId,
          reason,
          leaseHolder: observedOwnership.leaseHolder,
          leaseSurfaceId: observedOwnership.leaseSurfaceId,
          error,
        });
      }
      return observedOwnership;
    }
  }

  private async renewCurrentWriterLease(reason: string): Promise<FrontendOwnershipSnapshot> {
    try {
      const lease = await this.sidecarClient.writerRenewLease({
        instanceId: this.instanceId,
        ttlMs: this.leaseTtlMs,
        surfaceId: this.runtimeScopeId,
        ...this.buildWriterLeaseClientState(),
      });
      return this.applyLeaseOwnership(lease, reason);
    } catch (error) {
      const observedOwnership = await this.observeCurrentLease(`${reason}:renew-failed`);
      if (!this.isExpectedOwnershipRenewContention(reason, error, observedOwnership)) {
        this.logger.warn('[FrontendInstanceRuntime] writer lease renew failed', {
          instanceId: this.instanceId,
          runtimeScopeId: this.runtimeScopeId,
          reason,
          leaseHolder: observedOwnership.leaseHolder,
          leaseSurfaceId: observedOwnership.leaseSurfaceId,
          error,
        });
      }
      return observedOwnership;
    }
  }

  private applyLeaseOwnership(
    lease: FrontendObservedLeaseEnvelope,
    reason: string,
  ): FrontendOwnershipSnapshot {
    const ownership = this.buildOwnershipSnapshot(lease);
    this.setMode(
      ownership.leaseHolder === this.instanceId ? 'writer' : 'follower',
      reason,
      ownership.leaseHolder,
      ownership.leaseSurfaceId,
    );
    return ownership;
  }

  private buildWriterLeaseClientState(): {
    visibilityState?: string;
    documentHasFocus?: boolean;
    locationHref?: string;
  } {
    const visibilityState = resolveDocumentVisibilityState();
    const documentHasFocus = resolveDocumentHasFocus();
    const locationHref = resolveWindowLocationHref();
    return {
      ...(visibilityState ? { visibilityState } : {}),
      ...(typeof documentHasFocus === 'boolean' ? { documentHasFocus } : {}),
      ...(locationHref ? { locationHref } : {}),
    };
  }

  private async observeCurrentLease(reason: string): Promise<FrontendOwnershipSnapshot> {
    const lease = await this.sidecarClient.writerGetLease().catch(() => null);
    const ownership = this.buildOwnershipSnapshot(lease);
    this.setMode(
      ownership.leaseHolder === this.instanceId ? 'writer' : 'follower',
      reason,
      ownership.leaseHolder,
      ownership.leaseSurfaceId,
    );
    return ownership;
  }

  private buildOwnershipSnapshot(envelope: FrontendObservedLeaseEnvelope | null): FrontendOwnershipSnapshot {
    const lease = envelope?.lease ?? null;
    return {
      leaseHolder: typeof lease?.instanceId === 'string' ? lease.instanceId : null,
      leaseSurfaceId: typeof lease?.surfaceId === 'string' ? lease.surfaceId : null,
      leaseVisibilityState: normalizeObservedString(lease?.visibilityState),
      leaseDocumentHasFocus: normalizeObservedBoolean(lease?.documentHasFocus),
      leaseLocationHref: normalizeObservedString(lease?.locationHref),
      leaseOwnerChangedAt: normalizeObservedNumber(lease?.ownerChangedAt),
      leaseAcquiredAt: normalizeObservedNumber(lease?.acquiredAt),
      leaseLastHeartbeatAt: normalizeObservedNumber(lease?.lastHeartbeatAt),
      leaseObservedAt: normalizeObservedNumber(envelope?.now) ?? Date.now(),
    };
  }

  private async drainPendingWriterCommands(reason = 'watchdog'): Promise<void> {
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
        if (this.processingRelayCommandIds.has(command.commandId)) {
          continue;
        }
        this.processingRelayCommandIds.add(command.commandId);
        const relayContext = {
          commandId: command.commandId,
          method: command.method,
          requesterInstanceId: command.requesterInstanceId,
          writerInstanceId: this.instanceId,
          writerRuntimeScopeId: this.runtimeScopeId,
        };
        const logTakenBeforeHandling = shouldLogRelayCommandSubmitted(command.method);
        if (logTakenBeforeHandling) {
          this.logger.info('[FrontendInstanceRuntime] relay command taken', {
            ...relayContext,
            wakeReason: reason,
          });
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
              this.logger.info('[FrontendInstanceRuntime] relay command taken', {
                ...completionContext,
                wakeReason: reason,
              });
            }
            this.logger.info('[FrontendInstanceRuntime] relay command completed', {
              ...completionContext,
              wakeReason: reason,
            });
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
            wakeReason: reason,
          });
        } finally {
          this.processingRelayCommandIds.delete(command.commandId);
        }
      }
    } catch (error) {
      if (this.isWriterLeaseUnavailableError(error)) {
        const ownership = await this.observeCurrentLease(`${reason}:lost-writer`);
        if (!ownership.leaseHolder || ownership.leaseHolder === this.instanceId) {
          this.logger.warn('[FrontendInstanceRuntime] relay polling lost writer lease', {
            instanceId: this.instanceId,
            runtimeScopeId: this.runtimeScopeId,
            wakeReason: reason,
            leaseHolder: ownership.leaseHolder,
            leaseSurfaceId: ownership.leaseSurfaceId,
            error,
          });
        }
      }
    } finally {
      this.drainingRelay = false;
    }
  }

  private isWriterLeaseUnavailableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '');
    return message.startsWith('BACKEND_UNAVAILABLE:');
  }

  private isExpectedOwnershipAcquireContention(
    reason: string,
    error: unknown,
    ownership: { leaseHolder: string | null; leaseSurfaceId: string | null },
  ): boolean {
    const message = error instanceof Error ? error.message : String(error || '');
    if (!message.includes('writer lease held by another instance')) {
      return false;
    }
    if (ownership.leaseHolder === this.instanceId) {
      return true;
    }
    if (reason === 'heartbeat' || reason === 'visibility') {
      return !!ownership.leaseHolder;
    }
    return false;
  }

  private isExpectedOwnershipRenewContention(
    reason: string,
    error: unknown,
    ownership: { leaseHolder: string | null; leaseSurfaceId: string | null },
  ): boolean {
    if (!this.isWriterLeaseUnavailableError(error)) {
      return false;
    }
    if (ownership.leaseHolder === this.instanceId) {
      return true;
    }
    if (reason === 'heartbeat' || reason === 'visibility') {
      return !!ownership.leaseHolder;
    }
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
