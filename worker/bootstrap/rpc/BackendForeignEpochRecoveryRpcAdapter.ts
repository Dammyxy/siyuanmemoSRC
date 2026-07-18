import {
  BACKEND_FOREIGN_EPOCH_RECOVERY_RPC_METHODS,
  type BackendForeignEpochRecoveryApplyRequest,
  type BackendForeignEpochRecoveryApplyResult,
  type BackendForeignEpochRecoveryPreviewRequest,
  type BackendForeignEpochRecoveryPreviewResult,
  type BackendForeignEpochRecoveryRpcMethod,
  type BackendForeignEpochRecoveryStatusRequest,
  type BackendForeignEpochRecoveryStatusResult,
  type BackendStartupReadinessDisposition,
  type BackendRpcHandlerAdapter,
} from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendForeignEpochRecoveryRpcRuntime {
  preview(request?: BackendForeignEpochRecoveryPreviewRequest): Promise<BackendForeignEpochRecoveryPreviewResult>;
  apply(request: BackendForeignEpochRecoveryApplyRequest): Promise<BackendForeignEpochRecoveryApplyResult>;
  status(request?: BackendForeignEpochRecoveryStatusRequest): Promise<BackendForeignEpochRecoveryStatusResult>;
  verifyRestart?(readiness: BackendStartupReadinessDisposition | null | undefined): Promise<boolean>;
}

export interface BackendForeignEpochRecoveryRpcHandlerContext extends BackendRpcHandlerContext {
  readonly foreignEpochRecovery: BackendForeignEpochRecoveryRpcRuntime;
}

export type BackendForeignEpochRecoveryRpcHandlerRegistration = BackendRpcHandlerRegistration<
  BackendForeignEpochRecoveryRpcHandlerContext
>;

function readOptionalNamedParams<T extends object>(params: unknown, method: string): T | undefined {
  if (params === undefined || (Array.isArray(params) && params.length === 0)) return undefined;
  const candidate = Array.isArray(params) ? params[0] : params;
  if (candidate === undefined || candidate === null) return undefined;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error(`INVALID_REQUEST: ${method} request must be an object`);
  }
  return candidate as T;
}

function readRequiredNamedParams<T extends object>(params: unknown, method: string): T {
  const candidate = readOptionalNamedParams<T>(params, method);
  if (!candidate) {
    throw new Error(`INVALID_REQUEST: ${method} requires named params`);
  }
  return candidate;
}

const HANDLERS: {
  readonly [Method in BackendForeignEpochRecoveryRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendForeignEpochRecoveryRpcHandlerContext
  >;
} = {
  'recovery.foreignEpoch.preview': {
    method: 'recovery.foreignEpoch.preview',
    family: 'recovery',
    handle(params, context): Promise<BackendForeignEpochRecoveryPreviewResult> {
      return context.foreignEpochRecovery.preview(
        readOptionalNamedParams<BackendForeignEpochRecoveryPreviewRequest>(
          params,
          'recovery.foreignEpoch.preview',
        ),
      );
    },
  },
  'recovery.foreignEpoch.apply': {
    method: 'recovery.foreignEpoch.apply',
    family: 'recovery',
    handle(params, context): Promise<BackendForeignEpochRecoveryApplyResult> {
      return context.foreignEpochRecovery.apply(
        readRequiredNamedParams<BackendForeignEpochRecoveryApplyRequest>(
          params,
          'recovery.foreignEpoch.apply',
        ),
      );
    },
  },
  'recovery.foreignEpoch.status': {
    method: 'recovery.foreignEpoch.status',
    family: 'recovery',
    handle(params, context): Promise<BackendForeignEpochRecoveryStatusResult> {
      return context.foreignEpochRecovery.status(
        readOptionalNamedParams<BackendForeignEpochRecoveryStatusRequest>(
          params,
          'recovery.foreignEpoch.status',
        ),
      );
    },
  },
};

export const BACKEND_FOREIGN_EPOCH_RECOVERY_RPC_HANDLER_REGISTRATIONS:
readonly BackendForeignEpochRecoveryRpcHandlerRegistration[] = Object.freeze(
  BACKEND_FOREIGN_EPOCH_RECOVERY_RPC_METHODS.map((method) => ({
    ...HANDLERS[method],
    owner: 'BackendForeignEpochRecoveryRpcAdapter',
  })),
);
