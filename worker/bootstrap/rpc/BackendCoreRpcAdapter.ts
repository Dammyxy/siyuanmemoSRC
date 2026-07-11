import type {
  BackendDbLoadResult,
  BackendDbLoadRequest,
  BackendDbReloadResult,
  BackendDiagnosticsStatusResult,
  BackendHealthResult,
  BackendPrivateDiagnosticsStatusResult,
  BackendPrivateHealthResult,
  BackendStorageMaintenanceApplyBatchRequest,
  BackendStorageMaintenanceApplyBatchResult,
  BackendStorageMaintenanceStatusRequest,
  BackendStorageMaintenanceStatusResult,
  BackendRpcHandlerAdapter,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_CORE_RPC_METHODS, type BackendCoreRpcMethod } from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendCoreRpcDatabase {
  getStatus(): { initialized: boolean };
  load(request?: BackendDbLoadRequest): Promise<BackendDbLoadResult> | BackendDbLoadResult;
  reloadFromDisk(request?: BackendDbLoadRequest): Promise<BackendDbReloadResult>;
  getStorageMaintenanceStatus(
    request: BackendStorageMaintenanceStatusRequest,
  ): Promise<BackendStorageMaintenanceStatusResult>;
  applyStorageMaintenanceBatch(
    request: BackendStorageMaintenanceApplyBatchRequest,
  ): Promise<BackendStorageMaintenanceApplyBatchResult>;
}

export interface BackendCoreRpcRuntime {
  readonly database: BackendCoreRpcDatabase;
  readDiagnosticsStatus(): Promise<BackendDiagnosticsStatusResult> | BackendDiagnosticsStatusResult;
  getPrivateAuditEventCount(): number;
}

export interface BackendCoreRpcHandlerContext extends BackendRpcHandlerContext {
  readonly core: BackendCoreRpcRuntime;
}

export type BackendCoreRpcHandlerRegistration = BackendRpcHandlerRegistration<
  BackendCoreRpcHandlerContext
>;

const BACKEND_CORE_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendCoreRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendCoreRpcHandlerContext
  >;
} = {
  'system.health': {
    method: 'system.health',
    family: 'core',
    handle(_params, context): BackendHealthResult {
      return {
        ok: true,
        runtime: 'srs-backend-worker',
        initialized: context.core.database.getStatus().initialized,
      };
    },
  },
  'db.load': {
    method: 'db.load',
    family: 'core',
    handle(params, context): Promise<BackendDbLoadResult> | BackendDbLoadResult {
      return context.core.database.load(readDbLoadRequest(params));
    },
  },
  'db.reload': {
    method: 'db.reload',
    family: 'core',
    handle(params, context): Promise<BackendDbReloadResult> {
      return context.core.database.reloadFromDisk(readDbLoadRequest(params));
    },
  },
  'storage.maintenance.status': {
    method: 'storage.maintenance.status',
    family: 'core',
    handle(params, context): Promise<BackendStorageMaintenanceStatusResult> {
      return context.core.database.getStorageMaintenanceStatus(
        readRequiredNamedParams<BackendStorageMaintenanceStatusRequest>(
          params,
          'storage.maintenance.status requires named params',
        ),
      );
    },
  },
  'storage.maintenance.applyBatch': {
    method: 'storage.maintenance.applyBatch',
    family: 'core',
    handle(params, context): Promise<BackendStorageMaintenanceApplyBatchResult> {
      return context.core.database.applyStorageMaintenanceBatch(
        readRequiredNamedParams<BackendStorageMaintenanceApplyBatchRequest>(
          params,
          'storage.maintenance.applyBatch requires named params',
        ),
      );
    },
  },
  'diagnostics.status': {
    method: 'diagnostics.status',
    family: 'core',
    handle(_params, context): Promise<BackendDiagnosticsStatusResult> | BackendDiagnosticsStatusResult {
      return context.core.readDiagnosticsStatus();
    },
  },
  'private.health': {
    method: 'private.health',
    family: 'core',
    handle(): BackendPrivateHealthResult {
      return {
        ok: true,
        runtime: 'srs-backend-worker',
        feature: 'private-api',
      };
    },
  },
  'private.diagnostics.status': {
    method: 'private.diagnostics.status',
    family: 'core',
    async handle(_params, context): Promise<BackendPrivateDiagnosticsStatusResult> {
      return {
        ok: true,
        runtime: 'srs-backend-worker',
        status: await context.core.readDiagnosticsStatus(),
        auditEvents: context.core.getPrivateAuditEventCount(),
      };
    },
  },
};

function readDbLoadRequest(params: unknown): BackendDbLoadRequest | undefined {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return undefined;
  }
  return params as BackendDbLoadRequest;
}

function readRequiredNamedParams<TParams extends object>(params: unknown, message: string): TParams {
  const candidate = Array.isArray(params) ? params[0] : params;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error(`INVALID_REQUEST: ${message}`);
  }
  return candidate as TParams;
}

export const BACKEND_CORE_RPC_HANDLER_REGISTRATIONS: readonly BackendCoreRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_CORE_RPC_METHODS.map((method) => ({
      ...BACKEND_CORE_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendCoreRpcAdapter',
    })),
  );
