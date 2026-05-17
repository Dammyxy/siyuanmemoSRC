import {
  BACKEND_RPC_VERSION,
  type BackendAiPromptNetworkResponse,
  type BackendAutoCardExecuteResult,
  type BackendNeuralGraphQueryRequest,
  type BackendNeuralGraphQueryResult,
  type BackendRpcResponse,
} from '../../packages/contracts/src/backend-rpc';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { BackendKernel } from './BackendKernel';
import type {
  BackendWorkerHostEffect,
  BackendWorkerHostEffectResultMessage,
  BackendWorkerMainToWorkerMessage,
  BackendWorkerToMainMessage,
} from './BackendWorkerProtocol';

type WorkerGlobalScopeLike = {
  postMessage(message: BackendWorkerToMainMessage): void;
  onmessage: ((event: MessageEvent<BackendWorkerMainToWorkerMessage>) => void) | null;
  close?: () => void;
};

const scope = self as unknown as WorkerGlobalScopeLike;

let hostEffectSeq = 0;
const pendingHostEffects = new Map<string, {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}>();

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildInternalErrorResponse(
  id: string | number,
  message: string,
): BackendRpcResponse {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
  };
}

function requestHostEffect<TResult>(effect: BackendWorkerHostEffect): Promise<TResult> {
  const effectId = `effect-${++hostEffectSeq}`;
  const pending = new Promise<TResult>((resolve, reject) => {
    pendingHostEffects.set(effectId, {
      resolve: (result) => resolve(result as TResult),
      reject,
    });
  });
  scope.postMessage({
    kind: 'host-effect',
    effectId,
    effect,
  });
  return pending;
}

function handleHostEffectResult(message: BackendWorkerHostEffectResultMessage): void {
  const pending = pendingHostEffects.get(message.effectId);
  if (!pending) {
    return;
  }
  pendingHostEffects.delete(message.effectId);
  if (message.ok) {
    pending.resolve(message.result);
    return;
  }
  pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
}

const database = new WorkerSqliteDatabaseService({
  readBinary: (path) => requestHostEffect<Uint8Array | null>({
    kind: 'sqlite.readBinary',
    path,
  }),
  writeBinary: (path, bytes) => requestHostEffect<void>({
    kind: 'sqlite.writeBinary',
    path,
    bytes,
  }),
  readJSON: <T>(path: string) => requestHostEffect<T | null>({
    kind: 'sqlite.readJSON',
    path,
  }),
  writeJSON: (path, value) => requestHostEffect<void>({
    kind: 'sqlite.writeJSON',
    path,
    value,
  }),
});

const backendKernel = new BackendKernel({
  database,
  resolveExistingBlockIds: (blockIds) => requestHostEffect<string[]>({
    kind: 'siyuan.resolveExistingBlockIds',
    blockIds,
  }),
  resolveNeuralGraphQuery: (request: BackendNeuralGraphQueryRequest) => requestHostEffect<BackendNeuralGraphQueryResult>({
    kind: 'siyuan.neuralGraph.query',
    request,
  }),
  executeAutoCard: (request) => requestHostEffect<BackendAutoCardExecuteResult>({
    kind: 'autocard.execute',
    request,
  }),
  executeAiPrompt: (request, context) => requestHostEffect<BackendAiPromptNetworkResponse>({
    kind: 'ai.prompt.execute',
    request,
    context,
  }),
});

scope.onmessage = (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') {
    return;
  }
  if (message.kind === 'host-effect-result') {
    handleHostEffectResult(message);
    return;
  }
  if (message.kind === 'shutdown') {
    pendingHostEffects.clear();
    scope.close?.();
    return;
  }
  if (message.kind === 'probe') {
    scope.postMessage({
      kind: 'probe-result',
      probeId: message.probeId,
    });
    return;
  }
  if (message.kind === 'request') {
    backendKernel.handle(message.request)
      .catch((error) => buildInternalErrorResponse(
        message.request?.id ?? 'invalid-request',
        toErrorMessage(error),
      ))
      .then((response) => {
        scope.postMessage({
          kind: 'response',
          requestId: message.requestId,
          response,
        });
      });
  }
};

scope.postMessage({ kind: 'ready' });
