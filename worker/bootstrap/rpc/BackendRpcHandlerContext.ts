import type {
  BackendRpcErrorCode,
  BackendRpcId,
  BackendRpcMethod,
} from '../../../packages/contracts/src/backend-rpc';

export interface BackendRpcDispatchRequest {
  readonly id: BackendRpcId;
  readonly method: BackendRpcMethod;
  readonly params: unknown;
}

export interface BackendRpcMappedError {
  readonly code: BackendRpcErrorCode;
  readonly message: string;
}

export interface BackendRpcHandlerTimingEvent {
  readonly method: string | null;
  readonly family: string | null;
  readonly owner: string | null;
  readonly outcome: string;
  readonly durationMs: number;
  readonly errorCode?: BackendRpcErrorCode;
}

export interface BackendRpcHandlerLifecycle {
  readonly now?: () => number;
  readonly beforeHandle?: (request: BackendRpcDispatchRequest) => Promise<void> | void;
  readonly mapError?: (error: unknown) => BackendRpcMappedError | null | undefined;
  readonly recordTiming?: (event: BackendRpcHandlerTimingEvent) => void;
}

export interface BackendRpcHandlerContext {
  readonly lifecycle?: BackendRpcHandlerLifecycle;
}
