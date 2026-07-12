import { withScopedCjsBrowserGlobals } from '@/utils/cjsBrowserGlobals';
import type { SrsBackendTransport } from '@/application/clients/SrsBackendClient';
import BackendWorker from '../../../worker/bootstrap/backend-worker.entry.ts?worker&inline';
import type {
  BackendAutoCardExecuteRequest,
  BackendAutoCardExecuteBatchRequest,
  BackendAutoCardExecuteBatchResult,
  BackendAutoCardExecuteResult,
  BackendProgressiveCommandExecuteRequest,
  BackendProgressiveCommandExecuteResult,
  BackendTopicDerivedCommandExecuteRequest,
  BackendTopicDerivedCommandExecuteResult,
  BackendNeuralGraphQueryRequest,
  BackendNeuralGraphQueryResult,
  BackendRpcRequest,
  BackendRpcResponse,
} from '../../../packages/contracts/src/backend-rpc';
import type {
  BackendWorkerHostEffect,
  BackendWorkerHostEffectBreakdownEntry,
  BackendWorkerInnerStepTiming,
  BackendWorkerMainToWorkerMessage,
  BackendWorkerResponseTiming,
  BackendWorkerToMainMessage,
} from '../../../worker/bootstrap/BackendWorkerProtocol';
import { createLogger } from '@/utils/logger';
import { recordRuntimePerformanceSpan } from '@/utils/runtimePerformanceDiagnostics';

const logger = createLogger('BrowserSrsBackendWorkerTransport');
const REVIEW_FEEDBACK_TRANSPORT_STEP_SLOW_MS = 120;
const DEFAULT_HOST_EFFECT_TIMEOUT_MS = 5_000;
type BackendOperationTimeoutClassification =
  | 'status-read'
  | 'startup-readiness'
  | 'maintenance-mutation'
  | 'projection-rebuild'
  | 'generic-request'
  | 'generic-host-effect';

interface BackendOperationTimeoutPolicy {
  readonly timeoutMs: number;
  readonly classification: BackendOperationTimeoutClassification;
}

const BACKEND_OPERATION_TIMEOUT_POLICY_BY_METHOD = new Map<string, BackendOperationTimeoutPolicy>([
  ['storage.maintenance.status', { timeoutMs: 5_000, classification: 'status-read' }],
  ['db.load', { timeoutMs: 60_000, classification: 'startup-readiness' }],
  ['db.reload', { timeoutMs: 60_000, classification: 'startup-readiness' }],
  ['storage.maintenance.applyBatch', { timeoutMs: 45_000, classification: 'maintenance-mutation' }],
  ['storage.projection.rebuild', { timeoutMs: 120_000, classification: 'projection-rebuild' }],
]);
const REVIEW_FEEDBACK_WORKER_HANDLE_TOP_INNER_STEP_COUNT = 5;
const PENDING_WORK_DIAGNOSTIC_LIMIT = 10;
const DIAGNOSTIC_TIMING_METHODS = new Set<string>([
  'db.load',
  'db.reload',
  'browser.deck.page',
  'browser.stats',
  'browser.deck.documentCounts',
  'review.session.feedback',
  'storage.maintenance.applyBatch',
  'storage.maintenance.status',
  'storage.projection.rebuild',
  'queue.projection.snapshot',
  'queue.projection.rowsByIds',
  'queue.projection.replace',
]);

export interface BrowserSrsBackendWorkerHostEffects {
  readBinary?: (path: string) => Promise<Uint8Array | null>;
  writeBinary?: (path: string, bytes: Uint8Array) => Promise<void>;
  readJSON?: <T>(path: string) => Promise<T | null>;
  writeJSON?: (path: string, value: unknown) => Promise<void>;
  hasLegacyPetalSqliteDb?: () => Promise<boolean>;
  readTruthBinary?: (path: string) => Promise<Uint8Array | null>;
  writeTruthBinary?: (path: string, bytes: Uint8Array) => Promise<void>;
  readTruthJSON?: <T>(path: string) => Promise<T | null>;
  writeTruthJSON?: (path: string, value: unknown) => Promise<void>;
  listTruthFiles?: (prefix: string) => Promise<string[]>;
  deleteTruthFile?: (path: string) => Promise<void>;
  readSyncConflictDatabaseSources?: () => Promise<Array<{
    sourceId: string;
    bytes: Uint8Array;
    path?: string | null;
    modifiedAt?: number | null;
    size?: number | null;
  }>>;
  cleanupSyncConflictDatabaseSources?: (sourceIds: string[]) => Promise<{
    cleaned: Array<{ sourceId: string; path: string | null }>;
    skipped: Array<{ sourceId: string; reason: string }>;
    failed: Array<{ sourceId: string; path: string | null; reason: string }>;
  }>;
  resolveExistingBlockIds?: (blockIds: string[]) => Promise<string[]>;
  resolveNeuralGraphQuery?: (
    request: BackendNeuralGraphQueryRequest,
  ) => Promise<BackendNeuralGraphQueryResult>;
  executeAutoCard?: (request: BackendAutoCardExecuteRequest) => Promise<BackendAutoCardExecuteResult>;
  executeAutoCardBatch?: (request: BackendAutoCardExecuteBatchRequest) => Promise<BackendAutoCardExecuteBatchResult>;
  executeProgressiveCommand?: (
    request: BackendProgressiveCommandExecuteRequest,
  ) => Promise<BackendProgressiveCommandExecuteResult>;
  executeTopicDerivedCommand?: (
    request: BackendTopicDerivedCommandExecuteRequest,
  ) => Promise<BackendTopicDerivedCommandExecuteResult>;
}

export interface BrowserSrsBackendWorkerTransportOptions {
  workerFactory?: () => Worker;
  hostEffects: BrowserSrsBackendWorkerHostEffects;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  hostEffectTimeoutMs?: number;
  probeTimeoutMs?: number;
  maxRestartAttempts?: number;
  restartBackoffMs?: number;
}

interface PendingBackendRequest {
  resolve: (response: BackendRpcResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  generation: number;
  method: BackendRpcRequest['method'];
  cardId: string | null;
  queuedAt: number;
  postedAt: number | null;
}

interface PendingProbe {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  generation: number;
  queuedAt: number;
}

export type BrowserSrsBackendWorkerHealth =
  | 'starting'
  | 'healthy'
  | 'unhealthy'
  | 'restarting'
  | 'unavailable'
  | 'closed';

export interface BrowserSrsBackendWorkerDiagnostics {
  health: BrowserSrsBackendWorkerHealth;
  generation: number;
  restartCount: number;
  pendingRequests: number;
  pendingProbes: number;
  pendingRequestSummaries: BrowserSrsBackendWorkerPendingRequestDiagnostic[];
  pendingProbeSummaries: BrowserSrsBackendWorkerPendingProbeDiagnostic[];
  startupTimeouts: number;
  requestTimeouts: number;
  probeTimeouts: number;
  lastSuccessfulProbeAt: number | null;
  lastStartedAt: number | null;
  lastReadyAt: number | null;
  lastTerminalError: string | null;
}

export interface BrowserSrsBackendWorkerPendingRequestDiagnostic {
  requestId: string;
  method: BackendRpcRequest['method'];
  cardId: string | null;
  generation: number;
  queuedForMs: number;
  postedForMs: number | null;
  posted: boolean;
}

export interface BrowserSrsBackendWorkerPendingProbeDiagnostic {
  probeId: string;
  generation: number;
  queuedForMs: number;
}

function createDefaultBackendWorker(): Worker {
  return withScopedCjsBrowserGlobals(() => (
    new BackendWorker({
      name: 'SiYuanMemoBackendWorker',
    })
  ));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unavailable(message: string): Error {
  return new Error(`BACKEND_UNAVAILABLE: ${message}`);
}

function backendWorkerCompatibilityError(error: unknown): Error {
  const message = toErrorMessage(error);
  if (message.startsWith('BACKEND_UNAVAILABLE: backend Worker CJS bootstrap')) {
    return new Error(message);
  }
  return unavailable(`backend Worker compatibility error: ${message}`);
}

function toStructuredCloneSafe<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }
  if (value instanceof ArrayBuffer) {
    return value.slice(0) as T;
  }
  if (ArrayBuffer.isView(value)) {
    return value as T;
  }
  if (seen.has(value)) {
    return seen.get(value) as T;
  }
  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const item of value) {
      clone.push(toStructuredCloneSafe(item, seen));
    }
    return clone as T;
  }
  const clone: Record<string, unknown> = {};
  seen.set(value, clone);
  for (const key of Object.keys(value)) {
    clone[key] = toStructuredCloneSafe((value as Record<string, unknown>)[key], seen);
  }
  return clone as T;
}

export class BrowserSrsBackendWorkerTransport implements SrsBackendTransport {
  private worker: Worker | null = null;
  private readonly pendingRequests = new Map<string, PendingBackendRequest>();
  private readonly pendingProbes = new Map<string, PendingProbe>();
  private ready: Promise<void> = Promise.resolve();
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((error: Error) => void) | null = null;
  private requestSeq = 0;
  private probeSeq = 0;
  private generation = 0;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private health: BrowserSrsBackendWorkerHealth = 'starting';
  private restartCount = 0;
  private startupTimeouts = 0;
  private requestTimeouts = 0;
  private probeTimeouts = 0;
  private lastSuccessfulProbeAt: number | null = null;
  private lastStartedAt: number | null = null;
  private lastReadyAt: number | null = null;
  private lastTerminalError: string | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: BrowserSrsBackendWorkerTransportOptions) {
    this.startWorkerGeneration();
  }

  async request(request: BackendRpcRequest): Promise<BackendRpcResponse> {
    if (this.closed) {
      throw unavailable('backend worker transport closed');
    }
    await this.ready;
    if (this.closed) {
      throw unavailable('backend worker transport closed');
    }
    if (this.health === 'unavailable') {
      throw unavailable(this.lastTerminalError || 'backend worker unavailable');
    }
    const requestId = `req-${++this.requestSeq}`;
    const queuedAt = Date.now();
    const cardId = this.extractReviewFeedbackCardId(request);
    const timeoutPolicy = this.resolveRequestTimeoutPolicy(request);
    const requestTimeoutMs = timeoutPolicy.timeoutMs;
    const pending = new Promise<BackendRpcResponse>((resolve, reject) => {
      const generation = this.generation;
      const timer = setTimeout(() => {
        const current = this.pendingRequests.get(requestId);
        if (!current) {
          return;
        }
        this.pendingRequests.delete(requestId);
        this.requestTimeouts += 1;
        const elapsedMs = Math.max(0, Date.now() - queuedAt);
        const error = unavailable(
          `backend worker request timed out after ${requestTimeoutMs}ms`
          + ` operation=${request.method}`
          + ' phase=worker-response'
          + ` elapsedMs=${elapsedMs}`
          + ` timeoutMs=${requestTimeoutMs}`
          + ` classification=${timeoutPolicy.classification}`,
        );
        current.reject(error);
        this.markWorkerUnhealthy(error, generation, { terminate: true });
      }, requestTimeoutMs);
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timer,
        generation,
        method: request.method,
        cardId,
        queuedAt,
        postedAt: null,
      });
    });
    const postStartedAt = Date.now();
    this.postToWorker({
      kind: 'request',
      requestId,
      request,
      sentAt: postStartedAt,
    });
    const current = this.pendingRequests.get(requestId);
    if (current) {
      current.postedAt = Date.now();
    }
    this.logReviewFeedbackTransportStepIfSlow('postMessage', request.method, cardId, Date.now() - postStartedAt, {
      pendingRequests: this.pendingRequests.size,
    });
    return pending;
  }

  async probe(): Promise<void> {
    if (this.closed) {
      throw unavailable('backend worker transport closed');
    }
    await this.ready;
    if (this.closed) {
      throw unavailable('backend worker transport closed');
    }
    if (this.health === 'unavailable') {
      throw unavailable(this.lastTerminalError || 'backend worker unavailable');
    }
    const probeId = `probe-${++this.probeSeq}`;
    const pending = new Promise<void>((resolve, reject) => {
      const generation = this.generation;
      const timer = setTimeout(() => {
        const current = this.pendingProbes.get(probeId);
        if (!current) {
          return;
        }
        this.pendingProbes.delete(probeId);
        this.probeTimeouts += 1;
        const error = unavailable(`backend worker probe timed out after ${this.probeTimeoutMs}ms`);
        current.reject(error);
        this.markWorkerUnhealthy(error, generation, { terminate: true });
      }, this.probeTimeoutMs);
      this.pendingProbes.set(probeId, { resolve, reject, timer, generation, queuedAt: Date.now() });
    });
    this.postToWorker({
      kind: 'probe',
      probeId,
    });
    return pending;
  }

  dispose(): void {
    if (this.closed) {
      return;
    }
    if (this.pendingRequests.size > 0 || this.pendingProbes.size > 0) {
      logger.warn('[SiYuanMemo][BrowserSrsBackendWorkerTransport] disposing with pending backend work', this.getDiagnostics());
    }
    this.closed = true;
    this.health = 'closed';
    this.clearStartupTimer();
    this.clearRestartTimer();
    this.rejectReady?.(unavailable('backend worker transport closed'));
    this.rejectPendingForGeneration(null, unavailable('backend worker transport closed'));
    this.rejectProbesForGeneration(null, unavailable('backend worker transport closed'));
    try {
      this.postToWorker({ kind: 'shutdown' });
    } catch {
      // worker may already be gone
    }
    this.worker?.terminate();
    this.worker = null;
  }

  getDiagnostics(): BrowserSrsBackendWorkerDiagnostics {
    return {
      health: this.health,
      generation: this.generation,
      restartCount: this.restartCount,
      pendingRequests: this.pendingRequests.size,
      pendingProbes: this.pendingProbes.size,
      pendingRequestSummaries: this.getPendingRequestSummaries(),
      pendingProbeSummaries: this.getPendingProbeSummaries(),
      startupTimeouts: this.startupTimeouts,
      requestTimeouts: this.requestTimeouts,
      probeTimeouts: this.probeTimeouts,
      lastSuccessfulProbeAt: this.lastSuccessfulProbeAt,
      lastStartedAt: this.lastStartedAt,
      lastReadyAt: this.lastReadyAt,
      lastTerminalError: this.lastTerminalError,
    };
  }

  private handleWorkerMessage(message: BackendWorkerToMainMessage): void {
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.kind === 'ready') {
      this.clearStartupTimer();
      this.health = 'healthy';
      this.lastReadyAt = Date.now();
      this.resolveReady?.();
      return;
    }
    if (message.kind === 'response') {
      const pending = this.pendingRequests.get(message.requestId);
      if (!pending) {
        return;
      }
      this.pendingRequests.delete(message.requestId);
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      if (this.isReviewFeedbackTimingMethod(pending.method)) {
        const now = Date.now();
        this.logReviewFeedbackWorkerTiming(pending, message.timing, now);
        const roundtripMs = now - (pending.postedAt ?? pending.queuedAt);
        if (this.shouldLogReviewFeedbackOuterTransportStep(roundtripMs, message.timing)) {
          this.logReviewFeedbackTransportStepIfSlow(
            'worker-roundtrip',
            pending.method,
            pending.cardId,
            roundtripMs,
            { pendingRequests: this.pendingRequests.size },
          );
        }
        const requestTotalMs = now - pending.queuedAt;
        if (this.shouldLogReviewFeedbackOuterTransportStep(requestTotalMs, message.timing)) {
          this.logReviewFeedbackTransportStepIfSlow(
            'request-total',
            pending.method,
            pending.cardId,
            requestTotalMs,
            { pendingRequests: this.pendingRequests.size },
          );
        }
      } else {
        this.recordDiagnosticWorkerTiming(pending, message.timing);
      }
      pending.resolve(message.response);
      return;
    }
    if (message.kind === 'probe-result') {
      const pending = this.pendingProbes.get(message.probeId);
      if (!pending) {
        return;
      }
      this.pendingProbes.delete(message.probeId);
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      this.lastSuccessfulProbeAt = Date.now();
      this.health = 'healthy';
      pending.resolve();
      return;
    }
    if (message.kind === 'host-effect') {
      this.handleHostEffect(message.effectId, message.effect).catch(() => {
        // handleHostEffect posts its own terminal result
      });
    }
  }

  private async handleHostEffect(effectId: string, effect: BackendWorkerHostEffect): Promise<void> {
    try {
      const result = await this.executeHostEffectWithDeadline(effect);
      this.postToWorker({
        kind: 'host-effect-result',
        effectId,
        ok: true,
        result,
      });
    } catch (error) {
      this.postToWorker({
        kind: 'host-effect-result',
        effectId,
        ok: false,
        error: {
          code: error instanceof Error && error.message.startsWith('BACKEND_UNAVAILABLE:')
            ? 'BACKEND_UNAVAILABLE'
            : 'INTERNAL_ERROR',
          message: toErrorMessage(error),
        },
      });
    }
  }

  private executeHostEffectWithDeadline(effect: BackendWorkerHostEffect): Promise<unknown> {
    const timeoutPolicy = this.resolveHostEffectTimeoutPolicy(effect);
    const timeoutMs = timeoutPolicy.timeoutMs;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const elapsedMs = Math.max(0, Date.now() - startedAt);
        reject(unavailable(
          `backend worker host effect ${effect.kind} timed out after ${timeoutMs}ms`
          + ` operation=${this.getHostEffectOperationName(effect)}`
          + ` phase=${this.getHostEffectTimeoutPhase(effect)}`
          + ` elapsedMs=${elapsedMs}`
          + ` timeoutMs=${timeoutMs}`
          + ` classification=${timeoutPolicy.classification}`,
        ));
      }, timeoutMs);
    });
    return Promise.race([
      this.executeHostEffect(effect),
      deadline,
    ]).finally(() => {
      if (timer) {
        clearTimeout(timer);
      }
    });
  }

  private async executeHostEffect(effect: BackendWorkerHostEffect): Promise<unknown> {
    if (this.shouldSuppressReviewFeedbackPersistenceHostEffect(effect)) {
      logger.info('[SiYuanMemo][BrowserSrsBackendWorkerTransport] review.feedback suppressed SiYuan persistence host effect', {
        kind: effect.kind,
        path: 'path' in effect ? effect.path : null,
        pendingReviewFeedbackRequests: this.countPendingReviewFeedbackRequests(),
      });
      throw unavailable(`review.feedback suppressed SiYuan persistence host effect ${effect.kind}`);
    }
    switch (effect.kind) {
      case 'sqlite.readBinary':
        if (!this.options.hostEffects.readBinary) {
          throw unavailable('sqlite.readBinary host effect unavailable');
        }
        return this.options.hostEffects.readBinary(effect.path);
      case 'sqlite.writeBinary':
        if (!this.options.hostEffects.writeBinary) {
          throw unavailable('sqlite.writeBinary host effect unavailable');
        }
        await this.options.hostEffects.writeBinary(effect.path, effect.bytes);
        return null;
      case 'sqlite.readJSON':
        if (!this.options.hostEffects.readJSON) {
          return null;
        }
        return this.options.hostEffects.readJSON(effect.path);
      case 'sqlite.writeJSON':
        if (!this.options.hostEffects.writeJSON) {
          throw unavailable('sqlite.writeJSON host effect unavailable');
        }
        await this.options.hostEffects.writeJSON(effect.path, effect.value);
        return null;
      case 'sqlite.hasLegacyPetalSqliteDb':
        if (!this.options.hostEffects.hasLegacyPetalSqliteDb) {
          return false;
        }
        return this.options.hostEffects.hasLegacyPetalSqliteDb();
      case 'truth.readBinary':
        if (!this.options.hostEffects.readTruthBinary) {
          throw unavailable('truth.readBinary host effect unavailable');
        }
        return this.options.hostEffects.readTruthBinary(effect.path);
      case 'truth.writeBinary':
        if (!this.options.hostEffects.writeTruthBinary) {
          throw unavailable('truth.writeBinary host effect unavailable');
        }
        await this.options.hostEffects.writeTruthBinary(effect.path, effect.bytes);
        return null;
      case 'truth.readJSON':
        if (!this.options.hostEffects.readTruthJSON) {
          return null;
        }
        return this.options.hostEffects.readTruthJSON(effect.path);
      case 'truth.writeJSON':
        if (!this.options.hostEffects.writeTruthJSON) {
          throw unavailable('truth.writeJSON host effect unavailable');
        }
        await this.options.hostEffects.writeTruthJSON(effect.path, effect.value);
        return null;
      case 'truth.listFiles':
        if (!this.options.hostEffects.listTruthFiles) {
          throw unavailable('truth.listFiles host effect unavailable');
        }
        return this.options.hostEffects.listTruthFiles(effect.prefix);
      case 'truth.deleteFile':
        if (!this.options.hostEffects.deleteTruthFile) {
          throw unavailable('truth.deleteFile host effect unavailable');
        }
        await this.options.hostEffects.deleteTruthFile(effect.path);
        return null;
      case 'sqlite.readSyncConflictDatabaseSources':
        if (!this.options.hostEffects.readSyncConflictDatabaseSources) {
          return [];
        }
        return this.options.hostEffects.readSyncConflictDatabaseSources();
      case 'sqlite.cleanupSyncConflictDatabaseSources':
        if (!this.options.hostEffects.cleanupSyncConflictDatabaseSources) {
          return {
            cleaned: [],
            skipped: effect.sourceIds.map((sourceId) => ({ sourceId, reason: 'cleanup host effect unavailable' })),
            failed: [],
          };
        }
        return this.options.hostEffects.cleanupSyncConflictDatabaseSources(effect.sourceIds);
      case 'siyuan.resolveExistingBlockIds':
        if (!this.options.hostEffects.resolveExistingBlockIds) {
          throw unavailable('resolveExistingBlockIds host effect unavailable');
        }
        return this.options.hostEffects.resolveExistingBlockIds(effect.blockIds);
      case 'siyuan.neuralGraph.query':
        if (!this.options.hostEffects.resolveNeuralGraphQuery) {
          throw unavailable('neural graph query host effect unavailable');
        }
        return this.options.hostEffects.resolveNeuralGraphQuery(effect.request);
      case 'autocard.execute':
        if (!this.options.hostEffects.executeAutoCard) {
          throw unavailable('autocard.execute host effect unavailable');
        }
        return this.options.hostEffects.executeAutoCard(effect.request);
      case 'autocard.executeBatch':
        if (!this.options.hostEffects.executeAutoCardBatch) {
          throw unavailable('autocard.executeBatch host effect unavailable');
        }
        return this.options.hostEffects.executeAutoCardBatch(effect.request);
      case 'progressive.command.execute':
        if (!this.options.hostEffects.executeProgressiveCommand) {
          throw unavailable('progressive.command.execute host effect unavailable');
        }
        return this.options.hostEffects.executeProgressiveCommand(effect.request);
      case 'topic-derived.command.execute':
        if (!this.options.hostEffects.executeTopicDerivedCommand) {
          throw unavailable('topic-derived.command.execute host effect unavailable');
        }
        return this.options.hostEffects.executeTopicDerivedCommand(effect.request);
      default:
        throw unavailable(`unknown host effect ${(effect as { kind?: unknown }).kind}`);
    }
  }

  private postToWorker(message: BackendWorkerMainToWorkerMessage): void {
    if (!this.worker) {
      throw unavailable('backend worker transport closed');
    }
    this.worker.postMessage(toStructuredCloneSafe(message));
  }

  private getPendingRequestSummaries(now = Date.now()): BrowserSrsBackendWorkerPendingRequestDiagnostic[] {
    return Array.from(this.pendingRequests.entries())
      .sort((left, right) => left[1].queuedAt - right[1].queuedAt)
      .slice(0, PENDING_WORK_DIAGNOSTIC_LIMIT)
      .map(([requestId, pending]) => ({
        requestId,
        method: pending.method,
        cardId: pending.cardId,
        generation: pending.generation,
        queuedForMs: Math.max(0, now - pending.queuedAt),
        postedForMs: pending.postedAt === null ? null : Math.max(0, now - pending.postedAt),
        posted: pending.postedAt !== null,
      }));
  }

  private getPendingProbeSummaries(now = Date.now()): BrowserSrsBackendWorkerPendingProbeDiagnostic[] {
    return Array.from(this.pendingProbes.entries())
      .sort((left, right) => left[1].queuedAt - right[1].queuedAt)
      .slice(0, PENDING_WORK_DIAGNOSTIC_LIMIT)
      .map(([probeId, pending]) => ({
        probeId,
        generation: pending.generation,
        queuedForMs: Math.max(0, now - pending.queuedAt),
      }));
  }

  private extractReviewFeedbackCardId(request: BackendRpcRequest): string | null {
    if (!this.isReviewFeedbackTimingMethod(request.method)) {
      return null;
    }
    const params = Array.isArray(request.params) ? request.params[0] : null;
    if (!params || typeof params !== 'object') {
      return null;
    }
    const cardId = String((params as { cardId?: unknown }).cardId || '').trim();
    return cardId || null;
  }

  private shouldSuppressReviewFeedbackPersistenceHostEffect(effect: BackendWorkerHostEffect): boolean {
    if (
      effect.kind !== 'truth.writeJSON'
      && effect.kind !== 'truth.writeBinary'
    ) {
      return false;
    }
    return this.countPendingReviewFeedbackRequests() > 0;
  }

  private countPendingReviewFeedbackRequests(): number {
    let count = 0;
    for (const pending of this.pendingRequests.values()) {
      if (pending.method === 'review.feedback') {
        count += 1;
      }
    }
    return count;
  }

  private logReviewFeedbackTransportStepIfSlow(
    step: string,
    method: BackendRpcRequest['method'],
    cardId: string | null,
    durationMs: number,
    extra?: Record<string, unknown>,
  ): void {
    if (
      !this.isReviewFeedbackTimingMethod(method)
      || durationMs < REVIEW_FEEDBACK_TRANSPORT_STEP_SLOW_MS
    ) {
      return;
    }
    logger.trace?.(`[SiYuanMemo][BrowserSrsBackendWorkerTransport] slow ${method} transport step`, {
      step,
      cardId,
      durationMs,
      generation: this.generation,
      health: this.health,
      ...(extra ?? {}),
    });
  }

  private summarizeReviewFeedbackInnerSteps(
    timing: BackendWorkerResponseTiming,
  ): {
    innerStepCount: number;
    innerStepTotalMs: number;
    slowestInnerStep: Record<string, unknown> | null;
    topInnerSteps: Array<Record<string, unknown>>;
    topInnerStepSummary: string[];
    sessionStepSummary: string[];
    transactionStepSummary: string[];
    sqliteStepSummary: string[];
    dominantInnerStepSummary: string | null;
    preRequestMergeSummary: string | null;
    mainDbReadSummary: string | null;
    unattributedMs: number;
  } {
    const innerSteps = Array.isArray(timing.innerSteps) ? timing.innerSteps : [];
    const topInnerSteps = innerSteps
      .map((innerStep, index) => ({ innerStep, index }))
      .sort((left, right) => right.innerStep.durationMs - left.innerStep.durationMs)
      .slice(0, REVIEW_FEEDBACK_WORKER_HANDLE_TOP_INNER_STEP_COUNT)
      .map(({ innerStep }) => ({
        layer: innerStep.layer,
        step: innerStep.step,
        durationMs: innerStep.durationMs,
        cardId: innerStep.cardId ?? null,
        queueType: innerStep.queueType ?? null,
        ...(innerStep.extra ?? {}),
      }));
    const preRequestMerge = innerSteps.find((innerStep) => (
      innerStep.layer === 'kernel' && innerStep.step === 'pre-request-merge'
    )) ?? null;
    const preRequestMergeSkip = innerSteps.find((innerStep) => (
      innerStep.layer === 'kernel'
      && innerStep.step === 'sync-divergent-diagnostic'
      && Boolean((innerStep.extra as { fullMergeSkipped?: unknown } | undefined)?.fullMergeSkipped)
    )) ?? null;
    const mainDbRead = innerSteps.find((innerStep) => (
      innerStep.layer === 'database' && innerStep.step === 'merge.read-main-db'
    )) ?? null;
    const innerStepTotalMs = innerSteps.reduce((total, innerStep) => total + innerStep.durationMs, 0);
    const topInnerStepSummary = topInnerSteps.map((innerStep) => (
      this.formatReviewFeedbackInnerStepSummary(innerStep)
    ));
    const sessionStepSummary = innerSteps
      .filter((innerStep) => innerStep.layer === 'session' && innerStep.step.startsWith('session-feedback-'))
      .map((innerStep) => this.formatReviewFeedbackInnerStepSummary(innerStep));
    const transactionStepSummary = innerSteps
      .filter((innerStep) => (
        innerStep.layer === 'transaction'
        && !innerStep.step.startsWith('sqlite.')
      ))
      .map((innerStep) => this.formatReviewFeedbackInnerStepSummary(innerStep));
    const sqliteStepSummary = innerSteps
      .filter((innerStep) => innerStep.step.startsWith('sqlite.'))
      .map((innerStep) => this.formatReviewFeedbackInnerStepSummary(innerStep));
    return {
      innerStepCount: innerSteps.length,
      innerStepTotalMs,
      slowestInnerStep: topInnerSteps[0] ?? null,
      topInnerSteps,
      topInnerStepSummary,
      sessionStepSummary,
      transactionStepSummary,
      sqliteStepSummary,
      dominantInnerStepSummary: topInnerStepSummary[0] ?? null,
      preRequestMergeSummary: (preRequestMerge ?? preRequestMergeSkip)
        ? this.formatReviewFeedbackInnerStepSummary({
          ...(preRequestMerge ?? preRequestMergeSkip),
          ...((preRequestMerge ?? preRequestMergeSkip)?.extra ?? {}),
        })
        : null,
      mainDbReadSummary: mainDbRead
        ? this.formatReviewFeedbackInnerStepSummary({
          ...mainDbRead,
          ...(mainDbRead.extra ?? {}),
        })
        : null,
      unattributedMs: Math.max(0, timing.handleDurationMs - innerStepTotalMs - timing.hostEffectTotalMs),
    };
  }

  private formatReviewFeedbackInnerStepSummary(
    innerStep: BackendWorkerInnerStepTiming | Record<string, unknown>,
  ): string {
    const layer = String((innerStep as { layer?: unknown }).layer || 'unknown');
    const step = String((innerStep as { step?: unknown }).step || 'unknown');
    const durationMs = Math.max(0, Math.round(Number((innerStep as { durationMs?: unknown }).durationMs) || 0));
    let summary = `${layer}:${step} ${durationMs}ms`;
    if (layer === 'kernel' && step === 'pre-request-merge') {
      const mainDbReadSkipped = String((innerStep as { mainDbReadSkipped?: unknown }).mainDbReadSkipped);
      const mainDbReadSkipReason = String((innerStep as { mainDbReadSkipReason?: unknown }).mainDbReadSkipReason ?? 'none');
      const changed = String((innerStep as { changed?: unknown }).changed);
      const sourceCount = String((innerStep as { sourceCount?: unknown }).sourceCount ?? 'unknown');
      const conflictSourceCount = String((innerStep as { conflictSourceCount?: unknown }).conflictSourceCount ?? 'unknown');
      const nonEmptyConflictSourceCount = String(
        (innerStep as { nonEmptyConflictSourceCount?: unknown }).nonEmptyConflictSourceCount ?? 'unknown',
      );
      const sanityStatus = String((innerStep as { sanityStatus?: unknown }).sanityStatus ?? 'unknown');
      summary += ` skipped=${mainDbReadSkipped}`
        + ` reason=${mainDbReadSkipReason}`
        + ` changed=${changed}`
        + ` sources=${sourceCount}`
        + ` conflicts=${nonEmptyConflictSourceCount}/${conflictSourceCount}`
        + ` sanity=${sanityStatus}`;
    }
    if (layer === 'kernel' && step === 'sync-divergent-diagnostic') {
      const fullMergeSkipped = String((innerStep as { fullMergeSkipped?: unknown }).fullMergeSkipped);
      const repairOwner = String((innerStep as { repairOwner?: unknown }).repairOwner ?? 'unknown');
      const backendMethod = String((innerStep as { backendMethod?: unknown }).backendMethod ?? 'unknown');
      const context = String((innerStep as { context?: unknown }).context ?? 'unknown');
      summary += ` skipped=${fullMergeSkipped}`
        + ' reason=review-rating-repair-gate'
        + ` repairOwner=${repairOwner}`
        + ` method=${backendMethod}`
        + ` context=${context}`;
    }
    return summary;
  }

  private buildReviewFeedbackWorkerHandleCopySummary(input: {
    pending: PendingBackendRequest;
    timing: BackendWorkerResponseTiming;
    innerStepSummary: ReturnType<BrowserSrsBackendWorkerTransport['summarizeReviewFeedbackInnerSteps']>;
  }): string {
    const host = input.timing.slowestHostEffect
      ? [
        `${input.timing.slowestHostEffect.kind} ${Math.round(input.timing.slowestHostEffect.durationMs)}ms`,
        `path=${input.timing.slowestHostEffect.path || 'unknown'}`,
        `storage=${input.timing.slowestHostEffect.storageClass || 'unknown'}`,
        `purpose=${input.timing.slowestHostEffect.purpose || 'unknown'}`,
        `substep=${input.timing.slowestHostEffect.substep || 'unknown'}`,
      ].join(' ')
      : 'none';
    const top = input.innerStepSummary.topInnerStepSummary.slice(0, 3).join(' | ') || 'none';
    const sessionBreakdown = input.innerStepSummary.sessionStepSummary.join(' | ') || 'none';
    const transactionBreakdown = input.innerStepSummary.transactionStepSummary.slice(0, 12).join(' | ') || 'none';
    const sqliteBreakdown = input.innerStepSummary.sqliteStepSummary.slice(0, 12).join(' | ') || 'none';
    const hostBreakdown = this.formatHostEffectBreakdownSummary(input.timing.hostEffectBreakdown);
    return [
      `card=${input.pending.cardId ?? 'unknown'}`,
      `duration=${Math.round(input.timing.handleDurationMs)}ms`,
      `dominant=${input.innerStepSummary.dominantInnerStepSummary ?? 'none'}`,
      `sessionBreakdown=${sessionBreakdown}`,
      `transactionBreakdown=${transactionBreakdown}`,
      `sqliteBreakdown=${sqliteBreakdown}`,
      `preMerge=${input.innerStepSummary.preRequestMergeSummary ?? 'none'}`,
      `mainDb=${input.innerStepSummary.mainDbReadSummary ?? 'none'}`,
      `host=${host}`,
      `hostTotal=${Math.round(input.timing.hostEffectTotalMs)}ms`,
      `hostBreakdown=${hostBreakdown}`,
      `innerAttribution=${input.timing.innerStepAttribution}`,
      `innerTruncated=${input.timing.innerStepsTruncated}`,
      `top=${top}`,
    ].join(' ');
  }

  private formatHostEffectBreakdownSummary(
    breakdown: BackendWorkerHostEffectBreakdownEntry[] | null | undefined,
  ): string {
    if (!Array.isArray(breakdown) || breakdown.length === 0) {
      return 'none';
    }
    return [...breakdown]
      .sort((left, right) => right.totalMs - left.totalMs)
      .slice(0, 5)
      .map((entry) => [
        `${entry.kind} ${Math.round(entry.totalMs)}ms`,
        `count=${entry.count}`,
        `path=${entry.path || 'unknown'}`,
        `storage=${entry.storageClass || 'unknown'}`,
        `purpose=${entry.purpose || 'unknown'}`,
        `substep=${entry.substep || 'unknown'}`,
        `max=${Math.round(entry.maxMs)}ms`,
        `bytes=${entry.byteLength ?? 'unknown'}`,
      ].join(' '))
      .join(' | ');
  }

  private logReviewFeedbackWorkerHandleCopySummary(
    pending: PendingBackendRequest,
    timing: BackendWorkerResponseTiming,
    innerStepSummary: ReturnType<BrowserSrsBackendWorkerTransport['summarizeReviewFeedbackInnerSteps']>,
  ): void {
    if (timing.handleDurationMs < REVIEW_FEEDBACK_TRANSPORT_STEP_SLOW_MS) {
      return;
    }
    const copySummary = this.buildReviewFeedbackWorkerHandleCopySummary({
      pending,
      timing,
      innerStepSummary,
    });
    logger.info(
      `[SiYuanMemo][BrowserSrsBackendWorkerTransport] slow ${pending.method} worker-handle summary ${copySummary}`,
      {
        step: 'worker-handle-summary',
        cardId: pending.cardId,
        durationMs: timing.handleDurationMs,
        generation: this.generation,
        health: this.health,
        copySummary,
        hostEffectCount: timing.hostEffectCount,
        hostEffectTotalMs: timing.hostEffectTotalMs,
        hostEffectAttribution: timing.hostEffectAttribution,
        slowestHostEffect: timing.slowestHostEffect,
        hostEffectBreakdown: timing.hostEffectBreakdown ?? [],
        hostEffectBreakdownSummary: this.formatHostEffectBreakdownSummary(timing.hostEffectBreakdown),
        innerStepAttribution: timing.innerStepAttribution,
        innerStepsTruncated: timing.innerStepsTruncated,
        ...innerStepSummary,
      },
    );
  }

  private shouldLogReviewFeedbackOuterTransportStep(
    durationMs: number,
    timing: BackendWorkerResponseTiming | null | undefined,
  ): boolean {
    if (!timing || timing.handleDurationMs < REVIEW_FEEDBACK_TRANSPORT_STEP_SLOW_MS) {
      return durationMs >= REVIEW_FEEDBACK_TRANSPORT_STEP_SLOW_MS;
    }
    return durationMs - timing.handleDurationMs >= REVIEW_FEEDBACK_TRANSPORT_STEP_SLOW_MS;
  }

  private logReviewFeedbackWorkerTiming(
    pending: PendingBackendRequest,
    timing: BackendWorkerResponseTiming | null | undefined,
    receivedAt: number,
  ): void {
    if (!this.isReviewFeedbackTimingMethod(pending.method) || !timing) {
      return;
    }
    const innerStepSummary = this.summarizeReviewFeedbackInnerSteps(timing);
    this.logReviewFeedbackTransportStepIfSlow(
      'worker-received-delay',
      pending.method,
      pending.cardId,
      timing.receivedDelayMs ?? 0,
      {
        pendingRequests: this.pendingRequests.size,
        workerReceivedAt: timing.receivedAt,
        transportPostedAt: pending.postedAt,
      },
    );
    this.logReviewFeedbackWorkerHandleCopySummary(pending, timing, innerStepSummary);
    this.logReviewFeedbackTransportStepIfSlow(
      'main-after-worker',
      pending.method,
      pending.cardId,
      Math.max(0, receivedAt - timing.handledAt),
      {
        pendingRequests: this.pendingRequests.size,
      },
    );
  }

  private isReviewFeedbackTimingMethod(method: BackendRpcRequest['method']): boolean {
    return method === 'review.feedback' || method === 'review.session.feedback';
  }

  private recordDiagnosticWorkerTiming(
    pending: PendingBackendRequest,
    timing: BackendWorkerResponseTiming | null | undefined,
  ): void {
    if (!timing || !DIAGNOSTIC_TIMING_METHODS.has(pending.method)) {
      return;
    }
    const innerStepSummary = this.summarizeReviewFeedbackInnerSteps(timing);
    recordRuntimePerformanceSpan(
      'worker',
      `${pending.method}.handle`,
      timing.handleDurationMs,
      {
        pendingRequests: this.pendingRequests.size,
        hostEffectCount: timing.hostEffectCount,
        hostEffectTotalMs: timing.hostEffectTotalMs,
        hostEffectAttribution: timing.hostEffectAttribution,
        innerStepCount: innerStepSummary.innerStepCount,
        innerStepTotalMs: innerStepSummary.innerStepTotalMs,
        innerStepAttribution: timing.innerStepAttribution,
        innerStepsTruncated: timing.innerStepsTruncated,
        unattributedMs: innerStepSummary.unattributedMs,
        slowestHostEffectKind: timing.slowestHostEffect?.kind ?? null,
        slowestHostEffectMs: timing.slowestHostEffect?.durationMs ?? null,
        slowestHostEffectPath: timing.slowestHostEffect?.path ?? null,
        slowestHostEffectByteLength: timing.slowestHostEffect?.byteLength ?? null,
        slowestHostEffectStorageClass: timing.slowestHostEffect?.storageClass ?? null,
        hostEffectBreakdownSummary: this.formatHostEffectBreakdownSummary(timing.hostEffectBreakdown),
        dominantInnerStep: innerStepSummary.dominantInnerStepSummary,
        preRequestMerge: innerStepSummary.preRequestMergeSummary,
        mainDbRead: innerStepSummary.mainDbReadSummary,
      },
      {
        startedAt: timing.handleStartedAt,
        endedAt: timing.handledAt,
      },
    );
    if (timing.hostEffectTotalMs > 0) {
      recordRuntimePerformanceSpan(
        'worker',
        `${pending.method}.host-effects`,
        timing.hostEffectTotalMs,
        {
          pendingRequests: this.pendingRequests.size,
          hostEffectCount: timing.hostEffectCount,
          hostEffectAttribution: timing.hostEffectAttribution,
          slowestHostEffectKind: timing.slowestHostEffect?.kind ?? null,
          slowestHostEffectMs: timing.slowestHostEffect?.durationMs ?? null,
          slowestHostEffectPath: timing.slowestHostEffect?.path ?? null,
          slowestHostEffectByteLength: timing.slowestHostEffect?.byteLength ?? null,
          slowestHostEffectStorageClass: timing.slowestHostEffect?.storageClass ?? null,
          hostEffectBreakdown: timing.hostEffectBreakdown ?? [],
          hostEffectBreakdownSummary: this.formatHostEffectBreakdownSummary(timing.hostEffectBreakdown),
        },
        {
          endedAt: timing.handledAt,
        },
      );
    }
    for (const innerStep of timing.innerSteps) {
      recordRuntimePerformanceSpan(
        'worker-inner',
        `${pending.method}.${innerStep.layer}.${innerStep.step}`,
        innerStep.durationMs,
        {
          pendingRequests: this.pendingRequests.size,
          innerStepAttribution: timing.innerStepAttribution,
          innerLayer: innerStep.layer,
          innerStep: innerStep.step,
          innerCardId: innerStep.cardId ?? null,
          innerQueueType: innerStep.queueType ?? null,
          ...(innerStep.extra ?? {}),
        },
        {
          endedAt: timing.handledAt,
        },
      );
    }
  }

  private closeWithError(error: Error): void {
    if (this.closed) {
      return;
    }
    this.markWorkerUnhealthy(error, this.generation, { terminate: true });
  }

  private startWorkerGeneration(): void {
    if (this.closed) {
      return;
    }
    this.clearStartupTimer();
    const generation = this.generation + 1;
    this.generation = generation;
    this.health = 'starting';
    this.lastStartedAt = Date.now();
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.ready.catch(() => {
      // Request/probe callers receive this rejection through their own await.
    });
    try {
      this.worker = this.options.workerFactory?.() ?? createDefaultBackendWorker();
    } catch (error) {
      this.markWorkerConstructionUnavailable(backendWorkerCompatibilityError(error), generation);
      return;
    }
    this.worker.onmessage = (event: MessageEvent<BackendWorkerToMainMessage>) => {
      if (generation !== this.generation) {
        return;
      }
      this.handleWorkerMessage(event.data);
    };
    this.worker.onerror = (event: ErrorEvent) => {
      if (generation !== this.generation) {
        return;
      }
      this.closeWithError(unavailable(`backend worker error: ${event.message || 'unknown error'}`));
    };
    this.startupTimer = setTimeout(() => {
      if (this.closed || generation !== this.generation || this.health !== 'starting') {
        return;
      }
      this.startupTimeouts += 1;
      const error = unavailable(`backend worker startup timed out after ${this.startupTimeoutMs}ms`);
      this.rejectReady?.(error);
      this.markWorkerUnhealthy(error, generation, { terminate: true });
    }, this.startupTimeoutMs);
  }

  private markWorkerConstructionUnavailable(error: Error, generation: number): void {
    if (this.closed || generation !== this.generation) {
      return;
    }
    this.worker = null;
    this.health = 'unavailable';
    this.lastTerminalError = error.message;
    this.clearStartupTimer();
    this.rejectReady?.(error);
    this.rejectPendingForGeneration(generation, error);
    this.rejectProbesForGeneration(generation, error);
  }

  private markWorkerUnhealthy(error: Error, generation: number, options: { terminate: boolean }): void {
    if (this.closed || generation !== this.generation) {
      return;
    }
    this.health = 'unhealthy';
    this.lastTerminalError = error.message;
    this.clearStartupTimer();
    this.rejectReady?.(error);
    this.rejectPendingForGeneration(generation, error);
    this.rejectProbesForGeneration(generation, error);
    if (options.terminate) {
      try {
        this.worker?.terminate();
      } catch {
        // worker may already be gone
      }
    }
    this.scheduleRestart();
  }

  private scheduleRestart(): void {
    if (this.closed) {
      return;
    }
    if (this.restartCount >= this.maxRestartAttempts) {
      this.health = 'unavailable';
      this.worker = null;
      return;
    }
    this.health = 'restarting';
    this.restartCount += 1;
    this.clearRestartTimer();
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.startWorkerGeneration();
    }, this.restartBackoffMs);
  }

  private rejectPendingForGeneration(generation: number | null, error: Error): void {
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      if (generation !== null && pending.generation !== generation) {
        continue;
      }
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      pending.reject(error);
      this.pendingRequests.delete(requestId);
    }
  }

  private rejectProbesForGeneration(generation: number | null, error: Error): void {
    for (const [probeId, pending] of this.pendingProbes.entries()) {
      if (generation !== null && pending.generation !== generation) {
        continue;
      }
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      pending.reject(error);
      this.pendingProbes.delete(probeId);
    }
  }

  private clearStartupTimer(): void {
    if (!this.startupTimer) {
      return;
    }
    clearTimeout(this.startupTimer);
    this.startupTimer = null;
  }

  private clearRestartTimer(): void {
    if (!this.restartTimer) {
      return;
    }
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private get startupTimeoutMs(): number {
    return Math.max(1, Math.floor(Number(this.options.startupTimeoutMs ?? 10_000)));
  }

  private get requestTimeoutMs(): number {
    return Math.max(1, Math.floor(Number(this.options.requestTimeoutMs ?? 30_000)));
  }

  private get hostEffectTimeoutMs(): number {
    return Math.max(1, Math.floor(Number(this.options.hostEffectTimeoutMs ?? DEFAULT_HOST_EFFECT_TIMEOUT_MS)));
  }

  private resolveRequestTimeoutPolicy(request: BackendRpcRequest): BackendOperationTimeoutPolicy {
    const baseTimeoutMs = this.requestTimeoutMs;
    return BACKEND_OPERATION_TIMEOUT_POLICY_BY_METHOD.get(request.method) ?? {
      timeoutMs: baseTimeoutMs,
      classification: 'generic-request',
    };
  }

  private resolveHostEffectTimeoutPolicy(effect: BackendWorkerHostEffect): BackendOperationTimeoutPolicy {
    const operationName = this.getHostEffectOperationName(effect);
    const operationPolicy = operationName === 'unknown'
      ? null
      : BACKEND_OPERATION_TIMEOUT_POLICY_BY_METHOD.get(operationName) ?? null;
    return operationPolicy ?? {
      timeoutMs: this.hostEffectTimeoutMs,
      classification: 'generic-host-effect',
    };
  }

  private getHostEffectOperationName(effect: BackendWorkerHostEffect): string {
    if (
      'requestMethod' in effect
      && typeof effect.requestMethod === 'string'
      && effect.requestMethod.trim().length > 0
      && (effect.kind.startsWith('sqlite.') || effect.kind.startsWith('truth.'))
    ) {
      return effect.requestMethod;
    }
    return 'unknown';
  }

  private getHostEffectTimeoutPhase(effect: BackendWorkerHostEffect): string {
    const substep = 'substep' in effect && typeof effect.substep === 'string' && effect.substep.trim().length > 0
      ? effect.substep.trim()
      : null;
    const purpose = 'purpose' in effect && typeof effect.purpose === 'string' && effect.purpose.trim().length > 0
      ? effect.purpose.trim()
      : null;
    return ['host-effect', effect.kind, substep ?? purpose]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(':');
  }

  private get probeTimeoutMs(): number {
    return Math.max(1, Math.floor(Number(this.options.probeTimeoutMs ?? 5_000)));
  }

  private get maxRestartAttempts(): number {
    return Math.max(0, Math.floor(Number(this.options.maxRestartAttempts ?? 3)));
  }

  private get restartBackoffMs(): number {
    return Math.max(0, Math.floor(Number(this.options.restartBackoffMs ?? 1_000)));
  }
}
