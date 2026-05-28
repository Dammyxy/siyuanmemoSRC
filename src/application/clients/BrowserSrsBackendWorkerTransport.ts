import type { SrsBackendTransport } from '@/application/clients/SrsBackendClient';
import BackendWorker from '../../../worker/bootstrap/backend-worker.entry.ts?worker&inline';
import type {
  BackendAiPromptExecuteRequest,
  BackendAiPromptNetworkResponse,
  BackendAutoCardExecuteRequest,
  BackendAutoCardExecuteResult,
  BackendProgressiveCommandExecuteRequest,
  BackendProgressiveCommandExecuteResult,
  BackendTopicDerivedCommandExecuteRequest,
  BackendTopicDerivedCommandExecuteResult,
  BackendNeuralGraphQueryRequest,
  BackendNeuralGraphQueryResult,
  BackendReviewRiffFeedbackExecuteRequest,
  BackendReviewRiffFeedbackExecuteResult,
  BackendRpcRequest,
  BackendRpcResponse,
  BackendXiuyuanRiffReadAuditRequest,
  BackendXiuyuanRiffReadAuditResult,
} from '../../../packages/contracts/src/backend-rpc';
import type {
  BackendWorkerHostEffect,
  BackendWorkerMainToWorkerMessage,
  BackendWorkerResponseTiming,
  BackendWorkerToMainMessage,
} from '../../../worker/bootstrap/BackendWorkerProtocol';
import { createLogger } from '@/utils/logger';

const logger = createLogger('BrowserSrsBackendWorkerTransport');
const REVIEW_FEEDBACK_TRANSPORT_STEP_SLOW_MS = 120;
const REVIEW_FEEDBACK_WORKER_HANDLE_TOP_INNER_STEP_COUNT = 5;

export interface BrowserSrsBackendWorkerHostEffects {
  readBinary?: (path: string) => Promise<Uint8Array | null>;
  writeBinary?: (path: string, bytes: Uint8Array) => Promise<void>;
  readJSON?: <T>(path: string) => Promise<T | null>;
  writeJSON?: (path: string, value: unknown) => Promise<void>;
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
  readXiuyuanRiffFacts?: (
    request: BackendXiuyuanRiffReadAuditRequest,
  ) => Promise<BackendXiuyuanRiffReadAuditResult>;
  executeAutoCard?: (request: BackendAutoCardExecuteRequest) => Promise<BackendAutoCardExecuteResult>;
  executeProgressiveCommand?: (
    request: BackendProgressiveCommandExecuteRequest,
  ) => Promise<BackendProgressiveCommandExecuteResult>;
  executeTopicDerivedCommand?: (
    request: BackendTopicDerivedCommandExecuteRequest,
  ) => Promise<BackendTopicDerivedCommandExecuteResult>;
  executeReviewRiffFeedback?: (
    request: BackendReviewRiffFeedbackExecuteRequest,
  ) => Promise<BackendReviewRiffFeedbackExecuteResult>;
  executeAiPrompt?: (
    request: BackendAiPromptExecuteRequest['request'],
    context: BackendAiPromptExecuteRequest,
  ) => Promise<BackendAiPromptNetworkResponse>;
}

export interface BrowserSrsBackendWorkerTransportOptions {
  workerFactory?: () => Worker;
  hostEffects: BrowserSrsBackendWorkerHostEffects;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
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
  startupTimeouts: number;
  requestTimeouts: number;
  probeTimeouts: number;
  lastSuccessfulProbeAt: number | null;
  lastStartedAt: number | null;
  lastReadyAt: number | null;
  lastTerminalError: string | null;
}

function createDefaultBackendWorker(): Worker {
  return new BackendWorker({
    name: 'SiYuanMemoBackendWorker',
  });
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unavailable(message: string): Error {
  return new Error(`BACKEND_UNAVAILABLE: ${message}`);
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
    const pending = new Promise<BackendRpcResponse>((resolve, reject) => {
      const generation = this.generation;
      const timer = setTimeout(() => {
        const current = this.pendingRequests.get(requestId);
        if (!current) {
          return;
        }
        this.pendingRequests.delete(requestId);
        this.requestTimeouts += 1;
        const error = unavailable(`backend worker request timed out after ${this.requestTimeoutMs}ms`);
        current.reject(error);
        this.markWorkerUnhealthy(error, generation, { terminate: true });
      }, this.requestTimeoutMs);
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
      this.pendingProbes.set(probeId, { resolve, reject, timer, generation });
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
      if (pending.method === 'review.feedback') {
        const now = Date.now();
        this.logReviewFeedbackWorkerTiming(pending, message.timing, now);
        this.logReviewFeedbackTransportStepIfSlow(
          'worker-roundtrip',
          pending.method,
          pending.cardId,
          now - (pending.postedAt ?? pending.queuedAt),
          { pendingRequests: this.pendingRequests.size },
        );
        this.logReviewFeedbackTransportStepIfSlow(
          'request-total',
          pending.method,
          pending.cardId,
          now - pending.queuedAt,
          { pendingRequests: this.pendingRequests.size },
        );
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
      const result = await this.executeHostEffect(effect);
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

  private async executeHostEffect(effect: BackendWorkerHostEffect): Promise<unknown> {
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
      case 'siyuan.riff.readAudit':
        if (!this.options.hostEffects.readXiuyuanRiffFacts) {
          throw unavailable('Xiuyuan native Riff read/audit host effect unavailable');
        }
        return this.options.hostEffects.readXiuyuanRiffFacts(effect.request);
      case 'autocard.execute':
        if (!this.options.hostEffects.executeAutoCard) {
          throw unavailable('autocard.execute host effect unavailable');
        }
        return this.options.hostEffects.executeAutoCard(effect.request);
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
      case 'review.riffFeedback.execute':
        if (!this.options.hostEffects.executeReviewRiffFeedback) {
          throw unavailable('review.riffFeedback.execute host effect unavailable');
        }
        return this.options.hostEffects.executeReviewRiffFeedback(effect.request);
      case 'ai.prompt.execute':
        if (!this.options.hostEffects.executeAiPrompt) {
          throw unavailable('ai.prompt.execute host effect unavailable');
        }
        return this.options.hostEffects.executeAiPrompt(effect.request, effect.context);
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

  private extractReviewFeedbackCardId(request: BackendRpcRequest): string | null {
    if (request.method !== 'review.feedback') {
      return null;
    }
    const params = Array.isArray(request.params) ? request.params[0] : null;
    if (!params || typeof params !== 'object') {
      return null;
    }
    const cardId = String((params as { cardId?: unknown }).cardId || '').trim();
    return cardId || null;
  }

  private logReviewFeedbackTransportStepIfSlow(
    step: string,
    method: BackendRpcRequest['method'],
    cardId: string | null,
    durationMs: number,
    extra?: Record<string, unknown>,
  ): void {
    const shouldForceLog = step === 'worker-inner-step'
      && (
        extra?.innerStep === 'merge.fast-skip-main-db-read'
        || extra?.forceLogReason === 'worker-handle-top-inner-step'
      );
    if (
      method !== 'review.feedback'
      || (!shouldForceLog && durationMs < REVIEW_FEEDBACK_TRANSPORT_STEP_SLOW_MS)
    ) {
      return;
    }
    logger.info('[SiYuanMemo][BrowserSrsBackendWorkerTransport] slow review.feedback transport step', {
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
    const innerStepTotalMs = innerSteps.reduce((total, innerStep) => total + innerStep.durationMs, 0);
    return {
      innerStepCount: innerSteps.length,
      innerStepTotalMs,
      slowestInnerStep: topInnerSteps[0] ?? null,
      topInnerSteps,
      unattributedMs: Math.max(0, timing.handleDurationMs - innerStepTotalMs - timing.hostEffectTotalMs),
    };
  }

  private logReviewFeedbackWorkerTiming(
    pending: PendingBackendRequest,
    timing: BackendWorkerResponseTiming | null | undefined,
    receivedAt: number,
  ): void {
    if (pending.method !== 'review.feedback' || !timing) {
      return;
    }
    const innerStepSummary = this.summarizeReviewFeedbackInnerSteps(timing);
    const shouldForceTopInnerSteps = timing.handleDurationMs >= REVIEW_FEEDBACK_TRANSPORT_STEP_SLOW_MS;
    const forceLoggedInnerSteps = shouldForceTopInnerSteps
      ? new Set(
        [...timing.innerSteps]
          .sort((left, right) => right.durationMs - left.durationMs)
          .slice(0, REVIEW_FEEDBACK_WORKER_HANDLE_TOP_INNER_STEP_COUNT),
      )
      : new Set();
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
    this.logReviewFeedbackTransportStepIfSlow(
      'worker-handle',
      pending.method,
      pending.cardId,
      timing.handleDurationMs,
      {
        pendingRequests: this.pendingRequests.size,
        hostEffectCount: timing.hostEffectCount,
        hostEffectTotalMs: timing.hostEffectTotalMs,
        hostEffectAttribution: timing.hostEffectAttribution,
        slowestHostEffect: timing.slowestHostEffect,
        innerStepAttribution: timing.innerStepAttribution,
        innerStepsTruncated: timing.innerStepsTruncated,
        ...innerStepSummary,
      },
    );
    for (const innerStep of timing.innerSteps) {
      this.logReviewFeedbackTransportStepIfSlow(
        'worker-inner-step',
        pending.method,
        pending.cardId,
        innerStep.durationMs,
        {
          pendingRequests: this.pendingRequests.size,
          innerLayer: innerStep.layer,
          innerStep: innerStep.step,
          innerCardId: innerStep.cardId ?? null,
          innerQueueType: innerStep.queueType ?? null,
          innerStepAttribution: timing.innerStepAttribution,
          ...(forceLoggedInnerSteps.has(innerStep)
            ? { forceLogReason: 'worker-handle-top-inner-step' }
            : {}),
          ...(innerStep.extra ?? {}),
        },
      );
    }
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
    this.worker = this.options.workerFactory?.() ?? createDefaultBackendWorker();
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.ready.catch(() => {
      // Request/probe callers receive this rejection through their own await.
    });
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
