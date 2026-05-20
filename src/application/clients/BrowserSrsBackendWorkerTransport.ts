import type { SrsBackendTransport } from '@/application/clients/SrsBackendClient';
import BackendWorker from '../../../worker/bootstrap/backend-worker.entry.ts?worker&inline';
import type {
  BackendAiPromptExecuteRequest,
  BackendAiPromptNetworkResponse,
  BackendAutoCardExecuteRequest,
  BackendAutoCardExecuteResult,
  BackendNeuralGraphQueryRequest,
  BackendNeuralGraphQueryResult,
  BackendRpcRequest,
  BackendRpcResponse,
} from '../../../packages/contracts/src/backend-rpc';
import type {
  BackendWorkerHostEffect,
  BackendWorkerHostEffectResultMessage,
  BackendWorkerMainToWorkerMessage,
  BackendWorkerToMainMessage,
} from '../../../worker/bootstrap/BackendWorkerProtocol';

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
  executeAutoCard?: (request: BackendAutoCardExecuteRequest) => Promise<BackendAutoCardExecuteResult>;
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
      this.pendingRequests.set(requestId, { resolve, reject, timer, generation });
    });
    this.postToWorker({
      kind: 'request',
      requestId,
      request,
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
      case 'autocard.execute':
        if (!this.options.hostEffects.executeAutoCard) {
          throw unavailable('autocard.execute host effect unavailable');
        }
        return this.options.hostEffects.executeAutoCard(effect.request);
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
    this.worker.postMessage(message);
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
