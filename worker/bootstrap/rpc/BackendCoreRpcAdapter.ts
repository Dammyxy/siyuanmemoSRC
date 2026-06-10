import type {
  BackendDbLoadResult,
  BackendDbPersistResult,
  BackendDiagnosticsStatusResult,
  BackendHealthResult,
  BackendPrivateDiagnosticsStatusResult,
  BackendPrivateHealthResult,
  BackendRpcHandlerAdapter,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_CORE_RPC_METHODS, type BackendCoreRpcMethod } from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendCoreRpcDatabase {
  getStatus(): { initialized: boolean };
  load(): Promise<BackendDbLoadResult> | BackendDbLoadResult;
  persist(): Promise<BackendDbPersistResult> | BackendDbPersistResult;
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
    void,
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
    handle(_params, context): Promise<BackendDbLoadResult> | BackendDbLoadResult {
      return context.core.database.load();
    },
  },
  'db.persist': {
    method: 'db.persist',
    family: 'core',
    handle(_params, context): Promise<BackendDbPersistResult> | BackendDbPersistResult {
      return context.core.database.persist();
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

export const BACKEND_CORE_RPC_HANDLER_REGISTRATIONS: readonly BackendCoreRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_CORE_RPC_METHODS.map((method) => ({
      ...BACKEND_CORE_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendCoreRpcAdapter',
    })),
  );
