import type {
  BackendAiPromptExecuteRequest,
  BackendAiPromptNetworkRequest,
  BackendAutoCardExecuteRequest,
  BackendRpcRequest,
  BackendRpcResponse,
} from '../../packages/contracts/src/backend-rpc';

export type BackendWorkerHostEffect =
  | { kind: 'sqlite.readBinary'; path: string }
  | { kind: 'sqlite.writeBinary'; path: string; bytes: Uint8Array }
  | { kind: 'sqlite.readJSON'; path: string }
  | { kind: 'sqlite.writeJSON'; path: string; value: unknown }
  | { kind: 'siyuan.resolveExistingBlockIds'; blockIds: string[] }
  | { kind: 'autocard.execute'; request: BackendAutoCardExecuteRequest }
  | { kind: 'ai.prompt.execute'; request: BackendAiPromptNetworkRequest; context: BackendAiPromptExecuteRequest };

export type BackendWorkerRequestMessage = {
  kind: 'request';
  requestId: string;
  request: BackendRpcRequest;
};

export type BackendWorkerResponseMessage = {
  kind: 'response';
  requestId: string;
  response: BackendRpcResponse;
};

export type BackendWorkerReadyMessage = {
  kind: 'ready';
};

export type BackendWorkerShutdownMessage = {
  kind: 'shutdown';
};

export type BackendWorkerHostEffectMessage = {
  kind: 'host-effect';
  effectId: string;
  effect: BackendWorkerHostEffect;
};

export type BackendWorkerHostEffectResultMessage = {
  kind: 'host-effect-result';
  effectId: string;
} & (
  | { ok: true; result: unknown }
  | { ok: false; error: { code: 'BACKEND_UNAVAILABLE' | 'INTERNAL_ERROR'; message: string } }
);

export type BackendWorkerMainToWorkerMessage =
  | BackendWorkerRequestMessage
  | BackendWorkerHostEffectResultMessage
  | BackendWorkerShutdownMessage;

export type BackendWorkerToMainMessage =
  | BackendWorkerReadyMessage
  | BackendWorkerResponseMessage
  | BackendWorkerHostEffectMessage;

export type BackendWorkerHostEffectHandler = (effect: BackendWorkerHostEffect) => Promise<unknown>;
