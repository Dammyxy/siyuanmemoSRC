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
import {
  incrementRuntimePerformanceCounter,
  measureRuntimePerformance,
  startRuntimePerformanceSpan,
} from '@/utils/runtimePerformanceDiagnostics';
import type { KernelBroadcastEvent } from '../../../packages/contracts/src/kernel-rpc';
import type { QueueProjectionLiveIdentityEvent } from '@/types/queue-projection-live-identity';
import {
  getQueueProjectionBroadcastDedupeKey,
  mapQueueProjectionBroadcastToLiveIdentity,
  mapQueueProjectionLiveIdentityToBroadcast,
} from '@/types/queue-projection-live-identity';
import {
  detectWriterProfile,
  type WriterProfileDetection,
} from './writerProfileDetector';

export interface FrontendInstanceRuntimeOptions {
  instanceId?: string;
  runtimeScopeId?: string;
  backendContainer?: string;
  frontendKind?: string;
  isBrowser?: boolean;
  isMobile?: boolean;
  leaseTtlMs?: number;
  relayPollIntervalMs?: number;
  relayDrainBudgetMs?: number;
  relayTransactionContinuationDelayMs?: number;
  relayTransactionMaxDelayMs?: number;
  relayNoCommandBackoffMaxMs?: number;
  startupRetryDelayMs?: number;
  startupMaxWaitMs?: number;
  logger?: FrontendRuntimeDiagnosticsLogger;
  backendWorkerHealth?: () => FrontendBackendWorkerHealthSnapshot;
  writerCommandHandler?: (command: {
    commandId: string;
    requesterInstanceId: string;
    method: string;
    params?: unknown;
    requestedAt: number;
  }) => Promise<unknown>;
}

export interface FrontendBackendWorkerHealthSnapshot {
  healthy: boolean;
  reason?: string | null;
  diagnostics?: unknown;
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

type RelayWakeSource = 'push' | 'reconnect' | 'watchdog' | 'continuation' | 'manual';

type RelayTransactionCommandAgeClass = 'none' | 'fresh' | 'stale' | 'mixed' | 'non-transaction';

interface RelayCommandDiagnosticsPayload {
  commandAgeMs: number;
  commandAgeClass: RelayTransactionCommandAgeClass;
  maxDelayCapHit: boolean;
}

interface FrontendRelayCommand {
  commandId: string;
  requesterInstanceId: string;
  method: string;
  params?: unknown;
  idempotencyKey?: string;
  requestedAt: number;
  expiresAt?: number;
}

interface FrontendWriterTakeCommandResult {
  command: FrontendRelayCommand | null;
  pendingCommandCount?: number;
  now: number;
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
const WRITER_RELAY_DRAIN_MAX_COMMANDS_PER_WAKE = 4;
const WRITER_RELAY_DRAIN_BUDGET_MS = 24;
const WRITER_RELAY_TRANSACTION_CONTINUATION_DELAY_MS = 48;
const WRITER_RELAY_TRANSACTION_MAX_DELAY_MS = 750;

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

function resolveDocumentBodyClass(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  try {
    return typeof document.body?.className === 'string' ? document.body.className : null;
  } catch {
    return null;
  }
}

function resolveUserAgentFamily(): 'electron' | 'browser' | 'mobile' | 'unknown' {
  if (typeof navigator === 'undefined' || typeof navigator.userAgent !== 'string') {
    return 'unknown';
  }
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Electron')) {
    return 'electron';
  }
  if (userAgent.includes('Mobile')) {
    return 'mobile';
  }
  return 'browser';
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
type QueueProjectionIdentityBroadcastListener = (event: QueueProjectionLiveIdentityEvent) => void;
interface ObserveCurrentLeaseOptions {
  preserveWriterModeForEmptyPrimaryLeaseGap?: boolean;
}

export class FrontendInstanceRuntime {
  private readonly instanceId: string;
  private readonly runtimeScopeId: string;
  private readonly leaseTtlMs: number;
  private readonly relayPollIntervalMs: number;
  private readonly relayDrainBudgetMs: number;
  private readonly relayTransactionContinuationDelayMs: number;
  private readonly relayTransactionMaxDelayMs: number;
  private readonly relayNoCommandBackoffMaxMs: number;
  private readonly startupRetryDelayMs: number;
  private readonly startupMaxWaitMs: number;
  private readonly logger: FrontendRuntimeDiagnosticsLogger;
  private readonly backendWorkerHealth: FrontendInstanceRuntimeOptions['backendWorkerHealth'];
  private readonly writerCommandHandler: FrontendInstanceRuntimeOptions['writerCommandHandler'];
  private readonly backendContainer: string;
  private readonly frontendKind: string;
  private readonly isBrowser: boolean | null;
  private readonly isMobile: boolean | null;
  private mode: FrontendInstanceMode = 'follower';
  private started = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private relayTimer: ReturnType<typeof setInterval> | null = null;
  private visibilityRefreshDisposer: (() => void) | null = null;
  private pushRelaySubscription: KernelCompanionBroadcastSubscription | null = null;
  private pushRelayDiagnostics: KernelCompanionBroadcastDiagnostics | null = null;
  private drainingRelay = false;
  private relayDrainRequestedWhileActive = false;
  private relayDrainRequestedWithoutCommandId = false;
  private relayDrainContinuationTimer: ReturnType<typeof setTimeout> | null = null;
  private relayNoCommandStreak = 0;
  private nextRelayWatchdogAllowedAt = 0;
  private lastWriterUnavailableReason: string | null = null;
  private readonly relayDrainCoalescedCommandIds = new Set<string>();
  private readonly processingRelayCommandIds = new Set<string>();
  private readonly queueProjectionIdentityListeners = new Set<QueueProjectionIdentityBroadcastListener>();
  private readonly acceptedQueueProjectionBroadcastKeys = new Set<string>();

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
    this.relayDrainBudgetMs = Number.isFinite(Number(options.relayDrainBudgetMs))
      ? Math.max(1, Math.floor(Number(options.relayDrainBudgetMs)))
      : WRITER_RELAY_DRAIN_BUDGET_MS;
    this.relayTransactionContinuationDelayMs = Number.isFinite(Number(options.relayTransactionContinuationDelayMs))
      ? Math.max(0, Math.floor(Number(options.relayTransactionContinuationDelayMs)))
      : WRITER_RELAY_TRANSACTION_CONTINUATION_DELAY_MS;
    this.relayTransactionMaxDelayMs = Number.isFinite(Number(options.relayTransactionMaxDelayMs))
      ? Math.max(this.relayTransactionContinuationDelayMs, Math.floor(Number(options.relayTransactionMaxDelayMs)))
      : WRITER_RELAY_TRANSACTION_MAX_DELAY_MS;
    this.relayNoCommandBackoffMaxMs = Number.isFinite(Number(options.relayNoCommandBackoffMaxMs))
      ? Math.max(this.relayPollIntervalMs, Math.floor(Number(options.relayNoCommandBackoffMaxMs)))
      : 4_000;
    this.startupRetryDelayMs = Number.isFinite(Number(options.startupRetryDelayMs))
      ? Math.max(1, Math.floor(Number(options.startupRetryDelayMs)))
      : 250;
    this.startupMaxWaitMs = Number.isFinite(Number(options.startupMaxWaitMs))
      ? Math.max(this.startupRetryDelayMs, Math.floor(Number(options.startupMaxWaitMs)))
      : 5_000;
    this.logger = options.logger ?? createLogger('FrontendInstanceRuntime');
    this.backendWorkerHealth = options.backendWorkerHealth;
    this.writerCommandHandler = options.writerCommandHandler;
    this.backendContainer = String(options.backendContainer || '').trim() || 'unknown';
    this.frontendKind = String(options.frontendKind || '').trim() || 'unknown';
    this.isBrowser = typeof options.isBrowser === 'boolean' ? options.isBrowser : null;
    this.isMobile = typeof options.isMobile === 'boolean' ? options.isMobile : null;
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

  subscribeQueueProjectionIdentityBroadcasts(listener: QueueProjectionIdentityBroadcastListener): () => void {
    this.queueProjectionIdentityListeners.add(listener);
    this.startPushRelay();
    return () => {
      this.queueProjectionIdentityListeners.delete(listener);
    };
  }

  async publishQueueProjectionIdentityBroadcast(event: QueueProjectionLiveIdentityEvent): Promise<void> {
    const broadcast = mapQueueProjectionLiveIdentityToBroadcast(event, {
      sourceInstanceId: this.instanceId,
      sourceSurfaceId: this.runtimeScopeId,
      sourceMode: this.mode,
    });
    if (!broadcast) {
      return;
    }
    try {
      await this.sidecarClient.queueProjectionPublishIdentityChanged(broadcast);
    } catch (error) {
      this.logger.warn('[FrontendInstanceRuntime] queue projection identity broadcast failed', {
        instanceId: this.instanceId,
        runtimeScopeId: this.runtimeScopeId,
        diagnosticEventId: broadcast.diagnosticEventId,
        error,
      });
    }
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
    const backendUnavailableReason = this.getBackendWorkerUnavailableReason();
    if (backendUnavailableReason) {
      await this.releaseWriterLeaseForUnhealthyBackend(backendUnavailableReason, 'ensure-writable');
      throw new Error(`BACKEND_UNAVAILABLE: backend worker unhealthy: ${backendUnavailableReason}`);
    }
    await this.refreshOwnership();
    if (this.mode !== 'writer') {
      throw new Error(this.lastWriterUnavailableReason || 'BACKEND_UNAVAILABLE: writer lease held by another instance');
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
    this.clearRelayDrainContinuation();
  }

  private clearRelayDrainContinuation(): void {
    if (!this.relayDrainContinuationTimer) {
      this.relayDrainCoalescedCommandIds.clear();
      this.relayDrainRequestedWithoutCommandId = false;
      this.relayDrainRequestedWhileActive = false;
      return;
    }
    clearTimeout(this.relayDrainContinuationTimer);
    this.relayDrainContinuationTimer = null;
    this.relayDrainCoalescedCommandIds.clear();
    this.relayDrainRequestedWithoutCommandId = false;
    this.relayDrainRequestedWhileActive = false;
  }

  private scheduleRelayDrainContinuation(reason: string, delayMs = 0): void {
    if (!this.started || this.mode !== 'writer' || !this.writerCommandHandler || this.relayDrainContinuationTimer) {
      return;
    }
    this.relayDrainContinuationTimer = setTimeout(() => {
      this.relayDrainContinuationTimer = null;
      this.drainPendingWriterCommands(reason).catch((error) => {
        this.logger.warn('[FrontendInstanceRuntime] relay drain continuation failed', {
          instanceId: this.instanceId,
          runtimeScopeId: this.runtimeScopeId,
          wakeReason: reason,
          error,
        });
      });
    }, delayMs);
  }

  private startPushRelay(): void {
    this.stopPushRelay();
    if (!this.started) {
      return;
    }
    if (!this.writerCommandHandler && this.queueProjectionIdentityListeners.size === 0) {
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
    if (event.method === 'memo.queueProjection.identityChanged') {
      this.handleQueueProjectionIdentityBroadcast(event);
      return;
    }
    if (event.method !== 'memo.writer.command' || this.mode !== 'writer' || !this.writerCommandHandler) {
      return;
    }
    incrementRuntimePerformanceCounter('relay', 'writer-push-command-events');
    const commandId = typeof event.params?.commandId === 'string' ? event.params.commandId : null;
    if (commandId && this.processingRelayCommandIds.has(commandId)) {
      incrementRuntimePerformanceCounter('relay', 'writer-push-duplicate-inflight-events');
      return;
    }
    this.drainPendingWriterCommands('push:command', commandId || undefined).catch((error) => {
      this.logger.warn('[FrontendInstanceRuntime] push relay drain failed', {
        instanceId: this.instanceId,
        runtimeScopeId: this.runtimeScopeId,
        error,
      });
    });
  }

  private handleQueueProjectionIdentityBroadcast(event: Extract<KernelBroadcastEvent, { method: 'memo.queueProjection.identityChanged' }>): void {
    if (event.params.sourceInstanceId === this.instanceId) {
      return;
    }
    const key = getQueueProjectionBroadcastDedupeKey(event.params);
    if (this.acceptedQueueProjectionBroadcastKeys.has(key)) {
      return;
    }
    const liveEvent = mapQueueProjectionBroadcastToLiveIdentity(event.params);
    if (!liveEvent) {
      return;
    }
    this.acceptedQueueProjectionBroadcastKeys.add(key);
    if (this.acceptedQueueProjectionBroadcastKeys.size > 256) {
      const oldestKey = this.acceptedQueueProjectionBroadcastKeys.values().next().value;
      if (oldestKey) {
        this.acceptedQueueProjectionBroadcastKeys.delete(oldestKey);
      }
    }
    for (const listener of this.queueProjectionIdentityListeners) {
      try {
        listener(liveEvent);
      } catch (error) {
        this.logger.warn('[FrontendInstanceRuntime] queue projection identity listener failed', {
          instanceId: this.instanceId,
          runtimeScopeId: this.runtimeScopeId,
          error,
        });
      }
    }
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
    if (nextMode === 'writer') {
      this.lastWriterUnavailableReason = null;
    }
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
    const backendUnavailableReason = this.getBackendWorkerUnavailableReason();
    if (backendUnavailableReason) {
      return this.handleBackendWorkerUnavailableForOwnership(reason, backendUnavailableReason);
    }

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
      const currentProfile = this.buildCurrentWriterProfile();
      if (
        currentProfile?.writerEligibility === 'follower-only'
        || currentProfile?.writerEligibility === 'never'
        || currentProfile?.writerEligibility === 'unavailable'
      ) {
        this.lastWriterUnavailableReason = `BACKEND_UNAVAILABLE: writer unavailable: ${currentProfile.reason}`;
        return false;
      }
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
    const backendUnavailableReason = this.getBackendWorkerUnavailableReason();
    if (backendUnavailableReason) {
      return this.handleBackendWorkerUnavailableForOwnership(reason, backendUnavailableReason);
    }
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
    const backendUnavailableReason = this.getBackendWorkerUnavailableReason();
    if (backendUnavailableReason) {
      return this.handleBackendWorkerUnavailableForOwnership(reason, backendUnavailableReason);
    }
    try {
      const lease = await this.sidecarClient.writerRenewLease({
        instanceId: this.instanceId,
        ttlMs: this.leaseTtlMs,
        surfaceId: this.runtimeScopeId,
        ...this.buildWriterLeaseClientState(),
      });
      return this.applyLeaseOwnership(lease, reason);
    } catch (error) {
      const observedOwnership = await this.observeCurrentLease(`${reason}:renew-failed`, {
        preserveWriterModeForEmptyPrimaryLeaseGap: true,
      });
      if (this.shouldRecoverEmptyPrimaryWriterLeaseGap(observedOwnership)) {
        const recoveredOwnership = await this.acquireWriterLease(`${reason}:recover-empty-lease`);
        if (recoveredOwnership.leaseHolder === this.instanceId) {
          this.logWriterLeaseGapRecovered(reason, observedOwnership, recoveredOwnership);
          return recoveredOwnership;
        }
        return recoveredOwnership;
      }
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
    writerProfile?: WriterProfileDetection;
  } {
    const visibilityState = resolveDocumentVisibilityState();
    const documentHasFocus = resolveDocumentHasFocus();
    const locationHref = resolveWindowLocationHref();
    const writerProfile = this.buildCurrentWriterProfile() ?? undefined;
    return {
      ...(visibilityState ? { visibilityState } : {}),
      ...(typeof documentHasFocus === 'boolean' ? { documentHasFocus } : {}),
      ...(locationHref ? { locationHref } : {}),
      ...(writerProfile ? { writerProfile } : {}),
    };
  }

  private buildCurrentWriterProfile(): WriterProfileDetection | null {
    if (!this.shouldSendWriterProfile()) {
      return null;
    }
    return detectWriterProfile({
      backendContainer: this.backendContainer,
      frontendKind: this.frontendKind,
      isBrowser: this.isBrowser,
      isMobile: this.isMobile,
      userAgentFamily: resolveUserAgentFamily(),
      locationHref: resolveWindowLocationHref(),
      bodyClass: resolveDocumentBodyClass(),
    });
  }

  private safeBackendWorkerHealthSnapshot(): FrontendBackendWorkerHealthSnapshot | null {
    try {
      return this.backendWorkerHealth?.() ?? null;
    } catch (error) {
      return {
        healthy: false,
        reason: `backend-worker-health-threw: ${formatUnknownError(error)}`,
      };
    }
  }

  private shouldSendWriterProfile(): boolean {
    return this.backendContainer !== 'unknown'
      || this.frontendKind !== 'unknown'
      || this.isBrowser !== null
      || this.isMobile !== null;
  }

  private async observeCurrentLease(
    reason: string,
    options: ObserveCurrentLeaseOptions = {},
  ): Promise<FrontendOwnershipSnapshot> {
    let lease: FrontendObservedLeaseEnvelope | null;
    try {
      lease = await this.sidecarClient.writerGetLease();
    } catch (error) {
      this.logger.warn('[FrontendInstanceRuntime] writer lease observe failed', {
        instanceId: this.instanceId,
        runtimeScopeId: this.runtimeScopeId,
        reason,
        error,
      });
      throw new Error(`BACKEND_UNAVAILABLE: writer lease observation failed: ${formatUnknownError(error)}`);
    }
    const ownership = this.buildOwnershipSnapshot(lease);
    if (
      options.preserveWriterModeForEmptyPrimaryLeaseGap
      && this.shouldRecoverEmptyPrimaryWriterLeaseGap(ownership)
    ) {
      return ownership;
    }
    this.setMode(
      ownership.leaseHolder === this.instanceId ? 'writer' : 'follower',
      reason,
      ownership.leaseHolder,
      ownership.leaseSurfaceId,
    );
    return ownership;
  }

  private shouldRecoverEmptyPrimaryWriterLeaseGap(ownership: FrontendOwnershipSnapshot): boolean {
    if (this.mode !== 'writer' || ownership.leaseHolder || isDocumentHidden()) {
      return false;
    }
    const currentProfile = this.buildCurrentWriterProfile();
    return currentProfile?.surfaceRole === 'primary-app'
      && currentProfile.writerEligibility === 'canonical';
  }

  private logWriterLeaseGapRecovered(
    reason: string,
    observedOwnership: FrontendOwnershipSnapshot,
    recoveredOwnership: FrontendOwnershipSnapshot,
  ): void {
    this.logger.info('[FrontendInstanceRuntime] writer lease gap recovered', {
      instanceId: this.instanceId,
      runtimeScopeId: this.runtimeScopeId,
      reason,
      observedAt: observedOwnership.leaseObservedAt,
      recoveredLeaseHolder: recoveredOwnership.leaseHolder,
      recoveredLeaseSurfaceId: recoveredOwnership.leaseSurfaceId,
    });
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

  private async drainPendingWriterCommands(reason = 'watchdog', coalescedCommandId?: string): Promise<void> {
    if (!this.started || this.mode !== 'writer' || !this.writerCommandHandler) {
      return;
    }
    const backendUnavailableReason = this.getBackendWorkerUnavailableReason();
    if (backendUnavailableReason) {
      await this.releaseWriterLeaseForUnhealthyBackend(backendUnavailableReason, `relay:${reason}`);
      return;
    }
    if (this.shouldSkipRelayWatchdogForNoCommandBackoff(reason, coalescedCommandId)) {
      incrementRuntimePerformanceCounter('relay', 'writer-drain-watchdog-empty-backoff-skips');
      return;
    }
    if (!this.isWatchdogRelayWake(reason) || coalescedCommandId) {
      this.resetRelayNoCommandBackoff();
    }
    if (this.drainingRelay) {
      this.relayDrainRequestedWhileActive = true;
      if (coalescedCommandId) {
        this.relayDrainCoalescedCommandIds.add(coalescedCommandId);
      } else {
        this.relayDrainRequestedWithoutCommandId = true;
      }
      incrementRuntimePerformanceCounter('relay', 'writer-drain-coalesced-wakes');
      return;
    }
    const finishDrainSpan = startRuntimePerformanceSpan('relay', 'writer.drain-pending-commands', {
      mode: this.mode,
      wakeReason: reason,
      commandLimit: WRITER_RELAY_DRAIN_MAX_COMMANDS_PER_WAKE,
      budgetMs: this.relayDrainBudgetMs,
    });
    let commandCount = 0;
    let pendingCommandCount = 0;
    let status = 'started';
    let budgetExceeded = false;
    let yieldReason: string | null = null;
    let transactionCommandCount = 0;
    let freshTransactionCommandCount = 0;
    let staleTransactionCommandCount = 0;
    let maxCommandAgeMs = 0;
    let continuationDelayMs = 0;
    const commandTypes = new Set<string>();
    const drainStartedAt = nowMs();
    const handledCommandIds = new Set<string>();
    this.drainingRelay = true;
    try {
      for (let i = 0; i < WRITER_RELAY_DRAIN_MAX_COMMANDS_PER_WAKE; i += 1) {
        const pulled = await this.takeWriterRelayCommand(reason);
        pendingCommandCount = Math.max(0, Math.trunc(Number(pulled.pendingCommandCount) || 0));
        if (!pulled.command) {
          break;
        }
        commandCount++;
        const command = pulled.command;
        commandTypes.add(command.method);
        const commandDiagnostics = this.buildRelayCommandDiagnostics(command);
        if (this.isKernelTransactionRelayCommand(command.method)) {
          transactionCommandCount++;
          if (commandDiagnostics.maxDelayCapHit) {
            staleTransactionCommandCount++;
          } else {
            freshTransactionCommandCount++;
          }
        }
        maxCommandAgeMs = Math.max(maxCommandAgeMs, commandDiagnostics.commandAgeMs);
        this.relayDrainCoalescedCommandIds.delete(command.commandId);
        if (handledCommandIds.has(command.commandId)) {
          incrementRuntimePerformanceCounter('relay', 'writer-drain-duplicate-taken-commands');
          continue;
        }
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
          const result = await measureRuntimePerformance('relay', 'writer.command-handler', () => this.writerCommandHandler!(command), {
            method: command.method,
            wakeReason: reason,
          });
          await this.completeWriterRelayCommand(reason, command, result);
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
          status = 'command-failed';
          const message = error instanceof Error ? error.message : String(error);
          await measureRuntimePerformance('relay', 'writer.fail-command', () => this.sidecarClient.writerFailCommand({
            instanceId: this.instanceId,
            commandId: command.commandId,
            error: {
              code: 'INTERNAL_ERROR',
              message,
            },
          }), {
            method: command.method,
            wakeReason: reason,
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
          handledCommandIds.add(command.commandId);
          this.processingRelayCommandIds.delete(command.commandId);
        }
        const elapsedMs = Math.max(0, nowMs() - drainStartedAt);
        budgetExceeded = elapsedMs >= this.relayDrainBudgetMs;
        if (budgetExceeded && pendingCommandCount > 0) {
          yieldReason = 'budget';
          incrementRuntimePerformanceCounter('relay', 'writer-drain-budget-yields');
          break;
        }
        if (i + 1 >= WRITER_RELAY_DRAIN_MAX_COMMANDS_PER_WAKE && pendingCommandCount > 0) {
          yieldReason = 'command-limit';
          incrementRuntimePerformanceCounter('relay', 'writer-drain-command-limit-yields');
          break;
        }
      }
      if (status === 'started') {
        status = yieldReason ? 'yielded' : 'drained';
      }
    } catch (error) {
      status = 'error';
      if (this.isWriterLeaseUnavailableError(error)) {
        const ownership = await this.observeCurrentLease(`${reason}:lost-writer`, {
          preserveWriterModeForEmptyPrimaryLeaseGap: true,
        });
        if (this.shouldRecoverEmptyPrimaryWriterLeaseGap(ownership)) {
          const recoveredOwnership = await this.acquireWriterLease(`${reason}:recover-empty-lease`);
          if (recoveredOwnership.leaseHolder === this.instanceId) {
            this.logWriterLeaseGapRecovered(reason, ownership, recoveredOwnership);
            return;
          }
        }
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
      const requestedWhileActive = this.relayDrainRequestedWhileActive;
      const requestedWithoutCommandId = this.relayDrainRequestedWithoutCommandId;
      const coalescedCommandCount = this.relayDrainCoalescedCommandIds.size;
      this.relayDrainRequestedWhileActive = false;
      this.relayDrainRequestedWithoutCommandId = false;
      this.drainingRelay = false;
      if (commandCount > 0) {
        incrementRuntimePerformanceCounter('relay', 'writer-drain-commands', commandCount);
      }
      incrementRuntimePerformanceCounter('relay', 'writer-drain-wakes');
      if (
        (yieldReason || pendingCommandCount > 0 || requestedWithoutCommandId || coalescedCommandCount > 0)
        && this.started
        && this.mode === 'writer'
      ) {
        continuationDelayMs = this.resolveRelayDrainContinuationDelayMs({
          maxCommandAgeMs,
          pendingCommandCount,
          transactionCommandCount,
          yieldReason,
        });
        if (continuationDelayMs > 0) {
          incrementRuntimePerformanceCounter('relay', 'writer-drain-transaction-continuation-delays');
        }
        this.scheduleRelayDrainContinuation(
          yieldReason ? `${reason}:yield:${yieldReason}` : `${reason}:coalesced`,
          continuationDelayMs,
        );
      }
      this.updateRelayNoCommandBackoff(reason, commandCount, pendingCommandCount, status);
      finishDrainSpan({
        commandCount,
        pendingCommandCount,
        budgetExceeded,
        yieldReason,
        coalescedWake: requestedWhileActive,
        coalescedCommandCount,
        commandLimit: WRITER_RELAY_DRAIN_MAX_COMMANDS_PER_WAKE,
        budgetMs: this.relayDrainBudgetMs,
        commandTypes: Array.from(commandTypes),
        commandTypeSummary: Array.from(commandTypes).join(','),
        transactionCommandCount,
        freshTransactionCommandCount,
        staleTransactionCommandCount,
        maxCommandAgeMs,
        maxDelayCapHit: staleTransactionCommandCount > 0,
        transactionCommandAgeClass: this.resolveDrainTransactionCommandAgeClass({
          freshTransactionCommandCount,
          staleTransactionCommandCount,
          transactionCommandCount,
        }),
        transactionMaxDelayMs: this.relayTransactionMaxDelayMs,
        continuationDelayMs,
        status,
        wakeReason: reason,
        ...this.buildRelayWakeDiagnostics(reason),
      }, {
        ok: status === 'drained' || status === 'yielded',
        errorName: status === 'drained' || status === 'yielded' ? undefined : 'WriterRelayDrainError',
      });
    }
  }

  private getBackendWorkerUnavailableReason(): string | null {
    if (!this.backendWorkerHealth) {
      return null;
    }
    let snapshot: FrontendBackendWorkerHealthSnapshot;
    try {
      snapshot = this.backendWorkerHealth();
    } catch (error) {
      return `health-check-failed: ${formatUnknownError(error)}`;
    }
    if (snapshot?.healthy) {
      return null;
    }
    return String(snapshot?.reason || 'unhealthy').trim() || 'unhealthy';
  }

  private async handleBackendWorkerUnavailableForOwnership(
    reason: string,
    backendUnavailableReason: string,
  ): Promise<FrontendOwnershipSnapshot> {
    await this.releaseWriterLeaseForUnhealthyBackend(backendUnavailableReason, reason);
    const now = Date.now();
    return {
      leaseHolder: null,
      leaseSurfaceId: null,
      leaseVisibilityState: null,
      leaseDocumentHasFocus: null,
      leaseLocationHref: null,
      leaseOwnerChangedAt: null,
      leaseAcquiredAt: null,
      leaseLastHeartbeatAt: null,
      leaseObservedAt: now,
    };
  }

  private async releaseWriterLeaseForUnhealthyBackend(
    backendUnavailableReason: string,
    reason: string,
  ): Promise<void> {
    this.lastWriterUnavailableReason = `BACKEND_UNAVAILABLE: backend worker unhealthy: ${backendUnavailableReason}`;
    const wasWriter = this.mode === 'writer';
    this.setMode('follower', `backend-worker-unhealthy:${reason}`, null, null);
    if (!wasWriter) {
      return;
    }
    try {
      await this.sidecarClient.writerReleaseLease({ instanceId: this.instanceId });
    } catch (error) {
      this.logger.warn('[FrontendInstanceRuntime] writer lease release after backend worker unhealthy failed', {
        instanceId: this.instanceId,
        runtimeScopeId: this.runtimeScopeId,
        reason,
        backendUnavailableReason,
        error,
      });
    }
  }

  private async takeWriterRelayCommand(reason: string): Promise<FrontendWriterTakeCommandResult> {
    const finishTakeSpan = startRuntimePerformanceSpan('relay', 'writer.take-command', {
      wakeReason: reason,
      ...this.buildRelayWakeDiagnostics(reason),
    });
    try {
      const pulled = await this.sidecarClient.writerTakeCommand({
        instanceId: this.instanceId,
      }) as FrontendWriterTakeCommandResult;
      const pendingCommandCount = Math.max(0, Math.trunc(Number(pulled.pendingCommandCount) || 0));
      const command = pulled.command ?? null;
      const commandDiagnostics = command
        ? this.buildRelayCommandDiagnostics(command)
        : {
            commandAgeMs: 0,
            commandAgeClass: 'none' as const,
            maxDelayCapHit: false,
          };
      finishTakeSpan({
        queueStatus: command ? 'command' : 'empty',
        commandId: command?.commandId ?? null,
        method: command?.method ?? null,
        requesterInstanceId: command?.requesterInstanceId ?? null,
        pendingCommandCount,
        ...commandDiagnostics,
      });
      return pulled;
    } catch (error) {
      finishTakeSpan({
        queueStatus: 'error',
      }, {
        ok: false,
        errorName: error instanceof Error ? error.name : 'Error',
      });
      throw error;
    }
  }

  private async completeWriterRelayCommand(
    reason: string,
    command: FrontendRelayCommand,
    result: unknown,
  ): Promise<void> {
    const commandDiagnostics = this.buildRelayCommandDiagnostics(command);
    const finishCompleteSpan = startRuntimePerformanceSpan('relay', 'writer.complete-command', {
      wakeReason: reason,
      ...this.buildRelayWakeDiagnostics(reason),
      commandId: command.commandId,
      method: command.method,
      requesterInstanceId: command.requesterInstanceId,
      ...commandDiagnostics,
    });
    try {
      await this.sidecarClient.writerCompleteCommand({
        instanceId: this.instanceId,
        commandId: command.commandId,
        result,
      });
      finishCompleteSpan({
        completionStatus: 'completed',
      });
    } catch (error) {
      finishCompleteSpan({
        completionStatus: 'error',
      }, {
        ok: false,
        errorName: error instanceof Error ? error.name : 'Error',
      });
      throw error;
    }
  }

  private resolveRelayDrainContinuationDelayMs(params: {
    yieldReason: string | null;
    transactionCommandCount: number;
    pendingCommandCount: number;
    maxCommandAgeMs: number;
  }): number {
    if (
      params.yieldReason !== 'budget'
      || params.transactionCommandCount <= 0
      || params.pendingCommandCount <= 0
      || this.relayTransactionContinuationDelayMs <= 0
    ) {
      return 0;
    }
    if (params.maxCommandAgeMs >= this.relayTransactionMaxDelayMs) {
      incrementRuntimePerformanceCounter('relay', 'writer-drain-transaction-max-delay-continuations');
      return 0;
    }
    return this.relayTransactionContinuationDelayMs;
  }

  private resolveRelayCommandAgeMs(requestedAt: unknown): number {
    const requestedAtMs = Number(requestedAt);
    if (!Number.isFinite(requestedAtMs) || requestedAtMs <= 0) {
      return 0;
    }
    return Math.max(0, Date.now() - requestedAtMs);
  }

  private buildRelayCommandDiagnostics(command: Pick<FrontendRelayCommand, 'method' | 'requestedAt'>): RelayCommandDiagnosticsPayload {
    const commandAgeMs = this.resolveRelayCommandAgeMs(command.requestedAt);
    const maxDelayCapHit = this.isKernelTransactionRelayCommand(command.method)
      && commandAgeMs >= this.relayTransactionMaxDelayMs;
    return {
      commandAgeMs,
      commandAgeClass: this.resolveRelayCommandAgeClass(command.method, maxDelayCapHit),
      maxDelayCapHit,
    };
  }

  private resolveRelayCommandAgeClass(
    method: string,
    maxDelayCapHit: boolean,
  ): RelayTransactionCommandAgeClass {
    if (!this.isKernelTransactionRelayCommand(method)) {
      return 'non-transaction';
    }
    return maxDelayCapHit ? 'stale' : 'fresh';
  }

  private resolveDrainTransactionCommandAgeClass(params: {
    transactionCommandCount: number;
    freshTransactionCommandCount: number;
    staleTransactionCommandCount: number;
  }): RelayTransactionCommandAgeClass {
    if (params.transactionCommandCount <= 0) {
      return 'none';
    }
    if (params.freshTransactionCommandCount > 0 && params.staleTransactionCommandCount > 0) {
      return 'mixed';
    }
    if (params.staleTransactionCommandCount > 0) {
      return 'stale';
    }
    return 'fresh';
  }

  private buildRelayWakeDiagnostics(reason: string): {
    wakeSource: RelayWakeSource;
    pushRelayState: string | null;
    pushRelayReconnectAttempts: number | null;
    pushRelayUnavailableReason: string | null;
  } {
    return {
      wakeSource: this.resolveRelayWakeSource(reason),
      pushRelayState: this.pushRelayDiagnostics?.state ?? null,
      pushRelayReconnectAttempts: typeof this.pushRelayDiagnostics?.reconnectAttempts === 'number'
        ? this.pushRelayDiagnostics.reconnectAttempts
        : null,
      pushRelayUnavailableReason: this.pushRelayDiagnostics?.unavailableReason ?? null,
    };
  }

  private resolveRelayWakeSource(reason: string): RelayWakeSource {
    if (reason === 'push:command' || reason.startsWith('push:command')) {
      return 'push';
    }
    if (reason === 'push:reconnect-drain' || reason.startsWith('push:reconnect-drain')) {
      return 'reconnect';
    }
    if (this.isWatchdogRelayWake(reason)) {
      return 'watchdog';
    }
    if (reason.includes(':yield:') || reason.includes(':coalesced')) {
      return 'continuation';
    }
    return 'manual';
  }

  private isKernelTransactionRelayCommand(method: string): boolean {
    return method === 'kernel.transaction.ingest'
      || method === 'kernel.transaction.dequeue'
      || method === 'kernel.transaction.requeue';
  }

  private shouldSkipRelayWatchdogForNoCommandBackoff(reason: string, coalescedCommandId?: string): boolean {
    if (!this.isWatchdogRelayWake(reason) || coalescedCommandId || this.pushRelayDiagnostics?.state !== 'open') {
      return false;
    }
    return Date.now() < this.nextRelayWatchdogAllowedAt;
  }

  private updateRelayNoCommandBackoff(
    reason: string,
    commandCount: number,
    pendingCommandCount: number,
    status: string,
  ): void {
    if (
      !this.isWatchdogRelayWake(reason)
      || this.pushRelayDiagnostics?.state !== 'open'
      || status !== 'drained'
      || commandCount > 0
      || pendingCommandCount > 0
    ) {
      this.resetRelayNoCommandBackoff();
      return;
    }
    this.relayNoCommandStreak += 1;
    const delayMs = Math.min(
      this.relayNoCommandBackoffMaxMs,
      this.relayPollIntervalMs * (2 ** this.relayNoCommandStreak),
    );
    this.nextRelayWatchdogAllowedAt = Date.now() + delayMs;
  }

  private resetRelayNoCommandBackoff(): void {
    this.relayNoCommandStreak = 0;
    this.nextRelayWatchdogAllowedAt = 0;
  }

  private isWatchdogRelayWake(reason: string): boolean {
    return reason === 'watchdog' || reason.startsWith('watchdog:');
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
