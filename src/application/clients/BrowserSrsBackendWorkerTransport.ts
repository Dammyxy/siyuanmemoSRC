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
}

interface PendingBackendRequest {
  resolve: (response: BackendRpcResponse) => void;
  reject: (error: Error) => void;
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
  private readonly worker: Worker;
  private readonly pendingRequests = new Map<string, PendingBackendRequest>();
  private readonly ready: Promise<void>;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((error: Error) => void) | null = null;
  private requestSeq = 0;
  private closed = false;

  constructor(private readonly options: BrowserSrsBackendWorkerTransportOptions) {
    this.worker = options.workerFactory?.() ?? createDefaultBackendWorker();
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.worker.onmessage = (event: MessageEvent<BackendWorkerToMainMessage>) => this.handleWorkerMessage(event.data);
    this.worker.onerror = (event: ErrorEvent) => {
      this.closeWithError(unavailable(`backend worker error: ${event.message || 'unknown error'}`));
    };
  }

  async request(request: BackendRpcRequest): Promise<BackendRpcResponse> {
    if (this.closed) {
      throw unavailable('backend worker transport closed');
    }
    await this.ready;
    if (this.closed) {
      throw unavailable('backend worker transport closed');
    }
    const requestId = `req-${++this.requestSeq}`;
    const pending = new Promise<BackendRpcResponse>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
    });
    this.postToWorker({
      kind: 'request',
      requestId,
      request,
    });
    return pending;
  }

  dispose(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.rejectReady?.(unavailable('backend worker transport closed'));
    for (const pending of this.pendingRequests.values()) {
      pending.reject(unavailable('backend worker transport closed'));
    }
    this.pendingRequests.clear();
    try {
      this.postToWorker({ kind: 'shutdown' });
    } catch {
      // worker may already be gone
    }
    this.worker.terminate();
  }

  private handleWorkerMessage(message: BackendWorkerToMainMessage): void {
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.kind === 'ready') {
      this.resolveReady?.();
      return;
    }
    if (message.kind === 'response') {
      const pending = this.pendingRequests.get(message.requestId);
      if (!pending) {
        return;
      }
      this.pendingRequests.delete(message.requestId);
      pending.resolve(message.response);
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
    this.worker.postMessage(message);
  }

  private closeWithError(error: Error): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.rejectReady?.(error);
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
